import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";

import isAuthenticated from "./middlewares/isAuthenticated.js";

import { getUserIdFromCookie, uploadImages } from "./utils.js";
import { IMAGE_MIME_TYPE } from "../@types/index.js";
import { NOTIFICATION_TYPES } from "../constants/notifications.js";
import { getPostParams } from "./queries.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
const getOldPostsSchema = z.object({
  type: z.union([
    z.literal("posts"),
    z.literal("products"),
    z.literal("users"),
  ]),
  tag: z.union([z.literal("true"), z.literal("false")]),
  q: z.string(),
  before: z.string(),
});

// MARK: 検索結果を取得
app.get(
  "/",
  zValidator("query", getOldPostsSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const userId: string = await getUserIdFromCookie(c);
    const {
      type,
      tag,
      q,
      before,
    }: { type?: string; tag: string; q: string; before: string } =
      c.req.valid("query");
    const searchWords = q.split(" ");

    const target =
      type === "users"
        ? await prisma.user.findUnique({ where: { id: before } })
        : await prisma.post.findUnique({ where: { id: before } });

    const whereQuery = {
      AND: searchWords.map((word) => ({
        OR: [
          ...(type === "posts"
            ? [
                { content: { contains: word } },
                // { tags: { some: { tag: { name: { contains: word } } } } },
                { product: { name: { contains: word } } },
              ]
            : []),
          ...(tag === "true"
            ? [
                {
                  tags: {
                    some: {
                      tag: { name: { contains: word } },
                    },
                  },
                },
              ]
            : []),
          ...(type === "products"
            ? [
                {
                  content: { contains: word },
                  // tags: { some: { tag: { name: { contains: word } } } },
                },
                {
                  product: {
                    OR: [{ name: { contains: word } }],
                  },
                },
              ]
            : []),
        ],
      })),
    };

    try {
      if (type === "users") {
        const users = await prisma.user.findMany({
          where: {
            OR: searchWords.map((word) => ({
              OR: [
                { username: { contains: word } },
                { nickname: { contains: word } },
                { bio: { contains: word } },
              ],
            })),
            created_at: target
              ? {
                  lt: target.created_at,
                }
              : {},
          },
          orderBy: {
            created_at: "desc",
          },
          take: 10,
          select: {
            id: true,
            username: true,
            nickname: true,
            bio: true,
            icon_link: true,
            followers: {
              where: {
                followerId: userId,
              },
              select: {
                followerId: true,
              },
            },
          },
        });
        return c.json({
          success: true,
          data: users.map((user) => ({ type: "user", ...user })),
          length: users.length,
        });
      } else {
        const posts = await prisma.post.findMany({
          where: {
            ...whereQuery,
            replied_ref: null,
            created_at: target
              ? {
                  lt: target.created_at,
                }
              : {},
          },
          orderBy: {
            created_at: "desc",
          },
          take: 10,
          ...getPostParams(userId),
        });
        return c.json({
          success: true,
          data: posts.map((post) => ({ type: "post", ...post })),
          length: posts.length,
        });
      }
    } catch (e) {
      console.log(e);
      return c.json({ success: false, error: "Failed to fetch posts" }, 500);
    }
  }
);

export default app;
