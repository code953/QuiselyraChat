import jwt from "jsonwebtoken";
import { getJwtSecret, verifyAccessPassword } from "./secrets";

export async function verifyPassword(password: string): Promise<boolean> {
  return verifyAccessPassword(password);
}

export async function signToken(): Promise<string> {
  const secret = await getJwtSecret();
  return jwt.sign({ authenticated: true }, secret, { expiresIn: "30d" });
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = await getJwtSecret();
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}
