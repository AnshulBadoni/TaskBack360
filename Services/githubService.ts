import { Request, Response } from "express";

export class GithubService {
    private static get GITHUB_CLIENT_ID() { return process.env.GITHUB_CLIENT_ID; }
    private static get GITHUB_CLIENT_SECRET() { return process.env.GITHUB_CLIENT_SECRET; }

    static async getAccessToken(code: string): Promise<string | null> {
        try {
            const response = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    client_id: this.GITHUB_CLIENT_ID,
                    client_secret: this.GITHUB_CLIENT_SECRET,
                    code,
                }),
            });

            const data: any = await response.json();
            return data.access_token || null;
        } catch (error) {
            console.error("Error fetching GitHub access token:", error);
            return null;
        }
    }

    static async getUser(accessToken: string): Promise<any> {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'TaskBack360-App'
                },
            });
            return await response.json();
        } catch (error) {
            console.error("Error fetching GitHub user:", error);
            return null;
        }
    }

    static async getCommits(accessToken: string, repo: string): Promise<any[]> {
        try {
            const response = await fetch(`https://api.github.com/repos/${repo}/commits`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'TaskBack360-App'
                },
            });
            return await response.json() as any[];
        } catch (error) {
            console.error("Error fetching GitHub commits:", error);
            return [];
        }
    }

    static async getIssues(accessToken: string, repo: string): Promise<any[]> {
        try {
            const response = await fetch(`https://api.github.com/repos/${repo}/issues?state=open`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'TaskBack360-App'
                },
            });
            return await response.json() as any[];
        } catch (error) {
            console.error("Error fetching GitHub issues:", error);
            return [];
        }
    }
}
