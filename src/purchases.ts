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

// 購入履歴の取得GETのスキーマ
const getPurchaseSchema = z.object({
  before: z.string(),
});

// 購入POSTのスキーマ
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
          include: {
            post: {
              include: {
                author: {
                  select: {
                    id: true,
                  },
                },
              },
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

          try {
            // @TODO 同じ人が同じ商品を購入したときに発生するUNIQUE制約違反を直す
            await sendNotification({
              type: NOTIFICATION_TYPES.PURCHASE,
              senderId: userId,
              recepientId: product.post.author.id,
              relPostId: product.post.id,
            });
          } catch (e) {
            // console.error(e);
            console.error("Failed to send notification");
          }
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

// MARK: 購入履歴の取得
app.get(
  "/",
  isAuthenticated,
  zValidator("query", getPurchaseSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        400
      );
    }
  }),
  async (c) => {
    const userId: string = c.get("jwtPayload").sub;
    const before: string = c.req.valid("query").before;

    try {
      let targetPurchase;
      if (before) {
        targetPurchase = await prisma.purchase.findUniqueOrThrow({
          where: { id: before },
          select: { created_at: true },
        });
      }

      const purchases = await prisma.purchase.findMany({
        where: {
          userId,
          created_at: targetPurchase
            ? {
                lt: targetPurchase.created_at,
              }
            : {},
        },
        orderBy: {
          created_at: "desc",
        },
        take: 10,
        select: {
          id: true,
          purchase_price: true,
          created_at: true,
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              thumbnail_link: true,
              post: {
                select: {
                  author: {
                    select: {
                      id: true,
                      username: true,
                      nickname: true,
                      icon_link: true,
                    },
                  },
                  id: true,
                  content: true,
                  images: {
                    select: {
                      image_link: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return c.json({ success: true, data: purchases }, 200);
    } catch (e) {
      return c.json(
        { success: false, error: "Failed to fetch purchases" },
        400
      );
    }
  }
);

export default app;
