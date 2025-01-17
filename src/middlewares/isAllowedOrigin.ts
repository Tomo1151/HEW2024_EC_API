import { Context, Next } from "hono";

export async function isAllowedOrigin(c: Context, next: Next) {
  const allowOrigins: string[] = [
    "https://miseba.syntck.com",
    "http://localhost:3001",
  ];
  const origin: string | undefined = c.req.header("Origin");
  if (origin && allowOrigins.includes(origin)) {
    await next();
  } else {
    return c.json({ message: "You do not have permission" }, 401);
  }
}
