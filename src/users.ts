import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated";

const app: Hono = new Hono();
const prisma = new PrismaClient();

// ユーザーの編集PUTのスキーマ
const userUpdateSchema = z
  .object({
    nickname: z.string().min(1).max(50),
    bio: z.string().max(160),
    homepage_link: z.string().max(255),
    icon_link: z.string().max(255),
  })
  .partial()
  .strict();

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
    return c.json({ success: false, error: "User not found" }, 404);
  }
  return c.json({ success: true, data: user }, 200);
});

// ユーザーの編集
app.put(
  "/:username",
  isAuthenticated,
  zValidator("json", userUpdateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const userId = c.get("jwtPayload").sub;
    const username = c.req.param("username");
    const { nickname, bio, homepage_link, icon_link } = c.req.valid("json");
    try {
      // リクエストユーザーが編集しようとしているユーザーか確認
      const reqUser = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { username: true },
      });

      if (reqUser.username !== username) {
        return c.json(
          {
            success: false,
            error: "You can only update your own user",
            data: null,
          },
          403
        );
      }

      await prisma.user.update({
        where: { username },
        data: {
          nickname,
          bio,
          homepage_link,
          icon_link,
        },
      });
    } catch (e) {
      return c.json({ success: false, error: "Failed to update user" }, 500);
    }
    return c.json({ success: true }, 200);
  }
);

// usernameのユーザーが作成した投稿を取得
app.get("/:username/posts", async (c) => {
  let posts;
  try {
    const username = c.req.param("username");
    posts = await prisma.post.findMany({
      where: { author: { username } },
      select: {
        id: true,
        content: true,
        like_count: true,
        comment_count: true,
        author: {
          select: {
            username: true,
            nickname: true,
            icon_link: true,
          },
        },
        tags: {
          select: {
            tag: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            thumbnail_link: true,
          },
        },
        created_at: true,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: "User not found" }, 404);
  }
  return c.json({ success: true, data: posts, length: posts.length }, 200);
});

export default app;
