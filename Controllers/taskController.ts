import { Request, Response } from "express";
import prisma from "../Connection/prisma";
import { Status } from "@prisma/client";
import { Tasks } from "@prisma/client";
import { getOrSetCache } from "../Services/cache";
import { deleteCache, resolveToken } from "../utils";
import { setResponse } from "../DTO";
import { updateProject } from "./projectController";

async function isTaskExists(taskId: number): Promise<Tasks | null> {
  return prisma.tasks.findUnique({
    where: { id: taskId },
    include: {
      assignedBy: true,
      taskAssignments: {
        include: {
          user: true
        }
      },
      project: true
    }
  });
}
// export const createTask = async (req: Request, res: Response) => {
//   try {
//     const {
//       name,
//       description,
//       status,
//       dueDate,
//       assignedBy,
//       assignedTo,
//       projectId,
//     }: {
//       name: string;
//       description: string;
//       status: string;
//       dueDate: string;
//       assignedBy: number;
//       assignedTo: number;
//       projectId: number;
//     } = req.body;

//     if (
//       !name ||
//       !description ||
//       !status ||
//       !dueDate ||
//       !assignedBy ||
//       !assignedTo ||
//       !projectId
//     ) {
//       res.status(400).json({ error: "All fields are required" });
//       return;
//     }

//     const users = await prisma.users.findMany({
//       where: { id: { in: [Number(assignedBy), Number(assignedTo)] } },
//       select: { id: true },
//     });

//     if (users.length < 1) {
//       res.status(400).json({ error: "Invalid assignedBy or assignedTo ID" });
//       return;
//     }

//     const newTask = await prisma.tasks.create({
//       data: {
//         name,
//         description,
//         status: status.toUpperCase() as Status,
//         dueDate: new Date(dueDate),
//         assignedBy: { connect: { id: Number(assignedBy) } },
//         assignedTo: { connect: { id: Number(assignedTo) } },
//         project: { connect: { id: Number(projectId) } },
//       },
//       include: {
//         assignedBy: true,
//         assignedTo: true,
//         project: true,
//       },
//     });

//     await prisma.projects.update({
//       where: { id: Number(projectId) },
//       data: {
//         users: {
//           connect: [
//             { id: Number(assignedBy) },
//             { id: Number(assignedTo) }
//           ]
//         }
//       }
//     });

//     // Clear all relevant cache keys
//     await deleteCache(
//       "tasks:all",
//       `tasks:name:${newTask.name}`,
//       `tasks:user:${newTask.assignedById}`,
//       `tasks:user:${newTask.assignedToId}`,
//       // Add project cache invalidation
//       "projects:all",
//       `projects:name:${newTask.project.name}`,
//       `projects:user:${newTask.assignedById}`,
//       `projects:user:${newTask.assignedToId}`
//     );
//     // await setKafka("task-events", "task-created", newTask);

//     res.status(201).json(newTask);
//   } catch (error) {
//     console.error("Error creating Task:", error);
//        res.status(500).send(setResponse(500, "Internal Server Error", []));
//   }
// };
export const createTask = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by token", []));
      return;
    }
    const userId = resolveToken(token);
    if (!userId) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by id", []));
      return;
    }

    const {
      name,
      description,
      status,
      dueDate,
      assignedById,
      assignees,
      projectId,
    } = req.body;

    // Validation
    if (
      !name ||
      !description ||
      !status ||
      !dueDate ||
      !assignedById ||
      !assignees ||
      !projectId ||
      !Array.isArray(assignees) ||
      assignees.length === 0
    ) {
      console.log(assignees, Array.isArray(assignees), assignees.length === 0,"error")
      res.status(400).send(setResponse(res.statusCode, "All fields are required and assignees must be a non-empty array", []));
      return
    }

    // add current user id to assignees
    assignees.push(userId);

    // Convert all IDs to numbers and remove duplicates
    const uniqueAssigneeIds = Array.from(new Set(assignees.map(id => Number(id))));
    const assignedBy = Number(assignedById);
    const projectIdNum = Number(projectId);
    const allUserIds = [assignedBy, ...uniqueAssigneeIds];

    // Check if all users exist
    const users = await prisma.users.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true },
    });

    // Find missing IDs
    const foundUserIds = users.map(user => user.id);
    const missingIds = allUserIds.filter(id => !foundUserIds.includes(id));

    if (missingIds.length > 0) {
       res.status(400).send(setResponse(400,
        `Invalid user IDs: ${missingIds.join(', ')}`,
        []));
      return
    }

    // Create the task
    const newTask = await prisma.tasks.create({
      data: {
        name,
        description,
        status: status.toUpperCase() as Status, // Ensure this matches your enum
        dueDate: new Date(dueDate),
        assignedBy: { connect: { id: assignedById } }, // Correct relation connection
        project: { connect: { id: projectIdNum } }, // Correct relation connection
        taskAssignments: {
          create: uniqueAssigneeIds.map(userId => ({
            user: { connect: { id: userId } },
            status: 'ASSIGNED' // Ensure this matches your AssignmentStatus enum
          }))
        }
      },
      include: {
        assignedBy: true,
        taskAssignments: {
          include: {
            user: true
          }
        },
        project: true,
      },
    });

    // Update project with all users
    await prisma.projects.update({
      where: { id: projectIdNum },
      data: {
        users: {
          connect: allUserIds.map(id => ({ id })),
        },
      },
    });

    // Clear cache
    const cacheKeysToDelete = [
      "tasks:all",
      `tasks:name:${newTask.name}`,
      `tasks:user:${newTask.assignedById}`,
      ...uniqueAssigneeIds.map(id => `tasks:user:${id}`),
      "projects:all",
      `projects:name:${newTask.project.name}`,
      `projects:user:${newTask.assignedById}`,
      ...uniqueAssigneeIds.map(id => `projects:user:${id}`),
    ];

    await deleteCache(...cacheKeysToDelete);

    res.status(201).send(setResponse(res.statusCode, "Task created successfully", newTask));;
  } catch (error) {
    console.error("Error creating Task:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};


export const getAllTasks = async (req: Request, res: Response) => {
  try {
    const tasks = await getOrSetCache(
      "tasks:all",
      () =>
        prisma.tasks.findMany({
          include: {
            assignedBy: true,
            taskAssignments: {
              include: {
                user: true
              }
            },
            project: true
          },
        }),
      600
    );

    res.status(200).send(setResponse(res.statusCode, "Tasks fetched successfully", tasks));
  } catch (error) {
    console.error("Error fetching Tasks:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", [])); 
  }
};

export const getUserProjectTasks = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by token", []));
      return;
    }
    const userId = resolveToken(token);
    if (!userId) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by id", []));
      return;
    }

    const tasks = await getOrSetCache(
      `tasks:user:${userId}`,
      () =>
        prisma.tasks.findMany({
          where: {
            OR: [
              { assignedById: Number(userId) },
              { taskAssignments: { some: { userId: Number(userId) } } }
            ]
          },
          include: {
            assignedBy: true,
            taskAssignments: {
              include: {
                user: true
              }
            },
            project: true,
          },
        }),
      600
    );

    res.status(200).send(setResponse(200, "Tasks found", tasks));
  } catch (error) {
    console.error("Error fetching Tasks:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

export const getUserProjectTasksByProjectId = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by token", []));
      return;
    }
    const userId = resolveToken(token);
    if (!userId) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by id", []));
      return;
    }
    const { projectId } = req.params;
    
    const tasks = await getOrSetCache(
      `tasks:user:${userId}:project:${projectId}`,
      () =>
        prisma.tasks.findMany({
          where: {
            OR: [
              { assignedById: Number(userId) },
              { taskAssignments: { some: { userId: Number(userId) } } }
            ],
            projectId: Number(projectId)
          },
          include: {
            assignedBy: true,
            taskAssignments: {
              include: {
                user: true
              }
            },
            project: true,
          },
        }),
      600
    );
    
    res.status(200).send(setResponse(200, "Tasks found", tasks));
  } catch (error) {
    console.error("Error fetching Tasks:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

export const getProjectTasks = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by token", []));
      return;
    }
    const userId = resolveToken(token);
    if (!userId) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by id", []));
      return;
    }
    const { projectId } = req.params;
    if (isNaN(Number(projectId))) {
      res.status(400).send(setResponse(res.statusCode, "Invalid project ID", []));
      return;
    }

    const tasks = await getOrSetCache(
      `tasks:project:${projectId}`,
      () =>
        prisma.tasks.findMany({
          where: { projectId: Number(projectId) },
          include: {
            assignedBy: true,
            taskAssignments: {
              include: {
                user: true
              }
            },
            project: true,
          },
        })
    );
    
    res.status(200).send(setResponse(200, "Tasks found", tasks));
  } catch (error) {
    console.error("Error fetching Tasks:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

export const getTask = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const task = await getOrSetCache(
      `tasks:name:${name}`,
      () =>
        prisma.tasks.findMany({
          where: { name: name },
          include: {
            assignedBy: true,
            taskAssignments: {
              include: {
                user: true
              }
            },
            project: true,
          },
        }),
      600
    );

    if (!task || task.length === 0) {
      res.status(404).send(setResponse(res.statusCode, "Task not found", []));
      return;
    }

    res.status(200).send(setResponse(200, "Task found", task));
  } catch (error) {
    console.error("Error fetching Task:", error);
    res.status(500).send(setResponse(500, "Internal Server Error",[]));
  }
};


export const updateTask = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return 
    }
    const userId = resolveToken(token);
    if (!userId) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return
    }

    const { id } = req.params;
    const {
      name,
      description,
      status,
      dueDate,
      assignedById,
      assignees, 
      projectId,
    } = req.body;

    if (isNaN(Number(id))) {
      res.status(400).send(setResponse(res.statusCode, "Invalid task ID", []));
      return 
    }

    // Verify the task exists
    const existingTask = await isTaskExists(Number(id));
    if (!existingTask) {
      res.status(404).send(setResponse(res.statusCode, "Task not found", []));
      return 
    }

    // Prepare update data - only include fields that were provided
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (dueDate !== undefined) {
      const parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        res.status(400).send(setResponse(400, "Invalid dueDate format", []));
        return 
      }
      updateData.dueDate = parsedDueDate;
    }
    if (assignedById !== undefined) updateData.assignedById = assignedById;
    if (projectId !== undefined) updateData.projectId = projectId;

    // Verify all assignees exist if they were provided
    if (assignees !== undefined) {
      if (!Array.isArray(assignees)) {
        res.status(400).send(setResponse(400, "Assignees must be an array", []));
        return
      }

      const users = await prisma.users.findMany({
        where: {
          id: { in: assignees.map(id => Number(id)) }
        },
        select: { id: true }
      });

      if (users.length !== assignees.length) {
        const missingUsers = assignees.filter(id => 
          !users.some((user: { id: number }) => user.id === Number(id))
        );
        res.status(400).send(setResponse(400, 
          `The following users do not exist: ${missingUsers.join(', ')}`, []));
        return 
      }
    }

    // Update basic task info if there's anything to update
    let updatedTask:any = existingTask;
    if (Object.keys(updateData).length > 0) {
      updatedTask = await prisma.tasks.update({
        where: { id: Number(id) },
        data: updateData,
        include: {
          assignedBy: true,
          taskAssignments: {
            include: {
              user: true
            }
          },
          project: true
        }
      });
    }

    // Handle assignees if they were provided
    if (assignees !== undefined) {
      // First remove all existing assignments
      await prisma.taskAssignment.deleteMany({
        where: { taskId: Number(id) }
      });

      // Then create new assignments if any were provided
      if (assignees.length > 0) {
        await prisma.taskAssignment.createMany({
          data: assignees.map((userId: string) => ({
            taskId: Number(id),
            userId: Number(userId),
            status: 'ASSIGNED'
          }))
        });
      }

      // Refetch the task with updated assignments
      const taskWithAssignments = await prisma.tasks.findUnique({
        where: { id: Number(id) },
        include: {
          assignedBy: true,
          taskAssignments: {
            include: {
              user: true
            }
          },
          project: true
        }
      });

      if (!taskWithAssignments) {
        res.status(500).send(setResponse(500, "Failed to refetch updated task", []));
        return
      }

        updatedTask = taskWithAssignments;
    }
    // Clear cache for all affected users
    const allUserIds = [
      updatedTask.assignedById,
      ...(updatedTask.taskAssignments?.map((a: { userId: number }) => a.userId) || [])
    ];
    
    await deleteCache(
      "tasks:all",
      `tasks:name:${updatedTask.name}`,
      `tasks:name:${existingTask.name}`,
      ...allUserIds.map(id => `tasks:user:${id}`),
      `tasks:project:${updatedTask.projectId}`
    );

    res.status(200).send(setResponse(200, "Task updated", updatedTask));
  } catch (error) {
    console.error("Error updating Task:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", [])); 
  }
};
export const deleteTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized by token", [])); 
      return;
    }

    // Get the task with its assignments before deleting
    const existingTask = await prisma.tasks.findUnique({
      where: { id: Number(id) },
      include: {
        assignedBy: true,
        taskAssignments: {
          include: {
            user: true
          }
        },
        project: true
      }
    });

    if (!existingTask) {
      res.status(404).send(setResponse(res.statusCode, "Task not found", []));
      return;
    }

    // Delete the task (cascade will handle the taskAssignments)
    await prisma.tasks.delete({
      where: { id: Number(id) },
    });

    // Get all user IDs that were assigned to this task
    const assignedUserIds = existingTask.taskAssignments.map(assignment => assignment.userId);
    
    // Clear all relevant cache keys
    const cacheKeysToDelete = [
      "tasks:all",
      `tasks:name:${existingTask.name}`,
      `tasks:user:${existingTask.assignedById}`,
      ...assignedUserIds.map(id => `tasks:user:${id}`),
      `tasks:project:${existingTask.projectId}`,
      `projects:user:${existingTask.assignedById}`,
      ...assignedUserIds.map(id => `projects:user:${id}`)
    ];

    await deleteCache(...cacheKeysToDelete);

    res.status(200).send(setResponse(res.statusCode, "Task deleted successfully", [
      {
        id: existingTask.id,
        name: existingTask.name,
        projectId: existingTask.projectId
      }
    ]));
  } catch (error) {
    console.error("Error deleting Task:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};

export const unassignTask = async (req: Request, res: Response) => {
  try {
    const { taskId, userId } = req.params;

    if (!taskId || !userId) {
      res.status(400).send(setResponse(400, "Task ID and User ID are required", []));
      return;
    }

    // Delete the assignment
    const assignment = await prisma.taskAssignment.delete({
      where: {
        taskId_userId: {
          taskId: Number(taskId),
          userId: Number(userId)
        }
      }
    });

    // Clear relevant cache
    await deleteCache(
      `tasks:user:${userId}`,
      `tasks:project:${assignment.taskId}`
    );

    res.status(200).send(setResponse(200, "User unassigned from task successfully", []));
  } catch (error) {
    console.error("Error unassigning user from task:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};
export const assignTask = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).send(setResponse(res.statusCode, "Unauthorized", []));
      return;
    }

    const { taskId } = req.params;
    const { userIds } = req.body; // Array of user IDs to assign

    if (!taskId || !userIds || !Array.isArray(userIds)) {
      res.status(400).send(setResponse(400, "Task ID and user IDs array are required", []));
      return;
    }

    // Check if task exists
    const task = await prisma.tasks.findUnique({
      where: { id: Number(taskId) }
    });
    if (!task) {
      res.status(404).send(setResponse(404, "Task not found",[]));
      return;
    }

    // Check if users exist
    const users = await prisma.users.findMany({
      where: { id: { in: userIds.map(id => Number(id)) } },
      select: { id: true },
    });

    if (users.length !== userIds.length) {
      const missingIds = userIds.filter(id => !users.some(user => user.id === Number(id)));
      res.status(400).send(setResponse(400, `Invalid user IDs: ${missingIds.join(', ')}` ,[]));
      return;
    }

    // Create assignments
    await prisma.taskAssignment.createMany({
      data: userIds.map(userId => ({
        taskId: Number(taskId),
        userId: Number(userId),
        status: 'ASSIGNED'
      })),
      skipDuplicates: true // Skip if assignment already exists
    });

    // Get updated task with assignments
    const updatedTask = await prisma.tasks.findUnique({
      where: { id: Number(taskId) },
      include: {
        taskAssignments: {
          include: {
            user: true
          }
        }
      }
    });

    // Clear relevant cache
    await deleteCache(
      `tasks:user:${task.assignedById}`,
      ...userIds.map(id => `tasks:user:${id}`),
      `tasks:project:${task.projectId}`
    );

    res.status(200).send(setResponse(200, "Users assigned to task successfully", updateProject));
  } catch (error) {
    console.error("Error assigning users to task:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};