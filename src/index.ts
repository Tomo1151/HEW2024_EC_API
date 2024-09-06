import { Hono } from "hono";
import { cors } from "hono/cors";

import users from "./users";

const app: Hono = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:3001"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 300,
  })
);

app.route("/users", users);

app.get("/", (ctx) => {
  return ctx.text("Hello Hono!");
});

app.get("/alive", (ctx) => {
  return ctx.json({ status: "alive" });
});

export default app;
