import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  X,
  Plus,
  Trash2,
  Camera,
  AlertCircle,
  Copy,
  Check,
  LoaderCircle,
} from "lucide-react";
import QRCode from "qrcode";
import type { Parent, Child, InvitationView } from "../shared/types";
import { invitationStatusLabels } from "../shared/types";
export function Spinner() {
  return <LoaderCircle className="spin" size={20} aria-label="Ładowanie" />;
}
export function Badge({ status }: { status: InvitationView["status"] }) {
  return (
    <span className={"badge " + status}>
      <span />
      {invitationStatusLabels[status]}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">✦</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const focusable = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ) || [],
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Zamknij">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const url = location.origin + path;
  return (
    <div className="copy-block">
      <p>Przekaż ten prywatny link rodzicowi. Nie wysyłamy go automatycznie.</p>
      <div className="copy-row">
        <input
          aria-label="Link dla rodzica"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
        />
        <button
          className="button primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setError("Zaznacz i skopiuj link z pola.");
            }
          }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}{" "}
          {copied ? "Skopiowano" : "Kopiuj"}
        </button>
      </div>
      {error && <p>{error}</p>}
      <small>
        Link daje dostęp do danych tej rodziny. Udostępniaj go tylko właściwemu
        rodzicowi.
      </small>
    </div>
  );
}
export function QR({ code }: { code: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(code, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#143e35", light: "#ffffff" },
    }).then(setSrc);
  }, [code]);
  return src ? (
    <img className="qr-image" src={src} alt="Indywidualny kod QR zaproszenia" />
  ) : (
    <Spinner />
  );
}
export type Family = {
  parents: Parent[];
  children: Pick<Child, "id" | "firstName" | "lastName">[];
  phone: string;
  secondPhone: string;
  email: string;
};
export function FamilyFields({
  value,
  onChange,
  maxChildren,
  phoneReadOnly = false,
}: {
  value: Family;
  onChange: (v: Family) => void;
  maxChildren: number;
  phoneReadOnly?: boolean;
}) {
  const changeParent = (i: number, field: keyof Parent, s: string) =>
    onChange({
      ...value,
      parents: value.parents.map((p, n) =>
        n === i ? { ...p, [field]: s } : p,
      ),
    });
  const changeChild = (i: number, field: "firstName" | "lastName", s: string) =>
    onChange({
      ...value,
      children: value.children.map((p, n) =>
        n === i ? { ...p, [field]: s } : p,
      ),
    });
  return (
    <div className="family-fields">
      <div className="section-label">
        <h3>Rodzice / opiekunowie</h3>
        <span>Co najmniej jedna osoba</span>
      </div>
      {value.parents.map((p, i) => (
        <div className="person-field" key={i}>
          <div className="person-title">
            Rodzic {i + 1}
            {i > 0 && (
              <button
                type="button"
                className="text-button danger-text"
                onClick={() =>
                  onChange({
                    ...value,
                    parents: value.parents.filter((_, n) => i !== n),
                  })
                }
              >
                Usuń
              </button>
            )}
          </div>
          <div className="form-grid">
            <label>
              Imię
              <input
                required
                maxLength={80}
                autoComplete="given-name"
                value={p.firstName}
                onChange={(e) => changeParent(i, "firstName", e.target.value)}
              />
            </label>
            <label>
              Nazwisko
              <input
                required
                maxLength={80}
                autoComplete="family-name"
                value={p.lastName}
                onChange={(e) => changeParent(i, "lastName", e.target.value)}
              />
            </label>
          </div>
        </div>
      ))}
      {value.parents.length < 2 && (
        <button
          className="text-button"
          type="button"
          onClick={() =>
            onChange({
              ...value,
              parents: [...value.parents, { firstName: "", lastName: "" }],
            })
          }
        >
          <Plus size={16} />
          Dodaj drugiego rodzica
        </button>
      )}
      <div className="form-grid">
        <label>
          Telefon kontaktowy
          <input
            required
            type="tel"
            autoComplete="tel"
            readOnly={phoneReadOnly}
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
          />
        </label>
        <label>
          Drugi telefon <span className="optional">opcjonalnie</span>
          <input
            type="tel"
            value={value.secondPhone}
            onChange={(e) =>
              onChange({ ...value, secondPhone: e.target.value })
            }
          />
        </label>
      </div>
      <label>
        Adres e-mail
        <input
          required
          type="email"
          autoComplete="email"
          maxLength={254}
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
      </label>
      <div className="section-label">
        <h3>Dzieci</h3>
        <span>
          {value.children.length} z {maxChildren} miejsc w zaproszeniu
        </span>
      </div>
      {value.children.map((c, i) => (
        <div className="person-field" key={c.id || i}>
          <div className="person-title">
            Dziecko {i + 1}
            {value.children.length > 1 && (
              <button
                type="button"
                className="icon-button small"
                aria-label={"Usuń dziecko " + (i + 1)}
                onClick={() =>
                  onChange({
                    ...value,
                    children: value.children.filter((_, n) => n !== i),
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className="form-grid">
            <label>
              Imię dziecka
              <input
                required
                maxLength={80}
                value={c.firstName}
                onChange={(e) => changeChild(i, "firstName", e.target.value)}
              />
            </label>
            <label>
              Nazwisko dziecka
              <input
                required
                maxLength={80}
                value={c.lastName}
                onChange={(e) => changeChild(i, "lastName", e.target.value)}
              />
            </label>
          </div>
        </div>
      ))}
      {value.children.length < maxChildren && (
        <button
          type="button"
          className="text-button"
          onClick={() =>
            onChange({
              ...value,
              children: [
                ...value.children,
                { id: "", firstName: "", lastName: "" },
              ],
            })
          }
        >
          <Plus size={16} />
          Dodaj kolejne dziecko
        </button>
      )}
    </div>
  );
}
export function Scanner({
  onScan,
}: {
  onScan: (code: string) => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null),
    scanRef = useRef(onScan);
  scanRef.current = onScan;
  const [error, setError] = useState(""),
    [manual, setManual] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false,
      controls: { stop: () => void } | undefined,
      handling = false;
    import("@zxing/browser").then(async ({ BrowserQRCodeReader }) => {
      const reader = new BrowserQRCodeReader();
      try {
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video.current!,
          async (result) => {
            if (!result || handling || cancelled) return;
            handling = true;
            try {
              await scanRef.current(result.getText());
            } catch (e) {
              setError((e as Error).message);
              setTimeout(() => {
                handling = false;
              }, 2000);
            }
          },
        );
        if (cancelled) controls.stop();
      } catch {
        if (!cancelled)
          setError(
            "Nie można uruchomić aparatu. Zezwól na dostęp w przeglądarce lub wyszukaj rodzinę po nazwisku.",
          );
      }
    });
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);
  return (
    <div className="scanner">
      <div className="camera-frame">
        <video ref={video} muted playsInline />
        <div className="scan-corners" />
        <div className="camera-caption">
          <Camera size={18} />
          Ustaw kod QR w ramce
        </div>
      </div>
      <ErrorBox message={error} />
      <p className="muted">
        Kod otwiera profil. Wejście potwierdzisz po sprawdzeniu danych.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onScan(manual);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Kod z zaproszenia
          <input
            placeholder="SS1.…"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            required
          />
        </label>
        <button className="button secondary full" disabled={busy}>
          {busy ? <Spinner /> : null}Otwórz zaproszenie
        </button>
      </form>
    </div>
  );
}
