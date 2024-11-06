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
app.post("/posts/:postId/quote", isAuthenticated, async (c) => {
  const postId: string = c.req.param("postId");
  const userId: string = c.get("jwtPayload").sub;
});

// MARK: リポストを削除
app.delete("/posts/:postId/quote", isAuthenticated, async (c) => {
  const postId: string = c.req.param("postId");
  const userId: string = c.get("jwtPayload").sub;
});

export default app;
