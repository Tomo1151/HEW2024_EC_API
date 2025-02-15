import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { IMAGE_MIME_TYPE, PRODUCT_DATA_TYPE } from "../@types";

import isAuthenticated from "./middlewares/isAuthenticated.js";
import {
  deleteBlobByName,
  generateBlobSASUrl,
  uploadBlobData,
  uploadImages,
} from "./utils.js";

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
const PRODUCT_DATA_TYPES: Array<string> = [
  "application/zip",
  "application/x-zip-compressed",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const MAX_IMAGE_COUNT: number = 4;

// MARK: スキーマ定義
// 商品評価POSTのスキーマ
const ratingProductSchema = z.object({
  value: z.number().min(1).max(5),
});

// 商品更新PUTのスキーマ
const putLiveProductSchema = z.object({
  type: z.literal("live_edit"),
  name: z.string().min(1),
  description: z.string().min(1),
  "tags[]": z.array(z.string()).optional(),
  live_link: z.string().url().optional(),
});

const putProductSchema = z.object({
  type: z.literal("product_edit"),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.string().min(1).optional(),
  "tags[]": z.array(z.string()).optional(),
});

// 商品作成POSTのスキーマ
const liveProductSchema = z.object({
  type: z.literal("live"),
  name: z.string().min(1),
  description: z.string().min(1),
  quoted_ref: z.string().length(25).optional(),
  "tags[]": z.array(z.string()).optional(),
  live_link: z.string().url(),
});

const postProductSchema = z.object({
  type: z.literal("product"),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.string().min(1).optional(),
  "tags[]": z.array(z.string()).optional(),
  quoted_ref: z.string().length(25).optional(),
  data: z
    .custom<File>()
    .superRefine((arg, ctx) => {
      if (!(arg instanceof File)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "商品データはファイルでなければなりません",
        });
      }
      return z.NEVER;
    })
    .refine((file) => file.size < 1024 * 1024 * 1024 * 5, {
      message: "商品データのサイズは5MiBまでです",
    })
    .refine(
      (file) => PRODUCT_DATA_TYPES.includes(file.type as PRODUCT_DATA_TYPE),
      {
        message: "商品データの形式はZIPまたは画像形式でなければなりません",
      }
    )
    .optional(),
  images: z
    .custom<File | FileList>()
    .superRefine((arg, ctx) => {
      if (
        !(
          arg instanceof File ||
          (arg instanceof Array && arg.every((file) => file instanceof File))
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "画像ファイルはファイルでなければなりません",
        });
      }
      return z.NEVER;
    })
    .refine(
      (files) => {
        if (files instanceof File) {
          return true;
        } else if (files instanceof Array) {
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
            // console.log("File size: ", file.size);
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

const productSchema = postProductSchema.or(liveProductSchema);
const editProductSchema = putProductSchema.or(putLiveProductSchema);

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
      include: {
        price_histories: {
          orderBy: {
            created_at: "desc",
          },
          take: 1,
        },
      },
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

// MARK: 商品の評価
app.post(
  "/:id/rating",
  isAuthenticated,
  zValidator("json", ratingProductSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue.message),
        },
        400
      );
    }
  }),
  async (c) => {
    const userId: string = c.get("jwtPayload").sub;
    const id: string = c.req.param("id");
    const { value }: { value: number } = c.req.valid("json");

    try {
      const purchases = await prisma.purchase.findMany({
        where: { userId, productId: id },
      });

      if (purchases.length === 0) {
        return c.json(
          { success: false, error: "You must purchase the product first" },
          403
        );
      }

      const rating = await prisma.productRating.upsert({
        where: { productId_userId: { productId: id, userId } },
        create: { productId: id, userId, value: value },
        update: { value: value },
      });

      return c.json({ success: true, data: rating }, 200);
    } catch (e) {
      console.log(e);
      return c.json(
        { success: false, error: "Failed to rate the product" },
        400
      );
    }
  }
);

// MARK: 商品作成
app.post(
  "/",
  isAuthenticated,
  zValidator("form", productSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue.message),
        },
        400
      );
    }
  }),
  async (c) => {
    const userId: string = c.get("jwtPayload").sub;
    let data_url: string;

    try {
      // フォームデータの取得
      const {
        type,
        name,
        description,
        price,
        quoted_ref,
        data,
        images,
        "tags[]": tags,
        live_link,
      }: {
        type: "live" | "product";
        name: string;
        description: string;
        price: string;
        quoted_ref: string;
        data: string | File;
        images: (string | File)[] | (string | File);
        "tags[]": string[];
        live_link: string;
      } = await c.req.parseBody({ all: true });

      // @TODO できれば大文字小文字を区別したい (MySQL && prismaがcollationをサポートしていないため見送り)
      // タグの前後の空白を削除して1次元の配列に変換
      const tagNames: string[] = tags
        ? [...new Set([tags].flat().map((tag) => tag.trim().toUpperCase()))]
        : [];

      // console.log(
      //   type,
      //   name,
      //   description,
      //   price,
      //   quoted_ref,
      //   data,
      //   images,
      //   tags,
      //   live_link
      // );

      //  画像ファイルの配列に変換
      const imagesArray = images ? [images].flat() : [];

      // 画像ファイルのバリデーション
      if (!imagesArray.every((image) => image instanceof File)) {
        return c.json(
          {
            success: false,
            error: ["画像はファイルでなければなりません"],
            data: null,
          },
          400
        );
      }

      try {
        // 商品データのアップロード
        if (type === "live") {
          try {
            new URL(live_link);
          } catch (e) {
            return c.json(
              { success: false, error: ["ライブURLが不正です"] },
              400
            );
          }

          // 商品の作成 (トランザクション: タグの作成 -> 商品の作成)
          const post = await prisma.$transaction(async (prisma) => {
            const tags = await Promise.all(
              tagNames.map((name) =>
                prisma.tag.upsert({
                  where: { name },
                  update: {},
                  create: { name },
                })
              )
            );

            const post = await prisma.post.create({
              data: {
                userId,
                content: description,
                live_link,
                quotedId: quoted_ref,
                product: {
                  create: {
                    name,
                    product_link: data_url,
                    live_release: true,
                  },
                },
                tags: {
                  create: tags.map((tag) => ({
                    tag: {
                      connectOrCreate: {
                        where: { name: tag.name },
                        create: { name: tag.name },
                      },
                    },
                  })),
                },
              },
            });

            // @TODO 通知の作成
            if (quoted_ref) {
              await prisma.post.update({
                where: {
                  id: quoted_ref,
                },
                data: {
                  quote_count: {
                    increment: 1,
                  },
                },
                select: {
                  author: true,
                },
              });
            }

            return post;
          });

          return c.json({ success: true, data: post }, 201);
        } else {
          if (data instanceof File) {
            data_url = await uploadBlobData({
              targetContainer: "product",
              file: data,
            });
          } else {
            return c.json(
              {
                success: false,
                error: ["商品データはファイルでなければなりません"],
                data: null,
              },
              400
            );
          }

          // 商品画像のアップロード
          const blobNames: string[] = await uploadImages(imagesArray);
          const priceNum: number | undefined = parseInt(price);
          if (price && isNaN(priceNum)) {
            return c.json(
              {
                success: false,
                error: ["価格は有効な数値でなければなりません"],
              },
              400
            );
          }

          // 商品の作成 (トランザクション: タグの作成 -> 商品の作成)
          const post = await prisma.$transaction(async (prisma) => {
            const tags = await Promise.all(
              tagNames.map((name) =>
                prisma.tag.upsert({
                  where: { name },
                  update: {},
                  create: { name },
                })
              )
            );

            const post = await prisma.post.create({
              data: {
                userId,
                content: description,
                quotedId: quoted_ref,
                images: {
                  create: blobNames.map((link) => {
                    return { image_link: link };
                  }),
                },
                product: {
                  create: {
                    name,
                    product_link: data_url,
                    thumbnail_link: blobNames[0],
                    live_release: false,
                    price_histories: price
                      ? {
                          create: {
                            price: priceNum,
                          },
                        }
                      : {},
                  },
                },
                tags: {
                  create: tags.map((tag) => ({
                    tag: {
                      connectOrCreate: {
                        where: { name: tag.name },
                        create: { name: tag.name },
                      },
                    },
                  })),
                },
              },
            });

            // @TODO 通知の作成
            if (quoted_ref) {
              await prisma.post.update({
                where: {
                  id: quoted_ref,
                },
                data: {
                  quote_count: {
                    increment: 1,
                  },
                },
                select: {
                  author: true,
                },
              });
            }

            return post;
          });

          return c.json({ success: true, data: post }, 201);
        }
      } catch (error) {
        return c.json(
          {
            success: false,
            error: ["商品の投稿に失敗しました"],
          },
          500
        );
      }
    } catch (e) {
      console.log(e);
      return c.json(
        { success: false, error: "Failed to create the product" },
        400
      );
    }
  }
);

// MARK: 商品の更新
app.put(
  "/:postId",
  isAuthenticated,
  zValidator("form", editProductSchema.or(postProductSchema), (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue.message),
        },
        400
      );
    }
  }),
  async (c) => {
    const postId: string = c.req.param("postId");
    const userId: string = c.get("jwtPayload").sub;

    try {
      const post = await prisma.post.findUniqueOrThrow({
        where: { id: postId },
        include: { product: true, tags: { include: { tag: true } } },
      });

      if (post.userId !== userId) {
        return c.json(
          { success: false, error: ["You can only update your own product"] },
          403
        );
      }

      if (post.product == null) {
        return c.json(
          { success: false, error: ["商品以外は編集できません"] },
          404
        );
      }

      const {
        type,
        name,
        description,
        price,
        quoted_ref,
        data,
        images,
        "tags[]": tags,
        live_link,
      }: {
        type: "live" | "live_edit" | "product" | "product_edit";
        name: string;
        description: string;
        price: string;
        quoted_ref: string;
        data: string | File;
        images: (string | File)[] | (string | File);
        "tags[]": string[];
        live_link: string;
      } = await c.req.parseBody({ all: true });

      // 取得したpostのタグとPUTリクエストのタグを比較して、新しいタグを追加する
      const oldTags = post.tags.map((tag) => tag.tag.name);
      const newTags = tags
        ? [...new Set([tags].flat().map((tag) => tag.trim().toUpperCase()))]
        : [];

      const tagsToAdd = newTags.filter((tag) => !oldTags.includes(tag));
      const tagsToRemove = oldTags.filter((tag) => !newTags.includes(tag));

      console.log(newTags, oldTags, tagsToAdd, tagsToRemove);

      const imagesArray = images ? [images].flat() : [];

      if (!imagesArray.every((image) => image instanceof File)) {
        return c.json(
          {
            success: false,
            error: ["画像はファイルでなければなりません"],
            data: null,
          },
          400
        );
      }

      const priceNum: number | undefined = parseInt(price);
      if (price && isNaN(priceNum)) {
        return c.json(
          {
            success: false,
            error: ["価格は有効な数値でなければなりません"],
          },
          400
        );
      }

      let data_url: string | undefined;
      if (data instanceof File) {
        data_url = await uploadBlobData({
          targetContainer: "product",
          file: data,
        });
      }

      const blobNames: string[] = await uploadImages(imagesArray);

      const updatedPost = await prisma.$transaction(async (prisma) => {
        if (post.product == null) {
          return c.json(
            { success: false, error: ["商品以外は編集できません"] },
            404
          );
        }

        const tags = await Promise.all(
          tagsToAdd.map((name) =>
            prisma.tag.upsert({
              where: { name },
              update: {},
              create: { name },
            })
          )
        );

        // Delete tag associations that are to be removed before updating the post.
        if (tagsToRemove.length > 0) {
          await prisma.taggedPost.deleteMany({
            where: {
              postId: postId,
              tag: { name: { in: tagsToRemove } },
            },
          });
        }

        const updatedPost = await prisma.post.update({
          where: { id: postId },
          data: {
            content: description || post.content,
            quotedId: quoted_ref,
            tags: {
              create: tagsToAdd.map((tag) => ({
                tag: {
                  connectOrCreate: {
                    where: { name: tag },
                    create: { name: tag },
                  },
                },
              })),
            },
            images: {
              create: blobNames.map((link) => ({
                image_link: link,
              })),
            },
            product: {
              update: {
                name: name || post.product.name,
                product_link: data_url || post.product.product_link,
                thumbnail_link: blobNames[0] || post.product.thumbnail_link,
                live_release: type === "live" || type == "live_edit",
                price_histories: price
                  ? {
                      create: {
                        price: priceNum,
                      },
                    }
                  : {},
              },
            },
          },
        });

        return updatedPost;
      });

      return c.json({ success: true, data: updatedPost }, 200);
    } catch (e) {
      console.log(e);
      return c.json(
        { success: false, error: ["Failed to update the product"] },
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

app.get("/:id/download", async (c) => {
  const id: string = c.req.param("id");
  try {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: {
        product_link: true,
      },
    });
    if (!product.product_link) {
      return c.json({ success: false, error: "Product not found" });
    }

    const sasUrl = await generateBlobSASUrl({
      targetContainer: "product",
      blobName: product.product_link,
    });
    return c.json({ success: true, data: sasUrl });
  } catch (e) {
    console.log(e);
    return c.json({ success: false, error: "Failed to download the product" });
  }
});

export default app;
