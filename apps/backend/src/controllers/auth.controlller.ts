import type { Request, Response } from "express";
import bcrypt from "bcrypt"
import { loginSchema, userSchema } from "../schemas/userSchema.js";
import { prisma } from "db";
import jwt from  "jsonwebtoken"

// Shared cookie options — the token is httpOnly so the browser stores it but
// JavaScript can't read it (safe from XSS). sameSite "lax" is fine for the
// localhost frontend/backend (same site, different port).
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  maxAge: 24 * 60 * 60 * 1000, // 1 day, matches the JWT expiry
};

function setAuthCookie(res: Response, user: { id: string; email: string }) {
  const token = jwt.sign({ id: user.id, email: user.email }, "secret", {
    expiresIn: "1d",
  });
  res.cookie("token", token, COOKIE_OPTS);
}

export const signupUser = async (req: Request, res: Response) => {
  const result = userSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).send("Please provide correct fields");
  }
  try {
    const existed = await prisma.user.findFirst({
      where: { email: result.data.email },
    });
    if (existed) {
      return res.status(409).send("email already exist");
    }

    const hashedPassword = await bcrypt.hash(result.data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: result.data.email,
        username: result.data.username,
        password: hashedPassword,
      },
    });

    const { password, ...safeUser } = user;
    // auto-login: set the cookie so the account is signed in right after signup
    setAuthCookie(res, user);
    return res.status(200).send({ message: "User is created", user: safeUser });
  } catch (e) {
    return res.status(500).send("something went wrong");
  }
};

export const loginUser = async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).send("Please provide correct fields");
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: result.data.email },
    });
    if (!user) {
      return res.status(401).send("Invalid email or password");
    }

    const isPasswordCorrect = await bcrypt.compare(
      result.data.password,
      user.password,
    );
    if (!isPasswordCorrect) {
      return res.status(401).send("Invalid email or password");
    }

    setAuthCookie(res, user);
    const { password, ...safeUser } = user;
    return res.status(200).send({ user: safeUser });
  } catch (e) {
    return res.status(500).send("something went wrong");
  }
};

// Session check: the authMiddleware has already verified the cookie and set
// req.user, so we just return the current user's public profile.
export const me = async (req: Request, res: Response) => {
  try {
    const id = (req.user as jwt.JwtPayload).id as string;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, username: true, usdBalance: true, lockedBalance: true },
    });
    if (!user) return res.status(404).send("User not found");
    return res.status(200).json(user);
  } catch (e) {
    return res.status(500).send("something went wrong");
  }
};

export const logout = (_req: Request, res: Response) => {
  res.clearCookie("token", COOKIE_OPTS);
  return res.status(200).send({ message: "Logged out" });
};
