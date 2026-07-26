import { createHash, randomBytes } from "node:crypto";
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
 * 访问密码的令牌版本缓存。密码哈希变化时版本随之变化，
 * 已签发的 JWT 因版本不匹配而立即失效（见 `src/lib/auth.ts`）。
 * 缓存在内存中，避免每个请求都为校验版本读一次数据库。
 */
let tokenVersionCache: string | null = null;

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
  // 逐条 console.log，每条各自成为一条日志记录。
  // 部分部署平台（如 Zeabur）会把带 \n 的多行字符串压成一行，
  // 因此把密码放在独立且带清晰前缀的一行，压行后依然能被看到/搜索到。
  const line = "=".repeat(56);
  console.log(line);
  console.log("QuiselyraChat 首次启动：已自动生成初始访问密码（仅显示一次，请妥善保存）");
  console.log(`QuiselyraChat 初始访问密码 => ${plaintext}`);
  console.log("登录后可在「设置 - 通用」中修改密码。");
  console.log(line);
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
 * 修改访问密码：写入新密码的 bcrypt 哈希，并让所有已签发的 JWT 失效。
 */
export async function setAccessPassword(newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db
    .insert(settings)
    .values({ key: SETTING_ACCESS_PASSWORD_HASH, value: hash })
    .onConflictDoUpdate({ target: settings.key, set: { value: hash } });
  // 令旧 token 立即失效：版本由新哈希派生。
  tokenVersionCache = deriveTokenVersion(hash);
}

function deriveTokenVersion(passwordHash: string): string {
  // 只暴露哈希的摘要片段，不把 bcrypt 哈希本身放进 JWT 载荷。
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

/**
 * 当前访问密码对应的令牌版本。签发与校验 JWT 时都会带上，
 * 因此「修改密码」等价于「登出所有设备」。
 */
export async function getTokenVersion(): Promise<string> {
  if (tokenVersionCache) return tokenVersionCache;
  await ensureSecrets();
  const hash = await readSetting(SETTING_ACCESS_PASSWORD_HASH);
  // 理论上 ensureSecrets 之后哈希必然存在；缺失时用固定占位值，
  // 保证签发与校验使用同一个版本而不是各自生成随机值。
  tokenVersionCache = deriveTokenVersion(hash ?? "");
  return tokenVersionCache;
}
