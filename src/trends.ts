import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";

import { getUserIdFromCookie } from "./utils.js";
import isAuthenticated from "./middlewares/isAuthenticated.js";

import { NOTIFICATION_TYPES } from "../constants/notifications.js";
import { sendNotification } from "./utils.js";
import { getPostParams } from "./queries.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: トレンドの取得
app.get("/", async (c) => {
  const userId: string = await getUserIdFromCookie(c);
  const take: number = 3;

  try {
    const trendingTags = await prisma.tag.findMany({
      take,
      orderBy: {
        tagged_posts: {
          _count: "desc",
        },
      },
      select: {
        name: true,
        created_at: true,
        _count: {
          select: {
            tagged_posts: true,
          },
        },
      },
    });

    // productのpostのlike_count+ref_count+comment_countの合計が多い順に取得
    const trendingProducts = await prisma.product.findMany({
      take,
      orderBy: {
        Purchase: {
          _count: "desc",
        },
      },
      select: {
        created_at: true,
        name: true,
        post: {
          select: {
            id: true,
            author: {
              select: {
                id: true,
                username: true,
                nickname: true,
                icon_link: true,
              },
            },
            like_count: true,
            ref_count: true,
            comment_count: true,
          },
        },
        _count: {
          select: {
            Purchase: true,
          },
        },
      },
    });

    // console.log(trendingProducts);

    return c.json(
      {
        success: true,
        data: { products: trendingProducts, tags: trendingTags },
      },
      200
    );
  } catch (e) {
    console.error(e);
    return c.json({ success: false, error: "Failed to fetch trendings" }, 400);
  }
});

export default app;
