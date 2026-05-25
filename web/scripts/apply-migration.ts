import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

// Load DATABASE_URL from .env (Next loads it automatically at runtime, but tsx does not).
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/apply-migration.ts <path-to-sql>");
  process.exit(1);
}

const sqlText = readFileSync(resolve(process.cwd(), file), "utf8");

// Strip line comments, then split on `;` outside of `$$ ... $$` blocks.
function splitStatements(text: string): string[] {
  const noComments = text
    .split(/\r?\n/)
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n");
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  for (let i = 0; i < noComments.length; i++) {
    const c = noComments[i];
    if (c === "$" && noComments[i + 1] === "$") {
      inDollar = !inDollar;
      buf += "$$";
      i++;
      continue;
    }
    if (c === ";" && !inDollar) {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

const statements = splitStatements(sqlText);
console.log(`Applying ${statements.length} statement(s) from ${file}`);

const sql = neon(url);

async function main() {
  for (const [i, stmt] of statements.entries()) {
    const preview = stmt.replace(/\s+/g, " ").slice(0, 100);
    console.log(`\n[${i + 1}/${statements.length}] ${preview}${preview.length === 100 ? "..." : ""}`);
    try {
      await sql.query(stmt);
      console.log("  ok");
    } catch (e) {
      console.error(`  FAILED: ${(e as Error).message}`);
      process.exit(1);
    }
  }
  console.log("\nMigration applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});