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
app.get("/:username/follows", async (c) => {
  const req_username: string = c.req.param("username");

  try {
    const userId = await prisma.user.findUniqueOrThrow({
      where: {
        username: req_username,
      },
      select: {
        id: true,
      }
    });

    const follower_list = 
    await prisma.follow.findMany({
      where: {
        followerId: userId.id,
      },
      select: {
        followee: {
          select: {
            id: true,
            username: true,
            nickname: true,
      }}}
    });

    return c.json({
      
      success: true,
      data: {
        user_id: req_username,
        followers: follower_list
      }
  
  }, 200);
  } catch (e) {
    return c.json({ success: false, error: "User not found" }, 401);
  }
});

app.get("/:username/followers", async (c) => {
  const req_username: string = c.req.param("username");

  try {
    const userId = await prisma.user.findUniqueOrThrow({
      where: {
        username: req_username,
      },
      select: {
        id: true,
      }
    });

    const follower_list = 
    await prisma.follow.findMany({
      where: {
        followeeId: userId.id,
      },
      select: {
        followee: {
          select: {
            id: true,
            username: true,
            nickname: true,
      }}}
    });

    return c.json({
      
      success: true,
      data: {
        user_id: req_username,
        followers: follower_list
      }
  
  }, 200);
  } catch (e) {
    return c.json({ success: false, error: "User not found" }, 401);
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
