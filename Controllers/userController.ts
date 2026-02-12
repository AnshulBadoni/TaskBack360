import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../Connection/prisma";
import { setResponse } from "../DTO";
import { resolveToken } from "../utils";

export const signUp = async (req: Request, res: Response) => {
  try {
    const { username, email, role = "", compcode, avatar = "", password } = req.body;

    const user = await prisma.users.create({
      data: {
        username,
        email,
        role,
        compcode,
        avatar,
        password: await bcrypt.hash(password, 10),
      },
    });

    if (user) {
      let token = jwt.sign(
        { id: user.id },
        process.env.secretKey || "defaultSecretKey",
        {
          expiresIn: 1 * 24 * 60 * 60 * 1000,
        }
      );
      res.cookie("jwt", token, {
        maxAge: 1 * 24 * 60 * 60 * 1000,
        httpOnly: true,
      });
      res.status(201).send(setResponse(res.statusCode, "User created", user));
    } else {
      res.status(409).send(setResponse(res.statusCode, "User not created", []));
    }
  } catch (error) {
    res.status(500).send(setResponse(res.statusCode, "Error creating user", []));
  }
};

export const signIn = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.users.findUnique({
      where: {
        email: email,
      },
    });

    if (user) {
      const isSame = await bcrypt.compare(password, user.password);

      if (isSame) {
        let token = jwt.sign(
          { id: user.id },
          process.env.secretKey || "defaultSecretKey",
          {
            expiresIn: 1 * 24 * 60 * 60 * 1000,
          }
        );
        res.cookie("jwt", token, {
          maxAge: 1 * 24 * 60 * 60 * 1000,
          httpOnly: true,
        });
        const response = { ...user, password: undefined, token: token };
        res.status(200).send(setResponse(res.statusCode, "Login Success", response));
        return
      }
      else {
        res.status(401).send(setResponse(res.statusCode, "Login Failed", "Invalid Email or Password"));
        return
      }
    } else {

      res.status(409).send(setResponse(res.statusCode, "Login Failed", "Authentication failed"));
    }
  } catch (error) {
    res.status(500).send(setResponse(res.statusCode, "Login Server Error", error));
  }
};
export const getUser = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return;
    }
    const userId = resolveToken(token);

    if (!userId) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", {}));
      return;
    }

    const { username } = req.params;
    if (!username) {
      res.status(400).send(setResponse(400, "Username is required", {})); // Changed to 400 Bad Request
      return;
    }

    const user = await prisma.users.findFirst({
      where: {
        username: {
          equals: username,
          mode: 'insensitive', // This makes the search case-insensitive
        },
      },
    });

    if (user) {
      res.status(200).send(setResponse(200, "User found", user));
    } else {
      res.status(404).send(setResponse(404, "User not found", {}));
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).send(setResponse(500, "Error fetching user", {}));
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return;
    }
    const userId = resolveToken(token);

    if (!userId) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return
    }
    const comp = await prisma.users.findUnique({
      where: {
        id: Number(userId),
      },
    })
    if (comp?.username?.toLocaleLowerCase() == "anshul badoni") {
      const users = await prisma.users.findMany();
      res.status(200).send(users);
      return
    }
    const users = await prisma.users.findMany({
      where: {
        compcode: comp?.compcode
      }
    });
    res.status(200).send(users);
  } catch (error) {
    res.status(500).send("Error fetching users");
  }
}

export const getUserImage = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return;
    }

    const userId = resolveToken(token);

    const user = await prisma.users.findUnique({
      where: {
        id: Number(userId),
      },
    });
    if (user) {
      res.status(200).send(setResponse(res.statusCode, "User found", user.avatar));
    } else {
      res.status(404).send(setResponse(res.statusCode, "User not found", []));
    }
  } catch (error) {
    res.status(500).send(setResponse(res.statusCode, "Error fetching user", []));
  }
}

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return;
    }

    const userId = resolveToken(token);

    if (!userId) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return;
    }
    const user = await prisma.users.findUnique({
      where: {
        id: Number(userId),
      },
    });
    if (!user) {
      res.status(404).send(setResponse(res.statusCode, "User not found", []));
      return;
    }

    const { username, email, avatar, role, compcode } = req.body;

    const updatedUser = await prisma.users.update({
      where: {
        id: Number(userId),
      },
      data: {
        username: username,
        email: email,
        avatar: avatar,
        role: role,
        compcode: compcode
      },
    });
    res.status(200).send(setResponse(res.statusCode, "User updated successfully", updatedUser));
  } catch (error) {
    res.status(500).send(setResponse(res.statusCode, "Error updating user", []));
  }
}
//admin route
export const deleteAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.users.deleteMany();
    res.status(200).send(users);
  } catch (error) {
    res.status(500).send("Error deleting users");
  }
}
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(id);
    const user = await prisma.users.delete({
      where: {
        id: Number(id),
      },
    });
    if (user) {
      res.status(200).send(user);
    } else {
      res.status(404).send("User not found");
    }
  } catch (error) {
    res.status(500).send("Error deleting user");
  }
}
export const getFriends = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).send("Unauthorized");
      return;
    }

    const userId = resolveToken(token);
    if (!userId) {
      res.status(401).send("Invalid token");
      return;
    }

    const { limit = "20", page = "1" } = req.query;
    const take = parseInt(limit as string, 10);
    const skip = (parseInt(page as string, 10) - 1) * take;

    // Get conversations with pagination and include user details
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { initiatorId: Number(userId) },
          { receiverId: Number(userId) }
        ]
      },
      include: {
        initiator: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar: true,
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar: true,
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take,
      skip,
    });

    if (conversations.length === 0) {
      res.status(200).send(setResponse(res.statusCode, "you currently have no friends", []));
      return
    }

    // Format the response to return friends with their last message
    const formattedFriends = conversations.map(conv => {
      const isInitiator = conv.initiatorId === Number(userId);
      const friend = isInitiator ? conv.receiver : conv.initiator;

      return {
        ...friend,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        conversationId: conv.id
      };
    });

    res.status(200).send(setResponse(res.statusCode, "friends found", formattedFriends));
  } catch (error) {
    console.error("Error fetching chat users:", error);
    res.status(500).send(setResponse(res.statusCode, "Error fetching chat users", []));
  }
}
