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
