import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";
import { getPostParams } from "./queries.js";
import { getUserIdFromCookie } from "./utils.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
const quoteTimelineSchema = z.object({
  type: z.union([z.literal("posts"), z.literal("products")]),
  before: z.string(),
});

// MARK: 引用の一覧を取得
app.get(
  "/posts/:quotedId/quotes",
  zValidator("query", quoteTimelineSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }
  }),
  async (c) => {
    const quotedId: string = c.req.param("quotedId");
    const userId: string = await getUserIdFromCookie(c);
    const type: string = c.req.valid("query").type;
    const before: string = c.req.valid("query").before;

    console.log("quotedId", quotedId);

    try {
      let targetPost;

      if (before) {
        targetPost = await prisma.post.findUnique({
          where: {
            id: before,
          },
        });
      }

      const quotes = await prisma.post.findMany({
        where: {
          AND: [
            { quotedId },
            targetPost ? { created_at: { lt: targetPost.created_at } } : {},
          ],
          ...(type === "products" ? { NOT: { product: null } } : {}),
        },
        orderBy: {
          created_at: "desc",
        },
        take: 10,
        ...getPostParams(userId),
      });

      const productRatings = await prisma.productRating.groupBy({
        by: ["productId"],
        _count: {
          id: true,
        },
        where: {
          productId: {
            in: quotes.map((quote) => quote.product?.id || ""),
          },
        },
      });

      const returnPosts = quotes.map((quote) => {
        const productRating = productRatings.find(
          (productRating) => productRating.productId === quote.product?.id
        );

        return {
          ...quote,
          productRatingCount: productRating?._count?.id || 0,
        };
      });

      return c.json({
        success: true,
        data: returnPosts.toReversed(),
        length: returnPosts.length,
      });
    } catch (e) {
      return c.json({ success: false, error: "Quote posts not found" }, 500);
    }
  }
);

export default app;
