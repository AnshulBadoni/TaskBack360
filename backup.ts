import express, { Express, Request, Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import userRoutes from "./Routes/userRoutes";
import cookieParser from "cookie-parser";
import Redis from "ioredis";

const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Create HTTP server with express instance
const httpServer = createServer(app);

//create redis publisher with aiven credentials
const pub = new Redis({
  host: 'valkey-1560c66d-scalable-chat-app-node.d.aivencloud.com',
  port: 17720,
  username: 'default',
  password: 'AVNS_N5QWjYiN1YIBmeQ6lRO',
});
//create redis subscriber with aiven credentials
const sub = new Redis({
  host: 'valkey-1560c66d-scalable-chat-app-node.d.aivencloud.com',
  port: 17720,
  username: 'default',
  password: 'AVNS_N5QWjYiN1YIBmeQ6lRO',
});

const channel = "chat";

app.get("/", (req: Request, res: Response) => {
  res.sendFile(__dirname + '/index.html');
})

// Routes
app.use('/auth', userRoutes);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

sub.subscribe("chat");

const rooms: Record<string, string[]> = {};

app.get("/allrooms", (req: Request, res: Response) => {
  console.log(rooms.length)
  res.send(rooms);
})

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  sub.on('message',(channel,message)=>{
    console.log(message,"message", channel);
    if(channel=="chat"){
      // io.emit(message);
      io.emit("privateMessage", message);
      // io.emit("chat-message", message);
    }
  })
  // Join a room
  socket.on('joinRoom', async(room: { roomname:string, message:string}) => {
    socket.join(room.roomname);
    if (!rooms[room.roomname]) {
      rooms[room.roomname] = [];
    }
    rooms[room.roomname].push(socket.id);
    rooms[room.roomname].push(room.message);
    console.log(`${socket.id} joined room: ${room.roomname} with message ${room.message}`);
    await pub.publish(channel, JSON.stringify({
      room: room.roomname,  
      message: room.message
    }))
  });

  // Handle chat message
  socket.on('chat-message', (data: { room: string, message: string }) => {
    console.log(data)
    io.emit("chat-message", data);
  });

  // Handle 1-to-1 private message
  socket.on('privateMessage', (data: { to: string, message: string }) => {
    io.to(data.to).emit('privateMessage', {
      from: socket.id,
      message: data.message,
    });
    io.emit("privateMessage", data);
    console.log(data)
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    // Clean up user from rooms
    for (const room in rooms) {
      rooms[room] = rooms[room].filter((id) => id !== socket.id);
    }
  });
});


httpServer.listen(3001, () => {
  console.log('Server is running on port 3001');
});

//
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

// Looking for ways to speed up your queries, or scale easily with your serverless or edge functions?
// Try Prisma Accelerate: https://pris.ly/cli/accelerate-init
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Users {
  id               Int        @id @default(autoincrement())
  username         String     @unique
  email            String     @unique
  role             String?
  password         String
  compcode         String
  avatar           String?
  isOnline         Boolean    @default(false)
  lastSeen         DateTime?
  rooms            Projects[] @relation("UserRooms")
  sentMessages     Message[]  @relation("SentMessages")
  receivedMessages Message[]  @relation("ReceivedMessages")
  assignedTasks    Tasks[]    @relation("AssignedTasks")
  createdTasks     Tasks[]    @relation("CreatedTasks")

  // Direct message conversations
  conversationsInitiated Conversation[] @relation("ConversationInitiator")
  conversationsReceived  Conversation[] @relation("ConversationReceiver")

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  MessageRead MessageRead[]
}

model Projects {
  id          Int       @id @default(autoincrement())
  name        String
  description String
  isPrivate   Boolean   @default(false)
  users       Users[]   @relation("UserRooms")
  messages    Message[] @relation("ProjectMessages")
  tasks       Tasks[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Tasks {
  id               Int               @id @default(autoincrement())
  name             String
  description      String
  status           Status
  dueDate          DateTime
  assignedBy       Users             @relation("CreatedTasks", fields: [assignedById], references: [id], onDelete: Cascade)
  assignedById     Int
  assignedTo       Users             @relation("AssignedTasks", fields: [assignedToId], references: [id], onDelete: Cascade)
  assignedToId     Int
  project          Projects          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId        Int
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  TaskConversation TaskConversation?
}

// Enhanced Message model
model Message {
  id          Int         @id @default(autoincrement())
  content     String
  messageType MessageType @default(TEXT)
  fileUrl     String? // For file attachments
  fileName    String? // Original file name
  fileSize    Int? // File size in bytes

  // Message status
  status MessageStatus @default(SENT)
  readBy MessageRead[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  editedAt  DateTime? // For message editing

  // Sender info - CASCADE DELETE
  sender   Users @relation("SentMessages", fields: [senderId], references: [id], onDelete: Cascade)
  senderId Int

  // For direct messages - CASCADE DELETE
  receiver       Users?        @relation("ReceivedMessages", fields: [receiverId], references: [id], onDelete: Cascade)
  receiverId     Int?
  conversation   Conversation? @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  conversationId Int?

  // For group/project messages - CASCADE DELETE
  project   Projects? @relation("ProjectMessages", fields: [projectId], references: [id], onDelete: Cascade)
  projectId Int?

  // Reply functionality - SET NULL when parent message is deleted
  replyTo            Message?          @relation("MessageReplies", fields: [replyToId], references: [id], onDelete: SetNull)
  replyToId          Int?
  replies            Message[]         @relation("MessageReplies")
  TaskConversation   TaskConversation? @relation(fields: [taskConversationId], references: [id])
  taskConversationId Int?

  @@index([projectId, createdAt])
  @@index([conversationId, createdAt])
  @@index([senderId, createdAt])
}

// for task conversation or comments
model TaskConversation {
  id        Int       @id @default(autoincrement())
  task      Tasks     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  taskId    Int
  messages  Message[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([taskId])
}

// For direct message conversations
model Conversation {
  id            Int       @id @default(autoincrement())
  initiator     Users     @relation("ConversationInitiator", fields: [initiatorId], references: [id], onDelete: Cascade)
  initiatorId   Int
  receiver      Users     @relation("ConversationReceiver", fields: [receiverId], references: [id], onDelete: Cascade)
  receiverId    Int
  messages      Message[]
  lastMessage   String? // Cache for performance
  lastMessageAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([initiatorId, receiverId])
  @@index([initiatorId, updatedAt])
  @@index([receiverId, updatedAt])
}

// Track message read status
model MessageRead {
  id        Int      @id @default(autoincrement())
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  messageId Int
  reader    Users    @relation(fields: [readerId], references: [id], onDelete: Cascade)
  readerId  Int
  readAt    DateTime @default(now())

  @@unique([messageId, readerId])
}

enum Status {
  OPEN
  IN_PROGRESS
  REVIEW
  DONE
  OVERDUE
  CANCELLED
}

enum MessageType {
  TEXT
  IMAGE
  FILE
  AUDIO
  VIDEO
  SYSTEM // For system messages like "User joined room"
}

enum MessageStatus {
  SENT
  DELIVERED
  READ
  FAILED
}
