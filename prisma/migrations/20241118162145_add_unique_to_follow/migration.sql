/*
  Warnings:

  - You are about to drop the column `postId` on the `posts` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[followerId,followeeId]` on the table `follows` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `posts` DROP FOREIGN KEY `posts_postId_fkey`;

-- AlterTable
ALTER TABLE `posts` DROP COLUMN `postId`,
    ADD COLUMN `repliedId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `follows_followerId_followeeId_key` ON `follows`(`followerId`, `followeeId`);

-- AddForeignKey
ALTER TABLE `posts` ADD CONSTRAINT `posts_repliedId_fkey` FOREIGN KEY (`repliedId`) REFERENCES `posts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
