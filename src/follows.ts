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
    // userテーブルからidを取得
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        id: true,
      },
    });

    // idからフォロワーリストを取得
    const followerList = await prisma.follow.findMany({
      where: {
        followerId: user.id,
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
        data: followerList,
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
    // userテーブルからidを取得
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        id: true,
      },
    });

    // idからフォロー中リストを取得
    const followeeList = await prisma.follow.findMany({
      where: {
        followeeId: user.id,
      },
      select: {
        follower: {
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
        data: followeeList,
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
    // userテーブルからidを取得
    const reqUser = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        id: true,
      },
    });

    // 自分自身をフォローしようとした際の例外処理
    if (reqUser.id === userId) {
      return c.json({ success: false, error: "Can't follow myself" }, 400);
    }

    // フォローテーブルにデータを追加
    await prisma.follow.create({
      data: {
        followerId: userId,
        followeeId: reqUser.id,
      },
    });

    return c.json({ success: true, error: "User followed successfully" }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Invalid Request data" }, 400);
  }
});

// MARK: フォローをはずす
app.delete("/:username/follow", isAuthenticated, async (c) => {
  const reqUsername: string = c.req.param("username");
  const userId: string = c.get("jwtPayload").sub;

  try {
    // userテーブルからidを取得
    const reqUser = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        id: true,
      },
    });

    // フォローテーブルから削除
    await prisma.follow.delete({
      where: {
        followerId_followeeId: {
          followerId: userId,
          followeeId: reqUser.id,
        },
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
