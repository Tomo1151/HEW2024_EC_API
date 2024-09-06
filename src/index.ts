import { Hono } from "hono";

export const app: Hono = new Hono();

app.get("/", (ctx) => {
  return ctx.text("Hello Hono!");
});
