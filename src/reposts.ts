import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: リポスト
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

    await prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        ref_count: {
          increment: 1,
        },
      },
    });

    return c.json({ success: true }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to repost the post" }, 400);
  }
});

// MARK: リポストを削除
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

    await prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        ref_count: {
          decrement: 1,
        },
      },
    });

    return c.json({ success: true }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to delete repost" }, 400);
  }
});

export default app;
