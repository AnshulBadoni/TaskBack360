import { Request, Response } from "express";
import prisma from "../Connection/prisma";
import { getOrSetCache } from "../Services/cache";
import { deleteCache, resolveToken } from "../utils";
import { setResponse } from "../DTO";

// Consistent cache key generators
const PROJECTS_ALL_KEY = "projects:all";
const PROJECT_BY_NAME_KEY = (name: string) => `projects:name:${name}`;
const USER_PROJECTS_KEY = (userId: number) => `projects:user:${userId}`;

// User controller to create a project
export const createUserProject = async (req: Request, res: Response) => {
  try {
    let {
      name,
      description,
      users,
    }: { name: string; description: string; users?: number[] } = req.body;

    // Validate required fields
    if (!name || !description) {
      res.status(400).send(setResponse(400, "Name and description are required" ,[]));
      return;
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(401, "Unauthorized", []));
      return;
    }

    // Decode the JWT token to get the user ID
    const currentUserId = resolveToken(token);
    if (!currentUserId) {
      res.status(401).send(setResponse(401, "Unauthorized", []));
      return;
    }

    let usersToConnect: { id: number }[] = [];
    users = users ? [...users, Number(currentUserId)] : [Number(currentUserId)];

    if (users.length > 0) {
      // Fetch only existing users to avoid errors
      const existingUsers = await prisma.users.findMany({
        where: { id: { in: users } },
        select: { id: true },
      });
      usersToConnect = existingUsers.map((user) => ({ id: user.id }));
    }

    // Create the project (with or without users)
    const newProject = await prisma.projects.create({
      data: {
        name,
        description,
        users: { connect: usersToConnect },
      },
      include: {
        users: { select: { id: true, username: true, email: true, role: true, avatar: true } },
      },
    });

    // Invalidate all relevant caches
    const cacheKeysToDelete = [
      PROJECTS_ALL_KEY,
      PROJECT_BY_NAME_KEY(newProject.name),
      ...newProject.users.map(user => USER_PROJECTS_KEY(user.id))
    ];
    await deleteCache(...cacheKeysToDelete);

    res.status(201).send(setResponse(201, "Project created successfully", newProject));
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

// Admin route to create a project
export const createProject = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      userIds,
    }: { name: string; description: string; userIds?: number[] } = req.body;

    // Validate required fields
    if (!name || !description) {
      res.status(400).send(setResponse(400, "Name and description are required" ,[]));
      return;
    }

    let usersToConnect: { id: number }[] = [];
    if (userIds && userIds.length > 0) {
      // Fetch only existing users to avoid errors
      const existingUsers = await prisma.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true },
      });
      usersToConnect = existingUsers.map((user) => ({ id: user.id }));
    }

    // Create the project (with or without users)
    const newProject = await prisma.projects.create({
      data: {
        name,
        description,
        users: { connect: usersToConnect },
      },
      include: {
        users: { select: { id: true } }, // Only need IDs for cache invalidation
      },
    });

    // Invalidate all relevant caches
    const cacheKeysToDelete = [
      PROJECTS_ALL_KEY,
      PROJECT_BY_NAME_KEY(newProject.name),
      ...newProject.users.map(user => USER_PROJECTS_KEY(user.id))
    ];
    await deleteCache(...cacheKeysToDelete);

    res.status(201).send(setResponse(201, "Project created successfully", newProject));
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

// Get projects for specific user
export const getUserProjects = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(401, "Unauthorized" ,[]));
      return;
    }

    const userId = resolveToken(token);
    if (!userId) {
      res.status(401).send(setResponse(401, "Unauthorized", []));
      return;
    }

    const projects = await getOrSetCache(
      USER_PROJECTS_KEY(Number(userId)),
      () => prisma.projects.findMany({
        where: { users: { some: { id: Number(userId) } } },
        include: { 
          users: { 
            select: { id: true, username: true, email: true, role: true, avatar: true } 
          } 
        }
      }),
      600
    );

    res.status(200).send(setResponse(200, "Projects fetched successfully", projects));
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

// Get all projects (admin)
export const getAllProjects = async (req: Request, res: Response) => {
  try {
    const projects = await getOrSetCache(
      PROJECTS_ALL_KEY,
      () => prisma.projects.findMany({ 
        include: { 
          users: { 
            select: { id: true, username: true, email: true, role: true, avatar: true } 
          } 
        } 
      }),
      600
    );
    res.status(200).send(setResponse(200, "Projects fetched successfully", projects));
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

// Get single project by name
export const getProject = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(401, "Unauthorized", []));
      return;
    }

    const encodedname = req.params;
    const name = decodeURIComponent(encodedname.name);

    const project = await getOrSetCache(
      PROJECT_BY_NAME_KEY(name),
      () => prisma.projects.findMany({
        where: { name: name },
        include: { 
          users: { 
            select: { id: true, username: true, email: true, role: true, avatar: true } 
          } 
        },
      }),
      600
    );

    if (!project || project.length === 0) {
      res.status(404).send(setResponse(404, "Project not found", []));
      return;
    }

    res.status(200).send(setResponse(200, "Project found", project));
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

// Update project
export const updateProject = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(401, "Unauthorized", []));
      return;
    }

    const userId = resolveToken(token);
    if (!userId) {
      res.status(401).send(setResponse(401, "Unauthorized", []));
      return;
    }

    const { id } = req.params;
    const { name, description } = req.body;

    // First get current project details for cache invalidation
    const currentProject = await prisma.projects.findUnique({
      where: { id: Number(id) },
      include: {
        users: { select: { id: true } }
      },
    });

    if (!currentProject) {
      res.status(404).send(setResponse(404, "Project not found", []));
      return;
    }

    const updatedProject = await prisma.projects.update({
      where: { id: Number(id) },
      data: { name, description },
    });

    // Invalidate all relevant caches
    const cacheKeysToDelete = [
      PROJECTS_ALL_KEY,
      PROJECT_BY_NAME_KEY(currentProject.name),
      ...currentProject.users.map(user => USER_PROJECTS_KEY(user.id))
    ];
    
    // If name changed, also invalidate the new name's cache
    if (name && name !== currentProject.name) {
      cacheKeysToDelete.push(PROJECT_BY_NAME_KEY(name));
    }

    await deleteCache(...cacheKeysToDelete);

    res.status(200).send(setResponse(200, "Project updated", updatedProject));
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

// Delete project
export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await prisma.projects.findUnique({
      where: { id: Number(id) },
      include: {
        users: { select: { id: true } }
      },
    });

    if (!project) {
      res.status(404).send(setResponse(404, "Project not found", []));
      return;
    }

    await prisma.projects.delete({
      where: { id: Number(id) },
    });

    // Invalidate all relevant caches
    const cacheKeysToDelete = [
      PROJECTS_ALL_KEY,
      PROJECT_BY_NAME_KEY(project.name),
      ...project.users.map(user => USER_PROJECTS_KEY(user.id))
    ];
    await deleteCache(...cacheKeysToDelete);

    res.status(204).send(setResponse(204, "Project deleted successfully", []));
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

// Assign user to project
export const assignProject = async (req: Request, res: Response) => {
  try {
    const { projectId, userId } = req.body;

    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      include: { 
        users: { 
          select: { id: true } 
        } 
      },
    });

    if (!project) {
      res.status(404).send(setResponse(404, "Project not found", []));
      return;
    }

    const updatedProject = await prisma.projects.update({
      where: { id: projectId },
      data: {
        users: {
          connect: { id: userId },
        },
      },
      include: {
        users: { select: { id: true } },
      },
    });

    // Invalidate all relevant caches
    const cacheKeysToDelete = [
      PROJECTS_ALL_KEY,
      PROJECT_BY_NAME_KEY(project.name),
      USER_PROJECTS_KEY(userId)
    ];
    await deleteCache(...cacheKeysToDelete);

    res.status(200).send(setResponse(200, "User assigned to project", updatedProject));
  } catch (error) {
    res.status(500).send(setResponse(500, "Internal Server error", []));
  }
};

// Unassign user from project
export const unaasignProject = async (req: Request, res: Response) => {
  try {
    const { projectId, userId } = req.body;

    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      include: { 
        users: { 
          select: { id: true } 
        } 
      },
    });

    if (!project) {
      res.status(404).send(setResponse(404, "Project not found", []));
      return;
    }

    const updatedProject = await prisma.projects.update({
      where: { id: projectId },
      data: {
        users: {
          disconnect: { id: userId },
        },
      },
    });

    // Invalidate all relevant caches
    const cacheKeysToDelete = [
      PROJECTS_ALL_KEY,
      PROJECT_BY_NAME_KEY(project.name),
      USER_PROJECTS_KEY(userId)
    ];
    await deleteCache(...cacheKeysToDelete);

    res.status(200).send(setResponse(200, "User unassigned from project", updatedProject));
  } catch (error) {
    res.status(500).send(setResponse(500, "Internal Server error", []));
  }
};