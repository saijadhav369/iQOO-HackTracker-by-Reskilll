export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams, teamMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

const registerSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  team_name: z.string(),
  // Multi-phone teams. Old APKs omit both — we default them into slot 1.
  member_slot: z.number().int().min(1).max(99).optional(),
  member_name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    const slot = data.member_slot ?? 1;
    const memberName = (data.member_name ?? `Member ${slot}`).trim() || `Member ${slot}`;

    // 1. Create the team row only if it doesn't exist. NEVER overwrite
    // teams.device_id on duplicate — that single column is legacy; per-phone
    // identity now lives in team_members keyed by (team_id, device_id).
    const existing = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, data.team_id))
      .limit(1);

    const created = existing.length === 0;
    if (created) {
      await db.insert(teams).values({
        id: data.team_id,
        hackathonId: data.hackathon_id,
        name: data.team_name,
        deviceId: data.device_id,
      });
    }

    // 2. Upsert this device's member row. Three cases:
    //   (a) same (team_id, device_id) exists → update slot + name (re-setup).
    //   (b) different device already claims this slot → 409 so the participant
    //       picks a different slot in Setup.
    //   (c) clean insert.
    const sameDevice = await db
      .select({ id: teamMembers.id, slot: teamMembers.slot })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, data.team_id),
          eq(teamMembers.deviceId, data.device_id)
        )
      )
      .limit(1);

    if (sameDevice.length === 0) {
      const slotTaken = await db
        .select({ deviceId: teamMembers.deviceId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, data.team_id),
            eq(teamMembers.slot, slot)
          )
        )
        .limit(1);

      if (slotTaken.length > 0) {
        return NextResponse.json(
          {
            error: `Member slot ${slot} is already taken on team ${data.team_id}. Pick a different slot.`,
            slot_conflict: true,
            slot,
          },
          { status: 409 }
        );
      }

      await db.insert(teamMembers).values({
        teamId: data.team_id,
        hackathonId: data.hackathon_id,
        deviceId: data.device_id,
        slot,
        memberName,
      });
    } else if (sameDevice[0].slot !== slot) {
      // Re-setup on the same phone with a different slot — check the new slot
      // isn't claimed by another device first.
      const slotTaken = await db
        .select({ deviceId: teamMembers.deviceId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, data.team_id),
            eq(teamMembers.slot, slot)
          )
        )
        .limit(1);

      if (slotTaken.length > 0 && slotTaken[0].deviceId !== data.device_id) {
        return NextResponse.json(
          {
            error: `Member slot ${slot} is already taken on team ${data.team_id}. Pick a different slot.`,
            slot_conflict: true,
            slot,
          },
          { status: 409 }
        );
      }

      await db
        .update(teamMembers)
        .set({ slot, memberName })
        .where(eq(teamMembers.id, sameDevice[0].id));
    } else {
      // Same device, same slot — just refresh the name in case it changed.
      await db
        .update(teamMembers)
        .set({ memberName })
        .where(eq(teamMembers.id, sameDevice[0].id));
    }

    return NextResponse.json(
      { success: true, created, slot, member_name: memberName },
      { status: created ? 201 : 200 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
