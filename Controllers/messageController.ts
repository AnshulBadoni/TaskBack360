import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../Connection/prisma";
import { setResponse } from "../DTO";
import { resolve } from "path";
import { resolveToken } from "../utils";

export const sendMessage = async (req: Request, res: Response) => {
    try {
      const { content, senderId, receiverId, projectId } = req.body;

      const newMessage = await prisma.message.create({
        data: {
          content,
          senderId,
          receiverId: receiverId || null,
          projectId: projectId || null,
        },
      });

      res.status(201).json(newMessage);
    } catch (error) {
      console.error("Error saving message:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };

  export const getMessages = async (req: Request, res: Response) => {
    try {
      const { projectId, senderId, receiverId } = req.query;

      let messages;
      if (projectId) {
        messages = await prisma.message.findMany({ where: { projectId: Number(projectId) } });
      } else if (senderId && receiverId) {
        messages = await prisma.message.findMany({
          where: {
            OR: [
              { senderId: Number(senderId), receiverId: Number(receiverId) },
              { senderId: Number(receiverId), receiverId: Number(senderId) },
            ],
          },
          orderBy: { createdAt: "asc" },
        });
      } else {
        res.status(400).json({ error: "Invalid query parameters" });
        return;
      }

      res.status(200).json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };

export const getUserAllConversations = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return;
    }
    const userId = resolveToken(token);

    if(!userId){
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return
    }
    console.log(userId,"User ID from token:", userId);
    
    const messages = await prisma.conversation.findMany({
      where: {
        OR: [
          { initiatorId: Number(userId) },
          { receiverId: Number(userId) }
        ]
      },
      include: {
        messages: true
      }
    })
    
    res.status(200).send(setResponse(res.statusCode, "Messages fetched successfully", messages));
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};