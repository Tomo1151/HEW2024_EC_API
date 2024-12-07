import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { IMAGE_MIME_TYPE } from "../@types";

import isAuthenticated from "./middlewares/isAuthenticated.js";
import { deleteBlobByName, uploadBlobData } from "./utils.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

const IMAGE_SIZE_LIMIT: number = 1024 * 1024 * 5; // 5MB
const IMAGE_TYPES: Array<IMAGE_MIME_TYPE> = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const MAX_IMAGE_COUNT: number = 4;

// MARK: スキーマ定義
// 商品作成POSTのスキーマ
const productCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.string().min(1).optional(),
  data: z
    .custom<File>()
    // .refine((files) => files instanceof File, {
    //   message: "Images must be a file or a list of files",
    // })
    .superRefine((arg, ctx) => {
      if (!(arg instanceof File)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Data must be a file",
        });
      }
      return z.NEVER;
    })
    .refine((file) => file.size < 1024 * 1024 * 1024 * 5, {
      message: "Data size must be less than 5GB",
    })
    .refine((file) => file.type === "application/zip", {
      message: "Data must be a zip file",
    })
    .optional(),
  images: z
    .custom<File | FileList>()
    // .refine((files) => files instanceof File || files instanceof Array, {
    //   message: "Images must be a file or a list of files",
    // })
    .superRefine((arg, ctx) => {
      if (
        !(
          arg instanceof File ||
          (arg instanceof Array && arg.every((file) => file instanceof File))
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Images must be a file or a list of files",
        });
      }
      return z.NEVER;
    })
    .refine(
      (files) => {
        if (files instanceof File) {
          return true;
        } else if (files instanceof Array) {
          // console.log("File length: ", Array.from(files).length);
          return Array.from(files).length <= MAX_IMAGE_COUNT;
        }
      },
      {
        message: `一度にアップロードできる画像は${MAX_IMAGE_COUNT}枚までです`,
      }
    )
    .refine(
      (files) => {
        if (files instanceof File) {
          return files.size < IMAGE_SIZE_LIMIT;
        } else if (files instanceof Array) {
          return Array.from(files).every((file) => {
            if (!(file instanceof File)) return false;
            console.log("File size: ", file.size);
            return file.size < IMAGE_SIZE_LIMIT;
          });
        }
      },
      { message: "画像ファイルのサイズは5MiBまでです" }
    )
    .refine(
      (files) => {
        if (files instanceof File) {
          return IMAGE_TYPES.includes(files.type as IMAGE_MIME_TYPE);
        } else if (files instanceof Array) {
          return Array.from(files).every((file) => {
            if (!(file instanceof File)) return false;

            return IMAGE_TYPES.includes(file.type as IMAGE_MIME_TYPE);
          });
        }
      },
      { message: "画像ファイルの形式はJPEG/PNG/GIF/WEBPでなければなりません" }
    ),
});

// MARK: 商品一覧の取得
app.get("/", async (c) => {
  try {
    const products = await prisma.product.findMany();
    return c.json(
      { success: true, data: products, length: products.length },
      200
    );
  } catch (e) {
    console.log(e);
    return c.json({ success: false, error: "Failed to fetch products" }, 500);
  }
});

// MARK: 商品の取得
app.get("/:id", async (c) => {
  const id: string = c.req.param("id");

  try {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id },
    });
    return c.json({ success: true, data: product }, 200);
  } catch (e) {
    // console.log(e);
    return c.json(
      { success: false, error: "Failed to fetch the product" },
      500
    );
  }
});

// MARK: 商品作成
app.post(
  "/",
  isAuthenticated,
  zValidator("form", productCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { success: false, error: "Failed to create the product" },
        500
      );
    }
  }),
  async (c) => {
    const userId: string = c.get("jwtPayload").sub;
    let data_url: string;
    let images_link: Array<string> = [];
    let thumbnail_link: string;

    try {
      const {
        name,
        description,
        price,
        data,
        images,
      }: {
        name: string;
        description: string;
        price: string;
        data: string | File;
        images: (string | File)[] | (string | File);
      } = await c.req.parseBody({ all: true });

      try {
        if (data instanceof File) {
          data_url = await uploadBlobData({
            targetContainer: "product",
            file: data,
          });
        } else {
          return c.json(
            {
              success: false,
              error: "Failed to upload product data",
            },
            500
          );
        }

        if (images instanceof Array) {
          for (const image of images) {
            if (!(image instanceof File)) continue;
            const image_blob_name: string = await uploadBlobData({
              targetContainer: "post",
              file: image,
            });
            if (image_blob_name) {
              images_link.push(image_blob_name);
            }
          }
          if (images_link.length === 0) {
            return c.json(
              {
                success: false,
                error: "Failed to upload product images data",
              },
              500
            );
          }

          thumbnail_link = images_link[0];
        } else if (images instanceof File) {
          const image_blob_name: string = await uploadBlobData({
            targetContainer: "post",
            file: images,
          });
          if (!image_blob_name) {
            return c.json(
              {
                success: false,
                error: "Failed to upload product thumbnail data",
              },
              500
            );
          }
          images_link.push(image_blob_name);
          thumbnail_link = image_blob_name;
        } else {
          return c.json(
            {
              success: false,
              error: "Failed to upload product thumbnail data",
            },
            500
          );
        }
      } catch (error) {
        return c.json(
          {
            success: false,
            error: "Failed to upload product thumbnail data",
          },
          500
        );
      }
      const priceNum: number = parseInt(price);
      if (isNaN(priceNum)) {
        return c.json({ success: false, error: "Price must be a number" }, 400);
      }

      const post = await prisma.post.create({
        data: {
          userId,
          content: description,
          images: {
            create: images_link.map((link) => {
              return { image_link: link };
            }),
          },
          product: {
            create: {
              name,
              price: priceNum,
              product_link: data_url,
              thumbnail_link,
              live_release: false,
            },
          },
        },
      });

      return c.json({ success: true, data: post }, 201);
    } catch (e) {
      console.log(e);
      return c.json(
        { success: false, error: "Failed to create the product" },
        400
      );
    }
  }
);

// MARK: 商品の削除
app.delete("/:id", isAuthenticated, async (c) => {
  const id: string = c.req.param("id");
  const userId: string = c.get("jwtPayload").sub;

  try {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: {
        product_link: true,
        post: {
          select: {
            userId: true,
            images: {
              select: {
                image_link: true,
              },
            },
          },
        },
      },
    });

    if (product.post.userId !== userId) {
      return c.json(
        { success: false, error: "You can only delete your own product" },
        403
      );
    }

    await prisma.product.delete({ where: { id } });
    try {
      await deleteBlobByName({
        targetContainer: "product",
        blobName: product.product_link,
      });
      for (const image of product.post.images) {
        await deleteBlobByName({
          targetContainer: "post",
          blobName: image.image_link,
        });
      }
    } catch (error) {
      return c.json({ success: false, error: "Failed to delete the product" });
    }
    return c.json({ success: true }, 200);
  } catch (e) {
    console.log(e);
    return c.json(
      { success: false, error: "Failed to delete the product" },
      500
    );
  }
});

export default app;
