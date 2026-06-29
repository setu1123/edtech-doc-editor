import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-super-secret-key-123456";

export function signToken(payload: { userId: string; email: string; name: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string; name: string };
  } catch {
    return null;
  }
}

export async function getUserFromRequest(request: Request) {
  try {
    // Attempt 1: Get from cookie
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get("auth_token");
    let token = tokenCookie?.value;

    // Attempt 2: Authorization Header
    if (!token) {
      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    // Optional db check
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true },
    });

    return user;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}
