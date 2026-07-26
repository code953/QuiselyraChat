import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

function getDbPath(): string {
  const url = process.env.DATABASE_URL || "file:./data/app.db";
  return url;
}

function ensureDataDir(url: string) {
  if (url.startsWith("file:")) {
    const filePath = url.replace("file:", "");
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

const dbUrl = getDbPath();
ensureDataDir(dbUrl);

const client = createClient({
  url: dbUrl,
});

export const db = drizzle(client, { schema });

/**
 * 本地文件库的性能相关 PRAGMA。
 *
 * - journal_mode=WAL：读写不互斥，流式回答写入消息时不再阻塞侧栏/历史查询。
 * - synchronous=NORMAL：WAL 下的常规取舍，去掉每次事务的 fsync。
 * - busy_timeout：写锁竞争时等待而非立即抛 SQLITE_BUSY。
 * - foreign_keys=ON：schema 中声明了 CASCADE 外键，SQLite 默认不强制执行。
 *
 * 远端（libsql/turso）URL 不适用，跳过。
 */
const isLocalFile = dbUrl.startsWith("file:");

let pragmaPromise: Promise<void> | null = null;

export function applyDbPragmas(): Promise<void> {
  if (!isLocalFile) return Promise.resolve();
  if (!pragmaPromise) {
    pragmaPromise = (async () => {
      const statements = [
        "PRAGMA journal_mode = WAL",
        "PRAGMA synchronous = NORMAL",
        "PRAGMA busy_timeout = 5000",
        "PRAGMA foreign_keys = ON",
        "PRAGMA temp_store = MEMORY",
      ];
      for (const statement of statements) {
        try {
          await client.execute(statement);
        } catch (error) {
          // 单条 PRAGMA 失败不应阻止启动（如只读挂载下的 journal_mode）
          console.warn(`Failed to apply "${statement}":`, error);
        }
      }
    })();
  }
  return pragmaPromise;
}
