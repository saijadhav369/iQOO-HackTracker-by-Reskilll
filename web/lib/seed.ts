import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hackathons, teams } from "./db/schema";
import { hashPasscode } from "./auth/passcode";

const DATABASE_URL = process.env.DATABASE_URL!;

async function seed() {
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  // Create test hackathon with passcode "123456"
  await db
    .insert(hackathons)
    .values({
      id: "test_hack_2026",
      name: "Test Hackathon 2026",
      startTime: new Date("2026-04-11T09:00:00Z"),
      endTime: new Date("2026-04-12T21:00:00Z"),
      organiserPasscodeHash: hashPasscode("123456"),
      status: "active",
    })
    .onConflictDoNothing();

  // Create some test teams
  const testTeams = [
    { id: "team_01", name: "CodeCrafters" },
    { id: "team_02", name: "ByteBuilders" },
    { id: "team_03", name: "PixelPunks" },
  ];

  for (const t of testTeams) {
    await db
      .insert(teams)
      .values({
        id: t.id,
        hackathonId: "test_hack_2026",
        name: t.name,
        deviceId: `device_${t.id}`,
      })
      .onConflictDoNothing();
  }

  console.log("Seeded: hackathon test_hack_2026 with 3 teams");
  console.log("Login: hackathon_id=test_hack_2026, passcode=123456");
}

seed().catch(console.error);
