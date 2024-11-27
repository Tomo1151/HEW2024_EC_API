import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import isAuthenticated from "./middlewares/isAuthenticated.js";

// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

// MARK: スキーマ定義

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

export default app;
