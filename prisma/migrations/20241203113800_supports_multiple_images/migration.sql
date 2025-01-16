/*
  Warnings:

  - You are about to drop the column `image_link` on the `posts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `posts` DROP COLUMN `image_link`;

-- CreateTable
CREATE TABLE `post_images` (
    `id` VARCHAR(191) NOT NULL,
    `image_link` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `post_images_id_key`(`id`),
    UNIQUE INDEX `post_images_image_link_key`(`image_link`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `post_images` ADD CONSTRAINT `post_images_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
