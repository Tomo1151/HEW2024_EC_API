import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";
import { getUserIdFromCookie } from "./utils.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
// ユーザーの編集PUTのスキーマ
const userUpdateSchema = z
  .object({
    nickname: z.string().max(50),
    bio: z.string().max(160),
    homepage_link: z.string().max(255),
    icon_link: z.string().max(255),
  })
  .partial()
  .strict();

// MARK: ユーザー一覧
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

// MARK: usernameでユーザーを取得
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

// MARK: ユーザーの編集
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

// MARK: usernameのユーザーが作成した投稿を取得
app.get("/:username/posts", async (c) => {
  let posts;
  try {
    const username: string = c.req.param("username");
    const userId: string = await getUserIdFromCookie(c);

    posts = await prisma.post.findMany({
      where: { AND: [{ author: { username } }, { replied_ref: null }] },
      orderBy: {
        created_at: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            nickname: true,
            icon_link: true,
          },
        },
        reposts: {
          where: {
            userId,
          },
        },
        likes: {
          where: {
            userId,
          },
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                nickname: true,
                icon_link: true,
              },
            },

            likes: {
              where: {
                userId,
              },
            },

            reposts: {
              where: {
                userId,
              },
            },
          },
        },
      },
    });
  } catch (e) {
    console.log(e);
    return c.json({ success: false, error: "User not found", data: [] }, 404);
  }
  return c.json({ success: true, data: posts, length: posts.length }, 200);
});

// MARK: ユーザーを削除
app.delete("/:username", isAuthenticated, async (c) => {
  const userId = c.get("jwtPayload").sub;
  const username = c.req.param("username");
  try {
    // リクエストユーザーが削除しようとしているユーザーか確認
    const reqUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true },
    });

    if (reqUser.username !== username) {
      return c.json(
        {
          success: false,
          error: "You can only delete your own user",
          data: null,
        },
        403
      );
    }

    await prisma.user.delete({
      where: { username },
    });
  } catch (e) {
    return c.json({ success: false, error: "Failed to delete user" }, 500);
  }
  return c.json({ success: true }, 200);
});

export default app;
