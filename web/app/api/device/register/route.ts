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
  // Multi-phone teams. When omitted the server auto-assigns the lowest free
  // slot for the team (1, 2, 3 ...). No hard cap.
  member_slot: z.number().int().min(1).max(999).optional(),
  member_name: z.string().optional(),
});

// Pick the lowest positive integer not already used as a slot for the team.
// Fills gaps (so a departed Member 2 frees up slot 2) — simpler than max()+1
// for long-running hackathons.
async function pickNextSlot(teamId: string): Promise<number> {
  const used = await db
    .select({ slot: teamMembers.slot })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  const set = new Set(used.map((r) => r.slot));
  let candidate = 1;
  while (set.has(candidate)) candidate++;
  return candidate;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

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

    // 2. Upsert this device's member row.
    //   (a) same (team_id, device_id) exists → update slot + name (re-setup).
    //   (b) new device with explicit slot already claimed by someone else → 409.
    //   (c) new device with no slot → server auto-assigns next free.
    //   (d) new device, slot free → insert.
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

    let resolvedSlot: number;

    if (sameDevice.length === 0) {
      // New device. Resolve slot: client-provided OR auto-assigned.
      if (data.member_slot != null) {
        resolvedSlot = data.member_slot;
        const slotTaken = await db
          .select({ deviceId: teamMembers.deviceId })
          .from(teamMembers)
          .where(
            and(
              eq(teamMembers.teamId, data.team_id),
              eq(teamMembers.slot, resolvedSlot)
            )
          )
          .limit(1);
        if (slotTaken.length > 0) {
          return NextResponse.json(
            {
              error: `Member slot ${resolvedSlot} is already taken on team ${data.team_id}. Pick a different slot.`,
              slot_conflict: true,
              slot: resolvedSlot,
            },
            { status: 409 }
          );
        }
      } else {
        resolvedSlot = await pickNextSlot(data.team_id);
      }

      const memberName =
        (data.member_name ?? `Member ${resolvedSlot}`).trim() ||
        `Member ${resolvedSlot}`;

      await db.insert(teamMembers).values({
        teamId: data.team_id,
        hackathonId: data.hackathon_id,
        deviceId: data.device_id,
        slot: resolvedSlot,
        memberName,
      });

      return NextResponse.json(
        { success: true, created, slot: resolvedSlot, member_name: memberName },
        { status: created ? 201 : 200 }
      );
    }

    // Same device re-registering. Keep existing slot unless client explicitly
    // requested a different one.
    const existingSlot = sameDevice[0].slot;
    const requestedSlot = data.member_slot ?? existingSlot;
    resolvedSlot = requestedSlot;

    if (requestedSlot !== existingSlot) {
      const slotTaken = await db
        .select({ deviceId: teamMembers.deviceId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, data.team_id),
            eq(teamMembers.slot, requestedSlot)
          )
        )
        .limit(1);
      if (slotTaken.length > 0 && slotTaken[0].deviceId !== data.device_id) {
        return NextResponse.json(
          {
            error: `Member slot ${requestedSlot} is already taken on team ${data.team_id}. Pick a different slot.`,
            slot_conflict: true,
            slot: requestedSlot,
          },
          { status: 409 }
        );
      }
    }

    const memberName =
      (data.member_name ?? `Member ${resolvedSlot}`).trim() ||
      `Member ${resolvedSlot}`;

    await db
      .update(teamMembers)
      .set({ slot: resolvedSlot, memberName })
      .where(eq(teamMembers.id, sameDevice[0].id));

    return NextResponse.json(
      { success: true, created, slot: resolvedSlot, member_name: memberName },
      { status: created ? 201 : 200 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
