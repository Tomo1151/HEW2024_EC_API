import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import isAuthenticated from "./middlewares/isAuthenticated.js";

import { NOTIFICATION_TYPES } from "../constants/notifications.js";
import { sendNotification } from "./utils.js";
import { getPostParams } from "./queries.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
const purchaseSchema = z.object({
  productIds: z.array(z.string()),
});

// MARK: 購入
app.post(
  "/",
  isAuthenticated,
  zValidator("json", purchaseSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const userId: string = c.get("jwtPayload").sub;
    const { productIds }: { productIds: string[] } = c.req.valid("json");

    try {
      const purchases = await prisma.$transaction(async (prisma) => {
        const purchases = [];
        const products = await prisma.product.findMany({
          where: {
            id: {
              in: productIds,
            },
          },
        });

        for (const product of products) {
          if (product.price === null) {
            throw new Error("Product price cannot be null");
          }

          const purchase = await prisma.purchase.create({
            data: {
              userId,
              purchase_price: product.price,
              productId: product.id,
            },
          });

          purchases.push(purchase);
        }

        return purchases;
      });

      return c.json(
        { success: true, data: { purchases }, length: purchases.length },
        200
      );
    } catch (e) {
      return c.json({ success: false, error: "Failed to like the post" }, 400);
    }
  }
);

export default app;
