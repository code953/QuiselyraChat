import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * 服务端密钥/密码管理。
 *
 * JWT 签名密钥、API Key 加密密钥、访问密码均在首次启动时自动生成，
 * 并持久化到 `settings` 表，重启后保持不变。不再读取任何环境变量。
 *
 * - `jwt_secret`：JWT 签名密钥（hex 字符串）
 * - `encryption_key`：AES-256 加密主密钥（64 位 hex / 32 字节）
 * - `access_password_hash`：访问密码的 bcrypt 哈希
 */

export const SETTING_JWT_SECRET = "jwt_secret";
export const SETTING_ENCRYPTION_KEY = "encryption_key";
export const SETTING_ACCESS_PASSWORD_HASH = "access_password_hash";

const BCRYPT_ROUNDS = 10;

export interface RuntimeSecrets {
  jwtSecret: string;
  encryptionKey: Buffer;
}

let secretsPromise: Promise<RuntimeSecrets> | null = null;

/**
 * 生成一个随机强密码（约 143 bit 熵，base64url 字符集，无歧义填充符）。
 */
export function generateStrongPassword(): string {
  return randomBytes(18).toString("base64url");
}

async function readSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

/**
 * 若 key 不存在则写入 `generate()` 的结果并返回；已存在则返回已存的值。
 * 通过 onConflictDoNothing 保证并发/重复初始化时的幂等，且只有真正写入的一方
 * 才会触发 `onCreated` 回调。
 */
async function ensureSetting(
  key: string,
  generate: () => string,
  onCreated?: (value: string) => void
): Promise<string> {
  const candidate = generate();
  const inserted = await db
    .insert(settings)
    .values({ key, value: candidate })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0 && inserted[0].value) {
    onCreated?.(inserted[0].value);
    return inserted[0].value;
  }

  const existing = await readSetting(key);
  return existing ?? candidate;
}

function logGeneratedPassword(plaintext: string): void {
  const line = "=".repeat(56);
  console.log(
    `\n${line}\n` +
      `  NekoraChat 首次启动：已自动生成初始访问密码\n` +
      `  初始密码: ${plaintext}\n` +
      `  这是系统自动生成的初始密码，请妥善保存。\n` +
      `  登录后可在「设置 - 通用」中修改密码。\n` +
      `${line}\n`
  );
}

/**
 * 确保访问密码已存在：首次启动时生成随机强密码，持久化其 bcrypt 哈希，
 * 并把明文打印到启动日志（仅打印一次）。
 */
async function ensureAccessPassword(): Promise<void> {
  const existing = await readSetting(SETTING_ACCESS_PASSWORD_HASH);
  if (existing) return;

  const plaintext = generateStrongPassword();
  const hash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);

  const inserted = await db
    .insert(settings)
    .values({ key: SETTING_ACCESS_PASSWORD_HASH, value: hash })
    .onConflictDoNothing()
    .returning();

  // 只有真正写入哈希的一方才打印明文，避免并发/重复初始化时重复输出。
  if (inserted.length > 0) {
    logGeneratedPassword(plaintext);
  }
}

async function loadOrCreateSecrets(): Promise<RuntimeSecrets> {
  const jwtSecret = await ensureSetting(SETTING_JWT_SECRET, () =>
    randomBytes(32).toString("hex")
  );

  const encryptionKeyHex = await ensureSetting(SETTING_ENCRYPTION_KEY, () =>
    randomBytes(32).toString("hex")
  );

  const encryptionKey = Buffer.from(encryptionKeyHex, "hex");
  if (encryptionKey.length !== 32) {
    throw new Error("Stored encryption_key is invalid (must be 32 bytes / 64 hex chars)");
  }

  await ensureAccessPassword();

  return { jwtSecret, encryptionKey };
}

/**
 * 幂等地确保所有密钥/密码已生成并持久化，返回运行期需要的密钥。
 * 通过 Promise 记忆，进程内只会真正执行一次。
 */
export function ensureSecrets(): Promise<RuntimeSecrets> {
  if (!secretsPromise) {
    secretsPromise = loadOrCreateSecrets();
  }
  return secretsPromise;
}

export async function getJwtSecret(): Promise<string> {
  return (await ensureSecrets()).jwtSecret;
}

export async function getEncryptionKey(): Promise<Buffer> {
  return (await ensureSecrets()).encryptionKey;
}

/**
 * 校验访问密码。每次都从数据库读取哈希，因此在设置页修改密码后立即生效。
 */
export async function verifyAccessPassword(password: string): Promise<boolean> {
  if (!password) return false;
  await ensureSecrets();
  const hash = await readSetting(SETTING_ACCESS_PASSWORD_HASH);
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * 修改访问密码：写入新密码的 bcrypt 哈希。
 */
export async function setAccessPassword(newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db
    .insert(settings)
    .values({ key: SETTING_ACCESS_PASSWORD_HASH, value: hash })
    .onConflictDoUpdate({ target: settings.key, set: { value: hash } });
}
