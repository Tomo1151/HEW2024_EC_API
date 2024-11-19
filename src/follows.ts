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
app.get("/:username/follows", async (c) => {
  const reqUsername: string = c.req.param("username");

  try {
    const userId = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        id: true,
      },
    });

    const followerList = await prisma.follow.findMany({
      where: {
        followerId: userId.id,
      },
      select: {
        followee: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
      },
    });

    return c.json(
      {
        success: true,
        data: {
          user_id: reqUsername,
          followers: followerList,
        },
      },
      200
    );
  } catch (e) {
    return c.json({ success: false, error: "User not found" }, 404);
  }
});

// MARK: フォロー中リスト
app.get("/:username/followers", async (c) => {
  const reqUsername: string = c.req.param("username");

  try {
    const userId = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        id: true,
      },
    });

    const followerList = await prisma.follow.findMany({
      where: {
        followeeId: userId.id,
      },
      select: {
        followee: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
      },
    });

    return c.json(
      {
        success: true,
        data: {
          user_id: reqUsername,
          followers: followerList,
        },
      },
      200
    );
  } catch (e) {
    return c.json({ success: false, error: "User not found" }, 404);
  }
});

// MARK: フォローをつける
app.post("/:username/follow/", isAuthenticated, async (c) => {
  const reqUsername: string = c.req.param("username");
  const userId: string = c.get("jwtPayload").sub;

  try {
    const reqUserId = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        id: true,
      },
    });

    if (reqUserId.id === userId) {
      // エラーメッセージを変えてもいいかも
      return c.json({ success: false, error: "Can't follow myself" }, 400);
    }

    await prisma.follow.create({
      data: {
        followerId: userId,
        followeeId: reqUserId.id,
      },
    });

    return c.json({ success: true, error: "User followed successfully" }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Invalid Request data" }, 400);
  }
});

// MARK: フォローをはずす
app.delete("/:username/follow/", isAuthenticated, async (c) => {
  const reqUsername: string = c.req.param("username");
  const userId: string = c.get("jwtPayload").sub;

  try {
    const reqUserId = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        id: true,
      },
    });

    await prisma.follow.deleteMany({
      where: {
        followerId: userId,
        followeeId: reqUserId.id,
      },
    });

    return c.json(
      { success: true, error: "User unfollowed successfully" },
      200
    );
  } catch (e) {
    return c.json({ success: false, error: "User Not Found" }, 404);
  }
});

export default app;
