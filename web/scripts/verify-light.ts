import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

try {
  const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
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
} catch {}

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'hackathons' AND column_name IN ('current_light', 'light_changed_at')
    ORDER BY column_name
  `;
  console.log("hackathons new columns:", cols);

  const tbl = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'light_transitions'
    ORDER BY ordinal_position
  `;
  console.log("light_transitions columns:", tbl);

  const idx = await sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'light_transitions'
  `;
  console.log("light_transitions indexes:", idx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});