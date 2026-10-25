import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!supabaseUrl || !supabaseKey || !livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "Voice is not configured yet. Add Supabase and LiveKit environment variables." }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await supabase.auth.getUser(jwt);
    if (error || !user) return NextResponse.json({ error: "Invalid session. Please sign in again." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const rawRoom = typeof body.roomName === "string" ? body.roomName : "lobby";
    const roomName = rawRoom.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48) || "lobby";
    const displayName = (user.user_metadata?.display_name || user.email?.split("@")[0] || "Member").toString().slice(0, 64);
    const token = new AccessToken(apiKey, apiSecret, { identity: user.id, name: displayName, ttl: "1h" });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
    return NextResponse.json({ token: await token.toJwt(), serverUrl: livekitUrl, roomName });
  } catch {
    return NextResponse.json({ error: "Could not create a voice token." }, { status: 500 });
  }
}
