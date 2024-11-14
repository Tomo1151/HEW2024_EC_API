import { writeFile } from "node:fs";

import { zValidator } from "@hono/zod-validator";
import { Post, PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";

import isAuthenticated from "./middlewares/isAuthenticated.js";

import { getUserIdFromCookie } from "./utils.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

const IMAGE_SIZE_LIMIT = 1024 * 1024 * 5; // 5MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// MARK: スキーマ定義
// 投稿作成POSTのスキーマ
const replyCreateSchema = z.object({
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

// MARK: リプライ投稿
app.post(
  "/posts/:postId/reply",
  isAuthenticated,
  zValidator("form", replyCreateSchema, (result, c) => {
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
    const postId: string = c.req.param("postId");
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
            repliedId: postId,
          },
        });
        await prisma.post.update({
          where: {
            id: postId,
          },
          data: {
            comment_count: {
              increment: 1,
            },
          },
        });
        return c.json({ success: true, post }, 200);
      } catch (e) {
        return c.json(
          { success: false, error: "Failed to create the post" },
          400
        );
      }
    }

    try {
      const post = await prisma.post.create({
        data: {
          content,
          userId,
          repliedId: postId,
        },
      });
      await prisma.post.update({
        where: {
          id: postId,
        },
        data: {
          comment_count: {
            increment: 1,
          },
        },
      });
      return c.json({ success: true, post }, 200);
    } catch (e) {
      return c.json(
        { success: false, error: "Failed to create the post" },
        400
      );
    }
  }
);

export default app;
