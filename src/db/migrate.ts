import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./index";
import { personas } from "./schema";
import { builtinPersonas } from "./seed";
import { count } from "drizzle-orm";

export async function runMigrations() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedBuiltinPersonas();
}

async function seedBuiltinPersonas() {
  const [result] = await db.select({ total: count() }).from(personas);
  if (result.total === 0) {
    for (const p of builtinPersonas) {
      await db.insert(personas).values(p).onConflictDoNothing();
    }
  }
}
