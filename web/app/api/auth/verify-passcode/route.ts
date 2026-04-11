import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";
import { verifyPasscodeSchema } from "@/lib/validators";
import { verifyPasscode } from "@/lib/auth/passcode";
import { signToken, COOKIE_NAME } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = verifyPasscodeSchema.parse(body);

    const [hackathon] = await db
      .select()
      .from(hackathons)
      .where(eq(hackathons.id, data.hackathon_id))
      .limit(1);

    if (!hackathon) {
      return NextResponse.json(
        { error: "Hackathon not found" },
        { status: 404 }
      );
    }

    if (!verifyPasscode(data.passcode, hackathon.organiserPasscodeHash)) {
      return NextResponse.json(
        { error: "Invalid passcode" },
        { status: 401 }
      );
    }

    const token = await signToken({
      hackathonId: data.hackathon_id,
      role: "admin",
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return response;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
