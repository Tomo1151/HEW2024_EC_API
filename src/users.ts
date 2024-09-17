import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";

const app: Hono = new Hono();
const prisma = new PrismaClient();

app.get("/", async (ctx) => {
  try {
    const users = await prisma.user.findMany();
    return ctx.json({success: true, data: users, length: users.length}, 200);
  } catch {
    return ctx.json({success: false, error: "Failed to fetch users"}, 500);
  }
});

app.get("/:username", (ctx) => {
  return ctx.text(`Hello ${ctx.req.param("username")}!`);
});

export default app;
