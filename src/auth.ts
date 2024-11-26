import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

import * as bcrypt from "bcrypt";

import isAuthenticated from "./middlewares/isAuthenticated.js";
// console.log(process.env.ACCESS_TOKEN_NAME, process.env.REFRESH_TOKEN_NAME);
// MARK: 定数宣言
const app: Hono = new Hono();
const prisma = new PrismaClient();

if (!(process.env.ACCESS_TOKEN_NAME && process.env.REFRESH_TOKEN_NAME)) {
  throw new Error("JWT cookie name isn't defined");
}

// トークンのクッキー名
const ACCESS_TOKEN: string = process.env.ACCESS_TOKEN_NAME;
const REFRESH_TOKEN: string = process.env.REFRESH_TOKEN_NAME;

// JWTの有効期限 (5分)
// const TOKEN_EXPIRY: number = 60 * 1;
const TOKEN_EXPIRY: number = 60 * 5;

// リフレッシュトークンの有効期限 (30日)
const REFRESH_EXPIRY: number = 60 * 60 * 24 * 30;

// MARK: スキーマ定義
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

// MARK: ログイン
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
    const isPasswordValid = await bcrypt.compare(
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
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT secret is not set");
    }

    if (!process.env.JWT_REFRESH) {
      throw new Error("JWT refresh secret is not set");
    }

    // セッションのJWTペイロード
    const sessionPayload: JWTPayload = {
      sub: user.id,
      exp: Math.round(Date.now() / 1000 + TOKEN_EXPIRY),
    };
    const sessionToken = await sign(
      sessionPayload,
      process.env.JWT_SECRET,
      "HS256"
    );

    // リフレッシュトークンの生成，DBへの保存
    const refreshPayload: JWTPayload = {
      sub: user.id,
      exp: Math.round(Date.now() / 1000 + REFRESH_EXPIRY),
    };
    const refreshToken = await sign(
      refreshPayload,
      process.env.JWT_REFRESH,
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
    setCookie(c, ACCESS_TOKEN, sessionToken, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: TOKEN_EXPIRY,
    });

    setCookie(c, REFRESH_TOKEN, refreshToken, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: REFRESH_EXPIRY,
    });

    // レスポンス用のユーザーデータを作成
    {
      const { email, hashed_password, updated_at, ...returnUserData } = user;
      return c.json({ success: true, data: returnUserData }, 200);
    }
  }
);

// MARK: ユーザー登録
app.post(
  "/register",
  zValidator("json", registerSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
  }),
  async (c) => {
    const { username, email, password } = c.req.valid("json");

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const user = await prisma.user.create({
        data: {
          username,
          email,
          hashed_password: hashedPassword,
        },
      });

      // レスポンス用のユーザーデータを作成
      {
        const { id, email, hashed_password, updated_at, ...returnUserData } =
          user;
        return c.json({ success: true, data: returnUserData }, 201);
      }
    } catch (e) {
      return c.json({ success: false, error: "User already exists" }, 400);
    }
  }
);

// MARK: トークンのリフレッシュ
app.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, REFRESH_TOKEN);

  if (!refreshToken) {
    return c.json({ success: false, error: "No refresh token provided" }, 401);
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT secret is not set");
  }

  if (!process.env.JWT_REFRESH) {
    throw new Error("JWT refresh secret is not set");
  }

  try {
    // JWTペイロードからユーザーIDを抽出
    const { sub } = await verify(refreshToken, process.env.JWT_REFRESH);
    if (!sub || typeof sub !== "string") {
      throw new Error("Invalid token");
    }

    const user = await prisma.user.findUnique({
      where: {
        id: sub,
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        bio: true,
        homepage_link: true,
        icon_link: true,
        created_at: true,
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
      process.env.JWT_SECRET,
      "HS256"
    );

    setCookie(c, ACCESS_TOKEN, sessionToken, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: TOKEN_EXPIRY,
    });

    return c.json(
      { success: true, message: "Token refreshed", data: user },
      200
    );
  } catch (e) {
    return c.json({ success: false, error: "Invalid refresh token" }, 401);
  }
});

// MARK: ログアウト
app.post("/logout", async (c) => {
  deleteCookie(c, ACCESS_TOKEN, {
    path: "/",
    httpOnly: true,
    sameSite: "Strict",
    secure: true,
  });
  deleteCookie(c, REFRESH_TOKEN, {
    path: "/",
    httpOnly: true,
    sameSite: "Strict",
    secure: true,
  });

  return c.json({ success: true, message: "Logged out" }, 200);
});

// MARK: フェッチ
app.post("/fetch", isAuthenticated, async (c) => {
  try {
    const userId = c.get("jwtPayload").sub;

    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        username: true,
        nickname: true,
        bio: true,
        homepage_link: true,
        icon_link: true,
        created_at: true,
      },
    });

    return c.json({ success: true, data: user }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Invalid token" }, 401);
  }
});

// MARK: 保護されたリソース (JWTの検証テスト用)
app.get("/protected", isAuthenticated, async (c) => {
  try {
    const userId = c.get("jwtPayload").sub;

    return c.json({ success: true, data: { userId } }, 200);
  } catch (e) {
    return c.json({ success: false, error: "Invalid token" }, 401);
  }
});

export default app;
