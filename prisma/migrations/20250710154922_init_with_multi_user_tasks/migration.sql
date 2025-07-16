/*
  Warnings:

  - You are about to drop the column `assignedToId` on the `Tasks` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Tasks" DROP CONSTRAINT "Tasks_assignedToId_fkey";

-- AlterTable
ALTER TABLE "Tasks" DROP COLUMN "assignedToId";
