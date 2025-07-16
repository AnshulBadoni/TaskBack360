import express, { Express, Request, Response } from "express";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import cors from "cors";
// import { connectKafka } from "./Services/kafka";
// import { startKafkaConsumer } from "./Services/kafkaConsumer";
// import swaggerJsdoc from 'swagger-jsdoc';
// import swaggerUi from 'swagger-ui-express';
import userRoutes from "./routes/userRoutes";
import { initializeSocket } from "./Services/socket";
import projectRoutes from "./routes/projectRoutes";
import taskRoutes from "./routes/taskRoutes";
import messageRoute from "./routes/messageRoute";

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


// load services and middlewares
// ( async () => {
//   await connectKafka(); // Connect Kafka when app starts
// }) ();

// startKafkaConsumer();

// const options: swaggerJsdoc.Options = {
//   definition: {
//     openapi: '3.0.0',
//     info: {
//       title: 'My API Docs',
//       version: '1.0.0',
//       description: 'Node.js API with TypeScript and Swagger',
//     },
//     servers: [
//       {
//         url: 'http://192.168.0.185:3001',
//       },
//     ],
//   },
//   apis: ['./src/routes/*.ts'], // Path to your route files
// };

const httpServer = createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

// Routes
app.use("/auth", userRoutes);

app.use("/projects", projectRoutes);

app.use("/tasks", taskRoutes);

app.use("/messages",messageRoute)

app.get("/", (req: Request, res: Response) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/allrooms", (req: Request, res: Response) => {
  res.send({});
});

// Start the server
const PORT = process.env.PORT || 3001;
httpServer.listen({port:PORT, host:"0.0.0.0"}, () => {
  console.log(`Server is running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing HTTP server...');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT',() => {
  console.log('SIGTERM received. Closing HTTP server...');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
})
