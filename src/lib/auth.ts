import jwt from "jsonwebtoken";
import { getJwtSecret, getTokenVersion, verifyAccessPassword } from "./secrets";

const TOKEN_TTL = "14d";
const TOKEN_ISSUER = "quiselyrachat";

interface TokenPayload {
  authenticated?: boolean;
  /** 访问密码的版本标记：改密码后旧 token 因版本不符而失效 */
  pv?: string;
}

export async function verifyPassword(password: string): Promise<boolean> {
  return verifyAccessPassword(password);
}

export async function signToken(): Promise<string> {
  const [secret, pv] = await Promise.all([getJwtSecret(), getTokenVersion()]);
  return jwt.sign({ authenticated: true, pv }, secret, {
    expiresIn: TOKEN_TTL,
    issuer: TOKEN_ISSUER,
    algorithm: "HS256",
  });
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const [secret, pv] = await Promise.all([getJwtSecret(), getTokenVersion()]);
    // 固定算法，避免 alg 混淆；固定签发者，拒绝其它来源的同密钥令牌。
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
    }) as TokenPayload;

    if (payload?.authenticated !== true) return false;
    // 缺少 pv 的令牌签发于版本机制之前，一并视为失效（需重新登录一次）。
    return payload.pv === pv;
  } catch {
    return false;
  }
}
