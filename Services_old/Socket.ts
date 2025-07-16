import { Server } from "socket.io";
import Redis from "ioredis";
// import prismaClient from "./prisma";
// import { produceMessage } from "./kafka";

const pub = new Redis({
  host: "valkey-1560c66d-scalable-chat-app-node.d.aivencloud.com",
  port: 17720,
  username: "default",
  password: process.env.REDIS_PASSWORD,
});
const sub = new Redis({
  host: "valkey-1560c66d-scalable-chat-app-node.d.aivencloud.com",
  port: 17720,
  username: "default",
  password: process.env.REDIS_PASSWORD,
});

class SocketService {
  private _io: Server;

  constructor() {
    console.log("Init Socket Service...");
    this._io = new Server({
      cors: {
        allowedHeaders: ["*"],
        origin: "*",
      },
    });
    sub.subscribe("chat");
  }
  public initListner() {
    const io = this.io;
    const rooms: Record<string, string[]> = {};
    const channel = "chat";

    console.log("Init Socket Listeners...");

    io.on("connection", (socket: any) => {
      console.log("A user connected:", socket.id);

      sub.on('message',(channel,message)=>{
        if(channel==="Chat"){
            io.emit('message',message);
        }
      })

      // Join a room
      socket.on(
        "joinRoom",
        async (room: { roomname: string; message: string }) => {
          socket.join(room.roomname);
          if (!rooms[room.roomname]) {
            rooms[room.roomname] = [];
          }
          rooms[room.roomname].push(socket.id);
          rooms[room.roomname].push(room.message);
          console.log(
            `${socket.id} joined room: ${room.roomname} with message ${room.message}`
          );
          await pub.publish(
            channel,
            JSON.stringify({
              room: room.roomname,
              message: room.message,
            })
          );
        }
      );

      // Handle chat message
      socket.on("chat-message", (data: { room: string; message: string }) => {
        console.log(data);
        io.emit("chat-message", data);
      });

      // Handle 1-to-1 private message
      socket.on("privateMessage", (data: { to: string; message: string }) => {
        io.to(data.to).emit("privateMessage", {
          from: socket.id,
          message: data.message,
        });
        io.emit("privateMessage", data);
        console.log(data);
      });

      socket.on("disconnect", () => {
        console.log("A user disconnected:", socket.id);
        // Clean up user from rooms
        for (const room in rooms) {
          rooms[room] = rooms[room].filter((id) => id !== socket.id);
        }
      });
    });
  }
  get io() {
    return this._io;
  }
}
export default SocketService;
