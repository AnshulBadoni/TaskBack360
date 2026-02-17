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
        },
        orderBy: { updatedAt: "desc" },
      }),
      600
    );

    if (!projects || projects.length === 0) {
      res.status(200).send(setResponse(200, "Projects fetched successfully", []));
      return;
    }

    const projectIds = projects.map((project) => project.id);

    const taskGroups = await prisma.tasks.groupBy({
      by: ["projectId", "status"],
      where: { projectId: { in: projectIds } },
      _count: { _all: true },
    });

    const statsByProject = new Map<number, { total: number; completed: number; overdue: number; inProgress: number }>();

    for (const group of taskGroups) {
      const current = statsByProject.get(group.projectId) ?? {
        total: 0,
        completed: 0,
        overdue: 0,
        inProgress: 0,
      };

      const count = group._count._all;
      current.total += count;

      if (group.status === "DONE") {
        current.completed += count;
      } else if (group.status === "OVERDUE") {
        current.overdue += count;
      } else if (group.status === "IN_PROGRESS") {
        current.inProgress += count;
      }

      statsByProject.set(group.projectId, current);
    }

    const projectsWithStats = projects.map((project) => ({
      ...project,
      taskStats: statsByProject.get(project.id) ?? {
        total: 0,
        completed: 0,
        overdue: 0,
        inProgress: 0,
      },
    }));
    res.status(200).send(setResponse(200, "Projects fetched successfully", projectsWithStats));
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).send(setResponse(500, "Internal Server Error", []));
  }
};
