import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

import { downloadBlobByName } from "./utils.js";

// MARK: 定数宣言
const app: Hono = new Hono();

app.get("/media/images/:blobName", async (c) => {
  const blobName: string = c.req.param("blobName");
  const blob = await downloadBlobByName({
    targetContainer: "post",
    blobName,
  });

  if (!blob) {
    return c.json({ success: false, error: "Blob not found" }, 404);
  }

  const contentType = "image/png"; // 必要に応じてファイルタイプを変更
  c.header("Content-Type", contentType);
  c.header("Content-Disposition", `inline`);
  return c.body(blob);
});

app.get("/media/icons/:blobName", async (c) => {
  const blobName: string = c.req.param("blobName");
  const blob = await downloadBlobByName({
    targetContainer: "icon",
    blobName,
  });

  if (!blob) {
    return c.json({ success: false, error: "Blob not found" }, 404);
  }

  const contentType = "image/png"; // 必要に応じてファイルタイプを変更
  c.header("Content-Type", contentType);
  c.header("Content-Disposition", `inline`);
  return c.body(blob);
});

export default app;
