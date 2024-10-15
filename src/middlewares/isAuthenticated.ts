import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";

async function isAuthenticated(c: Context, next: Next) {
  try {
    if (!Bun.env.JWT_SECRET) {
      throw new Error("JWT_SECRET_KEY is not set");
    }

    const token = getCookie(c, "__Host-access_token");
    const refreshToken = getCookie(c, "__Host-refresh_token");

    if (!token) {
      if (refreshToken) {
        return c.json({ message: "Token expired" }, 401);
      }
      return c.json({ message: "You do not have permission" }, 401);
    }

    try {
      const decoded = await verify(token, Bun.env.JWT_SECRET, "HS256");

      if (!decoded) {
        return c.json({ message: "You do not have permission" }, 401);
      }

      c.set("jwtPayload", decoded);
      await next();
    } catch (error) {
      console.log(error);
      return c.json({ message: "You do not have permission" }, 401);
    }
  } catch (error) {
    return c.json({ message: "You do not have permission" }, 401);
  }
}

export default isAuthenticated;
