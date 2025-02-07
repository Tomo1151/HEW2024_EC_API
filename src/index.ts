import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { getRouterName, showRoutes } from "hono/dev";
import { except } from "hono/combine";

import { trimTrailingSlash } from "hono/trailing-slash";

import statics from "./statics.js";
import auth from "./auth.js";
import users from "./users.js";
import posts from "./posts.js";
import products from "./products.js";
import serach from "./search.js";
import trends from "./trends.js";
import carts from "./carts.js";
import purchases from "./purchases.js";
import likes from "./likes.js";
import tags from "./tags.js";
import reposts from "./reposts.js";
import quotes from "./quotes.js";
import follows from "./follows.js";
import notifications from "./notifications.js";
import stats from "./stats.js";
import { isAllowedOrigin } from "./middlewares/isAllowedOrigin.js";

// const packageJson: { version: string } = require("../package.json");
// const API_VERSION: string = packageJson.version;
const API_VERSION: string = "1.0.0";

const app: Hono = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3001",
      "https://miseba.azurewebsites.net",
      "https://miseba.syntck.com",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 300,
  })
);

app.use(
  csrf({
    origin: [
      "http://localhost:3001",
      "https://miseba.azurewebsites.net",
      "https://miseba.syntck.com",
    ],
  })
);

app.use("*", except("/media/*", isAllowedOrigin));
app.use(trimTrailingSlash());

app.use(logger());
app.route("/", statics);
app.route("/auth", auth);
app.route("/users", users);
app.route("/posts", posts);
app.route("/", quotes);
app.route("/products", products);
app.route("/search", serach);
app.route("/trendings", trends);
app.route("/carts", carts);
app.route("/purchase", purchases);
app.route("/", reposts);
app.route("/tags", tags);
app.route("/", likes);
app.route("/users", follows);
app.route("/notifications", notifications);
app.route("/stats", stats);

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
