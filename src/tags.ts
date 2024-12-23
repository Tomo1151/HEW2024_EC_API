import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: タグ一覧取得
app.get("/", async (c) => {
  const tags = await prisma.tag.findMany({
    select: {
      name: true,
      created_at: true,
    },
  });
  return c.json({
    success: true,
    data: tags,
    length: tags.length,
  });
});

export default app;
