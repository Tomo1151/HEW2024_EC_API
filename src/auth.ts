import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

import isAuthenticated from "./middlewares/isAuthenticated";

const app: Hono = new Hono();
const prisma = new PrismaClient();

// JWTの有効期限 (5分)
const TOKEN_EXPIRY: number = 60 * 1;
// const TOKEN_EXPIRY: number = 60 * 5;

// リフレッシュトークンの有効期限 (30日)
const REFRESH_EXPIRY: number = 60 * 60 * 24 * 30;

// ログインPOSTのスキーマ
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// ユーザー登録POSTのスキーマ
const registerSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
});

type JWTPayload = {
  sub: string;
  exp: number;
};

// ログイン
app.post(
  "/login",
  // リクエストボディのバリデーション (middleware)
  zValidator("json", loginSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const { email, password } = c.req.valid("json");

    // ユーザーが存在するか否か&パスワードの検証
    let user;

    try {
      user = await prisma.user.findUnique({ where: { email } });
    } catch (e) {
      return c.json({ success: false, error: "Internal server error" }, 500);
    }

    if (!user) {
      return c.json(
        { success: false, error: "Invalid email or password" },
        401
      );
    }

    // パスワードの検証
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

    if (!Bun.env.JWT_REFRESH) {
      throw new Error("JWT refresh secret is not set");
    }

    // セッションのJWTペイロード
    const sessionPayload: JWTPayload = {
      sub: user.id,
      exp: Math.round(Date.now() / 1000 + TOKEN_EXPIRY),
    };
    const sessionToken = await sign(
      sessionPayload,
      Bun.env.JWT_SECRET,
      "HS256"
    );

    // リフレッシュトークンの生成，DBへの保存
    const refreshPayload: JWTPayload = {
      sub: user.id,
      exp: Math.round(Date.now() / 1000 + REFRESH_EXPIRY),
    };
    const refreshToken = await sign(
      refreshPayload,
      Bun.env.JWT_REFRESH,
      "HS256"
    );
    try {
      await prisma.refreshToken.upsert({
        where: {
          userId: user.id,
        },
        update: {
          token: refreshToken,
        },
        create: {
          token: refreshToken,
          user: {
            connect: {
              id: user.id,
            },
          },
        },
      });
    } catch (e) {
      return c.json(
        { success: false, error: "Failed to create refresh token" },
        500
      );
    }

    // 本番環境ではsecure: true, __Host-を付与
    setCookie(c, "access_token", sessionToken, {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
      maxAge: TOKEN_EXPIRY,
    });

    setCookie(c, "refresh_token", refreshToken, {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
      maxAge: REFRESH_EXPIRY,
    });

    // レスポンス用のユーザーデータを作成
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

// トークンのリフレッシュ
app.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, "refresh_token");

  if (!refreshToken) {
    return c.json({ success: false, error: "No refresh token provided" }, 401);
  }

  if (!Bun.env.JWT_SECRET) {
    throw new Error("JWT secret is not set");
  }

  if (!Bun.env.JWT_REFRESH) {
    throw new Error("JWT refresh secret is not set");
  }

  try {
    // JWTペイロードからユーザーIDを抽出
    const { sub } = await verify(refreshToken, Bun.env.JWT_REFRESH);
    if (!sub || typeof sub !== "string") {
      throw new Error("Invalid token");
    }

    const user = await prisma.user.findUnique({
      where: {
        id: sub,
      },
    });

    if (!user) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    // 新しいセッションのJWTを生成，付与
    const sessionPayload = {
      sub: user.id,
      exp: Math.round(Date.now() / 1000 + TOKEN_EXPIRY),
    };
    const sessionToken = await sign(
      sessionPayload,
      Bun.env.JWT_SECRET,
      "HS256"
    );

    setCookie(c, "access_token", sessionToken, {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
      maxAge: TOKEN_EXPIRY,
    });

    return c.json({ success: true, message: "Token refreshed" }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Invalid refresh token" }, 401);
  }
});

// ログアウト
app.post("/logout", async (c) => {
  deleteCookie(c, "access_token", { path: "/" });
  deleteCookie(c, "refresh_token", { path: "/" });

  return c.json({ success: true, message: "Logged out" }, 200);
});

// 保護されたリソース (JWTの検証テスト用)
app.get("/protected", isAuthenticated, async (c) => {
  try {
    const userId = c.get("jwtPayload").sub;

    return c.json({ success: true, data: { userId } }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Invalid token" }, 401);
  }
});

export default app;
