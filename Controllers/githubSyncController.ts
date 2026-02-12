import { Request, Response } from "express";
import prisma from "../Connection/prisma";
import { GithubService } from "../Services/githubService";
import { setResponse } from "../DTO";
import { resolveToken } from "../utils";

export const syncGithubData = async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).send(setResponse(401, "Unauthorized", []));
        }
        const userId = resolveToken(token);
        if (!userId) {
            return res.status(401).send(setResponse(401, "Invalid token", []));
        }

        const { projectId } = req.params;
        const project = await prisma.projects.findUnique({
            where: { id: Number(projectId) },
            include: { users: true }
        });

        if (!project) {
            return res.status(404).send(setResponse(404, "Project not found", []));
        }

        const isMember = project.users.some((u: any) => u.id === Number(userId));
        if (!isMember) {
            return res.status(403).send(setResponse(403, "Not a project member", []));
        }

        if (!project.githubRepo) {
            return res.status(400).send(setResponse(400, "Project has no GitHub repo linked", []));
        }

        const user = await prisma.users.findUnique({
            where: { id: Number(userId) }
        });

        if (!user?.githubAccessToken) {
            return res.status(400).send(setResponse(400, "User has not connected GitHub", []));
        }

        // 1. Sync Commits
        const commits = await GithubService.getCommits(user.githubAccessToken, project.githubRepo);
        let commitsCount = 0;
        if (Array.isArray(commits)) {
            for (const commit of commits) {
                const existingMessage = await prisma.message.findFirst({
                    where: {
                        projectId: project.id,
                        content: { contains: commit.sha }
                    }
                });

                if (!existingMessage) {
                    await prisma.message.create({
                        data: {
                            content: `[GitHub Commit] ${commit.commit.message}\nSHA: ${commit.sha}\nAuthor: ${commit.commit.author.name}`,
                            messageType: 'SYSTEM',
                            projectId: project.id,
                            senderId: user.id
                        }
                    });
                    commitsCount++;
                }
            }
        }

        // 2. Sync Issues
        const issues = await GithubService.getIssues(user.githubAccessToken, project.githubRepo);
        let issuesCount = 0;
        if (Array.isArray(issues)) {
            for (const issue of issues) {
                if (issue.pull_request) continue;

                const existingTask = await prisma.tasks.findUnique({
                    where: { githubIssueId: issue.id }
                });

                if (!existingTask) {
                    await prisma.tasks.create({
                        data: {
                            name: issue.title,
                            description: issue.body || "No description provided",
                            status: 'OPEN',
                            dueDate: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
                            assignedById: user.id,
                            projectId: project.id,
                            githubIssueId: issue.id,
                            githubIssueNumber: issue.number
                        }
                    });
                    issuesCount++;
                }
            }
        }

        res.status(200).send(setResponse(200, "Sync completed successfully", {
            commitsSynced: commitsCount,
            issuesSynced: issuesCount
        }));
    } catch (error) {
        console.error("GitHub Sync Error:", error);
        res.status(500).send(setResponse(500, "Internal Server Error", error));
    }
};
