import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";

import isAuthenticated from "./middlewares/isAuthenticated.js";

import { NOTIFICATION_TYPES } from "../constants/notifications.js";
import { sendNotification } from "./utils.js";
import { getPostParams } from "./queries.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: いいね
app.post("/posts/:postId/like", isAuthenticated, async (c) => {
  const postId: string = c.req.param("postId");
  const userId: string = c.get("jwtPayload").sub;

  try {
    await prisma.like.create({
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
        like_count: {
          increment: 1,
        },
      },
      ...getPostParams(userId),
    });

    await sendNotification({
      type: NOTIFICATION_TYPES.LIKE,
      relPostId: postId,
      senderId: userId,
      recepientId: ref.userId,
    });

    return c.json({ success: true, data: { ref } }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to like the post" }, 400);
  }
});

// MARK: いいねをはずす
app.delete("/posts/:postId/like", isAuthenticated, async (c) => {
  const postId: string = c.req.param("postId");
  const userId: string = c.get("jwtPayload").sub;

  try {
    await prisma.like.delete({
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
        like_count: {
          decrement: 1,
        },
      },
      ...getPostParams(userId),
    });

    await prisma.notification.deleteMany({
      where: {
        type: NOTIFICATION_TYPES.LIKE,
        senderId: userId,
        relPostId: postId,
        recepientId: ref.userId,
      },
    });

    // await prisma.notification.delete({
    //   where: {
    //     type_senderId_recepientId_relPostId: {
    //       type: NOTIFICATION_TYPES.LIKE,
    //       senderId: userId,
    //       recepientId: ref.userId,
    //       relPostId: postId,
    //     },
    //   },
    // });

    return c.json({ success: true, data: { ref } }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to dislike the post" }, 400);
  }
});

export default app;
