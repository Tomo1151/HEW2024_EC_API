import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";

import isAuthenticated from "./middlewares/isAuthenticated.js";

import {
  getUserIdFromCookie,
  sendNotification,
  uploadBlobData,
} from "./utils.js";
import { NOTIFICATION_TYPES } from "../constants/notifications.js";

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
      console.log(result.error);
      return c.json({ success: false, error: result.error, data: null }, 400);
    }
  }),
  async (c) => {
    const formData: {
      content: string;
      files: (string | File)[] | (string | File);
    } = await c.req.parseBody({
      all: true,
    });
    const userId = c.get("jwtPayload").sub;
    const postId: string = c.req.param("postId");

    const content: string = formData.content;
    const files = formData.files;

    // 画像が複数枚の場合
    if (files instanceof Array) {
      try {
        const { id } = await prisma.post.create({
          data: {
            content,
            userId,
            repliedId: postId,
          },
        });

        const ref = await prisma.post.update({
          where: {
            id: postId,
          },
          data: {
            comment_count: {
              increment: 1,
            },
          },
          select: {
            author: true,
          },
        });

        for (const file of files) {
          if (!(file instanceof File)) continue;
          const blobName: string | null = await uploadBlobData({
            targetContainer: "post",
            file,
          });

          if (!blobName) {
            return c.json(
              { success: false, error: "Failed to save image", data: null },
              500
            );
          }

          try {
            await prisma.postImage.create({
              data: {
                postId: id,
                image_link: blobName,
              },
            });
          } catch (error) {
            console.log(error);
            return c.json(
              { success: false, error: "Failed to create post", data: null },
              500
            );
          }
        }
        const post = await prisma.post.findUnique({
          where: {
            id,
          },
          include: {
            images: true,
          },
        });

        await sendNotification({
          type: NOTIFICATION_TYPES.COMMENT,
          relPostId: id,
          senderId: userId,
          recepientId: ref.author.id,
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

    // 画像が1枚の場合
    if (files instanceof File) {
      console.log("File");
      const blobName: string | null = await uploadBlobData({
        targetContainer: "post",
        file: files,
      });

      if (!blobName) {
        return c.json(
          { success: false, error: "Failed to save image", data: null },
          500
        );
      }

      try {
        const { id } = await prisma.post.create({
          data: {
            content,
            userId,
            repliedId: postId,
          },
        });

        const ref = await prisma.post.update({
          where: {
            id: postId,
          },
          data: {
            comment_count: {
              increment: 1,
            },
          },
          select: {
            author: true,
          },
        });

        await prisma.postImage.create({
          data: {
            postId: id,
            image_link: blobName,
          },
        });

        const post = await prisma.post.findUnique({
          where: {
            id,
          },
          include: {
            images: true,
          },
        });

        await sendNotification({
          type: NOTIFICATION_TYPES.COMMENT,
          relPostId: id,
          senderId: userId,
          recepientId: ref.author.id,
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
          repliedId: postId,
        },
      });
      const ref = await prisma.post.update({
        where: {
          id: postId,
        },
        data: {
          comment_count: {
            increment: 1,
          },
        },
        select: {
          author: true,
        },
      });

      await sendNotification({
        type: NOTIFICATION_TYPES.COMMENT,
        relPostId: post.id,
        senderId: userId,
        recepientId: ref.author.id,
      });

      return c.json({ success: true, post }, 200);
    } catch (e) {
      console.error(e);
      return c.json(
        { success: false, error: "Failed to create the post" },
        400
      );
    }
  }
);

export default app;
