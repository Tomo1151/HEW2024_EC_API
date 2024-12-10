import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import isAuthenticated from "./middlewares/isAuthenticated.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義
const cartItemSchema = z.object({
  productId: z.string(),
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
          error: result.error.issues.map((issue) => issue.message),
        },
        400
      );
    }
  }),
  async (c) => {
    try {
      const userId: string = c.get("jwtPayload").sub;
      const { productId }: { productId: string } = c.req.valid("json");

      return c.json({ success: true }, 200);
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
  zValidator("json", cartItemSchema, (result, c) => {
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
    try {
      const userId: string = c.get("jwtPayload").sub;
      const { productId }: { productId: string } = c.req.valid("json");

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
