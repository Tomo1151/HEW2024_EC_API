-- AlterTable
ALTER TABLE `posts` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `is_superuser` BOOLEAN NOT NULL DEFAULT false;
