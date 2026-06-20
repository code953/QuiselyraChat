import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  console.warn("WARNING: JWT_SECRET is not set, using insecure default. Set JWT_SECRET for production.");
}
const jwtSecret = JWT_SECRET || "default-secret-change-me-dev-only";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";

export async function verifyPassword(password: string): Promise<boolean> {
  if (!ACCESS_PASSWORD) return false;
  if (ACCESS_PASSWORD.startsWith("$2")) {
    return bcrypt.compare(password, ACCESS_PASSWORD);
  }
  return password === ACCESS_PASSWORD;
}

export function signToken(): string {
  return jwt.sign({ authenticated: true }, jwtSecret, { expiresIn: "30d" });
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, jwtSecret);
    return true;
  } catch {
    return false;
  }
}
