import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import isAuthenticated from "./middlewares/isAuthenticated.js";
import { sendNotification } from "./utils.js";
import { NOTIFICATION_TYPES } from "../constants/notifications.js";
import { getPostParams } from "./queries.js";

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

    const ref = await prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        ref_count: {
          increment: 1,
        },
      },
      ...getPostParams(userId),
    });

    await sendNotification({
      type: NOTIFICATION_TYPES.REPOST,
      relPostId: postId,
      senderId: userId,
      recepientId: ref.author.id,
    });

    return c.json({ success: true, data: { ref } }, 200);
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

    const ref = await prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        ref_count: {
          decrement: 1,
        },
      },
      ...getPostParams(userId),
    });

    await prisma.notification.deleteMany({
      where: {
        type: NOTIFICATION_TYPES.REPOST,
        relPostId: postId,
        senderId: userId,
        recepientId: ref.author.id,
      },
    });

    return c.json({ success: true, data: { ref } }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to delete repost" }, 400);
  }
});

export default app;
