import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: いいね
app.post("/posts/:postId/repost", isAuthenticated, async (c) => {
  const postId: string = c.req.param("postId");
  const userId: string = c.get("jwtPayload").sub;

  try {
    await prisma.repost.create({
      data: {
        userId,
        postId,
      },
    });

    return c.json({ success: true }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to repost the post" }, 400);
  }
});

// MARK: いいねをはずす
app.delete("/posts/:postId/repost", isAuthenticated, async (c) => {
  const postId: string = c.req.param("postId");
  const userId: string = c.get("jwtPayload").sub;

  try {
    await prisma.repost.delete({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    return c.json({ success: true }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to delete repost" }, 400);
  }
});

export default app;
