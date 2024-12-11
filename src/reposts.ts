import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import isAuthenticated from "./middlewares/isAuthenticated.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

// MARK: リポスト
app.post("/posts/:postId/repost", isAuthenticated, async (c) => {
  const postId: string = c.req.param("postId");
  const userId: string = c.get("jwtPayload").sub;

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
      like_count: true,
      likes: {
        where: {
          userId,
        },
      },
      live_link: true,
      product: {
        select: {
          name: true,
          price: true,
          thumbnail_link: true,
          live_release: true,
        },
      },
      images: {
        select: {
          image_link: true,
        },
      },
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
      ...postParams,
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
      like_count: true,
      likes: {
        where: {
          userId,
        },
      },
      live_link: true,
      product: {
        select: {
          name: true,
          price: true,
          thumbnail_link: true,
          live_release: true,
        },
      },
      images: {
        select: {
          image_link: true,
        },
      },
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
      ...postParams,
    });

    return c.json({ success: true, data: { ref } }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to delete repost" }, 400);
  }
});

export default app;
