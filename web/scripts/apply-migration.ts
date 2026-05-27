import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { Pool } from "pg";

// Loads DATABASE_URL from .env (Next loads it at runtime, but tsx does not).
const envPath = resolve(process.cwd(), ".env");
try {
  const text = readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch (e) {
  console.warn(`Could not read ${envPath}: ${(e as Error).message}`);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function ensureTracking() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "filename" text PRIMARY KEY,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedSet(): Promise<Set<string>> {
  const r = await pool.query<{ filename: string }>(
    `SELECT filename FROM "_migrations"`,
  );
  return new Set(r.rows.map((row) => row.filename));
}

async function applyOne(filename: string, sqlText: string) {
  console.log(`→ applying ${filename}`);
  await pool.query("BEGIN");
  try {
    // pg's simple-query path handles multi-statement strings safely, including
    // dollar-quoted blocks. Avoids naive `;` splitting that breaks on DO/PL/pgSQL.
    await pool.query(sqlText);
    await pool.query(`INSERT INTO "_migrations" (filename) VALUES ($1)`, [
      filename,
    ]);
    await pool.query("COMMIT");
    console.log(`  ✓ ${filename}`);
  } catch (e) {
    await pool.query("ROLLBACK");
    throw new Error(`Migration ${filename} failed: ${(e as Error).message}`);
  }
}

async function main() {
  const arg = process.argv[2];
  await ensureTracking();
  const applied = await appliedSet();

  if (arg) {
    const filename = arg.split("/").pop()!;
    if (applied.has(filename)) {
      console.log(`${filename} already applied — skipping`);
      return;
    }
    const sqlText = readFileSync(resolve(process.cwd(), arg), "utf8");
    await applyOne(filename, sqlText);
    return;
  }

  const dir = resolve(process.cwd(), "lib/db/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }
  console.log(`Pending: ${pending.length} migration(s)`);
  for (const f of pending) {
    const sqlText = readFileSync(join(dir, f), "utf8");
    await applyOne(f, sqlText);
  }
  console.log(`Done. Applied ${pending.length} migration(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
