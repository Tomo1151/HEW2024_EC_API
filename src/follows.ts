import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";
import { getUserIdFromCookie, sendNotification } from "./utils.js";
import { NOTIFICATION_TYPES } from "../constants/notifications.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: フォロワーリスト
app.get("/:username/follows", async (c) => {
  const reqUsername: string = c.req.param("username");
  const userId: string = await getUserIdFromCookie(c);

  try {
    // userテーブルからフォロー中のユーザーのidを取得
    const followIds = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        followees: {
          select: {
            followeeId: true,
          },
        },
      },
    });

    // idからフォロー中のユーザーを取得
    const follows = await prisma.user.findMany({
      where: {
        id: {
          in: followIds.followees.map((follow) => follow.followeeId),
        },
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        bio: true,
        icon_link: true,
        is_superuser: true,
        followers: {
          where: {
            followerId: userId,
          },
          select: {
            followerId: true,
          },
        },
      },
    });

    return c.json(
      {
        success: true,
        data: follows,
      },
      200
    );
  } catch (e) {
    return c.json({ success: false, error: "User not found" }, 404);
  }
});

// MARK: フォロワーリスト
app.get("/:username/followers", async (c) => {
  const reqUsername: string = c.req.param("username");
  const userId: string = await getUserIdFromCookie(c);

  try {
    // userテーブルからidを取得
    const followerIds = await prisma.user.findUniqueOrThrow({
      where: {
        username: reqUsername,
      },
      select: {
        followers: {
          select: {
            followerId: true,
          },
        },
      },
    });

    // idからフォロワーリストを取得
    const followers = await prisma.user.findMany({
      where: {
        id: {
          in: followerIds.followers.map((follow) => follow.followerId),
        },
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        bio: true,
        icon_link: true,
        is_superuser: true,
        followers: {
          where: {
            followerId: userId,
          },
          select: {
            followerId: true,
          },
        },
      },
    });

    return c.json(
      {
        success: true,
        data: followers,
      },
      200
    );
  } catch (e) {
    return c.json({ success: false, error: "User not found" }, 404);
  }
});

// MARK: フォローをつける
app.post("/:username/follow", isAuthenticated, async (c) => {
  const reqUsername: string = c.req.param("username");
  const userId: string = c.get("jwtPayload").sub;
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

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
        dateKey: dateStr,
      },
    });

    await sendNotification({
      type: NOTIFICATION_TYPES.FOLLOW,
      senderId: userId,
      recepientId: reqUser.id,
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

    await prisma.notification.deleteMany({
      where: {
        type: NOTIFICATION_TYPES.FOLLOW,
        senderId: userId,
        recepientId: reqUser.id,
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
