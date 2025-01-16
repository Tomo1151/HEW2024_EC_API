/*
  Warnings:

  - Added the required column `dateKey` to the `follows` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dateKey` to the `purchases` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `follows` ADD COLUMN `dateKey` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `purchases` ADD COLUMN `dateKey` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `daily_post_impressions` (
    `postId` VARCHAR(191) NOT NULL,
    `impression` INTEGER NOT NULL DEFAULT 0,
    `dateKey` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`postId`, `dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
