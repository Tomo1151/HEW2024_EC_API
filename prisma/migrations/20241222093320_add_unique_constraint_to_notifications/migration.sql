/*
  Warnings:

  - You are about to drop the column `content` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the `user_notifications` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[type,senderId,recepientId,relPostId]` on the table `notifications` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `recepientId` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderId` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `posts` DROP FOREIGN KEY `posts_repliedId_fkey`;

-- DropForeignKey
ALTER TABLE `user_notifications` DROP FOREIGN KEY `user_notifications_notificationId_fkey`;

-- DropForeignKey
ALTER TABLE `user_notifications` DROP FOREIGN KEY `user_notifications_userId_fkey`;

-- AlterTable
ALTER TABLE `notifications` DROP COLUMN `content`,
    ADD COLUMN `recepientId` VARCHAR(191) NOT NULL,
    ADD COLUMN `relPostId` VARCHAR(191) NULL,
    ADD COLUMN `senderId` VARCHAR(191) NOT NULL,
    ADD COLUMN `type` INTEGER NOT NULL;

-- DropTable
DROP TABLE `user_notifications`;

-- CreateIndex
CREATE UNIQUE INDEX `notifications_type_senderId_recepientId_relPostId_key` ON `notifications`(`type`, `senderId`, `recepientId`, `relPostId`);

-- AddForeignKey
ALTER TABLE `posts` ADD CONSTRAINT `posts_repliedId_fkey` FOREIGN KEY (`repliedId`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_relPostId_fkey` FOREIGN KEY (`relPostId`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recepientId_fkey` FOREIGN KEY (`recepientId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
