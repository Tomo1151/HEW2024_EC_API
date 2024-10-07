import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import isAuthenticated from "./middlewares/isAuthenticated";

const app: Hono = new Hono();
const prisma = new PrismaClient();

const postCreateSchema = z.object({
  content: z.string().min(1),
});

// すべての投稿を取得 (テスト用)
app.get("/", async (c) => {
  try {
    const posts = await prisma.post.findMany();
    return c.json({ success: true, data: posts, length: posts.length }, 200);
  } catch {
    return c.json({ success: false, error: "Failed to fetch posts" }, 500);
  }
});

// IDで指定された投稿を取得
app.get("/:id", async (c) => {
  try {
    const post = await prisma.post.findUnique({
      where: {
        id: c.req.param("id"),
      },
    });
    return c.json({ success: true, data: post }, 200);
  } catch {
    return c.json({ success: false, error: "Failed to fetch post" }, 500);
  }
});

// 投稿を作成
app.post(
  "/",
  isAuthenticated,
  zValidator("json", postCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error, data: null }, 400);
    }
  }),
  async (c) => {
    const { content }: { content: string } = c.req.valid("json");
    const userId = c.get("jwtPayload").sub;
    try {
      const post = await prisma.post.create({
        data: {
          content,
          userId,
        },
      });
      return c.json({ success: true, data: post }, 201);
    } catch {
      return c.json(
        { success: false, error: "Failed to create post", data: null },
        500
      );
    }
  }
);

export default app;
