import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";

const app: Hono = new Hono();
const prisma = new PrismaClient();

// ユーザー一覧
app.get("/", async (c) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        username: true,
        nickname: true,
        bio: true,
        homepage_link: true,
        icon_link: true,
        created_at: true,
      },
    });
    return c.json({ success: true, data: users, length: users.length }, 200);
  } catch (e) {
    console.log(e);
    return c.json({ success: false, error: "Failed to fetch users" }, 500);
  }
});

// usernameでユーザーを取得
app.get("/:username", async (c) => {
  let user;
  try {
    const username = c.req.param("username");
    user = await prisma.user.findUniqueOrThrow({
      where: { username },
      select: {
        username: true,
        nickname: true,
        bio: true,
        homepage_link: true,
        icon_link: true,
        created_at: true,
      },
    });
  } catch (e) {
    console.log(e);
    return c.json({ success: false, error: "User not found" }, 400);
  }
  return c.json({ success: true, data: user }, 200);
});

export default app;
