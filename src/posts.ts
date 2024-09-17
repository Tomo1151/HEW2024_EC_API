import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";

const app: Hono = new Hono();
const prisma = new PrismaClient();

app.get("/", async (ctx) => {
    try {
        const posts = await prisma.post.findMany();
        return ctx.json({ success: true, data: posts, length: posts.length }, 200);
    } catch {
        return ctx.json({ success: false, error: "Failed to fetch posts" }, 500);
    }
});

export default app;
