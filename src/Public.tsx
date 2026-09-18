import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  ShieldCheck,
  Check,
  Clock3,
  Heart,
} from "lucide-react";
import { api, date, time } from "./api";
import { ErrorBox, FamilyFields, QR, Spinner, type Family } from "./components";
import type { Event, InvitationView, Settings } from "../shared/types";
type Registration = {
  event: Pick<Event, "name" | "location" | "startsAt" | "endsAt">;
  invitation: InvitationView & { qrCode?: string };
};
export function Brand() {
  return (
    <a href="/" className="brand">
      <img src="/logo.png" alt="Sami Swoi Dobrzykowice" />
      <span>
        samych swoich<span>WYDARZENIA</span>
      </span>
    </a>
  );
}
export function Landing({
  settings,
  error,
}: {
  settings: Settings;
  error?: string;
}) {
  return (
    <div className="public-page">
      <header>
        <Brand />
        <span className="eyebrow">DOBRZYKOWICE · RAZEM OD POKOLEŃ</span>
      </header>
      <main className="landing-card">
        <div className="landing-flower">
          <Heart size={42} />
        </div>
        <span className="eyebrow">DOBRZE BYĆ RAZEM</span>
        <h1>
          Małe spotkania.
          <br />
          <em>Wielka radość.</em>
        </h1>
        <p>
          {settings.paused
            ? settings.message
            : "Tworzymy dobre wspomnienia dla najmłodszych i naszej lokalnej społeczności. Witamy na platformie wydarzeń Samych Swoich."}
        </p>
        <div className="landing-notice">
          <ShieldCheck size={22} />
          <div>
            <strong>Masz zaproszenie na wydarzenie?</strong>
            <span>
              Otwórz prywatny link otrzymany od organizatora, aby zgłosić dzieci
              i odebrać kod QR.
            </span>
          </div>
        </div>
        <ErrorBox message={error || ""} />
        <a
          className="button primary"
          href="/.auth/login/aad?post_login_redirect_uri=/"
        >
          Logowanie dla zespołu <ArrowRight size={18} />
        </a>
        <small>Dostęp dla administratorów i obsługi wydarzeń</small>
      </main>
      <PublicFooter />
    </div>
  );
}
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <span>
        © {new Date().getFullYear()} Dobrzykowickie Stowarzyszenie Samych Swoich
      </span>
      <a href="/prywatnosc">Informacja o danych osobowych</a>
    </footer>
  );
}
export function Privacy() {
  return (
    <div className="public-page">
      <header>
        <Brand />
      </header>
      <main className="public-card prose">
        <span className="eyebrow">TWOJE DANE</span>
        <h1>Informacja dla rodziców</h1>
        <p>
          Organizatorem wydarzeń i administratorem danych w tej platformie jest
          Dobrzykowickie Stowarzyszenie Samych Swoich.
        </p>
        <h2>Jakie dane zapisujemy?</h2>
        <p>
          Imiona i nazwiska dzieci oraz jednego lub dwóch rodziców, kontaktowy
          numer telefonu, adres e-mail i opcjonalny drugi numer telefonu.
          Zapisujemy też status zgłoszenia, wejścia i wyjścia oraz historię
          zmian z informacją o osobie, która je wykonała.
        </p>
        <h2>Po co są potrzebne?</h2>
        <p>
          Służą organizacji wskazanego wydarzenia, weryfikacji zaproszenia,
          kontaktowi z rodzicem i kontroli obecności dzieci. Dostęp ma
          upoważniony zespół organizatora, zgodnie z rolą przypisaną do
          wydarzenia.
        </p>
        <h2>Prywatny link i kod QR</h2>
        <p>
          Link pozwala otworzyć zgłoszenie bez konta. Przechowuj go bezpiecznie
          i nie publikuj. Kod QR zawiera losowy identyfikator, a dane rodziny
          może wyświetlić po jego zeskanowaniu wyłącznie zalogowana obsługa
          wydarzenia.
        </p>
        <h2>Kontakt i usunięcie danych</h2>
        <p>
          W sprawach poprawienia danych, uzyskania ich kopii lub usunięcia
          skontaktuj się z organizatorem, od którego otrzymałeś zaproszenie.
          Dane są przechowywane w usłudze Microsoft Azure, w regionie
          europejskim.
        </p>
        <p>
          Organizator przekazuje informacje o zasadach uczestnictwa, podstawie
          przetwarzania i okresie przechowywania danych wraz z zaproszeniem na
          konkretne wydarzenie.
        </p>
        <a href="/" className="button secondary">
          Wróć na stronę główną
        </a>
      </main>
      <PublicFooter />
    </div>
  );
}
export function RegistrationPage({ path }: { path: string }) {
  const [data, setData] = useState<Registration>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ack, setAck] = useState(false);
  const [family, setFamily] = useState<Family>({
    parents: [{ firstName: "", lastName: "" }],
    children: [{ id: "", firstName: "", lastName: "" }],
    phone: "",
    secondPhone: "",
    email: "",
  });
  async function load(initial = false) {
    try {
      const result = await api<Registration>("/public/registration/" + path);
      setData(result);
      if (initial)
        setFamily({
          parents: result.invitation.parents.length
            ? result.invitation.parents
            : [{ firstName: "", lastName: "" }],
          children: result.invitation.children.length
            ? result.invitation.children
            : [{ id: "", firstName: "", lastName: "" }],
          phone: result.invitation.phone,
          secondPhone: result.invitation.secondPhone,
          email: result.invitation.email,
        });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load(true);
  }, [path]);
  useEffect(() => {
    if (data?.invitation.status !== "pending") return;
    const t = setInterval(() => load(), 20000);
    return () => clearInterval(t);
  }, [data?.invitation.status]);
  const status = data?.invitation.status;
  const canEdit = status === "invited" || status === "rejected";
  return (
    <div className="public-page">
      <header>
        <Brand />
        <span className="secure-label">
          <ShieldCheck size={16} />
          Prywatne zaproszenie
        </span>
      </header>
      <main className="public-card">
        <span className="eyebrow">SPOTKAJMY SIĘ W DOBRZYKOWICACH</span>
        <h1>{data?.event.name || "Twoje zaproszenie"}</h1>
        {data && (
          <div className="event-meta">
            <span>
              <CalendarDays size={17} />
              {date(data.event.startsAt)} · {time(data.event.startsAt)}
            </span>
            <span>
              <MapPin size={17} />
              {data.event.location}
            </span>
          </div>
        )}
        <ErrorBox message={error} />
        {!data && !error && <Spinner />}
        {data && canEdit && (
          <>
            <div className="info-box">
              Uzupełnij dane rodziny. Organizator sprawdzi zgłoszenie, a po
              akceptacji w tym miejscu pojawi się kod QR.
            </div>
            {status === "rejected" && (
              <div className="warning-box">
                Zgłoszenie wymaga poprawy. Skontaktuj się z organizatorem,
                popraw dane i wyślij je ponownie.
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api("/public/registration/" + path, "POST", {
                    ...family,
                    children: family.children.map((c) => ({
                      firstName: c.firstName,
                      lastName: c.lastName,
                    })),
                    version: data.invitation.version,
                    acknowledged: ack,
                  });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FamilyFields
                value={family}
                onChange={setFamily}
                maxChildren={data.invitation.maxChildren}
                phoneReadOnly
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  required
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span>
                  Potwierdzam poprawność danych i zapoznanie się z{" "}
                  <a href="/prywatnosc" target="_blank" rel="noreferrer">
                    informacją o danych osobowych
                  </a>{" "}
                  oraz zasadami przekazanymi przez organizatora.
                </span>
              </label>
              <button className="button primary full large" disabled={busy}>
                {busy ? <Spinner /> : <ArrowRight size={18} />}Wyślij zgłoszenie
                do weryfikacji
              </button>
            </form>
          </>
        )}
        {status === "pending" && (
          <div className="status-panel">
            <div className="status-symbol amber">
              <Clock3 size={35} />
            </div>
            <h2>Zgłoszenie dotarło!</h2>
            <p>
              Organizator sprawdzi dane Twojej rodziny. Zachowaj ten link — po
              akceptacji pojawi się tutaj zaproszenie z kodem QR.
            </p>
            <button className="button secondary" onClick={() => load()}>
              Sprawdź status
            </button>
          </div>
        )}
        {status === "approved" && data && (
          <div className="status-panel approved-panel">
            <div className="status-symbol">
              <Check size={35} />
            </div>
            <h2>Do zobaczenia na wydarzeniu!</h2>
            <p>
              Zgłoszenie zostało zaakceptowane. Pokaż poniższy kod przy wejściu.
              Możesz zrobić zrzut ekranu lub wydrukować zaproszenie.
            </p>
            <QR code={data.invitation.qrCode!} />
            <div className="ticket-names">
              {data.invitation.children.map((c) => (
                <strong key={c.id}>
                  {c.firstName} {c.lastName}
                </strong>
              ))}
            </div>
            <button
              className="button secondary no-print"
              onClick={() => window.print()}
            >
              Drukuj zaproszenie
            </button>
            <small>
              Kod jest wspólny dla dzieci z tego zaproszenia. Obsługa potwierdza
              wejście każdego dziecka osobno.
            </small>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
