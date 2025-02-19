import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// MARK: 定数宣言
const app: Hono = new Hono();

if (!process.env.CONTACT_WEBHOOK_URL) {
  throw new Error("Contact webhook URL isn't defined");
}

const CONTACT_WEBHOOK_URL: string = process.env.CONTACT_WEBHOOK_URL;

const contactFormSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(1),
});

app.post(
  "/",
  zValidator("json", contactFormSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error.issues.map((issue) => issue.message),
        },
        400
      );
    }
  }),
  async (c) => {
    const { name, email, message } = c.req.valid("json");
    const response = await fetch(CONTACT_WEBHOOK_URL, {
      method: "POST",
      body: JSON.stringify({
        content: `お名前:\n* ${name} \n\nメール:\n* ${email}\n\n内容:\n* ${message}`,
      }),
      headers: { "Content-Type": "application/json" },
    });

    return c.json(
      {
        success: true,
        data: {
          name,
          email,
          message,
        },
      },
      200
    );
  }
);

export default app;
