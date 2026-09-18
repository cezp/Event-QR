import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  DoorOpen,
  Gift,
  Heart,
  History,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type {
  Audit,
  Event,
  InvitationView,
  Me,
  Profile,
  Settings,
  Staff,
} from "../shared/types";
import { eventStatusLabels, roleLabels } from "../shared/types";
import { api, ApiError, date, normalize, time } from "./api";
import {
  Badge,
  CopyLink,
  Empty,
  ErrorBox,
  FamilyFields,
  Modal,
  QR,
  Scanner,
  Spinner,
  type Family,
} from "./components";
import { Brand, Landing, Privacy, RegistrationPage } from "./Public";

type Page =
  | "dashboard"
  | "invitations"
  | "checkin"
  | "eventsettings"
  | "team"
  | "settings";
type InvitationSummary = Omit<InvitationView, "qrToken">;
const inside = (i: InvitationSummary) =>
  i.children.filter((c) => c.checkedInAt && !c.checkedOutAt).length;
const fullName = (i: InvitationSummary) =>
  i.parents.length
    ? i.parents.map((p) => p.firstName + " " + p.lastName).join(" i ")
    : "Oczekujemy na dane rodziny";
const initialFamily = (i: InvitationView): Family => ({
  parents: i.parents.length ? i.parents : [{ firstName: "", lastName: "" }],
  children: i.children.length
    ? i.children
    : [{ id: "", firstName: "", lastName: "" }],
  phone: i.phone,
  secondPhone: i.secondPhone,
  email: i.email,
});
export default function App() {
  const [me, setMe] = useState<Me>(),
    [config, setConfig] = useState<Settings>(),
    [authError, setAuthError] = useState(""),
    [loading, setLoading] = useState(true);
  const path = location.pathname;
  useEffect(() => {
    if (path.startsWith("/r/") || path === "/prywatnosc") return;
    Promise.all([
      api<Settings>("/public/config").then(setConfig),
      api<Me>("/me")
        .then(setMe)
        .catch((e) => {
          if (e.status !== 401) setAuthError(e.message);
        }),
    ])
      .catch((e) => setAuthError(e.message))
      .finally(() => setLoading(false));
  }, []);
  if (path === "/prywatnosc") return <Privacy />;
  if (path.startsWith("/r/")) return <RegistrationPage path={path.slice(3)} />;
  if (loading)
    return (
      <div className="loading-screen">
        <img src="/logo.png" alt="Sami Swoi" />
        <Spinner />
        <p>Za chwilę będziemy razem…</p>
      </div>
    );
  if (!me)
    return (
      <Landing
        settings={config || { paused: false, message: "" }}
        error={authError}
      />
    );
  return (
    <Workspace
      me={me}
      config={config || { paused: false, message: "" }}
      onConfig={setConfig}
    />
  );
}
function Workspace({
  me,
  config,
  onConfig,
}: {
  me: Me;
  config: Settings;
  onConfig: (s: Settings) => void;
}) {
  const [events, setEvents] = useState<Event[]>([]),
    [eventId, setEventId] = useState(
      () => localStorage.getItem("eventqr-selected-event") || "",
    ),
    [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [page, setPage] = useState<Page>("dashboard"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState<Profile>(),
    [modal, setModal] = useState<"invite" | "event" | "scan" | null>(null);
  const [suggest, setSuggest] = useState(false),
    [syncTime, setSyncTime] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const event = events.find((e) => e.id === eventId),
    isAdmin = me.user.role === "admin",
    canManage = me.user.role !== "crew";
  const notify = useCallback((s: string) => {
    setToast(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const refreshEvents = useCallback(async () => {
    const result = await api<Event[]>("/events");
    setEvents(result);
    setEventId((current) =>
      result.some((e) => e.id === current) ? current : result[0]?.id || "",
    );
  }, []);
  useEffect(() => {
    if (eventId) localStorage.setItem("eventqr-selected-event", eventId);
  }, [eventId]);
  const refresh = useCallback(async () => {
    if (!eventId || config.paused) return;
    const result = await api<InvitationSummary[]>(
      "/events/" + eventId + "/invitations",
    );
    setInvitations(result);
    setSyncTime(new Date().toISOString());
    setError("");
  }, [eventId, config.paused]);
  useEffect(() => {
    refreshEvents().catch((e) => setError(e.message));
  }, [refreshEvents]);
  useEffect(() => {
    setInvitations([]);
    setProfile(undefined);
    setBusy(true);
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [refresh]);
  useEffect(() => {
    if (!eventId || config.paused) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible")
        refresh().catch((e) => setError(e.message));
    }, 15000);
    return () => clearInterval(t);
  }, [refresh, eventId, config.paused]);
  useEffect(() => {
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  const closeModal = useCallback(() => setModal(null), []),
    closeProfile = useCallback(() => setProfile(undefined), []);
  async function openProfile(id: string) {
    try {
      setProfile(
        await api<Profile>("/events/" + eventId + "/invitations/" + id),
      );
      setSuggest(false);
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const onChange = async () => {
    await refresh();
    if (profile)
      setProfile(
        await api<Profile>(
          "/events/" + eventId + "/invitations/" + profile.invitation.id,
        ),
      );
  };
  const results = useMemo(() => {
    const q = normalize(query.trim());
    return invitations.filter(
      (i) =>
        (filter === "all" ||
          (filter === "inside" ? inside(i) > 0 : i.status === filter)) &&
        (!q ||
          normalize(
            [...i.parents, ...i.children]
              .map((p) => p.firstName + " " + p.lastName)
              .join(" ") +
              " " +
              i.phone +
              " " +
              i.email,
          ).includes(q)),
    );
  }, [invitations, query, filter]);
  const stats = {
    children: invitations
      .filter((i) => i.status === "approved")
      .reduce((sum, i) => sum + i.children.length, 0),
    inside: invitations.reduce((sum, i) => sum + inside(i), 0),
    arrived: invitations.reduce(
      (sum, i) =>
        sum +
        (i.pastAdmissions || 0) +
        i.children.filter((c) => c.everCheckedIn).length,
      0,
    ),
    waiting: invitations
      .filter((i) => i.status === "approved")
      .reduce(
        (sum, i) => sum + i.children.filter((c) => !c.everCheckedIn).length,
        0,
      ),
    pending: invitations.filter((i) => i.status === "pending").length,
  };
  const go = (p: Page) => {
    setPage(p);
    setQuery("");
    setFilter("all");
    setMenu(false);
    setError("");
  };
  const nav = [
    { page: "dashboard" as Page, icon: LayoutDashboard, label: "Przegląd" },
    { page: "invitations" as Page, icon: Ticket, label: "Zaproszenia" },
    { page: "checkin" as Page, icon: QrCode, label: "Obsługa wejścia" },
  ];
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "mobile-open" : "")}>
        <Brand />
        <button
          className="mobile-close icon-button"
          aria-label="Zamknij menu"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="sidebar-label">PRZESTRZEŃ ORGANIZATORA</div>
        <div className="event-picker">
          <CalendarDays size={20} />
          <select
            aria-label="Wybierz wydarzenie"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            {!events.length && <option value="">Brak wydarzeń</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.page}
              className={page === n.page ? "active" : ""}
              onClick={() => go(n.page)}
            >
              <n.icon size={20} />
              {n.label}
              {n.page === "invitations" && stats.pending > 0 && (
                <span className="nav-count">{stats.pending}</span>
              )}
            </button>
          ))}
          {canManage && (
            <button
              className={page === "eventsettings" ? "active" : ""}
              onClick={() => go("eventsettings")}
            >
              <SettingsIcon size={20} />
              Ustawienia wydarzenia
            </button>
          )}
          {isAdmin && (
            <>
              <div className="sidebar-label">STOWARZYSZENIE</div>
              <button
                className={page === "team" ? "active" : ""}
                onClick={() => go("team")}
              >
                <Users size={20} />
                Zespół i uprawnienia
              </button>
              <button
                className={page === "settings" ? "active" : ""}
                onClick={() => go("settings")}
              >
                <ShieldCheck size={20} />
                Platforma
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="together">
            <Heart size={18} />
            <p>
              Małe spotkania.
              <br />
              <strong>Wielka radość.</strong>
            </p>
            <span>✦</span>
          </div>
          <div className="user-block">
            <div className="avatar">{me.user.name[0]}</div>
            <div>
              <strong>{me.user.name}</strong>
              <small>{roleLabels[me.user.role]}</small>
            </div>
            <a
              href="/.auth/logout?post_logout_redirect_uri=/"
              aria-label="Wyloguj"
              title="Wyloguj"
            >
              <LogOut size={18} />
            </a>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(true)}
            aria-label="Otwórz menu"
          >
            <Menu />
          </button>
          <div className="breadcrumbs">
            Wydarzenia <ChevronRight size={14} />
            <strong>{event?.name || "Panel organizatora"}</strong>
          </div>
          <div className="topbar-right">
            <span className={"connection " + (!online ? "offline" : "")}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              <span>{online ? "Połączono" : "Brak internetu"}</span>
            </span>
            <span className="topbar-divider" />
            <span className="tiny-avatar">{me.user.name[0]}</span>
          </div>
        </header>
        <main className="main-content">
          {me.local && (
            <div className="demo-banner">
              <Sparkles size={15} />
              Środowisko lokalne · dane demonstracyjne są fikcyjne
            </div>
          )}
          {!online && (
            <ErrorBox message="Brak internetu. Wejścia nie są zapisywane. Przywróć połączenie i ponów operację." />
          )}
          <ErrorBox message={error} />
          {config.paused && page !== "settings" ? (
            <div className="panel paused-panel">
              <Heart size={42} />
              <h1>Platforma jest wstrzymana</h1>
              <p>{config.message}</p>
              {isAdmin && (
                <button
                  className="button primary"
                  onClick={() => go("settings")}
                >
                  Przejdź do ustawień
                </button>
              )}
            </div>
          ) : page === "team" && isAdmin ? (
            <Team events={events} notify={notify} />
          ) : page === "settings" && isAdmin ? (
            <Platform config={config} onConfig={onConfig} notify={notify} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {page === "checkin"
                      ? "SPRAWNE WEJŚCIE, SPOKOJNA GŁOWA"
                      : "DOBRZE BYĆ RAZEM"}
                  </span>
                  <h1>
                    {page === "dashboard"
                      ? "Wszystko gotowe na uśmiechy."
                      : page === "invitations"
                        ? "Każde zaproszenie to historia."
                        : page === "checkin"
                          ? "Witamy na wydarzeniu!"
                          : "Twoje wydarzenie"}
                  </h1>
                  <p>
                    {page === "dashboard"
                      ? "Twoje wydarzenie w jednym miejscu. Zobacz, co dzieje się teraz."
                      : page === "invitations"
                        ? "Rodziny, zgłoszenia i wszystkie ważne szczegóły."
                        : page === "checkin"
                          ? "Zeskanuj kod lub znajdź rodzinę. Sprawdź dane i potwierdź wejście."
                          : "Zadbaj o szczegóły spotkania i otwórz wejście dla uczestników."}
                  </p>
                </div>
                {isAdmin && page === "dashboard" && (
                  <button
                    className="button secondary"
                    onClick={() => setModal("event")}
                  >
                    <Plus size={18} />
                    Nowe wydarzenie
                  </button>
                )}
                {canManage && page === "invitations" && event && (
                  <button
                    className="button primary"
                    onClick={() => setModal("invite")}
                  >
                    <Plus size={18} />
                    Nowe zaproszenie
                  </button>
                )}
              </div>
              {!event ? (
                <div className="panel">
                  <Empty title="Pierwsze dobre spotkanie przed nami">
                    {isAdmin
                      ? "Utwórz wydarzenie, aby zacząć zapraszać rodziny."
                      : "Administrator przypisze Cię do wydarzenia. Po przypisaniu odśwież stronę."}
                  </Empty>
                  {isAdmin && (
                    <div className="empty-action">
                      <button
                        className="button primary"
                        onClick={() => setModal("event")}
                      >
                        <Plus size={18} />
                        Utwórz wydarzenie
                      </button>
                    </div>
                  )}
                </div>
              ) : page === "eventsettings" ? (
                <EventEditor
                  event={event}
                  onSave={async () => {
                    await refreshEvents();
                    notify("Zapisano wydarzenie.");
                  }}
                />
              ) : (
                <>
                  {page === "dashboard" && (
                    <>
                      <section className="event-hero">
                        <div className="hero-copy">
                          <div className={"event-status " + event.status}>
                            <span />
                            {eventStatusLabels[event.status]}
                          </div>
                          <h2>{event.name}</h2>
                          <p>
                            {event.description ||
                              "Wspólnie tworzymy dobre wspomnienia."}
                          </p>
                          <div className="event-meta">
                            <span>
                              <CalendarDays size={16} />
                              {date(event.startsAt)} · {time(event.startsAt)}
                            </span>
                            <span>
                              <MapPin size={16} />
                              {event.location}
                            </span>
                          </div>
                          <div className="hero-actions">
                            <button
                              className="button primary"
                              onClick={() => setModal("scan")}
                            >
                              <QrCode size={18} />
                              Skanuj zaproszenie
                            </button>
                            <button
                              className="text-button"
                              onClick={() => go("invitations")}
                            >
                              Zobacz zaproszenia <ArrowRight size={17} />
                            </button>
                          </div>
                        </div>
                        <div className="hero-art" aria-hidden="true">
                          <span className="art-star one">✦</span>
                          <span className="art-star two">✧</span>
                          <div className="ticket-art">
                            <div className="ticket-art-top">
                              <Gift size={32} />
                              <span>
                                DOBRZE
                                <br />
                                BYĆ RAZEM
                              </span>
                            </div>
                            <div className="ticket-perforation" />
                            <div className="ticket-art-bottom">
                              <QrCode size={61} />
                              <div>
                                <span>TWOJE MIEJSCE</span>
                                <strong>
                                  na dobre
                                  <br />
                                  chwile.
                                </strong>
                              </div>
                            </div>
                          </div>
                          <span className="art-heart">
                            <Heart size={25} fill="currentColor" />
                          </span>
                          <span className="art-dots">•••</span>
                        </div>
                      </section>
                      <div className="stats-grid">
                        <Stat
                          title="Zapisane dzieci"
                          value={stats.children}
                          detail={
                            "w " +
                            invitations.filter((i) => i.status === "approved")
                              .length +
                            " zaakceptowanych zaproszeniach"
                          }
                          icon={Users}
                          color="green"
                        />
                        <Stat
                          title="Obecne na wydarzeniu"
                          value={stats.inside}
                          detail={"Przyjęto łącznie: " + stats.arrived}
                          icon={DoorOpen}
                          color="mint"
                        />
                        <Stat
                          title="Jeszcze przed wejściem"
                          value={stats.waiting}
                          detail="Czekamy na kolejne uśmiechy"
                          icon={Ticket}
                          color="purple"
                        />
                        <Stat
                          title="Do weryfikacji"
                          value={stats.pending}
                          detail="Zgłoszenia czekające na akceptację"
                          icon={Clock3}
                          color="amber"
                          onClick={() => {
                            go("invitations");
                            setFilter("pending");
                          }}
                        />
                      </div>
                      <div className="dashboard-grid">
                        <section className="panel">
                          <div className="panel-heading">
                            <div>
                              <h2>
                                Na miejscu{" "}
                                <span className="count-bubble">
                                  {stats.inside}
                                </span>
                              </h2>
                              <p>Wiemy, kto jest pod naszą opieką.</p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => {
                                go("invitations");
                                setFilter("inside");
                              }}
                            >
                              Zobacz wszystkich <ArrowRight size={16} />
                            </button>
                          </div>
                          {stats.inside === 0 ? (
                            <Empty title="Czekamy na pierwszych gości">
                              Potwierdzone wejścia pojawią się tutaj.
                            </Empty>
                          ) : (
                            <div className="arrival-list">
                              {invitations
                                .flatMap((i) =>
                                  i.children
                                    .filter(
                                      (c) => c.checkedInAt && !c.checkedOutAt,
                                    )
                                    .map((c) => ({ i, c })),
                                )
                                .sort((a, b) =>
                                  b.c.checkedInAt!.localeCompare(
                                    a.c.checkedInAt!,
                                  ),
                                )
                                .slice(0, 5)
                                .map(({ i, c }, n) => (
                                  <button
                                    className="arrival-row"
                                    key={c.id}
                                    onClick={() => openProfile(i.id)}
                                  >
                                    <span
                                      className={
                                        "child-avatar color-" + (n % 4)
                                      }
                                    >
                                      {c.firstName[0]}
                                      {c.lastName[0]}
                                    </span>
                                    <span>
                                      <strong>
                                        {c.firstName} {c.lastName}
                                      </strong>
                                      <small>
                                        Rodzic: {i.parents[0]?.firstName}{" "}
                                        {i.parents[0]?.lastName}
                                      </small>
                                    </span>
                                    <span className="arrival-time">
                                      <span className="dot" />
                                      {time(c.checkedInAt)}
                                    </span>
                                    <ChevronRight size={17} />
                                  </button>
                                ))}
                            </div>
                          )}
                        </section>
                        <section className="panel verification-panel">
                          <div className="panel-heading">
                            <div>
                              <h2>Jeszcze jeden krok</h2>
                              <p>Sprawdź nowe zgłoszenia rodziców.</p>
                            </div>
                            <span className="soft-icon amber">
                              <Clock3 size={20} />
                            </span>
                          </div>
                          {stats.pending === 0 ? (
                            <Empty title="Wszystko na bieżąco">
                              Nie ma zgłoszeń do weryfikacji.
                            </Empty>
                          ) : (
                            <>
                              {invitations
                                .filter((i) => i.status === "pending")
                                .slice(0, 3)
                                .map((i) => (
                                  <button
                                    className="pending-row"
                                    key={i.id}
                                    onClick={() => openProfile(i.id)}
                                  >
                                    <span>
                                      <strong>{fullName(i)}</strong>
                                      <small>
                                        {i.children.length}{" "}
                                        {i.children.length === 1
                                          ? "dziecko"
                                          : "dzieci"}{" "}
                                        · {time(i.updatedAt)}
                                      </small>
                                    </span>
                                    <ChevronRight size={17} />
                                  </button>
                                ))}
                              <button
                                className="button secondary full"
                                onClick={() => {
                                  go("invitations");
                                  setFilter("pending");
                                }}
                              >
                                Przejdź do weryfikacji <ArrowRight size={16} />
                              </button>
                            </>
                          )}
                        </section>
                      </div>
                      <div className="small-note">
                        <ShieldCheck size={16} />
                        Dane rodzin widzi tylko upoważniony zespół wydarzenia.
                        <span>Ostatnia aktualizacja: {time(syncTime)}</span>
                      </div>
                    </>
                  )}
                  {(page === "invitations" || page === "checkin") && (
                    <>
                      {page === "checkin" && (
                        <div className="checkin-banner">
                          <span className="scanner-icon">
                            <QrCode size={42} />
                          </span>
                          <div>
                            <h2>Jeden skan. I jesteśmy razem.</h2>
                            <p>
                              Uruchom aparat tabletu, aby otworzyć zaproszenie.
                            </p>
                          </div>
                          <button
                            className="button primary large"
                            onClick={() => setModal("scan")}
                          >
                            <QrCode size={20} />
                            Uruchom skaner
                          </button>
                        </div>
                      )}
                      <section className="panel invitations-panel">
                        <div className="list-toolbar">
                          <div className="search-wrap">
                            <Search size={19} />
                            <input
                              role="combobox"
                              aria-label="Szukaj po nazwisku"
                              aria-expanded={suggest && !!query}
                              aria-controls="family-suggestions"
                              placeholder="Szukaj po nazwisku, telefonie lub e-mailu…"
                              value={query}
                              onChange={(e) => {
                                setQuery(e.target.value);
                                setSuggest(true);
                              }}
                              onFocus={() => setSuggest(true)}
                              onBlur={() =>
                                setTimeout(() => setSuggest(false), 180)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && results.length) {
                                  e.preventDefault();
                                  openProfile(results[0].id);
                                }
                                if (e.key === "Escape") setSuggest(false);
                              }}
                            />
                            {query && (
                              <button
                                className="icon-button small"
                                aria-label="Wyczyść wyszukiwanie"
                                onClick={() => setQuery("")}
                              >
                                <X size={16} />
                              </button>
                            )}
                            {suggest && query && (
                              <div
                                className="suggestions"
                                id="family-suggestions"
                                role="listbox"
                              >
                                {results.slice(0, 6).map((i) => (
                                  <button
                                    role="option"
                                    aria-selected="false"
                                    key={i.id}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => openProfile(i.id)}
                                  >
                                    <span>
                                      <strong>
                                        {i.children
                                          .map(
                                            (c) =>
                                              c.firstName + " " + c.lastName,
                                          )
                                          .join(", ") || i.phone}
                                      </strong>
                                      <small>{fullName(i)}</small>
                                    </span>
                                    <ChevronRight size={16} />
                                  </button>
                                ))}
                                {results.length === 0 && (
                                  <p>Nie znaleziono rodziny.</p>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="result-count">
                            {results.length} zaproszeń
                          </span>
                        </div>
                        <div
                          className="filter-tabs"
                          role="group"
                          aria-label="Filtr zaproszeń"
                        >
                          {[
                            ["all", "Wszystkie"],
                            ["pending", "Do weryfikacji"],
                            ["approved", "Zaakceptowane"],
                            ["inside", "Na miejscu"],
                            ["invited", "Oczekujące"],
                            ["rejected", "Odrzucone"],
                            ["cancelled", "Anulowane"],
                          ].map(([v, label]) => (
                            <button
                              key={v}
                              className={filter === v ? "selected" : ""}
                              onClick={() => setFilter(v)}
                            >
                              {label}
                              {v === "pending" && stats.pending > 0 && (
                                <span>{stats.pending}</span>
                              )}
                            </button>
                          ))}
                        </div>
                        {busy ? (
                          <div className="empty">
                            <Spinner />
                          </div>
                        ) : results.length === 0 ? (
                          <Empty title="Tutaj jeszcze spokojnie">
                            {query
                              ? "Spróbuj innego nazwiska lub numeru telefonu."
                              : "Dodaj zaproszenie lub wybierz inny filtr."}
                          </Empty>
                        ) : (
                          <div className="table-scroll">
                            <table className="invitations-table">
                              <thead>
                                <tr>
                                  <th>RODZINA / KONTAKT</th>
                                  <th>DZIECI</th>
                                  <th>STATUS ZGŁOSZENIA</th>
                                  <th>OBECNOŚĆ</th>
                                  <th>
                                    <span className="sr-only">Akcja</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {results.map((i) => (
                                  <tr
                                    key={i.id}
                                    onClick={() => openProfile(i.id)}
                                  >
                                    <td>
                                      <button
                                        className="table-name"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openProfile(i.id);
                                        }}
                                      >
                                        {fullName(i)}
                                      </button>
                                      <small>{i.phone}</small>
                                    </td>
                                    <td>
                                      <strong>
                                        {i.children
                                          .map((c) => c.firstName)
                                          .join(", ") || "—"}
                                      </strong>
                                      <small>
                                        {i.children.length} / {i.maxChildren}{" "}
                                        miejsc
                                      </small>
                                    </td>
                                    <td>
                                      <Badge status={i.status} />
                                    </td>
                                    <td>
                                      {inside(i) > 0 ? (
                                        <span className="attendance yes">
                                          <Check size={15} />
                                          {inside(i)} na miejscu
                                        </span>
                                      ) : (
                                        <span className="muted">
                                          {i.children.some(
                                            (c) => c.everCheckedIn,
                                          )
                                            ? "Po wyjściu"
                                            : "Jeszcze nie dotarli"}
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      <ChevronRight size={17} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="table-footer">
                          <span>
                            <ShieldCheck size={14} />
                            Prywatna lista uczestników
                          </span>
                          <span>Aktualizacja co 15 sekund</span>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>Z sercem dla naszej społeczności.</span>
          <span>
            Samych Swoich · Dobrzykowice <Heart size={13} />
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={20} />
          {toast}
        </div>
      )}
      {modal === "event" && (
        <Modal title="Nowe wydarzenie" close={closeModal}>
          <EventEditor
            onSave={async (created) => {
              await refreshEvents();
              if (created) setEventId(created.id);
              closeModal();
              notify("Wydarzenie jest gotowe.");
            }}
          />
        </Modal>
      )}
      {modal === "invite" && event && (
        <Modal title="Zaproś rodzinę" close={closeModal}>
          <InviteCreator event={event} onCreated={refresh} />
        </Modal>
      )}
      {modal === "scan" && event && (
        <Modal title="Skanuj zaproszenie" close={closeModal}>
          <Scanner
            onScan={async (code) => {
              const result = await api<{ id: string }>(
                "/events/" + eventId + "/scan",
                "POST",
                { code },
              );
              await openProfile(result.id);
            }}
          />
        </Modal>
      )}
      {profile && event && (
        <Modal title="Profil zaproszenia" close={closeProfile} wide>
          <InvitationProfile
            profile={profile}
            event={event}
            manage={canManage}
            online={online}
            onChange={onChange}
            notify={notify}
          />
        </Modal>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  detail,
  icon: Icon,
  color,
  onClick,
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Users;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={"stat-card " + (onClick ? "clickable" : "")}
      onClick={onClick}
      disabled={!onClick}
    >
      <div>
        <span>{title}</span>
        <span className={"soft-icon " + color}>
          <Icon size={21} />
        </span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <small>{detail}</small>
    </button>
  );
}
function InviteCreator({
  event,
  onCreated,
}: {
  event: Event;
  onCreated: () => Promise<void>;
}) {
  const [phone, setPhone] = useState(""),
    [max, setMax] = useState(1),
    [note, setNote] = useState(""),
    [path, setPath] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="modal-body">
      {path ? (
        <>
          <div className="success-heading">
            <CheckCheck />
            <h3>Zaproszenie jest gotowe</h3>
          </div>
          <CopyLink path={path} />
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await api<{ registrationPath: string }>(
                "/events/" + event.id + "/invitations",
                "POST",
                { phone, maxChildren: max, note },
              );
              setPath(result.registrationPath);
              await onCreated();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="form-intro">
            Zacznij od numeru ze wstępnych zapisów. Rodzic uzupełni pozostałe
            dane przez prywatny link.
          </p>
          <label>
            Numer telefonu rodzica
            <input
              type="tel"
              required
              placeholder="+48 600 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label>
            Maksymalna liczba dzieci
            <input
              type="number"
              required
              min={1}
              max={10}
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
            <small>Rodzic będzie mógł zgłosić najwyżej tyle dzieci.</small>
          </label>
          <label>
            Notatka dla zespołu <span className="optional">opcjonalnie</span>
            <textarea
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Informacja pomocna organizatorowi"
            />
          </label>
          <ErrorBox message={error} />
          <button className="button primary full" disabled={busy}>
            {busy ? <Spinner /> : <LinkIcon size={18} />}Utwórz prywatny link
          </button>
        </form>
      )}
    </div>
  );
}
const localDate = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function EventEditor({
  event,
  onSave,
}: {
  event?: Event;
  onSave: (e?: Event) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: event?.name || "",
    description: event?.description || "",
    location: event?.location || "Świetlica wiejska w Dobrzykowicach",
    startsAt: event ? localDate(event.startsAt) : "",
    endsAt: event ? localDate(event.endsAt) : "",
    capacity: event?.capacity || 120,
    status: event?.status || "draft",
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (event)
      setForm({
        name: event.name,
        description: event.description,
        location: event.location,
        startsAt: localDate(event.startsAt),
        endsAt: localDate(event.endsAt),
        capacity: event.capacity,
        status: event.status,
      });
  }, [event?.id, event?.version]);
  const field = (key: string, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="event-editor panel form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const saved = await api<Event>(
            "/events" + (event ? "/" + event.id : ""),
            event ? "PUT" : "POST",
            {
              ...form,
              startsAt: new Date(form.startsAt).toISOString(),
              endsAt: new Date(form.endsAt).toISOString(),
              version: event?.version,
            },
          );
          await onSave(saved);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{event ? "Szczegóły wydarzenia" : "Zaplanuj dobre spotkanie"}</h2>
      <label>
        Nazwa wydarzenia
        <input
          value={form.name}
          required
          minLength={3}
          maxLength={100}
          onChange={(e) => field("name", e.target.value)}
          placeholder="np. Mikołajki w Dobrzykowicach"
        />
      </label>
      <label>
        Krótki opis
        <textarea
          value={form.description}
          maxLength={1500}
          onChange={(e) => field("description", e.target.value)}
        />
      </label>
      <label>
        Miejsce
        <input
          value={form.location}
          required
          maxLength={200}
          onChange={(e) => field("location", e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Początek
          <input
            type="datetime-local"
            required
            value={form.startsAt}
            onChange={(e) => field("startsAt", e.target.value)}
          />
        </label>
        <label>
          Koniec
          <input
            type="datetime-local"
            required
            value={form.endsAt}
            onChange={(e) => field("endsAt", e.target.value)}
          />
        </label>
      </div>
      <small className="muted">
        Czas w strefie urządzenia:{" "}
        {Intl.DateTimeFormat().resolvedOptions().timeZone}.
      </small>
      <div className="form-grid">
        <label>
          Planowana liczba miejsc
          <input
            type="number"
            required
            min={1}
            max={5000}
            value={form.capacity}
            onChange={(e) => field("capacity", Number(e.target.value))}
          />
        </label>
        <label>
          Status
          <select
            value={form.status}
            onChange={(e) => field("status", e.target.value)}
          >
            {Object.entries(eventStatusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="info-box">
        „Zapisy otwarte” udostępnia formularze rodzicom. „W trakcie” pozwala
        potwierdzać wejścia i wyjścia. „Zakończone” blokuje dalsze zmiany.
      </div>
      <ErrorBox message={error} />
      <button className="button primary" disabled={busy}>
        {busy ? <Spinner /> : <Check size={18} />}Zapisz wydarzenie
      </button>
    </form>
  );
}
function InvitationProfile({
  profile,
  event,
  manage,
  online,
  onChange,
  notify,
}: {
  profile: Profile;
  event: Event;
  manage: boolean;
  online: boolean;
  onChange: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const i = profile.invitation;
  const [editing, setEditing] = useState(false),
    [family, setFamily] = useState<Family>(initialFamily(i)),
    [reason, setReason] = useState(""),
    [note, setNote] = useState(i.note);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<"profile" | "history" | "qr">("profile"),
    [link, setLink] = useState(""),
    [review, setReview] = useState<"rejected" | "cancelled" | null>(null),
    [reviewReason, setReviewReason] = useState("");
  useEffect(() => {
    setFamily(initialFamily(i));
    setNote(i.note);
  }, [i.id, i.version]);
  const base = "/events/" + event.id + "/invitations/" + i.id;
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChange();
      notify(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="profile-content">
      <div className="profile-summary">
        <div className="profile-avatar">
          <Users size={27} />
        </div>
        <div>
          <span className="eyebrow">ZAPROSZENIE RODZINNE</span>
          <h2>
            {i.parents[0]?.lastName
              ? "Rodzina · " + i.parents[0].lastName
              : i.phone}
          </h2>
          <Badge status={i.status} />
        </div>
        <span className="profile-id">#{i.id.slice(0, 8).toUpperCase()}</span>
      </div>
      <div className="profile-tabs">
        <button
          className={tab === "profile" ? "selected" : ""}
          onClick={() => setTab("profile")}
        >
          <Users size={17} />
          Dane i obecność
        </button>
        <button
          className={tab === "history" ? "selected" : ""}
          onClick={() => setTab("history")}
        >
          <History size={17} />
          Historia <span>{profile.history.length}</span>
        </button>
        <button
          className={tab === "qr" ? "selected" : ""}
          onClick={() => setTab("qr")}
        >
          <QrCode size={17} />
          Kod QR
        </button>
      </div>
      <div className="modal-body">
        <ErrorBox message={error} />
        {error && (
          <button
            className="text-button"
            onClick={() => run(onChange, "Odświeżono profil.")}
          >
            Odśwież dane profilu
          </button>
        )}
        {tab === "history" ? (
          <div className="timeline">
            {profile.history.map((a) => (
              <AuditItem key={a.id} audit={a} />
            ))}
          </div>
        ) : tab === "qr" ? (
          i.status === "approved" ? (
            <div className="status-panel">
              <QR code={["SS1", event.id, i.id, i.qrToken].join(".")} />
              <h3>{event.name}</h3>
              <p>
                Kod przypisany do tego zaproszenia. Przy wejściu obsługa
                sprawdzi dane każdego dziecka.
              </p>
              <button
                className="button secondary"
                onClick={() => window.print()}
              >
                Drukuj
              </button>
            </div>
          ) : (
            <Empty title="Kod będzie dostępny po akceptacji">
              Najpierw uzupełnij i zweryfikuj zgłoszenie.
            </Empty>
          )
        ) : editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () =>
                  api(base, "PUT", {
                    ...family,
                    children: family.children.map((c) => ({
                      ...c,
                      id: c.id || undefined,
                    })),
                    version: i.version,
                    reason,
                    note,
                  }),
                "Zapisano zmianę i dodano ją do historii.",
              );
              if (ok) {
                setEditing(false);
                setReason("");
              }
            }}
          >
            <FamilyFields
              value={family}
              onChange={setFamily}
              maxChildren={i.maxChildren}
            />
            {manage && (
              <label>
                Notatka dla zespołu
                <textarea
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            )}
            <label>
              Powód zmiany
              <textarea
                required
                minLength={3}
                maxLength={300}
                placeholder="np. Zamiast Zosi przyszła jej siostra Maja — potwierdzono z rodzicem."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="info-box">
              <History size={18} />
              Poprzednie i nowe dane oraz autor zmiany zostaną zachowane w
              historii.
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(false)}
              >
                Anuluj
              </button>
              <button className="button primary" disabled={busy || !online}>
                {busy ? <Spinner /> : <Check size={18} />}Zapisz zmiany
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="section-label">
              <h3>Dzieci i obecność</h3>
              {event.status !== "closed" &&
                (manage ||
                  (i.status === "approved" && event.status === "live")) && (
                  <button
                    className="text-button"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={15} />
                    Edytuj / zmień dziecko
                  </button>
                )}
            </div>
            {!i.children.length && (
              <div className="info-box">
                Rodzic nie uzupełnił jeszcze danych. Możesz wprowadzić je
                ręcznie.
              </div>
            )}
            <div className="child-cards">
              {i.children.map((c) => (
                <div
                  className={
                    "child-card " +
                    (c.checkedInAt && !c.checkedOutAt ? "is-inside" : "")
                  }
                  key={c.id}
                >
                  <div className="child-info">
                    <span className="child-avatar">
                      {c.firstName[0]}
                      {c.lastName[0]}
                    </span>
                    <div>
                      <strong>
                        {c.firstName} {c.lastName}
                      </strong>
                      <small>
                        {c.checkedInAt && !c.checkedOutAt
                          ? "Na miejscu od " + time(c.checkedInAt)
                          : c.checkedOutAt
                            ? "Wyjście o " + time(c.checkedOutAt)
                            : "Oczekuje na wejście"}
                      </small>
                    </div>
                  </div>
                  <button
                    className={
                      "button " +
                      (c.checkedInAt && !c.checkedOutAt
                        ? "secondary"
                        : "primary")
                    }
                    disabled={
                      busy ||
                      !online ||
                      i.status !== "approved" ||
                      event.status !== "live"
                    }
                    onClick={() =>
                      run(
                        () =>
                          api<{ duplicate: boolean }>(
                            base + "/attendance",
                            "POST",
                            {
                              childId: c.id,
                              direction:
                                c.checkedInAt && !c.checkedOutAt ? "out" : "in",
                              version: i.version,
                            },
                          ),
                        c.checkedInAt && !c.checkedOutAt
                          ? "Wyjście zostało zapisane."
                          : "Wejście zostało potwierdzone.",
                      )
                    }
                  >
                    <DoorOpen size={18} />
                    {c.checkedInAt && !c.checkedOutAt
                      ? "Potwierdź wyjście"
                      : "Potwierdź wejście"}
                  </button>
                </div>
              ))}
            </div>
            {i.status === "approved" && event.status !== "live" && (
              <div className="warning-box">
                Potwierdzanie wejść jest dostępne, gdy wydarzenie ma status „W
                trakcie”.
              </div>
            )}
            <div className="section-label">
              <h3>Rodzice i kontakt</h3>
              <ShieldCheck size={17} />
            </div>
            <div className="contact-panel">
              {i.parents.map((p, n) => (
                <div className="parent-line" key={n}>
                  <span className="contact-label">RODZIC {n + 1}</span>
                  <strong>
                    {p.firstName} {p.lastName}
                  </strong>
                </div>
              ))}
              <div className="contact-links">
                <a href={"tel:" + i.phone}>
                  <Phone size={16} />
                  {i.phone}
                </a>
                {i.secondPhone && (
                  <a href={"tel:" + i.secondPhone}>
                    <Phone size={16} />
                    {i.secondPhone}
                  </a>
                )}
                {i.email && (
                  <a href={"mailto:" + i.email}>
                    <Mail size={16} />
                    {i.email}
                  </a>
                )}
              </div>
            </div>
            {i.note && (
              <div className="note">
                <strong>Notatka dla zespołu</strong>
                <p>{i.note}</p>
              </div>
            )}
            {manage && event.status !== "closed" && (
              <div className="review-actions">
                {i.status === "pending" && (
                  <>
                    <div className="info-box">
                      Sprawdź dane rodziców i dzieci, zanim zatwierdzisz
                      zgłoszenie.
                    </div>
                    <div className="form-actions">
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => setReview("rejected")}
                      >
                        Poproś o poprawę
                      </button>
                      <button
                        className="button primary"
                        disabled={busy || !online}
                        onClick={() =>
                          run(
                            () =>
                              api(base + "/review", "POST", {
                                status: "approved",
                                version: i.version,
                              }),
                            "Zgłoszenie zaakceptowane. Kod QR jest już dostępny.",
                          )
                        }
                      >
                        <CheckCheck size={18} />
                        Akceptuj zgłoszenie
                      </button>
                    </div>
                  </>
                )}
                {review && (
                  <form
                    className="review-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await run(
                          () =>
                            api(base + "/review", "POST", {
                              status: review,
                              reason: reviewReason,
                              version: i.version,
                            }),
                          "Zapisano decyzję.",
                        )
                      ) {
                        setReview(null);
                        setReviewReason("");
                      }
                    }}
                  >
                    <label>
                      Powód{" "}
                      {review === "rejected"
                        ? "prośby o poprawę"
                        : "anulowania"}
                      <input
                        required
                        minLength={3}
                        maxLength={300}
                        value={reviewReason}
                        onChange={(e) => setReviewReason(e.target.value)}
                      />
                    </label>
                    <div className="form-actions">
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => setReview(null)}
                      >
                        Wróć
                      </button>
                      <button disabled={busy} className="button danger">
                        Potwierdź decyzję
                      </button>
                    </div>
                  </form>
                )}
                <div className="profile-tools">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const r = await api<{ registrationPath: string }>(
                          base + "/rotate-link",
                          "POST",
                          {},
                        );
                        setLink(r.registrationPath);
                      }, "Wygenerowano nowy link. Poprzedni przestał działać.")
                    }
                  >
                    <LinkIcon size={15} />
                    Wygeneruj nowy link dla rodzica
                  </button>
                  {!["cancelled"].includes(i.status) && (
                    <button
                      className="text-button danger-text"
                      disabled={busy || inside(i) > 0}
                      onClick={() => setReview("cancelled")}
                    >
                      Anuluj zaproszenie
                    </button>
                  )}
                </div>
                {link && <CopyLink path={link} />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
const fieldNames: Record<string, string> = {
  parents: "Rodzice",
  children: "Dzieci / obecność",
  phone: "Telefon",
  secondPhone: "Drugi telefon",
  email: "E-mail",
  status: "Status",
  note: "Notatka",
  maxChildren: "Limit dzieci",
  expiresAt: "Ważność linku",
};
function showValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v))
    return (
      v
        .map((p) =>
          typeof p === "object" && p !== null
            ? [
                p.firstName,
                p.lastName,
                p.checkedInAt
                  ? "wejście " +
                    date(p.checkedInAt, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Warsaw",
                    })
                  : "",
                p.checkedOutAt ? "wyjście " + time(p.checkedOutAt) : "",
              ]
                .filter(Boolean)
                .join(" ")
            : String(p),
        )
        .join("; ") || "—"
    );
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
function AuditItem({ audit: a }: { audit: Audit }) {
  return (
    <div className="timeline-item">
      <span className="timeline-dot" />
      <div className="timeline-heading">
        <strong>{a.action}</strong>
        <time>
          {date(a.at, {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Warsaw",
          })}
        </time>
      </div>
      <small>{a.actor}</small>
      {a.reason && <p className="audit-reason">{a.reason}</p>}
      {a.changes.filter((c) => fieldNames[c.field]).length > 0 && (
        <details>
          <summary>Zobacz zmienione dane</summary>
          {a.changes
            .filter((c) => fieldNames[c.field])
            .map((c) => (
              <div className="audit-change" key={c.field}>
                <b>{fieldNames[c.field]}</b>
                <span className="before">{showValue(c.before)}</span>
                <span>→ {showValue(c.after)}</span>
              </div>
            ))}
        </details>
      )}
    </div>
  );
}
function Team({
  events,
  notify,
}: {
  events: Event[];
  notify: (s: string) => void;
}) {
  const blank: Staff = {
    email: "",
    name: "",
    role: "crew",
    eventIds: [],
    active: true,
  };
  const [members, setMembers] = useState<Staff[]>([]),
    [form, setForm] = useState<Staff>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => api<Staff[]>("/staff").then(setMembers);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const close = useCallback(() => setForm(undefined), []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LUDZIE, KTÓRZY TWORZĄ WYDARZENIA</span>
          <h1>Dobry zespół. Jasne role.</h1>
          <p>Udostępnij właściwe wydarzenia właściwym osobom.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setForm({ ...blank })}
        >
          <Plus size={18} />
          Dodaj osobę
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="panel">
        <div className="table-scroll">
          <table className="invitations-table">
            <thead>
              <tr>
                <th>OSOBA</th>
                <th>ROLA</th>
                <th>WYDARZENIA</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.email}>
                  <td>
                    <strong>{m.name}</strong>
                    <small>{m.email}</small>
                  </td>
                  <td>{roleLabels[m.role]}</td>
                  <td>
                    {m.role === "admin"
                      ? "Wszystkie wydarzenia"
                      : m.eventIds
                          .map(
                            (id) =>
                              events.find((e) => e.id === id)?.name ||
                              "Archiwalne",
                          )
                          .join(", ") || "Nie przypisano"}
                  </td>
                  <td>{m.active ? "Aktywne" : "Wyłączone"}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={"Edytuj " + m.name}
                      onClick={() => setForm({ ...m })}
                    >
                      <Pencil size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {form && (
        <Modal title="Osoba w zespole" close={close}>
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("/staff", "POST", form);
                await load();
                setForm(undefined);
                notify("Zapisano uprawnienia.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="form-intro">
              Osoba zaloguje się kontem Microsoft o podanym adresie e-mail.
              Rodzice nie potrzebują kont.
            </p>
            <label>
              Imię i nazwisko
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              E-mail konta Microsoft
              <input
                required
                type="email"
                value={form.email}
                readOnly={members.some((m) => m.email === form.email)}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Rola
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as Staff["role"] })
                }
              >
                {Object.entries(roleLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="info-box">
              {form.role === "admin"
                ? "Wszystkie prawa do platformy i wszystkich wydarzeń."
                : form.role === "event_admin"
                  ? "Zarządzanie przypisanymi wydarzeniami, rodzicami, dziećmi i akceptacją zgłoszeń."
                  : "Wyszukiwanie i skanowanie zaproszeń, poprawianie danych przy wejściu, potwierdzanie wejść i wyjść."}
            </div>
            {form.role !== "admin" && (
              <fieldset>
                <legend>Dostęp do wydarzeń</legend>
                {events.map((e) => (
                  <label className="checkbox-label" key={e.id}>
                    <input
                      type="checkbox"
                      checked={form.eventIds.includes(e.id)}
                      onChange={(ev) =>
                        setForm({
                          ...form,
                          eventIds: ev.target.checked
                            ? [...form.eventIds, e.id]
                            : form.eventIds.filter((id) => id !== e.id),
                        })
                      }
                    />
                    {e.name}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Konto aktywne
            </label>
            <ErrorBox message={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? <Spinner /> : <Check size={18} />}Zapisz uprawnienia
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Platform({
  config,
  onConfig,
  notify,
}: {
  config: Settings;
  onConfig: (s: Settings) => void;
  notify: (s: string) => void;
}) {
  const [form, setForm] = useState(config),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRZESTRZEŃ STOWARZYSZENIA</span>
          <h1>Czas na spotkania. Czas na przerwę.</h1>
          <p>Zarządzaj dostępnością platformy między wydarzeniami.</p>
        </div>
      </div>
      <form
        className="panel form-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await api<Settings>("/settings", "PUT", form);
            onConfig(result);
            notify("Zapisano ustawienia platformy.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Dostępność platformy</h2>
        <label className="toggle-row">
          <span>
            <strong>Przerwa między wydarzeniami</strong>
            <small>
              Pokaż stronę z logo i wiadomością. Wstrzymaj zapisy i obsługę
              wejść.
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={form.paused}
            onChange={(e) => setForm({ ...form, paused: e.target.checked })}
          />
        </label>
        <label>
          Wiadomość na stronie powitalnej
          <textarea
            required
            minLength={3}
            maxLength={300}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </label>
        <div className="info-box">
          Dane pozostają zapisane. Administrator może w każdej chwili zalogować
          się i wznowić działanie platformy.
        </div>
        <ErrorBox message={error} />
        <button className="button primary" disabled={busy}>
          {busy ? <Spinner /> : <Check size={18} />}Zapisz ustawienia
        </button>
      </form>
    </>
  );
}
