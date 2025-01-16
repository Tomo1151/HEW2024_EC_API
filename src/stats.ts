import { PrismaClient, Purchase } from "@prisma/client";
import { Hono } from "hono";

import isAuthenticated from "./middlewares/isAuthenticated.js";
import { getPostParams } from "./queries.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

// MARK: スキーマ定義

// MARK:
app.get("/", isAuthenticated, async (c) => {
  const userId: string = c.get("jwtPayload").sub;

  try {
    const posts = await prisma.post.findMany({
      where: { userId: userId },
    });

    // 30日以内の日別インプレッション
    const recentImpressionCounts = await prisma.dailyPostImpression.groupBy({
      by: ["dateKey"],
      where: {
        postId: { in: posts.map((post) => post.id) },
        dateKey: { gte: THIRTY_DAYS_AGO },
      },
      _sum: { impression: true },
    });

    // 30日以前の累計インプレッション
    const totalImpressionCount = await prisma.dailyPostImpression.aggregate({
      where: {
        postId: { in: posts.map((post) => post.id) },
        dateKey: { lt: THIRTY_DAYS_AGO },
      },
      _sum: { impression: true },
    });

    // 30日以内の日別フォロワー
    const recentFollowerCounts = await prisma.follow.groupBy({
      by: ["dateKey"],
      where: {
        followeeId: userId,
        dateKey: { gte: THIRTY_DAYS_AGO },
      },
      _count: { followeeId: true },
    });

    // 30日以前の累計フォロワー
    const totalFollowerCount = await prisma.follow.count({
      where: {
        followeeId: userId,
        dateKey: { lt: THIRTY_DAYS_AGO },
      },
    });

    // 30日以内の日別売上
    const recentPurchases = await prisma.purchase.findMany({
      where: {
        product: {
          post: { author: { id: userId } },
        },
        dateKey: { gte: THIRTY_DAYS_AGO },
      },
      select: {
        dateKey: true,
        purchase_price: true,
      },
    });

    // 30日以前の累計売上
    const totalSales = await prisma.purchase.aggregate({
      where: {
        product: {
          post: { author: { id: userId } },
        },
        dateKey: { lt: THIRTY_DAYS_AGO },
      },
      _sum: { purchase_price: true },
    });

    const impressions = {
      daily: recentImpressionCounts.reduce<Record<string, number>>(
        (acc, impression) => {
          acc[impression.dateKey] = Math.floor(
            (impression._sum.impression ?? 0) / 2
          );
          return acc;
        },
        {}
      ),
      total: Math.floor((totalImpressionCount._sum.impression ?? 0) / 2),
    };

    const followers = {
      daily: recentFollowerCounts.reduce<Record<string, number>>(
        (acc, follower) => {
          acc[follower.dateKey] = follower._count.followeeId ?? 0;
          return acc;
        },
        {}
      ),
      total: totalFollowerCount,
    };

    const sales = {
      daily: recentPurchases.reduce<Record<string, number>>((acc, sale) => {
        const key = sale.dateKey;
        acc[key] = (acc[key] ?? 0) + sale.purchase_price;
        return acc;
      }, {}),
      total: totalSales._sum.purchase_price ?? 0,
    };

    return c.json(
      {
        success: true,
        data: { impressions, followers, sales },
      },
      200
    );
  } catch (e) {
    return c.json({ success: false, error: "Failed to fetch statistics" }, 400);
  }
});

app.get("/sales", isAuthenticated, async (c) => {
  const userId: string = c.get("jwtPayload").sub;

  try {
    const purchases = await prisma.purchase.findMany({
      where: {
        product: {
          post: {
            author: {
              id: userId,
            },
          },
        },
      },
      include: {
        product: true,
      },
    });

    const sales = purchases.reduce<Record<string, Purchase[]>>((acc, sale) => {
      const key = sale.productId;
      if (acc[key]) {
        acc[key].push(sale);
      } else {
        acc[key] = [sale];
      }
      return acc;
    }, {});

    return c.json({ success: true, data: sales }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to get sales" }, 400);
  }
});

export default app;
