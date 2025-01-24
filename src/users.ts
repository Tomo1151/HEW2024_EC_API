import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";
import {
  deleteBlobByName,
  getUserIdFromCookie,
  uploadBlobData,
} from "./utils.js";
import { getPostParams } from "./queries.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
const profileTimelineSchema = z.object({
  before: z.string(),
});

// ユーザーの編集PUTのスキーマ
const userUpdateSchema = z
  .object({
    nickname: z.string().max(50),
    bio: z.string().max(160),
    homepage_link: z.string().max(255),
    icon: z
      .custom<File>()
      .refine((file) => file.size < 1024 * 1024 * 5, {
        message: "Icon size must be less than 5MB",
      })
      .refine(
        (file) =>
          ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
            file.type
          ),
        { message: "Icon must be jpeg, png, gif, or webp" }
      )
      .optional(),
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
  const userId: string = await getUserIdFromCookie(c);

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
        followers: {
          where: {
            followerId: userId,
          },
          select: {
            followerId: true,
          },
        },
        _count: {
          select: {
            posts: true,
            followers: true,
            followees: true,
          },
        },
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
  zValidator("form", userUpdateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error, data: null }, 400);
    }
  }),
  async (c) => {
    const userId = c.get("jwtPayload").sub;
    const formData: {
      nickname: string;
      bio: string;
      homepage_link: string;
      icon: File;
    } = await c.req.parseBody();

    const username = c.req.param("username");
    const { nickname, bio, homepage_link, icon } = c.req.valid("form");
    console.log({ nickname, bio, homepage_link, icon });

    try {
      // リクエストユーザーが編集しようとしているユーザーか確認
      const reqUser = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { username: true, icon_link: true },
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

      let icon_link: string | null = null;
      if (icon) {
        icon_link = await uploadBlobData({
          targetContainer: "icon",
          file: icon,
        });
      }

      if (reqUser.icon_link) {
        await deleteBlobByName({
          targetContainer: "icon",
          blobName: reqUser.icon_link,
        });
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
app.get(
  "/:username/posts",
  zValidator("query", profileTimelineSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
          data: [],
        },
        400
      );
    }
  }),
  async (c) => {
    const username: string = c.req.param("username");
    const userId: string = await getUserIdFromCookie(c);
    const before: string = c.req.valid("query").before;

    try {
      let targetPost;
      if (before) {
        targetPost = await prisma.post.findUniqueOrThrow({
          where: { id: before },
          select: { created_at: true },
        });
      }

      const where = targetPost
        ? {
            AND: [
              { author: { username } },
              { replied_ref: null },
              { created_at: { lt: targetPost.created_at } },
            ],
          }
        : {
            AND: [{ author: { username } }, { replied_ref: null }],
          };

      const posts = await prisma.post.findMany({
        where: {
          ...where,
        },
        orderBy: {
          created_at: "desc",
        },
        take: 10,
        ...getPostParams(userId),
      });

      posts.forEach((post) => {
        if (post.product) {
          post.product.price_histories = [
            post.product.price_histories.sort(
              (a, b) => b.created_at.getTime() - a.created_at.getTime()
            )[0],
          ];
        }
      });

      return c.json(
        { success: true, data: posts.toReversed(), length: posts.length },
        200
      );
    } catch (e) {
      console.log(e);
      return c.json(
        { success: false, error: "User posts not found", data: [] },
        404
      );
    }
  }
);

// MARK: usernameのユーザーの出品を取得
app.get(
  "/:username/products",
  zValidator("query", profileTimelineSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
          data: [],
        },
        400
      );
    }
  }),
  async (c) => {
    const username: string = c.req.param("username");
    const userId: string = await getUserIdFromCookie(c);
    const before: string = c.req.valid("query").before;

    try {
      let targetPost;
      if (before) {
        targetPost = await prisma.post.findUniqueOrThrow({
          where: { id: before },
          select: { created_at: true },
        });
      }
      const posts = await prisma.post.findMany({
        where: {
          AND: [
            { author: { username } },
            { replied_ref: null },
            targetPost
              ? {
                  created_at: { lt: targetPost.created_at },
                }
              : {},
          ],
          NOT: { product: null },
        },
        orderBy: {
          created_at: "desc",
        },
        take: 10,
        ...getPostParams(userId),
      });

      // postsのproductのprice_historiesをcreated_atで降順にソートして最初の要素だけ取得
      posts.forEach((post) => {
        if (post.product) {
          post.product.price_histories = [
            post.product.price_histories.sort(
              (a, b) => b.created_at.getTime() - a.created_at.getTime()
            )[0],
          ];
        }
      });

      return c.json(
        { success: true, data: posts.toReversed(), length: posts.length },
        200
      );
    } catch (e) {
      console.log(e);
      return c.json(
        { success: false, error: "User products not found", data: [] },
        404
      );
    }
  }
);

// MARK: usernameのユーザーのいいねを取得
app.get(
  "/:username/likes",
  zValidator("query", profileTimelineSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
          data: [],
        },
        400
      );
    }
  }),
  async (c) => {
    const username: string = c.req.param("username");
    const userId: string = await getUserIdFromCookie(c);
    const before: string = c.req.valid("query").before;
    try {
      let targetPost;
      if (before) {
        targetPost = await prisma.post.findUniqueOrThrow({
          where: { id: before },
          select: {
            created_at: true,
            likes: {
              select: {
                created_at: true,
              },
            },
          },
        });
      }

      const { id }: { id: string } = await prisma.user.findUniqueOrThrow({
        where: { username },
        select: { id: true },
      });

      const likes = await prisma.like.findMany({
        where: {
          AND: [
            {
              userId: id,
              created_at: targetPost
                ? { lt: targetPost.likes[0].created_at }
                : {},
            },
          ],
        },
        orderBy: {
          created_at: "desc",
        },
        select: {
          post: getPostParams(userId),
        },
        take: 10,
      });

      const posts = likes.map((like) => like.post);
      posts.forEach((post) => {
        if (post.product) {
          post.product.price_histories = [
            post.product.price_histories.sort(
              (a, b) => b.created_at.getTime() - a.created_at.getTime()
            )[0],
          ];
        }
      });

      return c.json(
        { success: true, data: posts.toReversed(), length: posts.length },
        200
      );
    } catch (e) {
      console.log(e);
      return c.json(
        { success: false, error: "User likes not found", data: [] },
        404
      );
    }
  }
);

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
