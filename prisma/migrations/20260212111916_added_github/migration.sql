/*
  Warnings:

  - A unique constraint covering the columns `[githubIssueId]` on the table `Tasks` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[githubId]` on the table `Users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Projects" ADD COLUMN     "githubRepo" TEXT;

-- AlterTable
ALTER TABLE "Tasks" ADD COLUMN     "githubIssueId" INTEGER,
ADD COLUMN     "githubIssueNumber" INTEGER;

-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "githubAccessToken" TEXT,
ADD COLUMN     "githubId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tasks_githubIssueId_key" ON "Tasks"("githubIssueId");

-- CreateIndex
CREATE UNIQUE INDEX "Users_githubId_key" ON "Users"("githubId");
