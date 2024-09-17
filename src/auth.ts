import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const app: Hono = new Hono();
const prisma = new PrismaClient();

// type User = {
//   username: string;
//   nickname: string | null;
//   bio: string | null;
//   homepage_link: string | null;
//   icon_link: string | null;
//   created_at: Date;
// }

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
});

// ログイン
app.post(
  "/login",
  zValidator("json", loginSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const { email, password } = c.req.valid("json");

    // ユーザーが存在するか否か&パスワードの検証
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return c.json(
        { success: false, error: "Invalid email or password" },
        401
      );
    }

    const isPasswordValid = await Bun.password.verify(
      password,
      user.hashed_password
    );

    if (!isPasswordValid) {
      return c.json(
        { success: false, error: "Invalid email or password" },
        401
      );
    }

    // JWTの生成
    if (!Bun.env.JWT_SECRET) {
      throw new Error("JWT secret is not set");
    }
    const payload = {
      sub: user.id,
      exp: Math.round(Date.now() / 1000 + 60 * 60),
    };
    const sessionToken = await sign(payload, Bun.env.JWT_SECRET, "HS256");

    // リフレッシュトークンの生成 @TODO DBへ保存，期限の設定
    const refreshToken = await sign(payload, Bun.env.JWT_SECRET, "HS256");

    setCookie(c, "access_token", sessionToken, {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      maxAge: 60 * 5,
    });

    // 返却用のユーザーデータを作成
    {
      const { id, email, hashed_password, updated_at, ...returnUserData } =
        user;
      return c.json({ success: true, data: returnUserData }, 200);
    }
  }
);

// ユーザー登録
app.post(
  "/register",
  zValidator("json", registerSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const { username, email, password } = c.req.valid("json");

    const hashedPassword = await Bun.password.hash(password);

    try {
      await prisma.user.create({
        data: {
          username,
          email,
          hashed_password: hashedPassword,
        },
      });
    } catch (e) {
      return c.json({ success: false, error: "User already exists" }, 400);
    }

    return c.json({ success: true, message: "User created" }, 201);
  }
);

export default app;
