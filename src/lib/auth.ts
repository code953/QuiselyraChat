import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";

export async function verifyPassword(password: string): Promise<boolean> {
  if (!ACCESS_PASSWORD) return false;
  if (ACCESS_PASSWORD.startsWith("$2")) {
    return bcrypt.compare(password, ACCESS_PASSWORD);
  }
  return password === ACCESS_PASSWORD;
}

export function signToken(): string {
  return jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}
