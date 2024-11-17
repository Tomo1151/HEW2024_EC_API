import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { getRouterName, showRoutes } from "hono/dev";

import statics from "./statics.js";
import auth from "./auth.js";
import users from "./users.js";
import posts from "./posts.js";
import likes from "./likes.js";
import reposts from "./reposts.js";
import replies from "./replies.js";
import follows from "./follows.js";

// const packageJson: { version: string } = require("../package.json");
// const API_VERSION: string = packageJson.version;
const API_VERSION: string = "1.0.0";

const app: Hono = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:3001", "https://miseba.azurewebsites.net"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 300,
  })
);

app.use(
  csrf({
    origin: ["http://localhost:3001", "https://miseba.azurewebsites.net"],
  })
);

app.use(logger());
app.route("/", statics);
app.route("/auth", auth);
app.route("/users", users);
app.route("/posts", posts);
app.route("/", reposts);
app.route("/", replies);
app.route("/", likes);
app.route("/", follows);

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

// export default app;
serve({
  fetch: app.fetch,
  port: 3000,
});
