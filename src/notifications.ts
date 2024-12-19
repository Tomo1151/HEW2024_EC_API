import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";
import { before } from "node:test";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
const getNotificationsSchema = z.object({
  before: z.string(),
});

const readNotificationSchema = z.object({
  ids: z.array(z.string()),
});

// MARK: 通知の取得
app.get(
  "/",
  isAuthenticated,
  zValidator("query", getNotificationsSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue.message),
        },
        400
      );
    }
  }),
  async (c) => {
    const userId: string = c.get("jwtPayload").sub;
    const before: string = c.req.valid("query").before;

    try {
      let targetNotification;
      if (before) {
        targetNotification = await prisma.notification.findUnique({
          where: { id: before },
          select: { created_at: true },
        });
      }
      const notifications = await prisma.notification.findMany({
        where: {
          recepientId: userId,
          created_at: targetNotification
            ? {
                lt: targetNotification.created_at,
              }
            : {},
          // is_read: false,
        },
        orderBy: {
          created_at: "desc",
        },
        take: 10,
        select: {
          id: true,
          type: true,
          is_read: true,
          sender: {
            select: {
              username: true,
              nickname: true,
              icon_link: true,
            },
          },
          rel_post: {
            select: {
              id: true,
              content: true,
              replied_ref: {
                select: {
                  id: true,
                },
              },
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      // await prisma.notification.updateMany({
      //   where: {
      //     recepientId: {
      //       in: notifications.map((notification) => notification.recepientId),
      //     },
      //   },
      //   data: {
      //     is_read: true,
      //   },
      // });

      return c.json({ success: true, data: notifications }, 200);
    } catch (e) {
      console.error(e);
      return c.json(
        { success: false, error: "Failed to fetch notifications" },
        400
      );
    }
  }
);

// MARK: 未読件数の取得
app.get("/unread", isAuthenticated, async (c) => {
  const userId: string = c.get("jwtPayload").sub;

  try {
    const unreadNotifications = await prisma.notification.findMany({
      where: {
        recepientId: userId,
        is_read: false,
      },
    });

    return c.json({ success: true, length: unreadNotifications.length }, 200);
  } catch (e) {
    console.error(e);
    return c.json(
      { success: false, error: "Failed to fetch unread notifications" },
      400
    );
  }
});

// MARK: 通知を既読にする
app.put(
  "/",
  isAuthenticated,
  zValidator("json", readNotificationSchema, async (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue.message),
        },
        500
      );
    }
  }),
  async (c) => {
    const { ids } = c.req.valid("json");

    try {
      const recepient = await prisma.notification.findMany({
        where: {
          id: {
            in: ids,
          },
        },
        select: {
          recepient: {
            select: {
              id: true,
            },
          },
        },
      });

      recepient.forEach(async (notification) => {
        if (notification.recepient.id !== c.get("jwtPayload").sub) {
          return c.json(
            { success: false, error: "You are not the recepient" },
            400
          );
        }
      });

      await prisma.notification.updateMany({
        where: {
          id: {
            in: ids,
          },
        },
        data: {
          is_read: true,
        },
      });

      return c.json({ success: true }, 200);
    } catch (e) {
      return c.json(
        { success: false, error: "Failed to create a notification" },
        400
      );
    }
  }
);

export default app;
