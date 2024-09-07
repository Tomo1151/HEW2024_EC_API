import { Hono } from "hono";
import { cors } from "hono/cors";

import users from "./users";

const packageJson = require("../package.json");
const API_VERSION = packageJson.version;

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

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/alive", (c) => {
  return c.json({ status: "alive" });
});

app.get("/version", (c) => {
  return c.json({ version: API_VERSION });
});

export default app;
