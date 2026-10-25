"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  Activity, Bell, Compass, Headphones, Home, MessageCircle, Search, Settings2,
  Sun, Moon, Users, ShieldCheck, AudioLines, Plus, ChevronDown, Send,
  UserPlus, LogOut, Check, X, RefreshCw, ArrowLeft, CircleHelp,
} from "lucide-react";
import styles from "./page.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import VoiceRoom from "@/components/VoiceRoom";

type Profile = { id: string; display_name: string; handle: string; avatar_url?: string | null };
type AppUser = { id: string; email: string; profile: Profile | null };
type Section = "Home" | "Messages" | "Communities" | "Voice rooms" | "Friends" | "Notifications" | "Search" | "Settings";
type ConversationVM = { id: string; kind: "direct" | "group"; title: string; created_at: string; otherUserId?: string };
type MessageVM = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; senderName: string; senderHandle: string };
type FriendRequestVM = { id: string; sender_id: string; receiver_id: string; status: string; created_at: string; sender: Profile | null; receiver: Profile | null };

const sections: [Section, typeof Home][] = [
  ["Home", Home], ["Messages", MessageCircle], ["Communities", Compass], ["Voice rooms", Headphones],
  ["Friends", Users], ["Notifications", Bell], ["Search", Search], ["Settings", Settings2],
];
const descriptions: Record<Section, string> = {
  Home: "Your space, at a glance", Messages: "Private conversations that sync through Supabase",
  Communities: "Community spaces are the next milestone", "Voice rooms": "Live voice, video and screen sharing",
  Friends: "Find people and manage requests", Notifications: "Your account activity", Search: "Find people by handle",
  Settings: "Make it yours",
};

export default function Page() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const configured = Boolean(supabase);
  const [user, setUser] = useState<AppUser | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [section, setSection] = useState<Section>("Home");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [conversations, setConversations] = useState<ConversationVM[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<MessageVM[]>([]);
  const [draft, setDraft] = useState("");
  const [personHandle, setPersonHandle] = useState("");
  const [requests, setRequests] = useState<FriendRequestVM[]>([]);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [appLoading, setAppLoading] = useState(true);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pv-theme");
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch { /* local storage can be unavailable in private browser settings */ }
    if (!supabase) { setAppLoading(false); return; }
    let mounted = true;
    const setFromSession = async (sessionUser: SupabaseUser | null) => {
      if (!mounted) return;
      if (!sessionUser) { setUser(null); setAppLoading(false); return; }
      setUser({ id: sessionUser.id, email: sessionUser.email ?? "", profile: null });
      setAppLoading(false);
    };
    void supabase.auth.getSession().then(({ data, error: sessionError }: { data: { session: import('@supabase/supabase-js').Session | null }; error: Error | null }) => {
      if (sessionError) setError(sessionError.message);
      return setFromSession(data.session?.user ?? null);
    }).catch((e: unknown) => {
      if (mounted) setError(e instanceof Error ? e.message : "Could not read Supabase session.");
      if (mounted) setAppLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void setFromSession(session?.user ?? null);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pv-theme", theme); } catch { /* no-op */ }
  }, [theme]);

  const loadProfile = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("id,display_name,handle,avatar_url").eq("id", uid).maybeSingle();
    setUser((old) => old?.id === uid ? { ...old, profile: data as Profile | null } : old);
  }, [supabase]);

  const loadConversations = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data: memberRows, error: memberError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", uid);
    if (memberError) { setError(memberError.message); return; }
    const ids = (memberRows ?? []).map((r: { conversation_id: string }) => r.conversation_id);
    if (!ids.length) { setConversations([]); setActiveConversationId(""); return; }
    const [{ data: convRows, error: convError }, { data: allMembers, error: peopleError }] = await Promise.all([
      supabase.from("conversations").select("id,kind,title,created_at").in("id", ids).order("created_at", { ascending: false }),
      supabase.from("conversation_members").select("conversation_id,user_id,profiles(display_name,handle)").in("conversation_id", ids),
    ]);
    if (convError || peopleError) { setError((convError || peopleError)?.message ?? "Could not load conversations."); return; }
    const mapped = (convRows ?? []).map((c: any) => {
      const peers = (allMembers ?? []).filter((m: any) => m.conversation_id === c.id && m.user_id !== uid);
      const first = peers[0];
      const p = Array.isArray(first?.profiles) ? first.profiles[0] : first?.profiles;
      return { ...c, kind: c.kind as "direct" | "group", title: c.title || p?.display_name || (p?.handle ? `@${p.handle}` : "Direct message"), otherUserId: first?.user_id } as ConversationVM;
    });
    setConversations(mapped);
    setActiveConversationId((old) => old && mapped.some((c) => c.id === old) ? old : "");
  }, [supabase]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!supabase || !conversationId) { setMessages([]); return; }
    setLoadingMessages(true);
    const { data, error: queryError } = await supabase.from("messages").select("id,conversation_id,sender_id,content,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(100);
    if (queryError) { setError(queryError.message); setLoadingMessages(false); return; }
    const senderIds = [...new Set((data ?? []).map((m: any) => m.sender_id))];
    const { data: profiles } = senderIds.length ? await supabase.from("profiles").select("id,display_name,handle").in("id", senderIds) : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    setMessages((data ?? []).map((m: any) => {
      const p = profileMap.get(m.sender_id);
      return { ...m, senderName: p?.display_name ?? "Member", senderHandle: p?.handle ?? "member" } as MessageVM;
    }));
    setLoadingMessages(false);
  }, [supabase]);

  const loadRequests = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data, error: requestError } = await supabase.from("friend_requests").select("id,sender_id,receiver_id,status,created_at").or(`sender_id.eq.${uid},receiver_id.eq.${uid}`).order("created_at", { ascending: false }).limit(100);
    if (requestError) { setError(requestError.message); return; }
    const ids = [...new Set((data ?? []).flatMap((r: any) => [r.sender_id, r.receiver_id]))];
    const { data: profileRows } = ids.length ? await supabase.from("profiles").select("id,display_name,handle").in("id", ids) : { data: [] as any[] };
    const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p as Profile]));
    setRequests((data ?? []).map((r: any) => ({ ...r, sender: profileMap.get(r.sender_id) ?? null, receiver: profileMap.get(r.receiver_id) ?? null })) as FriendRequestVM[]);
  }, [supabase]);

  useEffect(() => {
    if (!user || !supabase) return;
    void loadProfile(user.id);
    void loadConversations(user.id);
    void loadRequests(user.id);
  }, [user?.id, supabase, loadProfile, loadConversations, loadRequests]);

  useEffect(() => {
    if (!activeConversationId || !supabase) return;
    void loadMessages(activeConversationId);
    const channel = supabase.channel(`pv-messages-${activeConversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeConversationId}` }, () => {
        void loadMessages(activeConversationId);
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeConversationId, supabase, loadMessages]);

  async function auth(e: FormEvent) {
    e.preventDefault();
    if (!supabase) { setError("Сначала добавь URL и anon/publishable key Supabase в файл .env.local."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "register") {
        const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (cleanHandle.length < 3) throw new Error("Handle должен содержать минимум 3 символа: латинские буквы, цифры или _.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim(), handle: cleanHandle }, emailRedirectTo: `${window.location.origin}/` },
        });
        if (signUpError) throw signUpError;
        if (data.session?.user) {
          setUser({ id: data.session.user.id, email: data.session.user.email ?? email.trim(), profile: null });
          setNotice("Аккаунт создан. Добро пожаловать в PulseVoice!");
        } else {
          setNotice("Аккаунт создан. Открой почту и подтверди адрес, затем войди в PulseVoice.");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        if (!data.user) throw new Error("Вход не завершён. Попробуй ещё раз.");
        setUser({ id: data.user.id, email: data.user.email ?? email.trim(), profile: null });
        setNotice("Ты вошёл в PulseVoice.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось выполнить запрос. Проверь настройки Supabase.");
    } finally { setBusy(false); }
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    setUser(null); setConversations([]); setMessages([]); setActiveConversationId(""); setSection("Home"); setNotice("Ты вышел из аккаунта.");
  }

  async function startConversation(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const clean = personHandle.trim().replace(/^@/, "").toLowerCase();
      const { data: profile, error: profileError } = await supabase.from("profiles").select("id,display_name,handle").eq("handle", clean).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error(`Пользователь @${clean} не найден. Он должен сначала создать аккаунт.`);
      if (profile.id === user.id) throw new Error("Нельзя начать диалог с самим собой.");
      const { data: conversationId, error: rpcError } = await supabase.rpc("create_direct_conversation", { target_user_id: profile.id });
      if (rpcError) throw rpcError;
      await loadConversations(user.id);
      setActiveConversationId(conversationId as string);
      setPersonHandle(""); setSection("Messages"); setNotice(`Открыт диалог с @${profile.handle}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось создать диалог."); }
    finally { setBusy(false); }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!supabase || !user || !activeConversationId || !content) return;
    setBusy(true); setError("");
    const { error: insertError } = await supabase.from("messages").insert({ conversation_id: activeConversationId, sender_id: user.id, content });
    if (insertError) setError(insertError.message);
    else { setDraft(""); await loadMessages(activeConversationId); }
    setBusy(false);
  }

  async function sendFriendRequest(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const clean = personHandle.trim().replace(/^@/, "").toLowerCase();
      const { data: target, error: targetError } = await supabase.from("profiles").select("id,handle").eq("handle", clean).maybeSingle();
      if (targetError) throw targetError;
      if (!target) throw new Error(`Пользователь @${clean} не найден.`);
      if (target.id === user.id) throw new Error("Нельзя отправить запрос самому себе.");
      const { error: insertError } = await supabase.from("friend_requests").insert({ sender_id: user.id, receiver_id: target.id });
      if (insertError) {
        if (insertError.code === "23505") throw new Error("Запрос этому пользователю уже отправлен.");
        throw insertError;
      }
      setPersonHandle(""); setNotice(`Запрос в друзья отправлен пользователю @${target.handle}.`); await loadRequests(user.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось отправить запрос."); }
    finally { setBusy(false); }
  }

  async function respondToFriendRequest(id: string, status: "accepted" | "declined") {
    if (!supabase || !user) return;
    const { error: updateError } = await supabase.from("friend_requests").update({ status }).eq("id", id).eq("receiver_id", user.id);
    if (updateError) setError(updateError.message);
    else { setNotice(status === "accepted" ? "Запрос принят." : "Запрос отклонён."); await loadRequests(user.id); }
  }

  async function searchPeople(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    const clean = query.trim().replace(/^@/, "");
    if (clean.length < 2) { setError("Введи хотя бы 2 символа handle."); return; }
    const { data, error: searchError } = await supabase.from("profiles").select("id,display_name,handle,avatar_url").ilike("handle", `%${clean}%`).neq("id", user.id).limit(20);
    if (searchError) setError(searchError.message); else setPeople((data ?? []) as Profile[]);
  }

  if (appLoading) return <main className={styles.auth}><header className={styles.brand}><span className={styles.logo}><Activity size={20}/></span>pulsevoice</header><p className={styles.subtitle}>Подключаем аккаунт…</p></main>;

  if (!user) return <main className={styles.auth}>
    <header className={styles.brand}><span className={styles.logo}><Activity size={20}/></span>pulsevoice <small>SUPABASE EDITION</small></header>
    <div className={styles.authGrid}>
      <section className={styles.pitch}><label>● &nbsp; A BETTER PLACE TO CONNECT</label><h1>Good conversations<br/>move us <span>forward.</span></h1><p>Private messages and people you care about, backed by Supabase.</p><div className={styles.proof}><AudioLines/><div><b>One space. Every voice.</b><small>Accounts and direct messages are connected to the database.</small></div></div></section>
      <section className={styles.formCard}>
        <div className={styles.formTop}><small>{configured ? "YOUR SPACE AWAITS" : "ONE-TIME SETUP REQUIRED"}</small><div><button onClick={()=>setTheme("dark")} aria-label="Dark theme"><Moon size={15}/></button><button onClick={()=>setTheme("light")} aria-label="Light theme"><Sun size={15}/></button></div></div>
        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2><p>{mode === "login" ? "Sign in to pick up where you left off." : "Make a little space for your people."}</p>
        {!configured && <div className={styles.setupBox}><b>Сначала подключи Supabase</b><p>Создай проект на supabase.com, выполни SQL из папки <code>supabase/schema.sql</code> и заполни <code>.env.local</code>. Пошаговая инструкция лежит в README.md.</p></div>}
        <form onSubmit={auth}>
          {mode === "register" && <><label>Display name<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={40} required autoComplete="name"/></label><label>Handle (unique)<input value={handle} onChange={e=>setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} minLength={3} maxLength={24} required placeholder="your_handle" autoComplete="username"/></label></>}
          <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>
          <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode === "register" ? 8 : 1} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"}/></label>
          {error && <div className={styles.error} role="alert">{error}</div>}{notice && <div className={styles.success} role="status">{notice}</div>}
          <button className={styles.primary} disabled={busy || !configured}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<span>↗</span></button>
        </form>
        <div className={styles.switch}>{mode === "login" ? "New to PulseVoice?" : "Already have an account?"} <button onClick={()=>{setMode(mode === "login" ? "register" : "login");setError("");setNotice("")}}>{mode === "login" ? "Create an account" : "Sign in"}</button></div>
        <footer><ShieldCheck size={14}/> Supabase Auth • secured database rules</footer>
      </section>
    </div><div className={styles.footer}><span>© 2026 PulseVoice</span><span>Thoughtful by design.</span></div>
  </main>;

  const incoming = requests.filter((r) => r.receiver_id === user.id && r.status === "pending");
  const accepted = requests.filter((r) => r.status === "accepted");
  return <main className={styles.app}>
    <header className={styles.top}><button className={styles.brand} onClick={()=>setSection("Home")}><span className={styles.logo}><Activity size={18}/></span>pulsevoice</button><span className={styles.context}>YOUR SPACE　/　{section}</span><div><button className={styles.icon} onClick={()=>setSection("Search")} aria-label="Search"><Search size={17}/></button><button className={styles.icon} onClick={()=>setSection("Notifications")} aria-label="Notifications"><Bell size={17}/></button><span className={styles.avatar}>{(user.profile?.display_name || user.email)[0]?.toUpperCase()}</span></div></header>
    <div className={styles.layout}>
      <aside className={styles.side}><small>WORKSPACE <button onClick={()=>setNotice("Создание сообществ — следующий этап разработки.")} aria-label="Create workspace"><Plus size={14}/></button></small><div className={styles.workspace}><span className={styles.square}><Activity size={16}/></span><div><b>Personal space</b><small>Supabase connected</small></div><ChevronDown size={14}/></div><nav>{sections.map(([s,Icon])=><button key={s} className={section === s ? styles.active : ""} onClick={()=>{setSection(s);setError("");}}><Icon size={17}/>{s}{s === "Friends" && incoming.length > 0 ? <span className={styles.navCount}>{incoming.length}</span> : null}</button>)}</nav><div className={styles.user}><span className={styles.avatar}>{(user.profile?.display_name || user.email)[0]?.toUpperCase()}</span><div><b>{user.profile?.display_name || "Member"}</b><small>@{user.profile?.handle || user.email.split("@")[0]}</small></div><button className={styles.icon} onClick={logout} aria-label="Sign out"><LogOut size={15}/></button></div></aside>
      <section className={styles.content}>
        <small className={styles.kicker}>PULSEVOICE / {section.toUpperCase()}</small><h1>{section === "Home" ? "Your space, in sync." : section}</h1><p className={styles.subtitle}>{descriptions[section]}</p>
        {notice && <p className={styles.notice} role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
        {section === "Home" && <><div className={styles.hero}><small>SUPABASE CONNECTED</small><h2>Welcome to your corner<br/>of the internet.</h2><p>Your account is connected. Start a direct message by handle or find people to connect with.</p><button className={styles.primary} onClick={()=>setSection("Messages")}>Open messages　↗</button><div className={styles.orbit}><Activity size={26}/></div></div><h3>Your overview</h3><div className={styles.cards}>{(["Messages","Friends","Voice rooms"] as Section[]).map((s,i)=>{const Icon=[MessageCircle,Users,Headphones][i];return <button className={styles.card} key={s} onClick={()=>setSection(s)}><Icon size={19}/><small>{["SAVED IN DATABASE","YOUR PEOPLE","COMING NEXT"][i]}</small><b>{s}</b><p>{[`${conversations.length} direct conversation(s). Messages sync across signed-in accounts.`,`${accepted.length} accepted friend connection(s).`,`Voice calls need a LiveKit integration, not just Supabase.`][i]}</p><span>Explore ↗</span></button>})}</div><div className={styles.note}><ShieldCheck size={18}/><div><b>Access rules enabled</b><p>Database Row Level Security restricts messages to conversation members.</p></div></div></>}

        {section === "Messages" && <div className={styles.messaging}>
          <div className={styles.messageSidebar}><form className={styles.inlineForm} onSubmit={startConversation}><input aria-label="Find user by handle" value={personHandle} onChange={e=>setPersonHandle(e.target.value)} placeholder="Start chat: @handle" minLength={3} required/><button className={styles.primary} disabled={busy} title="Start direct message"><Plus size={16}/></button></form>
            <div className={styles.panelLabel}>DIRECT MESSAGES <button className={styles.icon} onClick={()=>user && loadConversations(user.id)} title="Refresh"><RefreshCw size={14}/></button></div>
            {conversations.length === 0 ? <p className={styles.smallMuted}>No conversations yet. Enter another user's handle above.</p> : conversations.map(c=><button key={c.id} className={`${styles.conversationRow} ${activeConversationId === c.id ? styles.conversationActive : ""}`} onClick={()=>setActiveConversationId(c.id)}><span className={styles.avatar}>{c.title[0]?.toUpperCase() || "D"}</span><span><b>{c.title}</b><small>{c.kind === "group" ? "Group" : "Direct message"}</small></span></button>)}
          </div>
          <div className={styles.chatPanel}>{activeConversation ? <><div className={styles.chatHeader}><button className={styles.icon} onClick={()=>setActiveConversationId("")} aria-label="Back"><ArrowLeft size={16}/></button><span className={styles.avatar}>{activeConversation.title[0]?.toUpperCase() || "D"}</span><div><b>{activeConversation.title}</b><small>Messages saved in Supabase</small></div></div><div className={styles.messageList}>{loadingMessages ? <p className={styles.smallMuted}>Loading messages…</p> : messages.length === 0 ? <div className={styles.chatEmpty}><MessageCircle size={24}/><b>Say hello</b><p>This is the start of your conversation.</p></div> : messages.map(m=><div key={m.id} className={`${styles.bubbleRow} ${m.sender_id === user.id ? styles.ownBubbleRow : ""}`}><div className={styles.bubble}><small>{m.sender_id === user.id ? "You" : m.senderName} · {new Date(m.created_at).toLocaleString()}</small><p>{m.content}</p></div></div>)}</div><form className={styles.composer} onSubmit={sendMessage}><input aria-label="Message" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={4000} placeholder="Write a message…" required/><button className={styles.primary} disabled={busy || !draft.trim()} aria-label="Send message"><Send size={16}/></button></form></> : <div className={styles.chatEmpty}><MessageCircle size={27}/><h2>Your conversations</h2><p>Select a conversation or enter another user's unique handle to start a direct message.</p></div>}</div>
        </div>}

        {section === "Friends" && <div className={styles.settings}><h2>Add a friend</h2><p>Send a request by exact handle (without the @ is okay).</p><form className={styles.inlineForm} onSubmit={sendFriendRequest}><input value={personHandle} onChange={e=>setPersonHandle(e.target.value)} placeholder="friend_handle" minLength={3} required/><button className={styles.primary} disabled={busy}><UserPlus size={15}/> Send request</button></form><h2 className={styles.sectionHeading}>Incoming requests ({incoming.length})</h2>{incoming.length === 0 ? <p className={styles.smallMuted}>No incoming requests.</p> : incoming.map(r=><div className={styles.requestRow} key={r.id}><div><b>{r.sender?.display_name || "Member"}</b><small>@{r.sender?.handle || "unknown"}</small></div><button className={styles.acceptButton} onClick={()=>respondToFriendRequest(r.id,"accepted")} aria-label="Accept"><Check size={16}/></button><button className={styles.declineButton} onClick={()=>respondToFriendRequest(r.id,"declined")} aria-label="Decline"><X size={16}/></button></div>)}<h2 className={styles.sectionHeading}>Accepted requests ({accepted.length})</h2>{accepted.length === 0 ? <p className={styles.smallMuted}>When a request is accepted, it appears here.</p> : accepted.map(r=>{const other=r.sender_id===user.id?r.receiver:r.sender;return <div className={styles.requestRow} key={r.id}><span className={styles.avatar}>{(other?.display_name||"M")[0]}</span><div><b>{other?.display_name||"Member"}</b><small>@{other?.handle||"unknown"}</small></div><span className={styles.statusPill}>Friends</span></div>})}</div>}

        {section === "Search" && <div className={styles.settings}><h2>Find people</h2><p>Search public handles of registered users.</p><form className={styles.inlineForm} onSubmit={searchPeople}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search handles" minLength={2} required/><button className={styles.primary}><Search size={15}/> Search</button></form>{people.map(p=><div className={styles.requestRow} key={p.id}><span className={styles.avatar}>{p.display_name[0]?.toUpperCase()}</span><div><b>{p.display_name}</b><small>@{p.handle}</small></div><button className={styles.secondary} onClick={()=>{setPersonHandle(p.handle);setSection("Messages");setNotice(`Нажми + рядом с @${p.handle}, чтобы открыть диалог.`)}}>Message</button></div>)}</div>}

        {section === "Settings" && <div className={styles.settings}><h2>Appearance</h2><p>Choose the theme that feels right.</p><div className={styles.themeChoices}><button onClick={()=>setTheme("dark")} className={theme === "dark" ? styles.chosen : ""}><Moon/>Dark</button><button onClick={()=>setTheme("light")} className={theme === "light" ? styles.chosen : ""}><Sun/>Light</button></div><h2>Account</h2><p>{user.email}</p><p>@{user.profile?.handle || "profile loading"}</p><small>Account sign-in uses Supabase Auth. Public launch still needs recovery UX, email verification UX and rate limiting.</small><button className={styles.secondary} onClick={logout}>Sign out <LogOut size={14}/></button></div>}

        {section === "Voice rooms" && supabase && <VoiceRoom supabase={supabase} displayName={user.profile?.display_name || user.email.split("@")[0]} />}
        {(section === "Communities" || section === "Notifications") && <div className={styles.empty}><span className={styles.square}>{section === "Communities" ? <Compass size={22}/> : <Bell size={22}/>}</span><small>NEXT DEVELOPMENT MILESTONE</small><h2>{section === "Communities" ? "Community spaces are not wired up yet." : "Notifications are not wired up yet."}</h2><p>{section === "Communities" ? "Next we need community/channel tables, role permissions and server-side moderation checks." : "Message notifications work when the app is open; persistent in-app and push notifications need their own implementation."}</p><button className={styles.secondary} onClick={()=>setSection("Home")}>Back to home ↗</button></div>}
      </section>
      <aside className={styles.right}><small>AT A GLANCE <span>CONNECTED</span></small><div className={styles.rightEmpty}><AudioLines size={24}/><b>Your people, in time.</b><p>Messages and profiles are stored in Supabase. Realtime message refresh is enabled for joined conversations.</p></div><hr/><b>Next milestone</b><p>Communities, moderation and notifications.</p><button onClick={()=>setSection("Voice rooms")}><CircleHelp size={14}/> View voice setup</button></aside>
    </div>
  </main>;
}
