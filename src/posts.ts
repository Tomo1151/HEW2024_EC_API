import { writeFile } from "node:fs";

import { zValidator } from "@hono/zod-validator";
import { Post, PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";

import isAuthenticated from "./middlewares/isAuthenticated.js";

import { getUserIdFromCookie } from "./utils.js";
import { equal } from "node:assert";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

const IMAGE_SIZE_LIMIT = 1024 * 1024 * 5; // 5MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// MARK: スキーマ定義
// 投稿作成POSTのスキーマ
const postCreateSchema = z.object({
  content: z.string().min(1),
  image: z
    .custom<FileList>()
    .refine(
      (files) =>
        Array.from(files).every((file) => file.size < IMAGE_SIZE_LIMIT),
      { message: "Image size must be less than 5MB" }
    )
    .refine(
      (files) =>
        Array.from(files).every((file) => IMAGE_TYPES.includes(file.type)),
      { message: "Image must be jpeg, png, gif, or webp" }
    )
    .optional(),
});

const getLatestPostsSchema = z.object({
  tagName: z.string().optional(),
  after: z.string(),
});

// MARK: 最新の投稿を取得
app.get(
  "/",
  zValidator("query", getLatestPostsSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const userId: string = await getUserIdFromCookie(c);
    const { tagName, after }: { tagName?: string; after: string } =
      c.req.valid("query");
    // console.log("Params", tagName, after);

    const targetPost =
      (await prisma.post.findUnique({
        where: {
          id: after,
        },
        select: {
          created_at: true,
        },
      })) ||
      (await prisma.repost.findUnique({
        where: {
          id: after,
        },
        select: {
          created_at: true,
        },
      }));

    try {
      const query = {
        take: 10,
        where: {},
        orderBy: {},
      };

      if (targetPost) {
        query.where = {
          AND: [
            { replied_ref: null },
            { created_at: { gt: targetPost.created_at } },
          ],
        };
      } else {
        query.where = {
          replied_ref: null,
        };
        query.orderBy = { created_at: "desc" };
      }

      // async function getTimeline(userId?: string) {
      const postParams = {
        select: {
          author: {
            select: {
              id: true,
              username: true,
              nickname: true,
              icon_link: true,
            },
          },
          comment_count: true,
          content: true,
          created_at: true,
          id: true,
          image_link: true,
          like_count: true,
          likes: {
            where: {
              userId,
            },
          },
          live_link: true,
          ref_count: true,
          replied_ref: true,
          reposts: {
            where: {
              userId,
            },
          },
          updated_at: true,
          userId: true,
        },
      };
      // postsを取得
      const posts = await prisma.post.findMany({
        ...postParams,
        ...query,
      });

      // repostsを取得し、関連するpostのcontentを取得
      delete (query.where as { replied_ref?: string }).replied_ref;
      const reposts = await prisma.repost.findMany({
        select: {
          id: true,
          postId: true,
          created_at: true,
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              icon_link: true,
            },
          },
          post: postParams,
        },
        ...query,
      });

      // postsとrepostsを合体し、created_atで降順にソート
      const timeline = [
        ...reposts.map((repost) => ({
          id: repost.id,
          content: repost.post.content,
          image_link: repost.post.image_link,
          live_link: repost.post.live_link,
          like_count: repost.post.like_count,
          ref_count: repost.post.ref_count,
          comment_count: repost.post.comment_count,
          created_at: repost.created_at,
          updated_at: repost.post.updated_at,
          userId: repost.post.userId,
          postId: repost.postId,
          author: repost.post.author,
          reposts: repost.post.reposts,
          likes: repost.post.likes,
          repost_user: repost.user,
          type: "repost",
        })),
        ...posts.map((post) => ({ ...post, type: "post" })),
      ]
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, 10);

      // return timeline;
      // }

      // const latestPosts = await getTimeline(userId);
      // console.dir(latestPosts);

      return c.json(
        {
          success: true,
          data: targetPost ? timeline : timeline.toReversed(),
          length: timeline.length,
        },
        200
      );

      // const q =
      //   await prisma.$queryRaw<Post>`SELECT id, content, created_at, 'post' AS 'type', userId FROM posts UNION ALL SELECT reposts.postId AS id, posts.content, reposts.created_at, 'repost' AS 'type', reposts.userId FROM reposts JOIN posts ON reposts.postId = posts.id ORDER BY created_at DESC LIMIT 10;`;
      // console.dir(q);

      // const posts = await prisma.post.findMany({
      //   ...query,
      // });
      // return c.json(
      //   {
      //     success: true,
      //     data: targetPost ? posts : posts.toReversed(),
      //     length: posts.length,
      //   },
      //   200
      // );
    } catch (e) {
      console.log(e);
      return c.json({ success: false, error: "Failed to fetch posts" }, 500);
    }
  }
);

// MARK: IDで指定された投稿を取得
app.get("/:id", async (c) => {
  const userId: string = await getUserIdFromCookie(c);

  try {
    const post = await prisma.post.findUnique({
      where: {
        id: c.req.param("id"),
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
    return c.json({ success: true, data: post }, 200);
  } catch {
    return c.json({ success: false, error: "Failed to fetch post" }, 500);
  }
});

// MARK: 投稿を作成
app.post(
  "/",
  isAuthenticated,
  zValidator("form", postCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error, data: null }, 400);
    }
  }),
  async (c) => {
    const formData: {
      content: string;
      files?: File | string;
    } = await c.req.parseBody();
    const userId = c.get("jwtPayload").sub;

    const content: string = formData.content;
    const files = formData.files;

    if (files instanceof File) {
      const fileData = await files.arrayBuffer();
      const buffer = Buffer.from(fileData);
      const fileName = `${userId}-${Date.now()}-${files.name}`;
      const filePath = `./static/media/images/${fileName}`;
      writeFile(filePath, buffer, (error) => {
        if (error) {
          console.error(error);
          return c.json(
            { success: false, error: "Failed to save image", data: null },
            500
          );
        }
      });

      try {
        const post = await prisma.post.create({
          data: {
            content,
            userId,
            image_link: `/images/${fileName}`,
          },
        });

        return c.json({ success: true, data: post }, 201);
      } catch (error) {
        console.log(error);
        return c.json(
          { success: false, error: "Failed to create post", data: null },
          500
        );
      }
    }

    try {
      const post = await prisma.post.create({
        data: {
          content,
          userId,
        },
      });
      return c.json({ success: true, data: post }, 201);
    } catch (error) {
      console.log(error);
      return c.json(
        { success: false, error: "Failed to create post", data: null },
        500
      );
    }
  }
);

// MARK: 投稿を更新
app.put(
  "/:id",
  isAuthenticated,
  zValidator("json", postCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const userId = c.get("jwtPayload").sub;
    const { content }: { content: string } = c.req.valid("json");
    try {
      const post = await prisma.post.findUniqueOrThrow({
        where: {
          id: c.req.param("id"),
        },
      });
      if (post.userId !== userId) {
        return c.json(
          {
            success: false,
            error: "You can only update your own post",
            data: null,
          },
          403
        );
      }
      await prisma.post.update({
        where: {
          id: c.req.param("id"),
        },
        data: {
          content,
        },
      });
      return c.json({ success: true }, 200);
    } catch {
      return c.json({ success: false, error: "Failed to update post" }, 400);
    }
  }
);

// MARK: 投稿を削除
app.delete("/:id", isAuthenticated, async (c) => {
  const userId = c.get("jwtPayload").sub;
  try {
    const post = await prisma.post.findUniqueOrThrow({
      where: {
        id: c.req.param("id"),
      },
    });
    if (post.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "You can only delete your own post",
          data: null,
        },
        403
      );
    }
    await prisma.post.delete({
      where: {
        id: c.req.param("id"),
      },
    });
    return c.json({ success: true }, 200);
  } catch (e) {
    console.log(e);
    return c.json({ success: false, error: "Failed to delete post" }, 400);
  }
});

export default app;
