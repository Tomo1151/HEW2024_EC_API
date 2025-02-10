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
const purchaseSchema = z.array(
  z.object({
    productId: z.string(),
    priceId: z.string(),
  })
);
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
    // 必要なデータの取得
    const userId: string = c.get("jwtPayload").sub;
    const requestProducts: Array<{ productId: string; priceId: string }> =
      c.req.valid("json");

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${
      now.getMonth() + 1
    }-${now.getDate()}`;
    // console.log(userId, requestProducts);
    try {
      // トランザクション処理
      const purchases = await prisma.$transaction(async (prisma) => {
        const purchases: {
          id: string;
          purchase_price: number;
          created_at: Date;
          updated_at: Date;
          productId: string;
          userId: string;
        }[] = [];

        // 購入商品の取得
        const products = await prisma.product.findMany({
          where: {
            id: {
              in: requestProducts.map((product) => product.productId),
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
            price_histories: {
              orderBy: {
                created_at: "desc",
              },
              select: {
                id: true,
                price: true,
                productId: true,
                created_at: true,
              },
            },
          },
        });

        for (const product of products) {
          if (product.price_histories.length === 0) {
            throw new Error("購入価格が不正です");
          }

          const priceId = requestProducts.find(
            (p) => p.productId === product.id
          )?.priceId;

          if (!priceId) {
            throw new Error("購入価格が不正です");
          }

          let price;
          for (let i = 0; i < product.price_histories.length; i++) {
            if (product.price_histories[i].id === priceId) {
              // もしpriceIdが5分以上前かつ最新ではないのものだったらエラーを返す
              if (
                now.getTime() -
                  product.price_histories[i].created_at.getTime() >
                  5 * 60 * 1000 &&
                i !== 0
              ) {
                throw new Error("その価格での購入はできません");
              }
              price = product.price_histories[i].price;
              break;
            }
          }

          if (!price) {
            throw new Error("購入価格が不正です");
          }

          const purchase = await prisma.purchase.create({
            data: {
              userId,
              purchase_price: price,
              productId: product.id,
              dateKey: dateStr,
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
            console.error("通知の送信に失敗しました");
          }
        }

        return purchases;
      });

      return c.json(
        { success: true, data: { purchases }, length: purchases.length },
        200
      );
    } catch (e) {
      console.error(e);
      return c.json(
        { success: false, error: ["商品の購入に失敗しました"] },
        400
      );
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
              price_histories: {
                orderBy: {
                  created_at: "desc",
                },
                take: 1,
                select: {
                  id: true,
                  price: true,
                },
              },
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
