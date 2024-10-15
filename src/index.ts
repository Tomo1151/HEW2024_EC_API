import { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { getRouterName, showRoutes } from "hono/dev";

import auth from "./auth";
import users from "./users";
import posts from "./posts";

const packageJson: { version: string } = require("../package.json");
const API_VERSION: string = packageJson.version;

const app: Hono = new Hono();

app.use(
  "*",
  cors({
    origin: ["https://localhost:3001"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 300,
  })
);

app.use(
  csrf({
    origin: ["http://localhost:3001"],
  })
);

app.use(logger());
app.route("/auth", auth);
app.route("/users", users);
app.route("/posts", posts);

app.get("/", (c) => {
  return c.text("Hello Hono! 🔥");
});

app.get("/alive", (c) => {
  return c.json({ status: "alive" });
});

app.get("/version", (c) => {
  return c.json({ version: API_VERSION });
});

showRoutes(app, { verbose: true });
console.log(getRouterName(app), "\n");

export default {
  fetch: app.fetch,
  port: 3000,
  tls: {
    key: Bun.file("./cert/server.key"),
    cert: Bun.file("./cert/server.crt"),
  },
};
