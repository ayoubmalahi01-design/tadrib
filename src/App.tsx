import { useEffect, useMemo, useState, useRef, FormEvent } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ClipboardList,
  GraduationCap,
  Home,
  Languages,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Users,
  X,
  NotebookPen,
  Building2,
  UserPlus,
  History,
  HeartPulse,
  Paperclip,
  Mic,
  Square,
  Pencil,
  Archive,
  Settings as SettingsIcon,
} from "lucide-react";
import { supabase, isConfigured } from "./lib/supabase";
import {
  makeT,
  isRtl,
  type Lang,
  setDateLocale,
  formatDateTime,
  formatTime,
} from "./lib/i18n";
import {
  loadAttendance,
  saveAttendance,
  buildAttendanceRows,
  resolveSessionKey,
  NO_SESSION,
} from "./lib/attendance";
import {
  loadReportDraft,
  saveReportDraft,
  clearReportDraft,
  hasDraftContent,
} from "./lib/report-draft";
import {
  pushNotification,
  requestPushPermission,
  pushEnv,
  type PushPermission,
} from "./lib/push-notify";
import { accountGate, gateTitleKey, gateBodyKey } from "./lib/account-gate";
import { notify, setToastListener } from "./lib/toast";
import {
  PageHeader,
  Panel,
  StatCard,
  Badge,
  EmptyState,
  LoadingState,
  ErrorState,
} from "./components/ui";

type Role = "owner" | "manager" | "admin" | "coach";
type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  institution_id: string | null;
  account_status: string;
  preferred_language: Lang;
};
type T = (key: string) => string;
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const roleLabel = (r: Role, t: T) => t(r);
export default function App() {
  const [lang, setLang] = useState<Lang>(
    (localStorage.getItem("tt_lang") as Lang) || "ar",
  );
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(true);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [toast, setToast] = useState("");
  const nav = useNavigate();
  const t: T = makeT(lang);
  const rtl = isRtl(lang);
  useEffect(() => {
    setDateLocale(lang);
  }, [lang]);
  useEffect(() => setToastListener(setToast), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    localStorage.setItem("tt_lang", lang);
  }, [lang, rtl]);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setBusy(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadProfile(s.user.id);
      else setProfile(null);
      setBusy(false);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  async function loadProfile(id: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      setProfileError(error.message);
      setProfile(null);
      return;
    }
    setProfileError("");
    setProfile(data as Profile | null);
  }
  async function signOut() {
    await supabase.auth.signOut();
    nav("/");
  }
  if (busy)
    return (
      <div className="loading-screen">
        <div className="brand-mark">T</div>
        <p>{t("loading")}</p>
      </div>
    );
  if (!session)
    return (
      <Login
        lang={lang}
        setLang={setLang}
        t={t}
        error={error}
        setError={setError}
      />
    );
  const gate = accountGate(profile, profileError);
  if (gate !== "active")
    return (
      <div className="login-wrap">
        <section className="login-card">
          <div className="brand-mark big">T</div>
          <h2>{t(gateTitleKey(gate))}</h2>
          <p>{t(gateBodyKey(gate))}</p>
          {gate === "error" && !!profileError && (
            <p className="muted">
              <small>{profileError}</small>
            </p>
          )}
          <div className="modal-actions">
            {gate === "error" && (
              <button
                className="secondary"
                onClick={() => {
                  setBusy(true);
                  if (session)
                    loadProfile(session.user.id).finally(() => setBusy(false));
                }}
              >
                {t("retry")}
              </button>
            )}
            <button className="secondary" onClick={signOut}>
              {t("logout")}
            </button>
          </div>
        </section>
      </div>
    );
  // Never render an empty document here: a signed-in account without a readable
  // profiles row used to fall through to `return null`, which produced the
  // reported blank white screen with no way out.
  if (!profile)
    return (
      <div className="boot-screen">
        <section className="boot-card">
          <div className="brand-mark big">T</div>
          <h1>{t("app")}</h1>
          <h2>{t("profileMissing")}</h2>
          <p>{profileError || t("profileMissingBody")}</p>
          <div className="boot-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                if (!session) return;
                setBusy(true);
                loadProfile(session.user.id).finally(() => setBusy(false));
              }}
            >
              {busy ? "..." : t("retry")}
            </button>
            <button className="secondary" onClick={signOut}>
              {t("logout")}
            </button>
          </div>
        </section>
      </div>
    );
  const owner = profile.role === "owner",
    admin = ["owner", "manager", "admin"].includes(profile.role);
  const navItems = owner
    ? [
        ["/", Home, "home"],
        ["/owner", Building2, "ownerConsole"],
        ["/audit", History, "audit"],
        ["/profile", ShieldCheck, "profile"],
      ]
    : [
        ["/", Home, "home"],
        ["/students", Users, "students"],
        ["/attendance", CalendarDays, "attendance"],
        ["/reports", ClipboardList, "reports"],
        ["/notebook", NotebookPen, "notebook"],
        ["/notices", Bell, "notices"],
        ["/notifications", Bell, "notifications"],
        ["/messages", MessageCircle, "messages"],
        ["/sessions", Activity, "sessions"],
        ["/profile", ShieldCheck, "profile"],
        ...(admin
          ? [
              ["/classes", GraduationCap, "classes"],
              ["/team", UserPlus, "team"],
              ["/medical", HeartPulse, "medical"],
              ["/settings", SettingsIcon, "settings"],
              ["/audit", History, "audit"],
            ]
          : []),
      ];
  return (
    <div className="app-shell">
      {toast && (
        <div
          className="toast"
          role="status"
          aria-live="polite"
          onClick={() => setToast("")}
        >
          {toast}
        </div>
      )}
      <header className="topbar">
        <button className="icon-btn mobile-menu" onClick={() => setMenu(!menu)}>
          {menu ? <X /> : <Menu />}
        </button>
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <b>{t("app")}</b>
            <small>{t("subtitle")}</small>
          </div>
        </div>
        <div className="top-actions">
          <select
            aria-label="Language"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            <option value="ar">العربية</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
          <button className="icon-btn" onClick={signOut} title={t("logout")}>
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <div className="layout">
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <div className="user-mini">
            <div className="avatar">
              {profile.full_name?.slice(0, 1) || "T"}
            </div>
            <div>
              <b>{profile.full_name || profile.email}</b>
              <small>{roleLabel(profile.role, t)}</small>
            </div>
          </div>
          <nav>
            {navItems.map(([to, Icon, key]: any) => (
              <NavLink
                end={to === "/"}
                to={to}
                key={to}
                onClick={() => setMenu(false)}
              >
                <Icon size={19} />
                <span>{t(key)}</span>
                <ChevronLeft className="nav-arrow" size={16} />
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span
              className={`status-dot ${isConfigured ? "online" : "offline"}`}
            ></span>
            <small>{isConfigured ? t("configured") : t("disconnected")}</small>
          </div>
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard profile={profile} t={t} />} />
            <Route
              path="/owner"
              element={owner ? <OwnerConsole t={t} /> : <Denied t={t} />}
            />
            <Route
              path="/students"
              element={
                !owner ? <Students profile={profile} t={t} /> : <Denied t={t} />
              }
            />
            <Route
              path="/attendance"
              element={
                !owner ? (
                  <Attendance profile={profile} t={t} />
                ) : (
                  <Denied t={t} />
                )
              }
            />
            <Route
              path="/reports"
              element={
                !owner ? <Reports profile={profile} t={t} /> : <Denied t={t} />
              }
            />
            <Route
              path="/notebook"
              element={
                profile.role === "coach" ? (
                  <Notebook profile={profile} t={t} />
                ) : (
                  <Denied t={t} />
                )
              }
            />
            <Route
              path="/notices"
              element={
                !owner ? <Notices profile={profile} t={t} /> : <Denied t={t} />
              }
            />
            <Route
              path="/notifications"
              element={
                !owner ? (
                  <Notifications profile={profile} t={t} />
                ) : (
                  <Denied t={t} />
                )
              }
            />
            <Route
              path="/messages"
              element={
                !owner ? <Messages profile={profile} t={t} /> : <Denied t={t} />
              }
            />
            <Route
              path="/classes"
              element={
                admin ? <Classes profile={profile} t={t} /> : <Denied t={t} />
              }
            />
            <Route
              path="/team"
              element={
                admin && !owner ? (
                  <Team profile={profile} t={t} />
                ) : (
                  <Denied t={t} />
                )
              }
            />
            <Route
              path="/medical"
              element={
                admin && !owner ? (
                  <Medical profile={profile} t={t} />
                ) : (
                  <Denied t={t} />
                )
              }
            />
            <Route
              path="/settings"
              element={
                admin && !owner ? (
                  <InstitutionSettings profile={profile} t={t} />
                ) : (
                  <Denied t={t} />
                )
              }
            />
            <Route
              path="/audit"
              element={owner || admin ? <Audit t={t} /> : <Denied t={t} />}
            />
            <Route
              path="/sessions"
              element={
                !owner ? <Sessions profile={profile} t={t} /> : <Denied t={t} />
              }
            />
            <Route
              path="/profile"
              element={
                <ProfilePage
                  profile={profile}
                  t={t}
                  lang={lang}
                  setLang={setLang}
                />
              }
            />
            <Route path="*" element={<Dashboard profile={profile} t={t} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
function Login({
  lang,
  setLang,
  t,
  error,
  setError,
}: {
  lang: Lang;
  setLang: (v: Lang) => void;
  t: T;
  error: string;
  setError: (v: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState(""),
    [resetBusy, setResetBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    if (!isConfigured) {
      setError(
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
    setLoading(false);
  }
  async function resetPassword() {
    if (!isConfigured) {
      setError(
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
      return;
    }
    if (!email.trim()) {
      setError(t("resetEmailFirst"));
      return;
    }
    setResetBusy(true);
    setError("");
    setNotice("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setResetBusy(false);
    if (error) setError(error.message);
    else setNotice(t("resetSent"));
  }
  return (
    <div className="login-wrap">
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-mark big">T</div>
          <h1>{t("app")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="login-lang">
          <Languages size={16} />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            <option value="ar">العربية</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
        <h2>{t("welcome")}</h2>
        <form onSubmit={submit}>
          <label>
            {t("email")}
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label>
            {t("password")}
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary full" disabled={loading}>
            {loading ? t("loading") : t("login")}
          </button>
          <button
            type="button"
            className="secondary full"
            onClick={resetPassword}
            disabled={loading || resetBusy}
          >
            {resetBusy ? t("sendingReset") : t("forgotPassword")}
          </button>
          {notice && <div className="notice-box">{notice}</div>}
        </form>
        <small className="secure-note">
          <ShieldCheck size={14} /> Secure institution access
        </small>
      </section>
    </div>
  );
}
function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: any;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Empty({ t }: { t: T }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Activity />
      </div>
      <p>{t("noData")}</p>
    </div>
  );
}
function Dashboard({ profile, t }: { profile: Profile; t: T }) {
  const [stats, setStats] = useState({
      students: 0,
      reports: 0,
      notices: 0,
      team: 0,
    }),
    [recent, setRecent] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const queries = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase
          .from("daily_reports")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("admin_notices")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("account_status", "active"),
      ]);
      if (alive)
        setStats({
          students: queries[0].count || 0,
          reports: queries[1].count || 0,
          notices: queries[2].count || 0,
          team: queries[3].count || 0,
        });
      let q = supabase
        .from("daily_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (profile.role === "coach") q = q.eq("coach_id", profile.id);
      const { data } = await q;
      if (alive) setRecent(data || []);
    };
    run();
    return () => {
      alive = false;
    };
  }, [profile.id, profile.role]);
  return (
    <>
      <Heading
        title={profile.role === "owner" ? t("ownerConsole") : t("home")}
        subtitle={`${t("welcome")}${t("comma")} ${profile.full_name}`}
      />
      <div className="stats-grid">
        <Stat icon={Users} label={t("students")} value={stats.students} />
        <Stat icon={ClipboardList} label={t("reports")} value={stats.reports} />
        <Stat icon={Bell} label={t("notices")} value={stats.notices} />
        {profile.role !== "coach" && (
          <Stat icon={UserPlus} label={t("team")} value={stats.team} />
        )}
      </div>
      {profile.role === "coach" && <ShiftCard profile={profile} t={t} />}
      <section className="panel">
        <div className="panel-head">
          <h3>{t("reports")}</h3>
          <span className="muted">{t("today")}</span>
        </div>
        {recent.length === 0 ? (
          <Empty t={t} />
        ) : (
          <div className="report-list">
            {recent.map((r) => (
              <div className="report-row" key={r.id}>
                <div className="report-icon">
                  <ClipboardList size={18} />
                </div>
                <div className="grow">
                  <b>{r.coach_name_snapshot}</b>
                  <small>{r.report_date}</small>
                </div>
                <span
                  className={`pill ${r.is_finalized ? "success" : "warning"}`}
                >
                  {r.is_finalized ? t("finalized") : t("draft")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        <Icon size={20} />
      </div>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}
function ShiftCard({ profile, t }: { profile: Profile; t: T }) {
  const [active, setActive] = useState<any>(null),
    [loading, setLoading] = useState(false);
  async function refresh() {
    const { data } = await supabase
      .from("coach_shifts")
      .select("*")
      .eq("coach_id", profile.id)
      .is("ended_at", null)
      .maybeSingle();
    setActive(data);
  }
  useEffect(() => {
    refresh();
  }, [profile.id]);
  async function toggle() {
    setLoading(true);
    const result = active
      ? await supabase
          .from("coach_shifts")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", active.id)
      : await supabase.from("coach_shifts").insert({
          coach_id: profile.id,
          institution_id: profile.institution_id,
        });
    if (result.error) notify(result.error.message);
    await refresh();
    setLoading(false);
  }
  return (
    <section className="shift-card">
      <div>
        <span className="eyebrow">
          {active ? t("shiftActive") : t("shiftInactive")}
        </span>
        <h3>{active ? formatTime(active.started_at) : t("start")}</h3>
      </div>
      <button
        className={active ? "danger" : "primary"}
        disabled={loading}
        onClick={toggle}
      >
        {active ? t("finish") : t("start")}
      </button>
    </section>
  );
}
function Students({ profile, t }: { profile: Profile; t: T }) {
  const [items, setItems] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [show, setShow] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [noteStudent, setNoteStudent] = useState<any>(null),
    [noteItems, setNoteItems] = useState<any[]>([]),
    [note, setNote] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [birth, setBirth] = useState(""),
    [loading, setLoading] = useState(true);
  const admin = ["owner", "manager", "admin"].includes(profile.role);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id,student_code,full_name,is_active,class_id,date_of_birth")
      .order("full_name");
    if (error) notify(error.message);
    setItems(data || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [profile.id]);
  const filtered = useMemo(
    () =>
      items.filter((s) =>
        (s.full_name + " " + s.student_code)
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [items, search],
  );
  async function openNotes(s: any) {
    setNoteStudent(s);
    setNote("");
    const { data, error } = await supabase
      .from("student_notes")
      .select("*")
      .eq("student_id", s.id)
      .order("created_at", { ascending: false });
    if (error) notify(error.message);
    setNoteItems(data || []);
  }
  function openAdd() {
    setEditing(null);
    setCode("");
    setName("");
    setBirth("");
    setShow(true);
  }
  function openEdit(s: any) {
    setEditing(s);
    setCode(s.student_code);
    setName(s.full_name);
    setBirth(s.date_of_birth || "");
    setShow(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      student_code: code.trim(),
      full_name: name.trim(),
      date_of_birth: birth || null,
    };
    const result = editing
      ? await supabase.from("students").update(payload).eq("id", editing.id)
      : await supabase
          .from("students")
          .insert({ ...payload, institution_id: profile.institution_id });
    if (result.error) notify(result.error.message);
    else {
      setShow(false);
      load();
    }
  }
  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (!noteStudent) return;
    const { error } = await supabase.from("student_notes").insert({
      institution_id: profile.institution_id,
      student_id: noteStudent.id,
      author_id: profile.id,
      body: note,
      note_type: "general",
    });
    if (error) notify(error.message);
    else {
      setNote("");
      openNotes(noteStudent);
    }
  }
  async function toggleActive(s: any) {
    const { error } = await supabase
      .from("students")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) notify(error.message);
    else load();
  }
  return (
    <>
      <Heading
        title={t("students")}
        action={
          admin && (
            <button className="primary action-btn" onClick={openAdd}>
              <Plus size={18} />
              {t("add")}
            </button>
          )
        }
      />
      <div className="searchbar">
        <Search size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
        />
      </div>
      {loading ? (
        <Empty t={t} />
      ) : filtered.length === 0 ? (
        <Empty t={t} />
      ) : (
        <section className="panel student-list">
          {filtered.map((s) => (
            <div className="student-row" key={s.id}>
              <div className="avatar student-avatar">
                <GraduationCap size={19} />
              </div>
              <div className="grow">
                <b>{s.full_name}</b>
                <small>#{s.student_code}</small>
              </div>
              <span className={`pill ${s.is_active ? "success" : "warning"}`}>
                {s.is_active ? t("active") : t("status")}
              </span>
              <button
                className="icon-btn row-action"
                title="Student notes"
                onClick={() => openNotes(s)}
              >
                <NotebookPen size={16} />
              </button>
              {admin && (
                <>
                  <button
                    className="icon-btn row-action"
                    title="Edit"
                    onClick={() => openEdit(s)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-btn row-action"
                    title="Archive / activate"
                    onClick={() => toggleActive(s)}
                  >
                    <Archive size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
      )}
      {show && (
        <Modal
          title={editing ? t("students") : t("studentAdd")}
          close={() => setShow(false)}
        >
          <form onSubmit={save}>
            <label>
              {t("code")}
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <label>
              {t("name")}
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Date of birth
              <input
                type="date"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShow(false)}
              >
                {t("cancel")}
              </button>
              <button className="primary">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}
      {noteStudent && (
        <Modal
          title={`${t("notes")} · ${noteStudent.full_name}`}
          close={() => setNoteStudent(null)}
        >
          <form onSubmit={saveNote}>
            <label>
              {t("notes")}
              <DictateButton onText={setNote} />
              <textarea
                required
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button className="primary">{t("save")}</button>
          </form>
          {noteItems.map((n) => (
            <article className="notice note-item" key={n.id}>
              <p>{n.body}</p>
              <small>{formatDateTime(n.created_at)}</small>
            </article>
          ))}
        </Modal>
      )}
    </>
  );
}
function Modal({
  title,
  close,
  children,
  closeLabel = "Close",
}: {
  title: string;
  close: () => void;
  children: any;
  closeLabel?: string;
}) {
  useEffect(() => {
    const el = document.querySelector(
      ".modal-backdrop .modal",
    ) as HTMLElement | null;
    el?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            onClick={close}
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Attendance({ profile, t }: { profile: Profile; t: T }) {
  const [students, setStudents] = useState<any[]>([]),
    [status, setStatus] = useState<Record<string, string>>({}),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [date, setDate] = useState(localDate()),
    [busy, setBusy] = useState(false);
  async function load() {
    const [{ data: studentRows, error: a }, res] = await Promise.all([
      supabase
        .from("students")
        .select("id,student_code,full_name")
        .eq("is_active", true)
        .order("student_code"),
      loadAttendance(date, profile.id),
    ]);
    if (a || res.error) notify(a ? a.message : res.error);
    setStudents(studentRows || []);
    const next: Record<string, string> = {},
      why: Record<string, string> = {};
    (res.records || []).forEach((r) => {
      next[r.student_id] = r.status;
      why[r.student_id] = r.reason || "";
    });
    setStatus(next);
    setReasons(why);
  }
  useEffect(() => {
    load();
  }, [date, profile.id]);
  function mark(id: string, value: string) {
    setStatus((current) => ({ ...current, [id]: value }));
  }
  function markAllPresent() {
    setStatus(
      Object.fromEntries(students.map((s: any) => [s.id, "present"])) as Record<
        string,
        string
      >,
    );
    setReasons({});
  }
  function clearAll() {
    setStatus({});
    setReasons({});
  }
  async function save() {
    setBusy(true);
    const rows = buildAttendanceRows(students, status, reasons, {
      institution_id: profile.institution_id,
      coach_id: profile.id,
      session_date: date,
    });
    if (!rows.length) {
      notify(t("nothingRecorded"));
      setBusy(false);
      return;
    }
    const sessionKey = await resolveSessionKey(profile.id);
    if (sessionKey === NO_SESSION && !confirm(t("startShiftPrompt"))) {
      setBusy(false);
      return;
    }
    const res = await saveAttendance(rows, profile.id, sessionKey);
    if (res.error) notify(res.error);
    else
      notify(
        `${t("attendanceSaved")} — ${rows.length}${res.migrationRequired ? " (migration 0001 not applied: session dimension inactive)" : ""}`,
      );
    setBusy(false);
  }
  const counts = useMemo(
    () =>
      (Object.values(status) as string[]).reduce(
        (a: Record<string, number>, v: string) => {
          a[v] = (a[v] || 0) + 1;
          return a;
        },
        {} as Record<string, number>,
      ),
    [status],
  );
  return (
    <>
      <Heading title={t("attendance")} subtitle={t("attendanceSave")} />
      <section className="panel">
        <label>
          {t("date")}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="attendance-bulk">
          <button
            className="secondary"
            onClick={markAllPresent}
            disabled={!students.length}
          >
            {t("markAllPresent")}
          </button>
          <button
            className="secondary"
            onClick={clearAll}
            disabled={!students.length}
          >
            {t("clearAll")}
          </button>
        </div>
        <div className="attendance-summary">
          {[
            [t("statusPresent"), counts.present || 0],
            [t("statusAbsent"), counts.absent || 0],
            [t("statusLate"), counts.late || 0],
            [t("statusPermission"), counts.excused || 0],
            [t("statusExempt"), counts.medical_exemption || 0],
          ].map(([k, v]: any) => (
            <span key={k}>
              {k}: <b>{v}</b>
            </span>
          ))}
        </div>
        <div className="attendance-list">
          {students.map((student) => (
            <div className="attendance-row" key={student.id}>
              <div className="grow">
                <b>
                  {student.student_code} · {student.full_name}
                </b>
              </div>
              <select
                value={status[student.id] || ""}
                onChange={(e) => mark(student.id, e.target.value)}
              >
                <option value="">—</option>
                <option value="present">{t("present")}</option>
                <option value="absent">{t("absent")}</option>
                <option value="late">{t("late")}</option>
                <option value="excused">{t("excused")}</option>
                <option value="medical_exemption">{t("injured")}</option>
                <option value="permission">{t("statusDuty")}</option>
              </select>
              {status[student.id] && status[student.id] !== "present" && (
                <input
                  className="attendance-reason"
                  value={reasons[student.id] || ""}
                  onChange={(e) =>
                    setReasons((current) => ({
                      ...current,
                      [student.id]: e.target.value,
                    }))
                  }
                  placeholder={t("reasonLabel")}
                />
              )}
            </div>
          ))}
        </div>
        <button
          className="primary full"
          disabled={busy || !Object.keys(status).length}
          onClick={save}
        >
          {t("attendanceSave")}
        </button>
      </section>
    </>
  );
}
function Reports({ profile, t }: { profile: Profile; t: T }) {
  const [items, setItems] = useState<any[]>([]),
    [show, setShow] = useState(false),
    [notes, setNotes] = useState(""),
    [counts, setCounts] = useState({
      present_count: 0,
      absent_count: 0,
      late_count: 0,
      injured_count: 0,
      excused_count: 0,
    }),
    [busy, setBusy] = useState(false);
  async function load() {
    let q = supabase
      .from("daily_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (profile.role === "coach") q = q.eq("coach_id", profile.id);
    const { data, error } = await q;
    if (error) notify(error.message);
    setItems(data || []);
  }
  const [draftId, setDraftId] = useState<string | null>(null);
  useEffect(() => {
    load();
  }, [profile.id]);
  useEffect(() => {
    if (show) saveReportDraft(profile.id, { counts, notes, draftId });
  }, [show, counts, notes, draftId, profile.id]);
  async function openReport() {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("status")
      .eq("session_date", localDate())
      .eq("coach_id", profile.id);
    if (error) {
      notify(error.message);
      return;
    }
    const rows = data || [];
    setCounts({
      present_count: rows.filter((x) => x.status === "present").length,
      absent_count: rows.filter((x) => x.status === "absent").length,
      late_count: rows.filter((x) => x.status === "late").length,
      injured_count: rows.filter((x) => x.status === "medical_exemption")
        .length,
      excused_count: rows.filter((x) =>
        ["excused", "permission"].includes(x.status),
      ).length,
    });
    setNotes("");
    setDraftId(null);
    const draft = loadReportDraft(profile.id);
    if (hasDraftContent(draft) && draft) {
      setCounts(draft.counts);
      setNotes(draft.notes);
      setDraftId(draft.draftId);
      notify(t("draftRestored"));
    }
    setShow(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: shift } = await supabase
      .from("coach_shifts")
      .select("id,started_at,ended_at")
      .eq("coach_id", profile.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const payload = {
      ...counts,
      notes,
      coach_id: profile.id,
      institution_id: profile.institution_id,
      coach_name_snapshot: profile.full_name,
      shift_id: shift?.id || null,
      report_date: localDate(),
      status: "submitted",
      is_finalized: true,
      finalized_at: new Date().toISOString(),
      shift_start: shift?.started_at || null,
      shift_end: shift?.ended_at || new Date().toISOString(),
    };
    const { error } = draftId
      ? await supabase.from("daily_reports").update(payload).eq("id", draftId)
      : await supabase.from("daily_reports").insert(payload);
    if (error) notify(error.message);
    else {
      clearReportDraft(profile.id);
      setDraftId(null);
      setShow(false);
      load();
    }
    setBusy(false);
  }
  async function saveDraft() {
    setBusy(true);
    const payload = { ...counts, notes, status: "draft", is_finalized: false };
    const { data, error } = draftId
      ? await supabase
          .from("daily_reports")
          .update(payload)
          .eq("id", draftId)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("daily_reports")
          .insert({
            ...payload,
            coach_id: profile.id,
            institution_id: profile.institution_id,
            coach_name_snapshot: profile.full_name,
            report_date: localDate(),
          })
          .select("id")
          .maybeSingle();
    setBusy(false);
    if (error) {
      notify(error.message);
      return;
    }
    const id = (data as any)?.id || draftId || null;
    setDraftId(id);
    saveReportDraft(profile.id, { counts, notes, draftId: id });
    notify(t("draftSaved"));
    setShow(false);
    load();
  }
  function continueDraft(r: any) {
    setCounts({
      present_count: r.present_count || 0,
      absent_count: r.absent_count || 0,
      late_count: r.late_count || 0,
      injured_count: r.injured_count || 0,
      excused_count: r.excused_count || 0,
    });
    setNotes(r.notes || "");
    setDraftId(r.id);
    setShow(true);
  }
  async function review(id: string) {
    const { error } = await supabase
      .from("daily_reports")
      .update({
        status: "reviewed",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) notify(error.message);
    else load();
  }
  const admin = ["manager", "admin"].includes(profile.role);
  return (
    <>
      <Heading
        title={t("reports")}
        action={
          profile.role === "coach" && (
            <button className="primary action-btn" onClick={openReport}>
              <Plus size={18} />
              {t("newReport")}
            </button>
          )
        }
      />
      {items.length === 0 ? (
        <Empty t={t} />
      ) : (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("name")}</th>
                  <th>{t("date")}</th>
                  <th>{t("present")}</th>
                  <th>{t("absent")}</th>
                  <th>{t("late")}</th>
                  <th>{t("status")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.coach_name_snapshot}</td>
                    <td>{r.report_date}</td>
                    <td>{r.present_count}</td>
                    <td>{r.absent_count}</td>
                    <td>{r.late_count}</td>
                    <td>
                      {r.status === "reviewed"
                        ? t("reviewed")
                        : r.is_finalized
                          ? t("finalized")
                          : t("draft")}
                    </td>
                    <td>
                      {profile.role === "coach" &&
                        r.status === "draft" &&
                        !r.is_finalized && (
                          <button
                            className="secondary"
                            onClick={() => continueDraft(r)}
                          >
                            {t("continueDraft")}
                          </button>
                        )}
                      {admin && r.is_finalized && r.status !== "reviewed" && (
                        <button
                          className="secondary"
                          onClick={() => review(r.id)}
                        >
                          {t("approveReport")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {show && (
        <Modal
          title={t("newReport")}
          close={() => setShow(false)}
          closeLabel={t("close")}
        >
          <form onSubmit={save}>
            <p className="muted">{t("countsAuto")}</p>
            <div className="counter-grid">
              {(
                [
                  "present_count",
                  "absent_count",
                  "late_count",
                  "injured_count",
                  "excused_count",
                ] as const
              ).map((k) => (
                <label className="counter" key={k}>
                  <span>{t(k.replace("_count", ""))}</span>
                  <input
                    type="number"
                    min="0"
                    value={counts[k]}
                    onChange={(e) =>
                      setCounts((v) => ({ ...v, [k]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              {t("notes")}
              <DictateButton onText={setNotes} />
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShow(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={saveDraft}
                disabled={busy}
              >
                {t("saveDraft")}
              </button>
              <button className="primary" disabled={busy}>
                {t("send")}
              </button>
            </div>
            <small className="muted">{t("reportLocked")}</small>
          </form>
        </Modal>
      )}
    </>
  );
}
function Notebook({ profile, t }: { profile: Profile; t: T }) {
  const [items, setItems] = useState<any[]>([]),
    [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  async function load() {
    const { data } = await supabase
      .from("coach_notebooks")
      .select("*")
      .eq("coach_id", profile.id)
      .order("entry_date", { ascending: false });
    setItems(data || []);
  }
  useEffect(() => {
    load();
  }, [profile.id]);
  async function add(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("coach_notebooks").insert({
      institution_id: profile.institution_id,
      coach_id: profile.id,
      title,
      body,
    });
    if (error) notify(error.message);
    else {
      setTitle("");
      setBody("");
      load();
    }
  }
  return (
    <>
      <Heading title={t("notebook")} subtitle={t("privateNote")} />
      <section className="panel">
        <form onSubmit={add}>
          <label>
            {t("title")}
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {t("notes")}
            <DictateButton onText={setBody} />
            <textarea
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button className="primary">{t("add")}</button>
        </form>
      </section>
      {items.map((n) => (
        <article className="panel notice" key={n.id}>
          <h3>{n.title}</h3>
          <p>{n.body}</p>
          <small>{n.entry_date}</small>
        </article>
      ))}
    </>
  );
}
function Notices({ profile, t }: { profile: Profile; t: T }) {
  const [items, setItems] = useState<any[]>([]),
    [show, setShow] = useState(false),
    [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  const admin = profile.role !== "coach";
  async function load() {
    const { data, error } = await supabase
      .from("admin_notices")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) notify(error.message);
    setItems(data || []);
  }
  useEffect(() => {
    load();
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("admin_notices").insert({
      title,
      body,
      author_id: profile.id,
      institution_id: profile.institution_id,
    });
    if (error) notify(error.message);
    else {
      setShow(false);
      setTitle("");
      setBody("");
      load();
    }
  }
  return (
    <>
      <Heading
        title={t("notices")}
        action={
          admin && (
            <button
              className="primary action-btn"
              onClick={() => setShow(true)}
            >
              <Plus size={18} />
              {t("newNotice")}
            </button>
          )
        }
      />
      {items.length === 0 ? (
        <Empty t={t} />
      ) : (
        items.map((n) => (
          <article className="panel notice" key={n.id}>
            <div className="notice-head">
              <Bell size={18} />
              <small>{formatDateTime(n.created_at)}</small>
            </div>
            <h3>{n.title}</h3>
            <p>{n.body}</p>
          </article>
        ))
      )}
      {show && (
        <Modal title={t("newNotice")} close={() => setShow(false)}>
          <form onSubmit={save}>
            <label>
              {t("title")}
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              {t("body")}
              <textarea
                required
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <button className="primary">{t("save")}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Notifications({ profile, t }: { profile: Profile; t: T }) {
  const [items, setItems] = useState<any[]>([]),
    [perm, setPerm] = useState<PushPermission>(pushEnv().permission);
  async function load() {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) notify(error.message);
    setItems(data || []);
  }
  useEffect(() => {
    load();
    const ch = supabase
      .channel("tt-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload: any) => {
          load();
          const n = payload?.new;
          if (n) pushNotification(n.title || t("notifications"), n.body || "");
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile.id]);
  async function markRead(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) notify(error.message);
    else load();
  }
  return (
    <>
      <Heading title={t("notifications")} />
      {perm === "default" && (
        <button
          className="secondary action-btn"
          onClick={async () => {
            const r = await requestPushPermission();
            setPerm(r);
            notify(
              r === "granted"
                ? t("notificationsOn")
                : t("notificationsBlocked"),
            );
          }}
        >
          <Bell size={16} /> {t("enableNotifications")}
        </button>
      )}
      {items.length === 0 ? (
        <Empty t={t} />
      ) : (
        <section className="panel">
          {items.map((n) => (
            <div className="student-row" key={n.id}>
              <div className="report-icon">
                <Bell size={18} />
              </div>
              <div className="grow">
                <b>{n.title}</b>
                <small>{n.body}</small>
                <small>{formatDateTime(n.created_at)}</small>
              </div>
              {!n.read_at && (
                <button className="secondary" onClick={() => markRead(n.id)}>
                  <Check size={15} /> {t("markRead")}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function Messages({ profile, t }: { profile: Profile; t: T }) {
  const [conversations, setConversations] = useState<any[]>([]),
    [current, setCurrent] = useState<any>(null),
    [items, setItems] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [title, setTitle] = useState(""),
    [createOpen, setCreateOpen] = useState(false),
    [inviteOpen, setInviteOpen] = useState(false),
    [inviteName, setInviteName] = useState(""),
    [inviteEmail, setInviteEmail] = useState(""),
    [inviteBusy, setInviteBusy] = useState(false),
    [body, setBody] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [unread, setUnread] = useState<Record<string, number>>({}),
    [hasMore, setHasMore] = useState(false),
    [olderBusy, setOlderBusy] = useState(false),
    [membersOpen, setMembersOpen] = useState(false),
    [convMembers, setConvMembers] = useState<any[]>([]),
    [memberBusy, setMemberBusy] = useState(false),
    [newMember, setNewMember] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]);
  async function loadUnread() {
    const { data, error } = await supabase.rpc("unread_counts");
    if (error) {
      console.warn(error.message);
      return;
    }
    const map: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      map[r.conversation_id] = Number(r.unread) || 0;
    });
    setUnread(map);
  }
  async function openConversation(c: any) {
    setCurrent(c);
    if (!c) return;
    const { error } = await supabase.rpc("mark_conversation_read", {
      p_conversation_id: c.id,
    });
    if (error) console.warn(error.message);
    loadUnread();
  }
  async function loadConvMembers(id: string) {
    const { data, error } = await supabase
      .from("conversation_members")
      .select("profile_id")
      .eq("conversation_id", id);
    if (error) {
      console.warn(error.message);
      return;
    }
    const ids = (data || []).map((x: any) => x.profile_id);
    if (!ids.length) {
      setConvMembers([]);
      return;
    }
    const { data: ps, error: pe } = await supabase
      .from("profiles")
      .select("id,full_name,email,role")
      .in("id", ids);
    if (pe) console.warn(pe.message);
    setConvMembers(ps || []);
  }
  async function addMember(pid: string) {
    if (!current || !pid) return;
    setMemberBusy(true);
    const { error } = await supabase
      .from("conversation_members")
      .insert({ conversation_id: current.id, profile_id: pid });
    setMemberBusy(false);
    if (error) {
      notify(error.message);
      return;
    }
    setNewMember("");
    await loadConvMembers(current.id);
    loadConversations();
  }
  async function removeMember(pid: string) {
    if (!current) return;
    setMemberBusy(true);
    const { error } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", current.id)
      .eq("profile_id", pid);
    setMemberBusy(false);
    if (error) {
      notify(error.message);
      return;
    }
    await loadConvMembers(current.id);
    loadConversations();
  }
  async function loadMembers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,email,role")
      .eq("institution_id", profile.institution_id)
      .eq("account_status", "active")
      .neq("id", profile.id)
      .order("full_name");
    if (error) console.warn(error.message);
    setMembers(data || []);
  }
  async function loadConversations() {
    const { data: mine, error } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("profile_id", profile.id);
    if (error) {
      console.warn(error.message);
      return;
    }
    const ids = (mine || []).map((x) => x.conversation_id);
    if (!ids.length) {
      setConversations([]);
      return;
    }
    const [{ data: cs, error: ce }, { data: ms, error: me }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select("*")
          .in("id", ids)
          .order("created_at", { ascending: false }),
        supabase
          .from("conversation_members")
          .select("conversation_id,profile_id")
          .in("conversation_id", ids),
      ]);
    if (ce || me) {
      console.warn((ce || me)?.message);
      return;
    }
    const pids = [...new Set((ms || []).map((x) => x.profile_id))];
    const { data: ps } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", pids);
    const mapped = (cs || []).map((c) => {
      const people = (ms || [])
        .filter((x) => x.conversation_id === c.id)
        .flatMap((x) => {
          const person = ps?.find((p) => p.id === x.profile_id);
          return person ? [person] : [];
        });
      const other = people.filter((x) => x.id !== profile.id);
      return {
        ...c,
        people,
        label:
          c.title ||
          (c.conversation_type === "direct"
            ? other[0]?.full_name || other[0]?.email || t("directChat")
            : people.map((x) => x.full_name || x.email).join("، ")),
      };
    });
    setConversations(mapped);
    if (current) {
      const still = mapped.find((x) => x.id === current.id);
      if (still) setCurrent(still);
      else {
        setCurrent(null);
        setItems([]);
      }
    } else if (mapped.length) setCurrent(mapped[0]);
  }
  async function loadMessages(id: string) {
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id,body,sender_id,created_at,message_type,media_path,profiles:profiles!messages_sender_id_fkey(full_name)",
      )
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn(error.message);
      return;
    }
    const mapped = await Promise.all(
      (data || [])
        .slice()
        .reverse()
        .map(async (m) => {
          if (!m.media_path) return m;
          const { data: link } = await supabase.storage
            .from("trainer-media")
            .createSignedUrl(m.media_path, 3600);
          return { ...m, media_url: link?.signedUrl };
        }),
    );
    setItems(mapped);
    setHasMore((data || []).length >= 50);
  }
  async function loadOlder() {
    if (!current || !items.length) return;
    setOlderBusy(true);
    const oldest = items[0]?.created_at;
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id,body,sender_id,created_at,message_type,media_path,profiles:profiles!messages_sender_id_fkey(full_name)",
      )
      .eq("conversation_id", current.id)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn(error.message);
      setOlderBusy(false);
      return;
    }
    const older = await Promise.all(
      (data || [])
        .slice()
        .reverse()
        .map(async (m) => {
          if (!m.media_path) return m;
          const { data: link } = await supabase.storage
            .from("trainer-media")
            .createSignedUrl(m.media_path, 3600);
          return { ...m, media_url: link?.signedUrl };
        }),
    );
    setItems((prev) => [...older, ...prev]);
    setHasMore((data || []).length >= 50);
    setOlderBusy(false);
  }
  useEffect(() => {
    loadMembers();
    loadConversations();
    loadUnread();
  }, [profile.id]);
  useEffect(() => {
    if (!current) return;
    loadMessages(current.id);
    supabase
      .rpc("mark_conversation_read", { p_conversation_id: current.id })
      .then(({ error }: any) => {
        if (error) console.warn(error.message);
        loadUnread();
      });
    const ch = supabase
      .channel(`tt-chat-${current.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${current.id}`,
        },
        () => {
          loadMessages(current.id);
          loadUnread();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [current?.id]);
  async function createConversation(e: FormEvent) {
    e.preventDefault();
    if (!selected.length) {
      notify(t("selectOneCoach"));
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_conversation", {
      p_title: title.trim() || null,
      p_member_ids: selected,
    });
    if (error) {
      notify(error.message);
      setBusy(false);
      return;
    }
    setCreateOpen(false);
    setSelected([]);
    setTitle("");
    await loadConversations();
    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", data)
      .single();
    if (conv)
      setCurrent({ ...conv, label: conv.title || t("newConversation") });
    setBusy(false);
  }
  async function inviteCoach(e: FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: { email: inviteEmail, full_name: inviteName, role: "coach" },
    });
    if (error || data?.error) notify(error?.message || data.error);
    else {
      notify(t("inviteSent"));
      setInviteName("");
      setInviteEmail("");
      setInviteOpen(false);
      loadMembers();
    }
    setInviteBusy(false);
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!current || (!body.trim() && !file)) return;
    setBusy(true);
    let media_path: string | null = null;
    let message_type = "text";
    if (file) {
      const ext = file.name.split(".").pop() || "bin";
      media_path = `${profile.institution_id}/${current.id}/${profile.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("trainer-media")
        .upload(media_path, file, { upsert: false, contentType: file.type });
      if (upErr) {
        notify(upErr.message);
        setBusy(false);
        return;
      }
      message_type = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("audio/")
          ? "audio"
          : "file";
    }
    const { error } = await supabase.from("messages").insert({
      sender_id: profile.id,
      institution_id: profile.institution_id,
      conversation_id: current.id,
      body: body.trim() || null,
      message_type,
      media_path,
    });
    if (error) notify(error.message);
    else {
      setBody("");
      setFile(null);
      loadMessages(current.id);
    }
    setBusy(false);
  }
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, {
          type: rec.mimeType || "audio/webm",
        });
        setFile(
          new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }),
        );
        stream.getTracks().forEach((track) => track.stop());
      };
      rec.start();
      setRecording(true);
    } catch {
      notify(t("micError"));
    }
  }
  function stopRecording() {
    recorder.current?.stop();
    setRecording(false);
  }
  return (
    <>
      <Heading
        title={t("messages")}
        action={
          <div className="heading-actions">
            <button
              className="secondary action-btn"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus size={17} />
              {t("inviteCoach")}
            </button>
            <button
              className="primary action-btn"
              onClick={() => setCreateOpen(true)}
            >
              <MessageCircle size={17} />
              {t("newConversation")}
            </button>
          </div>
        }
      />
      <section className="panel chat-workspace">
        <aside className="conversation-list">
          {conversations.map((c) => (
            <button
              key={c.id}
              className={`conversation-item ${current?.id === c.id ? "selected" : ""}`}
              onClick={() => openConversation(c)}
            >
              <span className="avatar">
                <Users size={17} />
              </span>
              <span className="grow">
                <b>{c.label}</b>
                <small>
                  {c.conversation_type === "direct"
                    ? t("directChat")
                    : t("groupLabel")}
                </small>
              </span>
              {unread[c.id] > 0 && (
                <span className="unread-badge" aria-label={`${unread[c.id]}`}>
                  {unread[c.id] > 99 ? "99+" : unread[c.id]}
                </span>
              )}
            </button>
          ))}
          {!conversations.length && (
            <p className="muted">{t("noConversations")}</p>
          )}
        </aside>
        <div className="chat-panel-inner">
          {current ? (
            <>
              <div className="chat-title">
                <b>{current.label}</b>
                <small>
                  {current.conversation_type === "direct"
                    ? t("directConversation")
                    : t("groupConversation")}
                </small>
                {current.conversation_type !== "direct" && (
                  <button
                    type="button"
                    className="secondary members-btn"
                    onClick={() => {
                      setMembersOpen(true);
                      loadConvMembers(current.id);
                    }}
                  >
                    <Users size={15} />
                    {t("groupMembers")}
                  </button>
                )}
              </div>
              <div className="chat-messages">
                {hasMore && (
                  <button
                    type="button"
                    className="secondary load-older"
                    onClick={loadOlder}
                    disabled={olderBusy}
                  >
                    {olderBusy ? t("loading") : t("loadOlder")}
                  </button>
                )}
                {items.map((m) => (
                  <div
                    className={`chat-bubble ${m.sender_id === profile.id ? "mine" : ""}`}
                    key={m.id}
                  >
                    <b>{m.profiles?.full_name || t("memberLabel")}</b>
                    {m.body && <p>{m.body}</p>}
                    {m.media_url &&
                      (m.message_type === "image" ? (
                        <img
                          className="chat-image"
                          src={m.media_url}
                          alt="attachment"
                        />
                      ) : m.message_type === "audio" ? (
                        <audio controls src={m.media_url} />
                      ) : (
                        <a href={m.media_url} target="_blank" rel="noreferrer">
                          {t("openAttachment")}
                        </a>
                      ))}
                    <small>{formatTime(m.created_at)}</small>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="muted empty-chat">{t("noMessages")}</p>
                )}
              </div>
              <form className="chat-compose" onSubmit={send}>
                <label className="attach-btn" title={t("attachFile")}>
                  <Paperclip size={19} />
                  <input
                    type="file"
                    accept="image/*,audio/*,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
                <button
                  type="button"
                  className={`icon-btn ${recording ? "recording" : ""}`}
                  onClick={recording ? stopRecording : startRecording}
                  title={t("voiceRecord")}
                >
                  {recording ? <Square size={18} /> : <Mic size={18} />}
                </button>
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={file ? file.name : t("typeMessage")}
                />
                <button className="primary icon-send" disabled={busy}>
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className="empty-chat">{t("selectConversation")}</div>
          )}
        </div>
      </section>
      {inviteOpen && (
        <Modal title={t("inviteCoachTitle")} close={() => setInviteOpen(false)}>
          <form onSubmit={inviteCoach}>
            <p className="muted">{t("inviteCoachHelp")}</p>
            <label>
              {t("coachName")}
              <input
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </label>
            <label>
              {t("emailLabel")}
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setInviteOpen(false)}
              >
                {t("cancel")}
              </button>
              <button className="primary" disabled={inviteBusy}>
                {inviteBusy ? t("sendingInvite") : t("sendInvite")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {createOpen && (
        <Modal
          title={t("createConversationTitle")}
          close={() => setCreateOpen(false)}
        >
          <form onSubmit={createConversation}>
            <label>
              {t("groupNameOptional")}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("groupNamePlaceholder")}
              />
            </label>
            <label>
              {t("selectParticipants")}
              <select
                multiple
                size={Math.min(6, Math.max(3, members.length))}
                value={selected}
                onChange={(e) =>
                  setSelected(
                    Array.from(
                      e.target
                        .selectedOptions as HTMLCollectionOf<HTMLOptionElement>,
                    ).map((o: HTMLOptionElement) => o.value),
                  )
                }
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email} — {m.role}
                  </option>
                ))}
              </select>
            </label>
            <small className="muted">{t("participantsHelp")}</small>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setCreateOpen(false)}
              >
                {t("cancel")}
              </button>
              <button className="primary" disabled={busy || !selected.length}>
                {busy ? t("creating") : t("createConversation")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {membersOpen && (
        <Modal title={t("groupMembers")} close={() => setMembersOpen(false)}>
          {current && (
            <>
              <p className="muted">{t("membersHelp")}</p>
              <div className="member-list">
                {convMembers.map((m) => (
                  <div className="student-row" key={m.id}>
                    <span className="avatar">
                      <Users size={15} />
                    </span>
                    <div className="grow">
                      <b>{m.full_name || m.email}</b>
                      <small>{m.role}</small>
                    </div>
                    {m.id !== current.created_by &&
                      (profile.role === "admin" ||
                        profile.role === "owner" ||
                        current.created_by === profile.id) && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={memberBusy}
                          onClick={() => removeMember(m.id)}
                        >
                          {t("removeMember")}
                        </button>
                      )}
                  </div>
                ))}
                {!convMembers.length && <p className="muted">{t("loading")}</p>}
              </div>
              <label>
                {t("addMember")}
                <select
                  value={newMember}
                  onChange={(e) => setNewMember(e.target.value)}
                >
                  <option value="">—</option>
                  {members
                    .filter((m) => !convMembers.some((c: any) => c.id === m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name || m.email}
                      </option>
                    ))}
                </select>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setMembersOpen(false)}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!newMember || memberBusy}
                  onClick={() => addMember(newMember)}
                >
                  {memberBusy ? t("loading") : t("addMember")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function OwnerConsole({ t }: { t: T }) {
  const [items, setItems] = useState<any[]>([]),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [fullName, setFullName] = useState(""),
    [institution, setInstitution] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const { data, error } = await supabase
      .from("institutions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) notify(error.message);
    setItems(data || []);
  }
  useEffect(() => {
    load();
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("institutions").insert({ name });
    if (error) notify(error.message);
    else {
      setName("");
      load();
    }
    setBusy(false);
  }
  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: {
        email,
        full_name: fullName,
        role: "manager",
        institution_id: institution,
      },
    });
    if (error || data?.error) notify(error?.message || data.error);
    else {
      notify("Manager invitation sent");
      setEmail("");
      setFullName("");
    }
    setBusy(false);
  }
  return (
    <>
      <Heading
        title={t("ownerConsole")}
        subtitle="Platform-level institution management"
      />
      <section className="panel">
        <h3>{t("createInstitution")}</h3>
        <form onSubmit={create}>
          <label>
            {t("institution")}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {t("save")}
          </button>
        </form>
      </section>
      <section className="panel">
        <h3>Appoint institution manager</h3>
        <form onSubmit={invite}>
          <label>
            Institution
            <select
              required
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            >
              <option value="">—</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Manager name
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label>
            Manager email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            Invite manager
          </button>
        </form>
      </section>
      <section className="panel">
        <h3>{t("institution")}</h3>
        {items.length === 0 ? (
          <Empty t={t} />
        ) : (
          items.map((i) => (
            <div className="student-row" key={i.id}>
              <div className="avatar">
                <Building2 />
              </div>
              <div className="grow">
                <b>{i.name}</b>
                <small>{i.id}</small>
              </div>
              <span className="pill success">
                {i.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
function Team({ profile, t }: { profile: Profile; t: T }) {
  const [items, setItems] = useState<any[]>([]),
    [email, setEmail] = useState(""),
    [fullName, setFullName] = useState(""),
    [role, setRole] = useState("coach"),
    [busy, setBusy] = useState(false);
  async function load() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("institution_id", profile.institution_id)
      .order("created_at", { ascending: false });
    if (error) notify(error.message);
    setItems(data || []);
  }
  useEffect(() => {
    load();
  }, []);
  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: { email, full_name: fullName, role },
    });
    if (error || data?.error) notify(error?.message || data.error);
    else {
      notify("Invitation sent");
      setEmail("");
      setFullName("");
      load();
    }
    setBusy(false);
  }
  async function approve(id: string) {
    const { error } = await supabase
      .from("profiles")
      .update({
        account_status: "active",
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) notify(error.message);
    else load();
  }
  return (
    <>
      <Heading title={t("team")} />
      <section className="panel">
        <h3>{t("invite")}</h3>
        <p className="muted">{t("inviteHint")}</p>
        <form onSubmit={invite}>
          <label>
            {t("name")}
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label>
            {t("email")}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            {t("role")}
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="coach">{t("coach")}</option>
              {profile.role === "manager" && (
                <option value="admin">{t("admin")}</option>
              )}
            </select>
          </label>
          <button className="primary" disabled={busy}>
            {t("sendInvite")}
          </button>
        </form>
      </section>
      <section className="panel">
        <h3>{t("team")}</h3>
        {items.map((p) => (
          <div className="student-row" key={p.id}>
            <div className="avatar">{p.full_name?.slice(0, 1) || "?"}</div>
            <div className="grow">
              <b>{p.full_name || p.email}</b>
              <small>
                {p.email} · {p.role}
              </small>
            </div>
            <span
              className={`pill ${p.account_status === "active" ? "success" : "warning"}`}
            >
              {p.account_status}
            </span>
            {p.account_status === "pending" && (
              <button className="secondary" onClick={() => approve(p.id)}>
                {t("approve")}
              </button>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
function Medical({ profile, t }: { profile: Profile; t: T }) {
  const [students, setStudents] = useState<any[]>([]),
    [student, setStudent] = useState(""),
    [details, setDetails] = useState(""),
    [kind, setKind] = useState("medical"),
    [file, setFile] = useState<File | null>(null),
    [records, setRecords] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
  async function load() {
    const [a, b] = await Promise.all([
      supabase
        .from("students")
        .select("id,full_name,student_code")
        .order("full_name"),
      supabase
        .from("student_medical_records")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    setStudents(a.data || []);
    const mapped = await Promise.all(
      (b.data || []).map(async (r) => {
        if (!r.attachment_path) return r;
        const { data } = await supabase.storage
          .from("trainer-medical")
          .createSignedUrl(r.attachment_path, 3600);
        return { ...r, attachment_url: data?.signedUrl };
      }),
    );
    setRecords(mapped);
    if (b.error) notify(b.error.message);
  }
  useEffect(() => {
    load();
  }, []);
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    let attachment_path: string | null = null;
    if (file) {
      const ext = file.name.split(".").pop() || "bin";
      attachment_path = `${profile.institution_id}/${profile.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("trainer-medical")
        .upload(attachment_path, file, {
          upsert: false,
          contentType: file.type,
        });
      if (upErr) {
        notify(upErr.message);
        setBusy(false);
        return;
      }
    }
    const { error } = await supabase.from("student_medical_records").insert({
      institution_id: profile.institution_id,
      student_id: student,
      record_type: kind,
      details,
      created_by: profile.id,
      attachment_path,
    });
    if (error) notify(error.message);
    else {
      setDetails("");
      setFile(null);
      load();
    }
    setBusy(false);
  }
  return (
    <>
      <Heading title={t("medical")} />
      <section className="panel">
        <form onSubmit={add}>
          <label>
            {t("students")}
            <select
              required
              value={student}
              onChange={(e) => setStudent(e.target.value)}
            >
              <option value="">—</option>
              {students.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.student_code} · {s.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("records")}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="medical">Medical</option>
              <option value="injury">Injury</option>
              <option value="exemption">Exemption</option>
              <option value="permission">Permission</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            {t("notes")}
            <DictateButton onText={setDetails} />
            <textarea
              required
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          <label>
            Attachment (PDF / image)
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {t("save")}
          </button>
        </form>
      </section>
      {records.map((r) => (
        <article className="panel notice" key={r.id}>
          <b>{r.record_type}</b>
          <p>{r.details}</p>
          {r.attachment_url && (
            <a href={r.attachment_url} target="_blank" rel="noreferrer">
              Open private attachment
            </a>
          )}
          <small>{formatDateTime(r.created_at)}</small>
        </article>
      ))}
    </>
  );
}
function InstitutionSettings({ profile, t }: { profile: Profile; t: T }) {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState(""),
    [address, setAddress] = useState(""),
    [language, setLanguage] = useState<Lang>("ar"),
    [logo, setLogo] = useState<File | null>(null),
    [logoUrl, setLogoUrl] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const { data, error } = await supabase
      .from("institutions")
      .select("*")
      .eq("id", profile.institution_id)
      .single();
    if (error) {
      notify(error.message);
      return;
    }
    setName(data.name || "");
    setPhone(data.phone || "");
    setEmail(data.email || "");
    setAddress(data.address || "");
    setLanguage(data.default_language || "ar");
    if (data.logo_path) {
      const { data: link } = await supabase.storage
        .from("trainer-avatars")
        .createSignedUrl(data.logo_path, 3600);
      setLogoUrl(link?.signedUrl || "");
    }
  }
  useEffect(() => {
    load();
  }, [profile.institution_id]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    let logo_path: string | undefined;
    if (logo) {
      const ext = logo.name.split(".").pop() || "png";
      logo_path = `${profile.institution_id}/${profile.id}/institution-logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("trainer-avatars")
        .upload(logo_path, logo, { contentType: logo.type, upsert: false });
      if (uploadError) {
        notify(uploadError.message);
        setBusy(false);
        return;
      }
    }
    const payload: any = {
      name,
      phone,
      email,
      address,
      default_language: language,
    };
    if (logo_path) payload.logo_path = logo_path;
    const { error } = await supabase
      .from("institutions")
      .update(payload)
      .eq("id", profile.institution_id);
    if (error) notify(error.message);
    else {
      notify(t("save"));
      setLogo(null);
      load();
    }
    setBusy(false);
  }
  return (
    <>
      <Heading title={t("settings")} />
      <section className="panel">
        <form onSubmit={save}>
          <label>
            {t("institution")}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label>
            Default language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Lang)}
            >
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          {logoUrl && (
            <img
              className="institution-logo"
              src={logoUrl}
              alt="Institution logo"
            />
          )}
          <label>
            Institution logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setLogo(e.target.files?.[0] || null)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {t("save")}
          </button>
        </form>
      </section>
    </>
  );
}

function Audit({ t }: { t: T }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150)
      .then(({ data, error }) => {
        if (error) notify(error.message);
        setItems(data || []);
      });
  }, []);
  return (
    <>
      <Heading title={t("audit")} />
      {items.length === 0 ? (
        <Empty t={t} />
      ) : (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Table</th>
                  <th>Record</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.action}</td>
                    <td>{i.table_name}</td>
                    <td>{i.record_id}</td>
                    <td>{formatDateTime(i.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
function DictateButton({ onText }: { onText: (text: string) => void }) {
  function start() {
    const w = window as any;
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) {
      notify("Speech recognition is not supported by this browser.");
      return;
    }
    const rec = new Recognition();
    rec.lang =
      document.documentElement.lang === "ar"
        ? "ar-TN"
        : document.documentElement.lang === "fr"
          ? "fr-FR"
          : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) =>
      onText(event.results?.[0]?.[0]?.transcript || "");
    rec.onerror = () => notify("Speech recognition could not complete.");
    rec.start();
  }
  return (
    <button type="button" className="secondary dictation-btn" onClick={start}>
      <Mic size={15} /> Dictate
    </button>
  );
}

function Denied({ t }: { t: T }) {
  return (
    <section className="panel">
      <ShieldCheck />
      <h2>{t("noPermission")}</h2>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Profile page: account details, interface language and role summary.
 * Writes only to the signed-in user's own profiles row.
 * ------------------------------------------------------------------ */
function ProfilePage({
  profile,
  t,
  lang,
  setLang,
}: {
  profile: Profile;
  t: T;
  lang: Lang;
  setLang: (v: Lang) => void;
}) {
  const [name, setName] = useState(profile.full_name || "");
  const [institution, setInstitution] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile.institution_id) {
      setInstitution("");
      return;
    }
    let alive = true;
    supabase
      .from("institutions")
      .select("name")
      .eq("id", profile.institution_id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) setError(err.message);
        setInstitution((data as { name?: string } | null)?.name || "");
      });
    return () => {
      alive = false;
    };
  }, [profile.institution_id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("name"));
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("profiles")
      .update({ full_name: name.trim(), preferred_language: lang })
      .eq("id", profile.id);
    setSaving(false);
    if (err) setError(err.message);
    else notify(t("profileUpdated"));
  }

  return (
    <>
      <PageHeader
        title={t("profile")}
        subtitle={t("myAccount")}
        icon={<ShieldCheck size={20} />}
      />
      <Panel title={t("myAccount")}>
        <form className="ui-form" onSubmit={save}>
          <label className="ui-field">
            <span className="ui-field-label">{t("name")}</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">{t("emailAddress")}</span>
            <input value={profile.email || ""} readOnly />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">{t("institutionLabel")}</span>
            <input value={institution || t("noInstitution")} readOnly />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">{t("languageLabel")}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
            >
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="ui-inline">
            <Badge tone="info">{t(profile.role)}</Badge>
            <Badge
              tone={profile.account_status === "active" ? "success" : "warn"}
            >
              {profile.account_status}
            </Badge>
          </div>
          {error && <p className="ui-field-error">{error}</p>}
          <button className="primary" disabled={saving}>
            {saving ? "..." : t("save")}
          </button>
        </form>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Session history: every coach_shifts row the account may read, with the
 * number of attendance records captured in that session.
 * ------------------------------------------------------------------ */
function Sessions({ profile, t }: { profile: Profile; t: T }) {
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("coach_shifts")
      .select("id,coach_id,started_at,ended_at")
      .order("started_at", { ascending: false })
      .limit(60);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const list = data || [];
    setRows(list);
    const ids = list.map((r: any) => r.id).filter(Boolean);
    if (ids.length) {
      // session_key only exists once migration 0001 is applied; ignore the
      // error so the page still lists shifts on an un-migrated database.
      const res = await supabase
        .from("attendance_records")
        .select("session_key")
        .in("session_key", ids);
      if (!res.error) {
        const map: Record<string, number> = {};
        (res.data || []).forEach((r: any) => {
          if (r.session_key) map[r.session_key] = (map[r.session_key] || 0) + 1;
        });
        setCounts(map);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [profile.id]);

  const open = rows.filter((r) => !r.ended_at).length;

  return (
    <>
      <PageHeader
        title={t("sessions")}
        subtitle={t("sessionHistory")}
        icon={<Activity size={20} />}
        actions={
          <button className="secondary" onClick={load} disabled={loading}>
            {t("refresh")}
          </button>
        }
      />
      <div className="ui-stats">
        <StatCard
          label={t("totalSessions")}
          value={rows.length}
          tone="accent"
          icon={<Activity size={18} />}
        />
        <StatCard
          label={t("openNow")}
          value={open}
          tone={open ? "warn" : "default"}
          icon={<CalendarDays size={18} />}
        />
      </div>
      {loading ? (
        <LoadingState label={t("loading")} />
      ) : error ? (
        <ErrorState
          title={t("loadingError")}
          message={error}
          onRetry={load}
          retryLabel={t("retry")}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("noSessions")}
          body={t("noSessionsBody")}
          icon={<Activity size={26} />}
        />
      ) : (
        <Panel>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("startedAt")}</th>
                  <th>{t("endedAt")}</th>
                  <th>{t("duration")}</th>
                  <th>{t("attendanceCount")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const start = r.started_at ? new Date(r.started_at) : null;
                  const end = r.ended_at ? new Date(r.ended_at) : null;
                  const mins =
                    start && end
                      ? Math.max(
                          0,
                          Math.round((end.getTime() - start.getTime()) / 60000),
                        )
                      : null;
                  return (
                    <tr key={r.id}>
                      <td>{formatDateTime(r.started_at)}</td>
                      <td>
                        {r.ended_at ? (
                          formatDateTime(r.ended_at)
                        ) : (
                          <Badge tone="warn">{t("openSession")}</Badge>
                        )}
                      </td>
                      <td>{mins === null ? "-" : `${mins} ${t("minutes")}`}</td>
                      <td>{counts[r.id] ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Classes & groups: real CRUD over public.classes (the table that
 * students.class_id references). Admin-scoped by RLS.
 * ------------------------------------------------------------------ */
function Classes({ profile, t }: { profile: Profile; t: T }) {
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [desc, setDesc] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("classes")
      .select("id,name,academic_year,description,created_at")
      .order("name", { ascending: true });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setRows(data || []);
    const { data: st } = await supabase
      .from("students")
      .select("class_id")
      .not("class_id", "is", null);
    if (st) {
      const map: Record<string, number> = {};
      (st as any[]).forEach((r) => {
        if (r.class_id) map[r.class_id] = (map[r.class_id] || 0) + 1;
      });
      setCounts(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startAdd() {
    setEditId(null);
    setName("");
    setYear("");
    setDesc("");
    setFormError("");
    setOpen(true);
  }

  function startEdit(r: any) {
    setEditId(r.id);
    setName(r.name || "");
    setYear(r.academic_year || "");
    setDesc(r.description || "");
    setFormError("");
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError(t("fieldRequired"));
      return;
    }
    if (!profile.institution_id) {
      setFormError(t("noInstitutionScope"));
      return;
    }
    setSaving(true);
    setFormError("");
    const payload = {
      name: name.trim(),
      academic_year: year.trim() || null,
      description: desc.trim() || null,
    };
    const res = editId
      ? await supabase.from("classes").update(payload).eq("id", editId)
      : await supabase
          .from("classes")
          .insert({ ...payload, institution_id: profile.institution_id });
    setSaving(false);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    setOpen(false);
    notify(t("classSaved"));
    load();
  }

  async function remove(r: any) {
    if (!window.confirm(t("deleteClassConfirm"))) return;
    const { error: err } = await supabase
      .from("classes")
      .delete()
      .eq("id", r.id);
    if (err) notify(err.message);
    else {
      notify(t("classDeleted"));
      load();
    }
  }

  const totalStudents = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title={t("classes")}
        subtitle={t("classesSubtitle")}
        icon={<GraduationCap size={20} />}
        actions={
          <button className="primary" onClick={startAdd}>
            <Plus size={16} /> {t("addClass")}
          </button>
        }
      />
      <div className="ui-stats">
        <StatCard
          label={t("totalClasses")}
          value={rows.length}
          tone="accent"
          icon={<GraduationCap size={18} />}
        />
        <StatCard
          label={t("studentsCount")}
          value={totalStudents}
          icon={<Users size={18} />}
        />
      </div>
      {loading ? (
        <LoadingState label={t("loading")} />
      ) : error ? (
        <ErrorState
          title={t("loadingError")}
          message={error}
          onRetry={load}
          retryLabel={t("retry")}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("noClasses")}
          body={t("noClassesBody")}
          icon={<GraduationCap size={26} />}
          action={
            <button className="primary" onClick={startAdd}>
              {t("addClass")}
            </button>
          }
        />
      ) : (
        <Panel>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("className")}</th>
                  <th>{t("academicYear")}</th>
                  <th>{t("studentsCount")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.description && <small> — {r.description}</small>}
                    </td>
                    <td>{r.academic_year || "-"}</td>
                    <td>{counts[r.id] || 0}</td>
                    <td>
                      <div className="ui-inline">
                        <button
                          className="secondary"
                          onClick={() => startEdit(r)}
                        >
                          <Pencil size={14} /> {t("edit")}
                        </button>
                        <button className="secondary" onClick={() => remove(r)}>
                          <Archive size={14} /> {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {open && (
        <div className="ui-modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="ui-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <div className="ui-modal-head">
              <h2>{editId ? t("editClass") : t("addClass")}</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
              >
                <X size={18} />
              </button>
            </div>
            <div className="ui-modal-body">
              <div className="ui-form" style={{ maxWidth: "100%" }}>
                <label className="ui-field">
                  <span className="ui-field-label">{t("className")}</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </label>
                <label className="ui-field">
                  <span className="ui-field-label">{t("academicYear")}</span>
                  <input
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2025/2026"
                  />
                </label>
                <label className="ui-field">
                  <span className="ui-field-label">{t("description")}</span>
                  <textarea
                    rows={3}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />
                </label>
                {formError && <p className="ui-field-error">{formError}</p>}
              </div>
            </div>
            <div className="ui-modal-foot">
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                {t("cancel")}
              </button>
              <button className="primary" disabled={saving}>
                {saving ? "..." : t("save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
