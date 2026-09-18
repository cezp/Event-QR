import Fastify, { type FastifyRequest } from "fastify";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z, ZodError } from "zod";
import { Conflict, type Store, type Row } from "./store";
import type {
  Audit,
  Event,
  Invitation,
  Staff,
  Settings,
} from "../shared/types";

const name = z
  .string()
  .trim()
  .min(1, "Wpisz imię i nazwisko.")
  .max(80)
  .regex(/^[\p{L}\p{M} .'-]+$/u, "Wpisz poprawne imię lub nazwisko.");
const phone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?\d{9,15}$/, "Wpisz poprawny numer telefonu."));
const parentSchema = z.object({ firstName: name, lastName: name });
const childSchema = parentSchema.extend({ id: z.string().uuid().optional() });
const familySchema = z.object({
  parents: z
    .array(parentSchema)
    .min(1, "Wymagany jest co najmniej jeden rodzic.")
    .max(2),
  children: z.array(childSchema).min(1).max(10),
  email: z.string().trim().email("Wpisz poprawny adres e-mail.").max(254),
  phone,
  secondPhone: z.union([phone, z.literal("")]).default(""),
});
const eventSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().max(1500).default(""),
    location: z.string().trim().min(2).max(200),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    status: z.enum(["draft", "open", "live", "closed"]).default("draft"),
    capacity: z.number().int().min(1).max(5000),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: "Koniec wydarzenia musi być późniejszy niż początek.",
  });
const staffSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((s) => s.toLowerCase()),
  name: z.string().trim().min(2).max(100),
  role: z.enum(["admin", "event_admin", "crew"]),
  eventIds: z.array(z.string().uuid()).max(100),
  active: z.boolean(),
});
const editSchema = familySchema.extend({
  version: z.string().min(1),
  reason: z.string().trim().min(3, "Podaj powód zmiany.").max(300),
  note: z.string().trim().max(1000).default(""),
});
const uuid = z.string().uuid();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("hex");
const now = () => new Date().toISOString();
const fail = (statusCode: number, message: string): never => {
  throw Object.assign(new Error(message), { statusCode });
};
const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function view(row: Row<Invitation>) {
  const { registrationHash, ...rest } = row.value;
  return { ...rest, version: row.version };
}
function changes(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return Object.keys(after)
    .filter(
      (k) =>
        !["registrationHash", "qrToken", "version", "updatedAt"].includes(k) &&
        JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    )
    .map((field) => ({
      field,
      before: before[field] ?? null,
      after: after[field] ?? null,
    }));
}
export interface Principal {
  userId: string;
  userDetails: string;
  identityProvider: string;
  userRoles: string[];
}
export function readPrincipal(req: FastifyRequest): Principal | undefined {
  try {
    const raw = req.headers["x-ms-client-principal"];
    if (typeof raw !== "string") return;
    const p = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8"),
    ) as Principal;
    if (
      p.identityProvider === "aad" &&
      p.userRoles?.includes("authenticated") &&
      p.userId &&
      p.userDetails
    )
      return p;
  } catch {
    return;
  }
}
export function createApp(
  store: Store,
  options: {
    bootstrapEmail?: string;
    local?: boolean;
    principal?: (req: FastifyRequest) => Principal | undefined;
  } = {},
) {
  const app = Fastify({ bodyLimit: 32768, logger: false });
  const getPrincipal = options.principal || readPrincipal;
  const settings = async () =>
    (await store.get<Settings>("system", "settings"))?.value || {
      paused: false,
      message:
        "Kolejne dobre chwile już wkrótce. Do zobaczenia na naszych wydarzeniach!",
    };
  async function staff(req: FastifyRequest): Promise<Staff> {
    const p = getPrincipal(req);
    if (!p) return fail(401, "Zaloguj się kontem Microsoft.");
    const email = p.userDetails.toLowerCase();
    const key = hash(email);
    let row = await store.get<Staff>("users", key);
    if (!row && email === options.bootstrapEmail?.toLowerCase()) {
      try {
        await store.commit("users", [
          {
            key,
            create: true,
            value: {
              email,
              name: "Administrator",
              role: "admin",
              active: true,
              eventIds: [],
              principalId: p.userId,
            },
          },
        ]);
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
      }
      row = await store.get<Staff>("users", key);
    }
    if (!row)
      return fail(
        403,
        `Konto „${email}” nie jest dodane do zespołu. Poproś administratora o nadanie dostępu.`,
      );
    if (!row.value.active)
      return fail(403, `Dostęp konta „${email}” został wyłączony.`);
    if (row.value.principalId && row.value.principalId !== p.userId)
      return fail(
        403,
        "Konto Microsoft nie zgadza się z przypisanym kontem. Skontaktuj się z administratorem.",
      );
    if (!row.value.principalId) {
      await store.commit("users", [
        {
          key,
          value: { ...row.value, principalId: p.userId },
          version: row.version,
        },
      ]);
    }
    return row.value;
  }
  async function authorize(
    req: FastifyRequest,
    eventId?: string,
    manage = false,
  ) {
    const u = await staff(req);
    if (
      u.role !== "admin" &&
      (!eventId ||
        !u.eventIds.includes(eventId) ||
        (manage && u.role !== "event_admin"))
    )
      return fail(403, "Nie masz uprawnień do tej operacji.");
    if ((await settings()).paused)
      return fail(503, "Platforma jest chwilowo wstrzymana.");
    return u;
  }
  async function eventById(id: string) {
    uuid.parse(id);
    const r = await store.get<Event>("events", id);
    if (!r) return fail(404, "Nie znaleziono wydarzenia.");
    return r;
  }
  async function inviteById(eventId: string, id: string) {
    uuid.parse(eventId);
    uuid.parse(id);
    const r = await store.get<Invitation>(eventId, "invite_" + id);
    if (!r) return fail(404, "Nie znaleziono zaproszenia.");
    return r;
  }
  async function auditWrite(
    partition: string,
    key: string,
    value: unknown,
    previous: Row | undefined,
    actor: string,
    action: string,
    invitationId?: string,
    reason?: string,
  ) {
    const audit: Audit = {
      id: randomUUID(),
      at: now(),
      actor,
      action,
      invitationId,
      reason,
      changes: changes(
        (previous?.value || {}) as Record<string, unknown>,
        value as Record<string, unknown>,
      ),
    };
    await store.commit(partition, [
      {
        key,
        value,
        ...(previous ? { version: previous.version } : { create: true }),
      },
      { key: "audit_" + audit.at + "_" + audit.id, value: audit, create: true },
    ]);
  }
  async function publicInvitation(req: FastifyRequest) {
    if ((await settings()).paused)
      return fail(503, "Zapisy są chwilowo wstrzymane.");
    const p = req.params as { eventId: string; id: string; token: string };
    tokenSchema.parse(p.token);
    const row = await inviteById(p.eventId, p.id);
    if (!safeEqual(row.value.registrationHash, hash(p.token)))
      return fail(404, "Link jest nieprawidłowy lub został zastąpiony nowym.");
    if (row.value.expiresAt < now())
      return fail(410, "Ten link wygasł. Skontaktuj się z organizatorem.");
    const event = await eventById(p.eventId);
    if (event.value.status === "closed" || event.value.status === "draft")
      return fail(410, "Zapisy na to wydarzenie są zamknięte.");
    if (row.value.status === "cancelled")
      return fail(410, "Zaproszenie zostało anulowane.");
    return { row, event: event.value };
  }
  // A shared storage counter also works across cold starts and multiple workers.
  async function throttle(key: string, limit = 20) {
    const slot = Math.floor(Date.now() / 60000);
    const k = hash(key);
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await store.get<{ slot: number; count: number }>(
        "ratelimit",
        k,
      );
      const count = row?.value.slot === slot ? row.value.count : 0;
      if (count >= limit)
        return fail(429, "Zbyt wiele prób. Spróbuj za minutę.");
      try {
        await store.commit("ratelimit", [
          {
            key: k,
            value: { slot, count: count + 1 },
            ...(row ? { version: row.version } : { create: true }),
          },
        ]);
        return;
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
      }
    }
    return fail(429, "Spróbuj ponownie za chwilę.");
  }
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store, private")
      .header("X-Content-Type-Options", "nosniff");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      if (
        req.headers["x-event-request"] !== "1" ||
        !req.headers["content-type"]?.startsWith("application/json")
      )
        return fail(403, "Nieprawidłowe żądanie.");
      const site = req.headers["sec-fetch-site"];
      if (site === "cross-site")
        return fail(403, "Żądanie z innej witryny jest niedozwolone.");
    }
  });
  app.setErrorHandler((e, _req, reply) => {
    if (e instanceof ZodError)
      return reply
        .status(400)
        .send({ error: e.issues.map((i) => i.message).join(" ") });
    if (e instanceof Conflict)
      return reply.status(409).send({ error: e.message });
    const err = e as { statusCode?: number; message?: string };
    const code =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : err.statusCode === 503
          ? 503
          : 500;
    if (code === 500)
      console.error(
        "API failure",
        e instanceof Error ? e.name : "UnknownError",
      );
    return reply.status(code).send({
      error:
        code === 500
          ? "Nie udało się zapisać danych. Spróbuj ponownie."
          : err.message,
    });
  });
  app.get("/api/health", async () => {
    await settings();
    return { status: "ok" };
  });
  app.get("/api/public/config", settings);
  app.get("/api/me", async (req) => ({
    user: await staff(req),
    local: !!options.local,
  }));
  app.get("/api/events", async (req) => {
    const u = await staff(req);
    return (await store.list<Event>("events"))
      .filter((r) => "startsAt" in r.value)
      .map((r) => ({ ...r.value, version: r.version }))
      .filter((e) => u.role === "admin" || u.eventIds.includes(e.id))
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  });
  app.post("/api/events", async (req) => {
    const u = await authorize(req);
    const data = eventSchema.parse(req.body);
    const event: Event = {
      ...data,
      id: randomUUID(),
      createdAt: now(),
      version: "",
    };
    await auditWrite(
      "events",
      event.id,
      event,
      undefined,
      u.email,
      "Utworzono wydarzenie",
    );
    return { ...event, version: (await eventById(event.id)).version };
  });
  app.put("/api/events/:eventId", async (req) => {
    const { eventId } = req.params as { eventId: string };
    const u = await authorize(req, eventId, true);
    const r = await eventById(eventId);
    const data = eventSchema.parse(req.body);
    const version = z.object({ version: z.string() }).parse(req.body).version;
    if (version !== r.version)
      throw new Conflict("Wydarzenie zostało zmienione. Odśwież stronę.");
    if (data.status === "closed") {
      const invites = await store.list<Invitation>(eventId, "invite_");
      if (
        invites.some((i) =>
          i.value.children.some((c) => c.checkedInAt && !c.checkedOutAt),
        )
      )
        return fail(400, "Najpierw odnotuj wyjście wszystkich dzieci.");
    }
    await auditWrite(
      "events",
      eventId,
      { ...r.value, ...data },
      r,
      u.email,
      "Zmieniono wydarzenie",
    );
    return { ...r.value, ...data, version: (await eventById(eventId)).version };
  });
  app.get("/api/events/:eventId/invitations", async (req) => {
    const { eventId } = req.params as { eventId: string };
    await authorize(req, eventId);
    await eventById(eventId);
    return (await store.list<Invitation>(eventId, "invite_"))
      .map((r) => {
        const { qrToken, ...summary } = view(r);
        return summary;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  app.post("/api/events/:eventId/invitations", async (req) => {
    const { eventId } = req.params as { eventId: string };
    const u = await authorize(req, eventId, true);
    const event = (await eventById(eventId)).value;
    if (event.status === "closed")
      return fail(400, "Wydarzenie zostało zakończone.");
    const data = z
      .object({
        phone,
        maxChildren: z.number().int().min(1).max(10),
        note: z.string().max(1000).default(""),
      })
      .parse(req.body);
    const rawToken = token();
    const inv: Invitation = {
      ...data,
      id: randomUUID(),
      eventId,
      parents: [],
      children: [],
      email: "",
      secondPhone: "",
      status: "invited",
      createdAt: now(),
      updatedAt: now(),
      expiresAt: event.endsAt,
      registrationHash: hash(rawToken),
      qrToken: token(),
      version: "",
    };
    await auditWrite(
      eventId,
      "invite_" + inv.id,
      inv,
      undefined,
      u.email,
      "Utworzono zaproszenie",
      inv.id,
    );
    return {
      invitation: view(await inviteById(eventId, inv.id)),
      registrationPath: "/r/" + eventId + "/" + inv.id + "/" + rawToken,
    };
  });
  app.get("/api/events/:eventId/invitations/:id", async (req) => {
    const { eventId, id } = req.params as { eventId: string; id: string };
    await authorize(req, eventId);
    return {
      invitation: view(await inviteById(eventId, id)),
      history: (await store.list<Audit>(eventId, "audit_"))
        .map((r) => r.value)
        .filter((a) => a.invitationId === id)
        .sort((a, b) => b.at.localeCompare(a.at)),
    };
  });
  app.put("/api/events/:eventId/invitations/:id", async (req) => {
    const { eventId, id } = req.params as { eventId: string; id: string };
    const u = await authorize(req, eventId);
    const r = await inviteById(eventId, id);
    const event = (await eventById(eventId)).value;
    if (event.status === "closed")
      return fail(400, "Zakończone wydarzenie jest tylko do odczytu.");
    if (
      u.role === "crew" &&
      (r.value.status !== "approved" || event.status !== "live")
    )
      return fail(
        403,
        "Obsługa może poprawiać zaakceptowane zaproszenia podczas wydarzenia.",
      );
    const data = editSchema.parse(req.body);
    if (data.version !== r.version)
      throw new Conflict(
        "Profil został zmieniony. Odśwież dane przed zapisem.",
      );
    if (data.children.length > r.value.maxChildren)
      return fail(400, "Przekroczono limit dzieci dla zaproszenia.");
    if (
      new Set(data.children.map((c) => c.id).filter(Boolean)).size !==
      data.children.filter((c) => c.id).length
    )
      return fail(400, "Dziecko jest dodane więcej niż raz.");
    for (const old of r.value.children) {
      const next = data.children.find((c) => c.id === old.id);
      if (
        old.checkedInAt &&
        !old.checkedOutAt &&
        (!next ||
          next.firstName !== old.firstName ||
          next.lastName !== old.lastName)
      )
        return fail(
          400,
          "Najpierw odnotuj wyjście dziecka, zanim zmienisz jego tożsamość.",
        );
    }
    const children = data.children.map((c) => {
      const old = r.value.children.find((o) => o.id === c.id);
      if (c.id && !old)
        return fail(400, "Nieprawidłowy identyfikator dziecka.");
      const same =
        old && old.firstName === c.firstName && old.lastName === c.lastName;
      return {
        ...(same ? old : {}),
        id: same ? old.id : randomUUID(),
        firstName: c.firstName,
        lastName: c.lastName,
      };
    });
    const updated = {
      ...r.value,
      parents: data.parents,
      children,
      pastAdmissions:
        (r.value.pastAdmissions || 0) +
        r.value.children.filter(
          (old) =>
            old.everCheckedIn && !children.some((child) => child.id === old.id),
        ).length,
      email: data.email,
      phone: data.phone,
      secondPhone: data.secondPhone,
      note: u.role === "crew" ? r.value.note : data.note,
      status:
        r.value.status === "invited" || r.value.status === "rejected"
          ? ("pending" as const)
          : r.value.status,
      updatedAt: now(),
    };
    await auditWrite(
      eventId,
      "invite_" + id,
      updated,
      r,
      u.email,
      "Zmieniono dane zaproszenia",
      id,
      data.reason,
    );
    return view(await inviteById(eventId, id));
  });
  app.post("/api/events/:eventId/invitations/:id/review", async (req) => {
    const { eventId, id } = req.params as { eventId: string; id: string };
    const u = await authorize(req, eventId, true);
    const data = z
      .object({
        version: z.string(),
        status: z.enum(["approved", "rejected", "cancelled"]),
        reason: z.string().trim().max(300).default(""),
      })
      .parse(req.body);
    const r = await inviteById(eventId, id);
    if ((await eventById(eventId)).value.status === "closed")
      return fail(400, "Wydarzenie zostało zakończone.");
    if (data.version !== r.version)
      throw new Conflict("Profil został zmieniony. Odśwież dane.");
    if (r.value.children.some((c) => c.checkedInAt && !c.checkedOutAt))
      return fail(400, "Najpierw odnotuj wyjście dzieci.");
    if (data.status === "approved") familySchema.parse(r.value);
    else if (data.reason.length < 3)
      return fail(400, "Podaj powód odrzucenia lub anulowania.");
    if (r.value.status === data.status) return view(r);
    await auditWrite(
      eventId,
      "invite_" + id,
      { ...r.value, status: data.status, updatedAt: now() },
      r,
      u.email,
      data.status === "approved"
        ? "Zaakceptowano zgłoszenie"
        : data.status === "rejected"
          ? "Odrzucono zgłoszenie"
          : "Anulowano zaproszenie",
      id,
      data.reason,
    );
    return view(await inviteById(eventId, id));
  });
  app.post("/api/events/:eventId/invitations/:id/rotate-link", async (req) => {
    const { eventId, id } = req.params as { eventId: string; id: string };
    const u = await authorize(req, eventId, true);
    const r = await inviteById(eventId, id);
    const event = (await eventById(eventId)).value;
    if (event.status === "closed")
      return fail(400, "Wydarzenie zostało zakończone.");
    const raw = token();
    await auditWrite(
      eventId,
      "invite_" + id,
      {
        ...r.value,
        registrationHash: hash(raw),
        expiresAt: event.endsAt,
        updatedAt: now(),
      },
      r,
      u.email,
      "Wygenerowano nowy link; poprzedni unieważniono",
      id,
    );
    return { registrationPath: "/r/" + eventId + "/" + id + "/" + raw };
  });
  app.post("/api/events/:eventId/scan", async (req) => {
    const { eventId } = req.params as { eventId: string };
    await authorize(req, eventId);
    const { code } = z.object({ code: z.string().max(500) }).parse(req.body);
    const parts = code.trim().split(".");
    if (parts.length !== 4 || parts[0] !== "SS1" || parts[1] !== eventId)
      return fail(400, "Ten kod QR nie należy do wybranego wydarzenia.");
    const r = await inviteById(eventId, parts[2]);
    if (!safeEqual(parts[3], r.value.qrToken))
      return fail(404, "Nieprawidłowy kod QR.");
    return { id: r.value.id };
  });
  app.post("/api/events/:eventId/invitations/:id/attendance", async (req) => {
    const { eventId, id } = req.params as { eventId: string; id: string };
    const u = await authorize(req, eventId);
    const data = z
      .object({
        childId: uuid,
        direction: z.enum(["in", "out"]),
        version: z.string(),
      })
      .parse(req.body);
    if ((await eventById(eventId)).value.status !== "live")
      return fail(400, "Włącz status „W trakcie”, aby potwierdzać wejścia.");
    const r = await inviteById(eventId, id);
    if (r.value.status !== "approved")
      return fail(
        400,
        "Zaproszenie musi być zaakceptowane przez administratora wydarzenia.",
      );
    const child = r.value.children.find((c) => c.id === data.childId);
    if (!child) return fail(404, "Nie znaleziono dziecka.");
    const inside = !!child.checkedInAt && !child.checkedOutAt;
    if (
      (data.direction === "in" && inside) ||
      (data.direction === "out" && child.checkedOutAt)
    )
      return { invitation: view(r), duplicate: true };
    if (data.version !== r.version)
      throw new Conflict(
        "Profil został zmieniony na innym urządzeniu. Odśwież i potwierdź dane.",
      );
    if (data.direction === "out" && !inside)
      return fail(400, "Dziecko nie zostało przyjęte.");
    const updatedChild =
      data.direction === "in"
        ? {
            ...child,
            checkedInAt: now(),
            checkedOutAt: undefined,
            everCheckedIn: true,
          }
        : { ...child, checkedOutAt: now() };
    const updated = {
      ...r.value,
      children: r.value.children.map((c) =>
        c.id === child.id ? updatedChild : c,
      ),
      updatedAt: now(),
    };
    await auditWrite(
      eventId,
      "invite_" + id,
      updated,
      r,
      u.email,
      data.direction === "in" ? "Potwierdzono wejście" : "Potwierdzono wyjście",
      id,
    );
    return {
      invitation: view(await inviteById(eventId, id)),
      duplicate: false,
    };
  });
  app.get("/api/public/registration/:eventId/:id/:token", async (req) => {
    const { row, event } = await publicInvitation(req);
    const i = row.value;
    return {
      event: {
        name: event.name,
        location: event.location,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
      invitation: {
        id: i.id,
        eventId: i.eventId,
        phone: i.phone,
        secondPhone: i.secondPhone,
        email: i.email,
        parents: i.parents,
        children: i.children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
        })),
        maxChildren: i.maxChildren,
        status: i.status,
        version: row.version,
        qrCode:
          i.status === "approved"
            ? ["SS1", i.eventId, i.id, i.qrToken].join(".")
            : undefined,
      },
    };
  });
  app.post("/api/public/registration/:eventId/:id/:token", async (req) => {
    const { row: r } = await publicInvitation(req);
    await throttle(r.value.id);
    if (!["invited", "rejected"].includes(r.value.status))
      return fail(
        409,
        "Zgłoszenie zostało już wysłane. Zmiany zgłoś organizatorowi.",
      );
    const data = familySchema
      .extend({ version: z.string(), acknowledged: z.literal(true) })
      .parse(req.body);
    if (data.version !== r.version)
      throw new Conflict("Zgłoszenie zostało zmienione. Odśwież stronę.");
    if (data.children.length > r.value.maxChildren)
      return fail(400, "Przekroczono liczbę dzieci w zaproszeniu.");
    const updated = {
      ...r.value,
      parents: data.parents,
      children: data.children.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName,
        id: randomUUID(),
      })),
      phone: r.value.phone,
      secondPhone: data.secondPhone,
      email: data.email,
      status: "pending" as const,
      updatedAt: now(),
    };
    await auditWrite(
      r.value.eventId,
      "invite_" + r.value.id,
      updated,
      r,
      "Rodzic (link rejestracyjny)",
      "Wysłano zgłoszenie do weryfikacji",
      r.value.id,
    );
    return { status: "pending" };
  });
  app.get("/api/staff", async (req) => {
    const u = await staff(req);
    if (u.role !== "admin") return fail(403, "Brak uprawnień.");
    return (await store.list<Staff>("users"))
      .filter((r) => !("action" in r.value))
      .map((r) => ({ ...r.value, version: r.version }));
  });
  app.post("/api/staff", async (req) => {
    const u = await staff(req);
    if (u.role !== "admin") return fail(403, "Brak uprawnień.");
    const data = staffSchema.parse(req.body);
    const key = hash(data.email);
    const old = await store.get<Staff>("users", key);
    if (data.email === u.email && (!data.active || data.role !== "admin"))
      return fail(400, "Nie możesz odebrać sobie uprawnień administratora.");
    for (const id of data.eventIds) await eventById(id);
    const payload = {
      ...data,
      ...(old?.value.principalId ? { principalId: old.value.principalId } : {}),
    };
    await auditWrite(
      "users",
      key,
      payload,
      old,
      u.email,
      "Zmieniono uprawnienia zespołu",
    );
    return data;
  });
  app.get("/api/settings", async (req) => {
    const u = await staff(req);
    if (u.role !== "admin") return fail(403, "Brak uprawnień.");
    return settings();
  });
  app.put("/api/settings", async (req) => {
    const u = await staff(req);
    if (u.role !== "admin") return fail(403, "Brak uprawnień.");
    const data = z
      .object({
        paused: z.boolean(),
        message: z.string().trim().min(3).max(300),
      })
      .parse(req.body);
    const r = await store.get<Settings>("system", "settings");
    await auditWrite(
      "system",
      "settings",
      data,
      r,
      u.email,
      data.paused ? "Wstrzymano platformę" : "Włączono platformę",
    );
    return data;
  });
  return app;
}
