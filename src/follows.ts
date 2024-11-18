import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
// フォローするのスキーマ
const followSchema = z.object({
  followed_user_id: z.string(),
});

// MARK: フォロワーリスト
// not working
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

// MARK: フォローをつける
app.post("/follows/", isAuthenticated,
  zValidator("json", followSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: "Invalid Request data" }, 400);
    }
  }),
  async (c) =>{
  const { followed_user_id } = c.req.valid("json");
  const userId: string = c.get("jwtPayload").sub;

  try{
    await prisma.follow.create({
      data: {
        followerId: userId,
        followeeId: followed_user_id,
      },
    });

    return c.json({ success: true, error: "User followed successfully" }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Invalid Request data" }, 400);
  }
});

// MARK: フォローをはずす
app.delete("/follows/:req_userId", isAuthenticated, async (c) =>{
  const req_userId: string = c.req.param("req_userId");
  const userId: string = c.get("jwtPayload").sub;

  try{
    await prisma.follow.deleteMany({
      where: {
        followerId: userId,
        followeeId: req_userId,
      },
    });

    return c.json({ success: true, error: "User unfollowed successfully" }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Follow relationship not found" }, 404);
  }
});

export default app;
