import { Server, Socket } from "socket.io";
import { pub, sub } from "./resdisPubSub";
import { createAdapter } from "@socket.io/redis-adapter";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { setResponse } from "../DTO";


const prisma = new PrismaClient();

// In-memory storage for connected users
const userSockets: Map<number, string> = new Map();

interface AuthenticatedSocket extends Socket {
  userId?: number;
  username?: string;
  chunks?: {
    [fileName: string]: string[];
  };
}

interface JoinRoomData {
  roomId: string | number;
  roomType: 'task' | 'direct';
}

interface ChatMessage {
  content: string;
  roomId: string | number;
  roomType: 'task' | 'direct';
  messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  isFile?: boolean;
  fileData?: string;
  replyToId?: number;
  senderId: number;
  temp?: boolean;
}

interface PrivateMessage {
  content: string;
  receiverId: number;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}

interface TypingData {
  roomId: string | number;
  roomType: 'project' | 'direct';
  isTyping: boolean;
}

let io: Server;
const onlineUsers = new Set<number>();

export const initializeSocket = (httpServer: any) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      credentials: true,
      methods: ["GET", "POST"]
    },
    path: "/socket.io",
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    maxHttpBufferSize: 1e8 // 100MB
  });

  // Use Redis adapter for scaling
  io.adapter(createAdapter(pub, sub));

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        console.log("No token provided");
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, process.env.secretKey!) as any;
      console.log("Decoded token:", decoded);
      const user = await prisma.users.findUnique({
        where: { id: decoded.id },
        select: { id: true, username: true, email: true, isOnline: true, avatar: false }
      });

      if (!user) {
        console.log("User not found for token");
        return next(new Error("Authentication error: User not found"));
      }

      socket.userId = user.id;
      socket.username = user.username;
      next();
    } catch (error) {
      console.error("Authentication error:", error);
      next(new Error("Authentication failed"));
    }
  });

  // Add this right after creating the Server instance
  io.engine.on("connection_error", (err) => {
    console.log("Socket.io connection error:", {
      code: err.code,
      message: err.message,
      context: err.context
    });
  });

  // socket initialization
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.username} (${socket.id})`);

    if (socket.userId) {
        // Add user to onlineUsers and userSockets
        onlineUsers.add(socket.userId);
        userSockets.set(socket.userId, socket.id);
        
        console.log('Online users:', Array.from(onlineUsers));
        
        // Broadcast updated online users list to ALL connected clients
        io.emit('userStatusChange', { 
            userId: socket.userId, 
            isOnline: true,
            onlineUsers: Array.from(onlineUsers)
        });

        // Send the current online users list to the newly connected user
        socket.emit('onlineUsersList', Array.from(onlineUsers));
    }

    socket.on('getFriendList', async () => {
      console.log(`User ${socket.username} requested friend list`);
      try {
        const friends = await prisma.users.findMany({
          where: {
            id: { in: Array.from(onlineUsers) }
          },
          select: { id: true, username: true, avatar: true }
        });
        socket.emit('friendList', friends);
      } catch (error) {
        console.error('Error fetching friend list:', error);
        socket.emit('friendList', []);
      }
    });

    socket.on('getOnlineUsers', () => {
      console.log(`User ${socket.username} requested online users list`);
      socket.emit('onlineUsersList', Array.from(onlineUsers));
    });

    // Updated joinTaskRoom handler
    socket.on('joinTaskRoom', async (data: JoinRoomData) => {
      console.log(`User ${socket.username} joining task room`);
      try {
        const { roomId } = data;
        const roomIdStr = roomId.toString();

        // Parse task ID from "task-projectId-taskId"
        const parts = roomIdStr.replace('task-', '').split('-');
        const taskId = parseInt(parts[1]);

        if (isNaN(taskId)) {
          throw new Error('Invalid task ID');
        }

        // Verify user has access to the task's project
        const projectId = parseInt(parts[0]);
        const hasAccess = await prisma.projects.findFirst({
          where: {
            id: projectId,
            users: { some: { id: socket.userId } }
          }
        });

        if (!hasAccess) {
          return socket.emit('error', { message: 'Access denied to this task' });
        }

        // Get or create task conversation
        const taskConversation = await prisma.taskConversation.findUnique({
          where: { taskId }
        }) || await prisma.taskConversation.create({
          data: { taskId }
        });

        // Join the room
        socket.join(roomIdStr);

        // Get task messages
        const messages = await prisma.message.findMany({
          where: {
            taskConversationId: taskConversation.id
          },
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: { id: true, username: true, avatar: true } },
            replyTo: {
              include: {
                sender: { select: { id: true, username: true, avatar: true } }
              }
            }
          }
        });
        console.log(messages, "messAGE")
        socket.emit('messageHistory', { messages, roomType: 'task' });
      } catch (error) {
        console.error('Error joining task room:', error);
        socket.emit('error', { message: 'Failed to join task room' });
      }
    });

    // Updated sendComment handler
    socket.on('sendComment', async (data: any) => {
      try {
        const { content, roomId, senderId, messageType, fileName, fileSize } = data;
        const roomIdStr = roomId.toString();
        const taskId = parseInt(roomIdStr.replace('task-', '').split('-')[1]);

        if (isNaN(taskId)) {
          throw new Error('Invalid task ID');
        }

        // Get or create task conversation
        const taskConversation = await prisma.taskConversation.findUnique({
          where: { taskId }
        }) || await prisma.taskConversation.create({
          data: { taskId }
        });

        // Create task message
        const newMessage = await prisma.message.create({
          data: {
            content,
            senderId,
            taskConversationId: taskConversation.id,
            messageType: messageType || 'TEXT',
            fileName,
            fileSize
          },
          include: {
            sender: { select: { id: true, username: true, avatar: true } },
            replyTo: {
              include: {
                sender: { select: { id: true, username: true, avatar: true } }
              }
            }
          }
        });

        io.to(roomIdStr).emit('newMessage', newMessage);
      } catch (error) {
        console.error('Error sending task comment:', error);
        socket.emit('error', { message: 'Failed to send comment' });
      }
    });

    socket.on('deleteComment', async (data: any) => {
      try {
        const { messageId, roomId } = data;
        const roomIdStr = roomId.toString();
        const message = await prisma.message.delete({
          where: {
            id: Number(messageId)
          }
        });
        io.to(roomIdStr).emit('messageDeleted', message);
      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    })

    // Handle room joining
    socket.on('joinRoom', async (data: JoinRoomData) => {
      try {
        const { roomId, roomType } = data;

        if (roomType === 'direct') {
          console.log(`User ${socket.username} joining room ${roomId} (${roomType})`);
          // For direct messages, parse the roomId (format: "direct-user1-user2")
          const roomIdStr = roomId.toString();
          const userIds = roomIdStr.replace('direct-', '').split('-').map(Number);
          const [userId1, userId2] = userIds;

          // Verify one of the users is the current user
          if (socket.userId !== userId1 && socket.userId !== userId2) {
            socket.emit('error', { message: 'Access denied to this conversation' });
            return;
          }

          // Get or create conversation
          const conversation = await prisma.conversation.findFirst({
            where: {
              OR: [
                { initiatorId: userId1, receiverId: userId2 },
                { initiatorId: userId2, receiverId: userId1 }
              ]
            }
          }) || await prisma.conversation.create({
            data: {
              initiatorId: userId1,
              receiverId: userId2
            }
          });

          socket.join(roomIdStr);
          console.log(`User joined direct room: ${roomIdStr}`);

          // Send message history
          const messages = await prisma.message.findMany({
            where: { conversationId: conversation.id },
            include: {
              sender: { select: { id: true, username: true, avatar: false } },
              replyTo: {
                include: {
                  sender: { select: { id: true, username: true, avatar: false } }
                }
              }
            },
            orderBy: { createdAt: 'asc' },
            take: 50 
          });
          socket.emit('messageHistory', { messages, roomType: 'direct' });
        }
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Handle message sending
    socket.on('sendMessage', async (data: ChatMessage) => {
      try {
        const { content, roomId, roomType, senderId, messageType, fileName, fileSize, fileData, replyToId, temp } = data;

        console.log('Received message:', {
          content: content ? content.substring(0, 50) + '...' : 'No content',
          roomId,
          roomType,
          senderId,
          messageType: messageType || 'TEXT',
          fileName,
          fileSize: fileSize ? `${(fileSize / 1024).toFixed(2)} KB` : 'N/A',
          hasFileData: !!fileData
        });

        // Verify sender matches authenticated user
        if (senderId !== socket.userId) {
          socket.emit('error', { message: 'Unauthorized message send' });
          return;
        }

        // Prepare the message object that will be emitted
        const messageToEmit = {
          content: content || '',
          senderId,
          messageType: messageType || 'TEXT',
          fileName,
          fileSize,
          replyToId,
          temp: true, // Mark as temporary
          createdAt: new Date(),
          sender: {
            id: socket.userId,
            username: socket.username, // Assuming you have this on the socket
            avatar: null
          },
          replyTo: null // You would need to populate this if needed
        };

        // Handle file messages
        if (fileData && fileName) {
          messageToEmit.content = JSON.stringify({
            type: 'FILE',
            fileType: messageToEmit.messageType,
            fileName,
            fileSize,
            data: fileData,
            text: content
          });
        }

        // If temporary, just emit and return
        if (temp) {
          io.to(roomId.toString()).emit('newMessage', messageToEmit);
          return;
        }

        if (roomType === 'direct') {
          const roomIdStr = roomId.toString();
          const userIds = roomIdStr.replace('direct-', '').split('-').map(Number);
          const [userId1, userId2] = userIds;

          // Verify user has access to this conversation
          if (socket.userId !== userId1 && socket.userId !== userId2) {
            socket.emit('error', { message: 'Access denied to this conversation' });
            return;
          }

          const conversation = await prisma.conversation.findFirst({
            where: {
              OR: [
                { initiatorId: userId1, receiverId: userId2 },
                { initiatorId: userId2, receiverId: userId1 }
              ]
            }
          }) || await prisma.conversation.create({
            data: {
              initiatorId: userId1,
              receiverId: userId2
            }
          });

          let messageContent = content || '';
          let finalMessageType = messageType || 'TEXT';

          // Handle file messages
          if (fileData && fileName) {
            messageContent = JSON.stringify({
              type: 'FILE',
              fileType: finalMessageType,
              fileName,
              fileSize,
              data: fileData,
              text: content // Include any text that came with the file
            });
          }

          // Create the message
          const newMessage = await prisma.message.create({
            data: {
              content: messageContent,
              senderId,
              conversationId: conversation.id,
              messageType: finalMessageType,
              fileName,
              fileSize,
              replyToId
            },
            include: {
              sender: { select: { id: true, username: true, avatar: false } },
              replyTo: {
                include: {
                  sender: { select: { id: true, username: true, avatar: false } }
                }
              }
            }
          });

          console.log('Direct message created successfully:', {
            id: newMessage.id,
            content: newMessage.content.substring(0, 50) + '...',
            messageType: newMessage.messageType,
            senderId: newMessage.senderId,
            conversationId: newMessage.conversationId
          });

          // Emit to all users in the direct room
          io.to(roomIdStr).emit('newMessage', newMessage);

          // Update conversation last message
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessage: messageContent.length > 100 ? messageContent.substring(0, 100) + '...' : messageContent,
              lastMessageAt: new Date()
            }
          });

        // update the friends list of user to whom we are sending the message
          const friends = await findMyFriends(senderId);
          socket.emit('getNewFriends', friends)
        }
      } catch (error) {
        console.error('Error sending message:', error);
        // Send error back to the client
        socket.emit('messageError', {
          error: 'Failed to send message',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle file chunks (for large files)
    socket.on('fileChunk', async (data) => {
      try {
        const { roomId, senderId, fileName, fileSize, messageType, chunk, chunkIndex, totalChunks, roomType } = data;

        // Verify sender matches authenticated user
        if (senderId !== socket.userId) {
          socket.emit('error', { message: 'Unauthorized file upload' });
          return;
        }

        // Store chunks temporarily
        if (!socket.chunks) socket.chunks = {};
        if (!socket.chunks[fileName]) socket.chunks[fileName] = [];

        socket.chunks[fileName][chunkIndex] = chunk;

        // Check if all chunks have been received
        if (socket.chunks[fileName].length === totalChunks && !socket.chunks[fileName].some(chunk => chunk === undefined)) {
          const completeFile = socket.chunks[fileName].join('');

          // Send the complete file as a message
          await socket.emit('sendMessage', {
            content: '',
            roomId,
            roomType,
            senderId,
            messageType,
            fileName,
            fileSize,
            fileData: completeFile,
            sent: true
          });

          delete socket.chunks[fileName];
        }
      } catch (error) {
        console.error('Error handling file chunk:', error);
        socket.emit('error', { message: 'Failed to process file chunk' });
      }
    });

    socket.on('typing', (data: TypingData) => {
      console.log(`User ${socket.username} is typing in room ${data.roomId}`);

      let roomName: string;
      if (data.roomType === 'project') {
        const projectId = typeof data.roomId === 'string' ? data.roomId.replace('project-', '') : data.roomId;
        roomName = `project-${projectId}`;
      } else {
        roomName = data.roomId.toString();
      }

      // Emit to everyone in the room except the sender
      socket.to(roomName).emit('typing', {
        userId: socket.userId,
        username: socket.username,
        isTyping: data.isTyping
      });
    });

    // Update the delete message handler
    socket.on('deleteMessage', async (data) => {
      try {
        const { messageId, roomId, roomType } = data;
        console.log(`User ${socket.username} deleting message ${messageId} in room ${roomId}`);

        // First verify the message exists and belongs to this user
        const message = await prisma.message.findUnique({
          where: { id: Number(messageId) }
        });

        if (!message) {
          throw new Error('Message not found');
        }

        if (message.senderId !== socket.userId) {
          throw new Error('Unauthorized to delete this message');
        }

        await prisma.message.delete({ where: { id: Number(messageId) } });

        let roomName: string;
        if (roomType === 'project') {
          const projectId = typeof roomId === 'string' ? roomId.replace('project-', '') : roomId;
          roomName = `project-${projectId}`;
        } else {
          roomName = roomId.toString();
        }

        io.to(roomName).emit('messageDeleted', Number(messageId));
      } catch (error) {
        console.error('Error deleting message:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('deleteError', { error: errorMessage });
      }
    });

     socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.username} (${socket.id})`);
        if (socket.userId) {
            onlineUsers.delete(socket.userId);
            userSockets.delete(socket.userId);

            console.log('Online users after disconnect:', Array.from(onlineUsers));
            
            // Broadcast updated online users list to ALL connected clients
            io.emit('userStatusChange', { 
                userId: socket.userId, 
                isOnline: false,
                onlineUsers: Array.from(onlineUsers) // Send the complete list
            });
            
        }

        // Clean up any pending chunks
        if (socket.chunks) {
            console.log(`Cleaning up ${Object.keys(socket.chunks).length} pending file transfers`);
            delete socket.chunks;
        }
    });
});

  return io;
};


export const getSocketServer = () => io;

// Utility function to send notification to user
export const sendNotificationToUser = (userId: number, notification: any) => {
  const socketId = userSockets.get(userId);
  if (socketId && io) {
    io.to(socketId).emit("notification", notification);
  }
};

// Utility function to check if user is online
export const isUserOnline = (userId: number): boolean => {
  return userSockets.has(userId);
};

const findMyFriends = async (userId: number) => {

    // Get all unique conversation partners
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { initiatorId: Number(userId) },
          { receiverId: Number(userId) }
        ]
      },
      select: {
        initiatorId: true,
        receiverId: true
      },
      distinct: ['initiatorId', 'receiverId']
    });

    // Extract friend IDs (excluding current user) with null checks
    const friendIds = conversations
      .map(conv => {
        const otherId = conv.initiatorId === Number(userId) ? conv.receiverId : conv.initiatorId;
        return otherId !== Number(userId) ? otherId : null;
      })
      .filter((id): id is number => id !== null); // Type guard to ensure number[]

    // Get unique friend IDs
    const uniqueFriendIds = Array.from(new Set(friendIds));

    if (uniqueFriendIds.length === 0) {
      return []
    }

    // Get user details for all friends
    const users = await prisma.users.findMany({
      where: {
        id: {
          in: uniqueFriendIds
        }
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
      }
    });

     return users
}