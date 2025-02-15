import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";

import isAuthenticated from "./middlewares/isAuthenticated.js";

import {
  deleteBlobByName,
  getUserIdFromCookie,
  updatePostImpressionCount,
  uploadImages,
} from "./utils.js";
import { IMAGE_MIME_TYPE } from "../@types/index.js";
import { NOTIFICATION_TYPES } from "../constants/notifications.js";
import { getPostParams } from "./queries.js";

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
// 投稿作成POSTのスキーマ
const postCreateSchema = z.object({
  content: z.string().min(1),
  quoted_ref: z.string().length(25).optional(),
  replied_ref: z.string().length(25).optional(),
  "tags[]": z.array(z.string().min(1).max(64)).optional(),
  files: z
    .custom<File | FileList>()
    .refine(
      (files) => {
        if (files instanceof File) return true;
        // console.log("File length: ", Array.from(files).length);
        return Array.from(files).length <= MAX_IMAGE_COUNT;
      },
      {
        message: `一度にアップロードできる画像は${MAX_IMAGE_COUNT}枚までです`,
      }
    )
    .refine(
      (files) => {
        if (files instanceof File) {
          return files.size < IMAGE_SIZE_LIMIT;
        }
        return Array.from(files).every((file) => {
          // console.log("File size: ", file.size);
          return file.size < IMAGE_SIZE_LIMIT;
        });
      },
      { message: "画像ファイルのサイズは5MiBまでです" }
    )
    .refine(
      (files) => {
        if (files instanceof File) {
          return IMAGE_TYPES.includes(files.type as IMAGE_MIME_TYPE);
        }
        return Array.from(files).every((file) =>
          IMAGE_TYPES.includes(file.type as IMAGE_MIME_TYPE)
        );
      },
      { message: "画像ファイルの形式はJPEG/PNG/GIF/WEBPでなければなりません" }
    )
    .optional(),
});

const getLatestPostsSchema = z.object({
  tagName: z.string().optional(),
  after: z.string(),
  live: z.literal("true").optional(),
});

const getOldPostsSchema = z.object({
  tagName: z.string().optional(),
  before: z.string(),
  live: z.literal("true").optional(),
});

const geTimelinePostsSchema = getLatestPostsSchema.or(getOldPostsSchema);

// MARK: 最新の投稿を取得
app.get(
  "/",
  zValidator("query", geTimelinePostsSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const userId: string = await getUserIdFromCookie(c);
    const {
      tagName,
      after,
      before,
      live,
    }: { tagName?: string; after?: string; before?: string; live?: string } =
      c.req.valid("query");

    const targetId = before ? before : after;

    const targetPost =
      (await prisma.post.findUnique({
        where: {
          id: targetId,
        },
        select: {
          created_at: true,
        },
      })) ||
      (await prisma.repost.findUnique({
        where: {
          id: targetId,
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
            {
              created_at: before
                ? { lt: targetPost.created_at }
                : { gt: targetPost.created_at },
            },
          ],
        };

        if (before) query.orderBy = { created_at: "desc" };
      } else {
        query.where = {
          replied_ref: null,
        };
        query.orderBy = { created_at: "desc" };
      }

      if (live) {
        query.where = {
          ...query.where,
          live_link: {
            not: null,
          },
        };
      }

      // console.log("tags: ", tagName);

      if (tagName && tagName !== "最新の投稿") {
        query.where =
          tagName === "フォロー中"
            ? {
                ...query.where,
                author: {
                  OR: [
                    {
                      followers: {
                        some: {
                          followerId: userId,
                        },
                      },
                    },
                    {
                      id: userId,
                    },
                  ],
                },
              }
            : {
                ...query.where,
                tags: {
                  some: {
                    tag: {
                      name: tagName,
                    },
                  },
                },
              };
      }

      // postsを取得
      const posts = await prisma.post.findMany({
        ...getPostParams(userId),
        ...query,
      });

      const productRatings = await prisma.productRating.groupBy({
        by: ["productId"],
        _avg: {
          value: true,
        },
      });

      // postとproductRatingsをpost.productIdで結合して新たなオブジェクトを作成
      const returnPosts = posts.map((post) => {
        const productRating = productRatings.find(
          (rating) => rating.productId === post.product?.id
        );
        return {
          ...post,
          product: post.product
            ? {
                ...post.product,
                rating: productRating?._avg.value || -1,
              }
            : undefined,
        };
      });

      // console.log(returnPosts);

      // repostsを取得し、関連するpostのcontentを取得
      if ("replied_ref" in query.where) {
        delete query.where.replied_ref;
      }

      if ("tags" in query.where) {
        delete query.where.tags;
      }

      if ("author" in query.where) {
        delete query.where.author;
      }

      if ("AND" in query.where && targetPost) {
        query.where = {
          created_at: before
            ? { lt: targetPost.created_at }
            : { gt: targetPost.created_at },
        };
      }

      if ("live_link" in query.where) {
        delete query.where.live_link;
      }

      if (tagName && tagName !== "最新の投稿") {
        query.where =
          tagName === "フォロー中"
            ? {
                ...query.where,
                post: {
                  author: {
                    OR: [
                      {
                        followers: {
                          some: {
                            followerId: userId,
                          },
                        },
                      },
                      {
                        id: userId,
                      },
                    ],
                  },
                },
              }
            : {
                ...query.where,
                post: {
                  tags: {
                    some: {
                      tag: {
                        name: tagName,
                      },
                    },
                  },
                },
              };
      }

      if (live) {
        query.where = {
          ...query.where,
          post: {
            live_link: {
              not: null,
            },
          },
        };
      }

      // console.dir(query, { depth: null });

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
          post: getPostParams(userId),
        },
        ...query,
      });

      // postsとrepostsを合体し、created_atで降順にソート
      const timeline = [
        ...reposts.map((repost) => ({
          id: repost.id,
          content: repost.post.content,
          images: repost.post.images,
          product: repost.post.product && {
            ...repost.post.product,
            rating: productRatings.find(
              (rating) => rating.productId === repost.post.product!.id
            )?._avg.value,
          },
          live_link: repost.post.live_link,
          like_count: repost.post.like_count,
          ref_count: repost.post.ref_count,
          comment_count: repost.post.comment_count,
          quote_count: repost.post.quote_count,
          quoted_ref: repost.post.quoted_ref,
          created_at: repost.created_at,
          updated_at: repost.post.updated_at,
          userId: repost.post.userId,
          postId: repost.postId,
          postCreatedAt: repost.post.created_at,
          author: repost.post.author,
          reposts: repost.post.reposts,
          likes: repost.post.likes,
          repost_user: repost.user,
          tags: repost.post.tags,
          type: "repost",
        })),
        ...returnPosts.map((post) => ({ ...post, type: "post" })),
      ]
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, 10);

      // post の product の price_histories の created_at で降順にソート，最新のもの以外を削除
      for (const post of timeline) {
        if (post.product) {
          post.product.price_histories = post.product.price_histories
            .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
            .slice(0, 1);
        }
      }

      for (const post of timeline) {
        const postId =
          post.type === "repost" && "postId" in post ? post.postId : post.id;
        try {
          await updatePostImpressionCount(postId);
        } catch (e) {
          console.error(e);
        }
      }

      return c.json(
        {
          success: true,
          data: timeline,
          // data: targetPost
          //   ? before
          //     ? timeline.toReversed()
          //     : timeline
          //   : timeline.toReversed(),
          length: timeline.length,
        },
        200
      );
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
    const post = await prisma.post.findUniqueOrThrow({
      where: {
        id: c.req.param("id"),
      },
      ...getPostParams(userId),
    });
    await updatePostImpressionCount(post.id);

    if (post.product) {
      const productRating = await prisma.productRating.groupBy({
        by: ["productId"],
        where: {
          productId: post.product?.id,
        },
        _avg: {
          value: true,
        },
      });

      const postData = {
        ...post,
        product: {
          ...post.product,
          rating: productRating[0]?._avg.value || -1,
        },
      };
      return c.json({ success: true, data: postData }, 200);
    }
    return c.json({ success: true, data: post }, 200);
  } catch {
    return c.json({ success: false, error: "Failed to fetch post" }, 404);
  }
});

// MARK: 投稿を作成
app.post(
  "/",
  isAuthenticated,
  zValidator("form", postCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue.message),
          data: null,
        },
        400
      );
    }
  }),
  async (c) => {
    // フォームデータの取得
    const formData: {
      content: string;
      quoted_ref: string;
      replied_ref: string;
      "tags[]": string[];
      files: (string | File)[] | (string | File);
    } = await c.req.parseBody({
      all: true,
    });
    const userId = c.get("jwtPayload").sub;

    // @TODO できれば大文字小文字を区別したい (MySQL && prismaがcollationをサポートしていないため見送り)
    // タグの前後の空白を削除して1次元の配列に変換
    const tagNames: string[] = formData["tags[]"]
      ? [
          ...new Set(
            [formData["tags[]"]].flat().map((tag) => tag.trim().toUpperCase())
          ),
        ]
      : [];
    const content: string = formData.content;
    const quoted_ref: string = formData.quoted_ref;
    const replied_ref: string = formData.replied_ref;
    const files = formData.files;

    // console.log(content, tagNames, quoted_ref, replied_ref);

    // 画像ファイルの配列に変換
    const images = files ? [files].flat() : [];

    // 画像ファイルのバリデーション
    if (!images.every((file) => file instanceof File)) {
      return c.json(
        {
          success: false,
          error: ["画像ファイルが不正です"],
          data: null,
        },
        400
      );
    }

    try {
      // 画像をアップロード
      const blobNames: string[] = await uploadImages(images);

      //  投稿を作成 (トランザクション: タグの作成 -> 投稿の作成)
      const post = await prisma.$transaction(async (prisma) => {
        const tags = await Promise.all(
          tagNames.map((tag) =>
            prisma.tag.upsert({
              where: {
                name: tag,
              },
              update: {},
              create: {
                name: tag,
              },
            })
          )
        );

        const post = await prisma.post.create({
          data: {
            content,
            quotedId: quoted_ref,
            repliedId: replied_ref,
            userId,
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
            images: {
              createMany: {
                data: blobNames.map((blobName) => ({
                  image_link: blobName,
                })),
              },
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

        if (replied_ref) {
          await prisma.post.update({
            where: {
              id: replied_ref,
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
        }

        return post;
      });

      return c.json({ success: true, data: post }, 201);
    } catch (error) {
      console.log(error);
      return c.json(
        { success: false, error: ["Failed to create post"], data: null },
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
      include: {
        product: true,
        images: true,
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

    if (post.product && post.product.product_link) {
      try {
        await deleteBlobByName({
          targetContainer: "product",
          blobName: post.product.product_link,
        });
      } catch (error) {
        console.log("Failed to delete product image:", error);
      }
    }

    if (post.images.length > 0) {
      for (const image of post.images) {
        await deleteBlobByName({
          targetContainer: "product",
          blobName: image.image_link,
        });
      }
    }

    await prisma.post.delete({
      where: {
        id: c.req.param("id"),
      },
    });

    if (post.repliedId) {
      const ref = await prisma.post.update({
        where: {
          id: post.repliedId,
        },
        data: {
          comment_count: {
            decrement: 1,
          },
        },
        select: {
          author: true,
        },
      });

      await prisma.notification.delete({
        where: {
          type_senderId_recepientId_relPostId: {
            type: NOTIFICATION_TYPES.COMMENT,
            senderId: userId,
            recepientId: ref.author.id,
            relPostId: post.repliedId,
          },
        },
      });
    }

    if (post.quotedId) {
      await prisma.post.update({
        where: {
          id: post.quotedId,
        },
        data: {
          quote_count: {
            decrement: 1,
          },
        },
        select: {
          author: true,
        },
      });
    }

    // @TODO 通知の削除

    return c.json({ success: true }, 200);
  } catch (e) {
    console.log(e);
    return c.json({ success: false, error: "Failed to delete post" }, 400);
  }
});

export default app;
