import { Context } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";

export async function getUserIdFromCookie(c: Context): Promise<string> {
  if (!(process.env.ACCESS_TOKEN_NAME && process.env.REFRESH_TOKEN_NAME)) {
    throw new Error("JWT cookie name isn't defined");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET_KEY is not set");
  }

  const token = getCookie(c, process.env.ACCESS_TOKEN_NAME);

  if (!token) return "";
  try {
    const decoded = await verify(token, process.env.JWT_SECRET, "HS256");

    if (!decoded.sub) return "";

    if (!decoded) return "";
    return decoded.sub as string;
  } catch (error) {
    return "";
  }
}
