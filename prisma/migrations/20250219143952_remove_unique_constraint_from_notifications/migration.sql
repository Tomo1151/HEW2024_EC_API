-- DropIndex
DROP INDEX `notifications_type_senderId_recepientId_relPostId_key` ON `notifications`;

-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `content` VARCHAR(191) NULL;
