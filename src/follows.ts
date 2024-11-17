import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: フォロワーリスト
// not function
app.get("/follows/:userId", async (c) => {
  const param_userId: string = c.req.param("userId");

  try {
    const follower_list = 
    await prisma.follow.findUnique({
      where: {
        id: param_userId,
      },
    });

    return c.json({
      
      success: true,
      data: {
        user_id: param_userId,
        followers: follower_list
      }
  
  }, 200);
  } catch (e) {
    return c.json({ success: false, error: "User not found" }, 400);
  }
});

export default app;
