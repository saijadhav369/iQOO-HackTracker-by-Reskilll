import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "hacktracker_session";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export async function signToken(payload: {
  hackathonId: string;
  role: "admin";
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyToken(
  token: string
): Promise<{ hackathonId: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { hackathonId: string; role: string };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { COOKIE_NAME };
