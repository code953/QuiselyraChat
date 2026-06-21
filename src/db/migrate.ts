import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./index";
import { personas } from "./schema";
import { builtinPersonas } from "./seed";
import { count, sql } from "drizzle-orm";
import crypto from "node:crypto";
import fs from "node:fs";

const MIGRATIONS_FOLDER = "./drizzle";

export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already exists")) {
      console.log(
        "Database schema already exists (created via drizzle-kit push). Syncing migration journal..."
      );
      await syncMigrationJournal();
    } else {
      throw error;
    }
  }
  await seedBuiltinPersonas();
}

async function syncMigrationJournal() {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  const journalPath = `${MIGRATIONS_FOLDER}/meta/_journal.json`;
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  for (const entry of journal.entries) {
    const sqlContent = fs.readFileSync(
      `${MIGRATIONS_FOLDER}/${entry.tag}.sql`,
      "utf-8"
    );
    const hash = crypto
      .createHash("sha256")
      .update(sqlContent)
      .digest("hex");

    await db.run(
      sql`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (${hash}, ${entry.when})`
    );
  }

  console.log("Migration journal synced. Future migrations will apply normally.");
}

async function seedBuiltinPersonas() {
  const [result] = await db.select({ total: count() }).from(personas);
  if (result.total === 0) {
    for (const p of builtinPersonas) {
      await db.insert(personas).values(p).onConflictDoNothing();
    }
  }
}
