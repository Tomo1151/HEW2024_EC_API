import { Hono } from "hono";

const app: Hono = new Hono();

app.get("/", (ctx) => {
  return ctx.text("GET /users");
});

app.get("/:username", (ctx) => {
  return ctx.text(`Hello ${ctx.req.param("username")}!`);
});

export default app;
