import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { date, z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
const cartItemSchema = z.object({
  productId: z.string(),
});

const removeCartItemSchema = z.object({
  cartItemId: z.string(),
});

// MARK: カートの中身を取得
app.get("/items", isAuthenticated, async (c) => {
  const userId: string = c.get("jwtPayload").sub;

  try {
    const cartItems = await prisma.cartItem.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            thumbnail_link: true,
            live_release: true,
            post: {
              select: {
                id: true,
                author: {
                  select: {
                    id: true,
                    username: true,
                    nickname: true,
                    icon_link: true,
                  },
                },
                content: true,
                images: {
                  select: {
                    image_link: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return c.json({ success: true, data: cartItems }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Failed to fetch cart items" }, 400);
  }
});

// MARK: カートに追加
app.post(
  "/items",
  isAuthenticated,
  zValidator("json", cartItemSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue),
        },
        400
      );
    }
  }),
  async (c) => {
    const userId: string = c.get("jwtPayload").sub;
    const { productId }: { productId: string } = c.req.valid("json");

    try {
      await prisma.cartItem.create({
        data: {
          amount: 1,
          userId,
          productId,
        },
      });
      return c.json({ success: true }, 201);
    } catch (e) {
      return c.json(
        { success: false, error: "Failed to add product to cart" },
        400
      );
    }
  }
);

// MARK: カートから削除
app.delete(
  "/items",
  isAuthenticated,
  zValidator("json", removeCartItemSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue),
        },
        400
      );
    }
  }),
  async (c) => {
    const userId: string = c.get("jwtPayload").sub;
    const { cartItemId }: { cartItemId: string } = c.req.valid("json");

    try {
      const cartItem = await prisma.cartItem.findUnique({
        where: {
          id: cartItemId,
        },
      });

      if (!cartItem || cartItem.userId !== userId) {
        return c.json({ success: false, error: "Cart item not found" }, 404);
      }

      await prisma.cartItem.delete({
        where: {
          id: cartItemId,
        },
      });
      return c.json({ success: true }, 200);
    } catch (e) {
      return c.json(
        { success: false, error: "Failed to remove product from cart" },
        400
      );
    }
  }
);

export default app;
