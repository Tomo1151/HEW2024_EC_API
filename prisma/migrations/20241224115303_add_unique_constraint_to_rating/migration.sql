/*
  Warnings:

  - A unique constraint covering the columns `[productId,userId]` on the table `product_ratings` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `product_ratings_productId_userId_key` ON `product_ratings`(`productId`, `userId`);
