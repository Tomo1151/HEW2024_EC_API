import { PrismaClient, Purchase } from "@prisma/client";
import { Hono } from "hono";

import isAuthenticated from "./middlewares/isAuthenticated.js";
import { getPostParams } from "./queries.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK:
app.get("/", isAuthenticated, async (c) => {
  const userId: string = c.get("jwtPayload").sub;

  try {
    const posts = await prisma.post.findMany({
      where: {
        userId: userId,
      },
    });
    const impressionCounts = await prisma.dailyPostImpression.groupBy({
      by: ["dateKey"],
      where: {
        postId: {
          in: posts.map((post) => post.id),
        },
      },
      _sum: {
        impression: true,
      },
    });

    const impressions = impressionCounts.reduce<Record<string, number>>(
      (acc, impression) => {
        const key: string = impression.dateKey;
        acc[key] = Math.floor((impression._sum.impression ?? 0) / 2);
        return acc;
      },
      {}
    );

    const followerCounts = await prisma.follow.groupBy({
      by: ["dateKey"],
      where: {
        followeeId: userId,
      },
      _count: {
        followeeId: true,
      },
    });

    const followers = followerCounts.reduce<Record<string, number>>(
      (acc, follower) => {
        const key: string = follower.dateKey;
        acc[key] = follower._count.followeeId ?? 0;
        return acc;
      },
      {}
    );

    // const soldCounts = await prisma.purchase.groupBy({
    //   by: ["dateKey"],
    //   where: {
    //     product: {
    //       post: {
    //         author: {
    //           id: userId,
    //         },
    //       },
    //     },
    //   },
    //   _count: {
    //     userId: true,
    //   },
    // });
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
      select: {
        dateKey: true,
        product: true,
        purchase_price: true,
      },
    });

    const sales = purchases.reduce<Record<string, number>>((acc, sale) => {
      const key = sale.dateKey;
      if (acc[key]) {
        acc[key] += sale.purchase_price;
      } else {
        acc[key] = sale.purchase_price;
      }
      return acc;
    }, {});

    return c.json(
      {
        success: true,
        data: { impressions, followers, /*soldCounts,*/ sales },
      },
      200
    );
  } catch (e) {
    return c.json({ success: false, error: "Failed to like the post" }, 400);
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
