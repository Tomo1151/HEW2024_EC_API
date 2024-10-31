import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: 通知の取得
app.get("/:username", isAuthenticated, async (c) => {
  const userId: string = c.get("jwtPayload").sub;

  try {
    const notificatoins = await prisma.userNotification.findMany({
      where: {
        userId,
      },
    });

    await prisma.notification.updateMany({
      where: {
        user_notifications: {
          some: {
            userId,
          },
        },
      },
      data: {
        is_read: true,
      },
    });

    return c.json({ success: true, data: notificatoins }, 200);
  } catch (e) {
    return c.json(
      { success: false, error: "Failed to fetch notifications" },
      400
    );
  }
});

export default app;
