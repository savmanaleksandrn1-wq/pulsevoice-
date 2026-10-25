"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import styles from "./VoiceRoom.module.css";

type Props = { supabase: SupabaseClient; displayName: string };

export default function VoiceRoom({ supabase, displayName }: Props) {
  const [accessToken, setAccessToken] = useState("");
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token || "")); }, [supabase]);
  const [roomName, setRoomName] = useState("lobby");
  const [connection, setConnection] = useState<{ token: string; serverUrl: string; roomName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setBusy(true); setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const freshToken = sessionData.session?.access_token || accessToken;
      if (!freshToken) throw new Error("Your session expired. Sign in again.");
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({ roomName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not join voice room.");
      setConnection(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect."); }
    finally { setBusy(false); }
  }

  if (connection) return <div className={styles.connected}>
    <div className={styles.roomHeader}><div><span className={styles.liveDot}/> Connected to <b>{connection.roomName}</b><small>Signed in as {displayName}</small></div><button onClick={() => setConnection(null)}>Leave room</button></div>
    <LiveKitRoom token={connection.token} serverUrl={connection.serverUrl} connect audio video onDisconnected={() => setConnection(null)} data-lk-theme="default" className={styles.room}>
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
    <p className={styles.tip}>Use the microphone, camera and share-screen controls in the call toolbar. Screen sharing depends on browser permissions.</p>
  </div>;

  return <div className={styles.joinCard}>
    <div className={styles.icon}>♫</div><h2>Join a voice room</h2><p>Connect with other PulseVoice users. Live audio/video and screen sharing are provided by LiveKit.</p>
    <label htmlFor="pv-room">Room name</label><input id="pv-room" value={roomName} onChange={e => setRoomName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0,48))} maxLength={48} placeholder="lobby" />
    {error && <p className={styles.error}>{error}</p>}
    <button onClick={join} disabled={busy || !roomName.trim()}>{busy ? "Connecting…" : "Join room"}</button>
    <small>Everyone using the same room name joins the same room. Don't use private room names as a security boundary.</small>
  </div>;
}
