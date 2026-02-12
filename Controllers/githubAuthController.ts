import { Request, Response } from "express";
import prisma from "../Connection/prisma";
import { GithubService } from "../Services/githubService";
import { setResponse } from "../DTO";
import jwt from "jsonwebtoken";

export const redirectToGithub = (req: Request, res: Response) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = process.env.GITHUB_CALLBACK_URL;
    const scope = "user:email repo";
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
    res.redirect(url);
};

export const handleGithubCallback = async (req: Request, res: Response) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send(setResponse(400, "Code is missing", []));
        }

        const accessToken = await GithubService.getAccessToken(code as string);
        if (!accessToken) {
            return res.status(401).send(setResponse(401, "Failed to get access token", []));
        }

        const githubUser = await GithubService.getUser(accessToken);
        if (!githubUser) {
            return res.status(500).send(setResponse(500, "Failed to get GitHub user info", []));
        }

        let user = await prisma.users.findUnique({
            where: { githubId: githubUser.id.toString() },
        });

        if (!user) {
            const email = githubUser.email || `${githubUser.login}@github.com`;

            user = await prisma.users.findUnique({
                where: { email: email }
            });

            if (user) {
                user = await prisma.users.update({
                    where: { id: user.id },
                    data: {
                        githubId: githubUser.id.toString(),
                        githubAccessToken: accessToken
                    }
                });
            } else {
                user = await prisma.users.create({
                    data: {
                        username: githubUser.login,
                        email: email,
                        password: "github-oauth-managed",
                        compcode: "GITHUB",
                        avatar: githubUser.avatar_url,
                        githubId: githubUser.id.toString(),
                        githubAccessToken: accessToken
                    }
                });
            }
        } else {
            user = await prisma.users.update({
                where: { id: user.id },
                data: { githubAccessToken: accessToken }
            });
        }

        const token = jwt.sign(
            { id: user.id },
            process.env.secretKey || "defaultSecretKey",
            { expiresIn: 1 * 24 * 60 * 60 * 1000 }
        );

        res.cookie("jwt", token, {
            maxAge: 1 * 24 * 60 * 60 * 1000,
            httpOnly: true,
        });

        // Send token and user info back to frontend
        // In a real app, you'd redirect back to your frontend with the token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}?token=${token}`);
    } catch (error) {
        console.error("GitHub Auth Error:", error);
        res.status(500).send(setResponse(500, "Internal Server Error", error));
    }
};
