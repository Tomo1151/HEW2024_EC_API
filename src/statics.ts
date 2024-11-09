import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

// MARK: 定数宣言
const app: Hono = new Hono();

app.get(
  "/images/*",
  serveStatic({
    precompressed: true,
    root: "./",
    rewriteRequestPath(path) {
      return path.replace("/images", "/static/media/images");
    },
  })
);

export default app;
