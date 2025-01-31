-- AlterTable
ALTER TABLE `posts` ADD COLUMN `quotedId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `posts` ADD CONSTRAINT `posts_quotedId_fkey` FOREIGN KEY (`quotedId`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
