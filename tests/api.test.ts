import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { createApp } from "../server/app";
import { MemoryStore } from "../server/store";
import type { Event, InvitationView, Profile } from "../shared/types";

let store: MemoryStore, app: ReturnType<typeof createApp>, event: Event;
const headers = (email = "admin@example.test") => ({
  "x-ms-client-principal": Buffer.from(
    JSON.stringify({
      userId: email,
      identityProvider: "aad",
      userDetails: email,
      userRoles: ["authenticated"],
    }),
  ).toString("base64"),
  "x-event-request": "1",
  "content-type": "application/json",
});
const request = (
  method: "GET" | "POST" | "PUT",
  url: string,
  payload?: unknown,
  email?: string,
) =>
  app.inject({
    method,
    url,
    headers: headers(email),
    payload: payload === undefined ? undefined : JSON.stringify(payload),
  });
const parentData = {
  parents: [{ firstName: "Anna", lastName: "Żółkowska" }],
  children: [{ firstName: "Zofia", lastName: "Żółkowska" }],
  email: "anna@example.test",
  phone: "+48600100200",
  secondPhone: "",
  acknowledged: true,
};
async function invite(maxChildren = 1) {
  const r = await request("POST", "/api/events/" + event.id + "/invitations", {
    phone: "+48600100200",
    maxChildren,
  });
  expect(r.statusCode).toBe(200);
  return r.json() as { invitation: InvitationView; registrationPath: string };
}
async function submit() {
  const created = await invite();
  const path = "/api/public/registration/" + created.registrationPath.slice(3);
  const result = await app.inject({
    method: "POST",
    url: path,
    headers: { "x-event-request": "1", "content-type": "application/json" },
    payload: { ...parentData, version: created.invitation.version },
  });
  expect(result.statusCode).toBe(200);
  return {
    created,
    path,
    profile: (
      await request(
        "GET",
        "/api/events/" + event.id + "/invitations/" + created.invitation.id,
      )
    ).json() as Profile,
  };
}
async function approve() {
  const data = await submit();
  const base =
    "/api/events/" + event.id + "/invitations/" + data.created.invitation.id;
  const r = await request("POST", base + "/review", {
    status: "approved",
    version: data.profile.invitation.version,
  });
  expect(r.statusCode).toBe(200);
  return { ...data, base, invitation: r.json() as InvitationView };
}
beforeEach(async () => {
  store = new MemoryStore();
  app = createApp(store, { bootstrapEmail: "admin@example.test" });
  const r = await request("POST", "/api/events", {
    name: "Mikołajki testowe",
    description: "",
    location: "Świetlica",
    startsAt: "2099-12-06T14:00:00.000Z",
    endsAt: "2099-12-06T18:00:00.000Z",
    status: "live",
    capacity: 100,
  });
  expect(r.statusCode).toBe(200);
  event = r.json();
  for (const [email, role, events] of [
    ["crew@example.test", "crew", [event.id]],
    ["manager@example.test", "event_admin", [event.id]],
    ["outsider@example.test", "crew", []],
  ] as const)
    await store.commit("users", [
      {
        key: createHash("sha256").update(email).digest("hex"),
        create: true,
        value: { email, name: email, role, eventIds: events, active: true },
      },
    ]);
});
afterEach(() => app.close());
describe("Authentication, event scopes and request protection", () => {
  it("keeps a bound administrator authorized when Microsoft userDetails is masked or changes", async () => {
    const changedHeaders = (userDetails: string) => ({
      ...headers(),
      "x-ms-client-principal": Buffer.from(
        JSON.stringify({
          userId: "admin@example.test",
          userDetails,
          identityProvider: "aad",
          userRoles: ["authenticated"],
        }),
      ).toString("base64"),
    });
    for (const details of [
      "adm*****",
      " NEW-ALIAS@example.test ",
      "crew@example.test",
    ]) {
      const me = await app.inject({
        url: "/api/me",
        headers: changedHeaders(details),
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().user.email).toBe("admin@example.test");
      expect(me.json().user.role).toBe("admin");
      const saved = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: changedHeaders(details),
        payload: event,
      });
      expect(saved.statusCode).toBe(200);
      expect(
        (
          await app.inject({
            url: `/api/events/${saved.json().id}/invitations`,
            headers: changedHeaders(details),
          })
        ).statusCode,
      ).toBe(200);
    }
  });

  it("never grants an unbound identity access through a mask or another account's email", async () => {
    for (const details of ["adm*****", "admin@example.test"]) {
      const result = await app.inject({
        url: "/api/events",
        headers: {
          "x-ms-client-principal": Buffer.from(
            JSON.stringify({
              userId: "unrecognized-identity",
              userDetails: details,
              identityProvider: "aad",
              userRoles: ["authenticated"],
            }),
          ).toString("base64"),
        },
      });
      expect(result.statusCode).toBe(403);
    }
  });

  it("preserves event scopes and revocation for a bound identity with masked details", async () => {
    expect(
      (await request("GET", "/api/me", undefined, "crew@example.test"))
        .statusCode,
    ).toBe(200);
    const masked = {
      ...headers("crew@example.test"),
      "x-ms-client-principal": Buffer.from(
        JSON.stringify({
          userId: "crew@example.test",
          userDetails: "admin@example.test",
          identityProvider: "aad",
          userRoles: ["authenticated"],
        }),
      ).toString("base64"),
    };
    expect(
      (
        await app.inject({
          url: `/api/events/${event.id}/invitations`,
          headers: masked,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/events",
          headers: masked,
          payload: event,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: `/api/events/${randomUUID()}/invitations`,
          headers: masked,
        })
      ).statusCode,
    ).toBe(403);
    const key = createHash("sha256").update("crew@example.test").digest("hex");
    const row = (await store.get<Record<string, unknown>>("users", key))!;
    await store.commit("users", [
      { key, version: row.version, value: { ...row.value, active: false } },
    ]);
    expect(
      (
        await app.inject({
          url: `/api/events/${event.id}/invitations`,
          headers: masked,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("gives a global admin access to events without assignments while denying creation to scoped roles", async () => {
    const me = (await request("GET", "/api/me")).json().user;
    expect(me.role).toBe("admin");
    expect(me.eventIds).toEqual([]);
    expect(
      (await request("GET", `/api/events/${event.id}/invitations`)).statusCode,
    ).toBe(200);
    const saved = await request("PUT", `/api/events/${event.id}`, {
      ...event,
      name: "Zmienione wydarzenie",
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().name).toBe("Zmienione wydarzenie");
    for (const email of ["manager@example.test", "crew@example.test"]) {
      expect(
        (await request("POST", "/api/events", event, email)).statusCode,
      ).toBe(403);
    }
    const key = createHash("sha256").update(me.email).digest("hex");
    const row = (await store.get<typeof me>("users", key))!;
    await store.commit("users", [
      { key, version: row.version, value: { ...row.value, active: false } },
    ]);
    const disabled = await request("POST", "/api/events", event);
    expect(disabled.statusCode).toBe(403);
    expect(disabled.json().error).toContain("został wyłączony");
  });

  it("denies anonymous and unlisted users, and rejects forged providers", async () => {
    expect((await app.inject("/api/events")).statusCode).toBe(401);
    expect(
      (await request("GET", "/api/events", undefined, "unknown@example.test"))
        .statusCode,
    ).toBe(403);
    const principal = Buffer.from(
      JSON.stringify({
        identityProvider: "github",
        userId: "x",
        userDetails: "admin@example.test",
        userRoles: ["authenticated"],
      }),
    ).toString("base64");
    expect(
      (
        await app.inject({
          url: "/api/events",
          headers: { "x-ms-client-principal": principal },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("rejects simple cross-site requests and disallows cross-event crew access", async () => {
    const { "x-event-request": ignored, ...simpleHeaders } = headers();
    const r = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: simpleHeaders,
      payload: {},
    });
    expect(r.statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/events",
          headers: { ...headers(), "sec-fetch-site": "cross-site" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          "GET",
          "/api/events/" + event.id + "/invitations",
          undefined,
          "outsider@example.test",
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          "POST",
          "/api/events/" + event.id + "/invitations",
          { phone: "+48600100200", maxChildren: 1 },
          "crew@example.test",
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await request("GET", "/api/staff", undefined, "manager@example.test"))
        .statusCode,
    ).toBe(403);
  });
  it("allows event admin to create invitations and keeps event lists free of audit rows", async () => {
    expect(
      (
        await request(
          "POST",
          "/api/events/" + event.id + "/invitations",
          { phone: "+48600100200", maxChildren: 1 },
          "manager@example.test",
        )
      ).statusCode,
    ).toBe(200);
    expect((await request("GET", "/api/events")).json()).toHaveLength(1);
  });
  it("binds an allowed email to a stable Microsoft principal", async () => {
    await request("GET", "/api/me", undefined, "crew@example.test");
    const h = headers("crew@example.test");
    h["x-ms-client-principal"] = Buffer.from(
      JSON.stringify({
        userId: "different-id",
        identityProvider: "aad",
        userDetails: "crew@example.test",
        userRoles: ["authenticated"],
      }),
    ).toString("base64");
    expect((await app.inject({ url: "/api/me", headers: h })).statusCode).toBe(
      403,
    );
  });
});
describe("Private parent registration", () => {
  it("requires one parent and email; enforces child limit", async () => {
    const c = await invite(),
      path = "/api/public/registration/" + c.registrationPath.slice(3);
    for (const override of [
      { parents: [] },
      { email: "bad" },
      { children: [...parentData.children, ...parentData.children] },
      { acknowledged: false },
    ]) {
      const r = await request("POST", path, {
        ...parentData,
        ...override,
        version: c.invitation.version,
      });
      expect(r.statusCode).toBe(400);
    }
  });
  it("moves submission to pending, prevents replay and never exposes audit or private notes", async () => {
    const { path, profile } = await submit();
    expect(profile.invitation.status).toBe("pending");
    const publicView = (await app.inject(path)).json();
    expect(publicView.invitation.qrCode).toBeUndefined();
    expect(publicView.invitation.registrationHash).toBeUndefined();
    expect(publicView.invitation.note).toBeUndefined();
    expect(publicView.history).toBeUndefined();
    expect(
      (
        await request("POST", path, {
          ...parentData,
          version: profile.invitation.version,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("invalidates old links on rotation and rejects expired or guessed links", async () => {
    const c = await invite(),
      base = "/api/events/" + event.id + "/invitations/" + c.invitation.id;
    const old = "/api/public/registration/" + c.registrationPath.slice(3);
    expect(
      (await app.inject(old.slice(0, -64) + "a".repeat(64))).statusCode,
    ).toBe(404);
    const rotated = (await request("POST", base + "/rotate-link", {})).json();
    expect((await app.inject(old)).statusCode).toBe(404);
    expect(
      (
        await app.inject(
          "/api/public/registration/" + rotated.registrationPath.slice(3),
        )
      ).statusCode,
    ).toBe(200);
    const row = await store.get<InvitationView>(
      event.id,
      "invite_" + c.invitation.id,
    );
    await store.commit(event.id, [
      {
        key: "invite_" + c.invitation.id,
        version: row!.version,
        value: { ...row!.value, expiresAt: "2000-01-01T00:00:00.000Z" },
      },
    ]);
    expect(
      (
        await app.inject(
          "/api/public/registration/" + rotated.registrationPath.slice(3),
        )
      ).statusCode,
    ).toBe(410);
  });
  it("throttles repeated submissions with a shared store counter", async () => {
    const c = await invite(),
      path = "/api/public/registration/" + c.registrationPath.slice(3);
    for (let i = 0; i < 20; i++)
      expect((await request("POST", path, {})).statusCode).toBe(400);
    expect((await request("POST", path, {})).statusCode).toBe(429);
  });
});
describe("Approval, QR, attendance and audit", () => {
  it("blocks crew approval and admission of an unverified invitation", async () => {
    const { created, profile } = await submit(),
      base =
        "/api/events/" + event.id + "/invitations/" + created.invitation.id;
    expect(
      (
        await request(
          "POST",
          base + "/review",
          { status: "approved", version: profile.invitation.version },
          "crew@example.test",
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          "POST",
          base + "/attendance",
          {
            childId: profile.invitation.children[0].id,
            direction: "in",
            version: profile.invitation.version,
          },
          "crew@example.test",
        )
      ).statusCode,
    ).toBe(400);
  });
  it("exposes an opaque QR only after approval, validates event and QR token", async () => {
    const d = await approve(),
      qr = (await app.inject(d.path)).json().invitation.qrCode;
    expect(qr).not.toContain("Zofia");
    expect(qr).not.toContain("600100200");
    expect(
      (
        await request(
          "POST",
          "/api/events/" + event.id + "/scan",
          { code: qr },
          "crew@example.test",
        )
      ).json().id,
    ).toBe(d.invitation.id);
    expect(
      (
        await request("POST", "/api/events/" + event.id + "/scan", {
          code: qr.replace(event.id, randomUUID()),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("POST", "/api/events/" + event.id + "/scan", {
          code: qr.slice(0, -1) + "!",
        })
      ).statusCode,
    ).toBe(404);
  });
  it("does not count duplicate or concurrent admissions twice and logs exit", async () => {
    const d = await approve(),
      payload = {
        childId: d.invitation.children[0].id,
        direction: "in",
        version: d.invitation.version,
      };
    const results = await Promise.all([
      request("POST", d.base + "/attendance", payload, "crew@example.test"),
      request("POST", d.base + "/attendance", payload, "crew@example.test"),
    ]);
    expect(results.some((r) => r.statusCode === 200)).toBe(true);
    expect(results.every((r) => [200, 409].includes(r.statusCode))).toBe(true);
    const duplicate = await request(
      "POST",
      d.base + "/attendance",
      payload,
      "crew@example.test",
    );
    expect(duplicate.json().duplicate).toBe(true);
    let profile = (await request("GET", d.base)).json() as Profile;
    expect(
      profile.history.filter((a) => a.action === "Potwierdzono wejście"),
    ).toHaveLength(1);
    expect(profile.invitation.children[0].everCheckedIn).toBe(true);
    expect(
      (
        await request("POST", d.base + "/attendance", {
          ...payload,
          direction: "out",
          version: profile.invitation.version,
        })
      ).statusCode,
    ).toBe(200);
    profile = (await request("GET", d.base)).json();
    expect(profile.invitation.children[0].checkedOutAt).toBeTruthy();
    expect(
      profile.history.filter((a) => a.action === "Potwierdzono wyjście"),
    ).toHaveLength(1);
  });
  it("supports substitution before admission with old/new values and actor in immutable history", async () => {
    const d = await approve();
    const payload = {
      ...parentData,
      children: [{ ...d.invitation.children[0], firstName: "Maja" }],
      version: d.invitation.version,
      reason: "Przyszła siostra zamiast Zofii",
      note: "",
    };
    const r = await request("PUT", d.base, payload, "crew@example.test");
    expect(r.statusCode).toBe(200);
    const profile = (await request("GET", d.base)).json() as Profile;
    const change = profile.history.find(
      (a) => a.action === "Zmieniono dane zaproszenia",
    )!;
    expect(change.actor).toBe("crew@example.test");
    expect(JSON.stringify(change.changes)).toContain("Zofia");
    expect(JSON.stringify(change.changes)).toContain("Maja");
    expect(profile.invitation.children[0].id).not.toBe(
      d.invitation.children[0].id,
    );
    expect(
      (await request("PUT", d.base, payload, "crew@example.test")).statusCode,
    ).toBe(409);
  });
  it("prevents identity replacement while a child is inside and requires change reasons", async () => {
    const d = await approve();
    const result = await request("POST", d.base + "/attendance", {
      childId: d.invitation.children[0].id,
      direction: "in",
      version: d.invitation.version,
    });
    const updated = result.json().invitation as InvitationView;
    expect(
      (
        await request("PUT", d.base, {
          ...parentData,
          children: [{ ...updated.children[0], firstName: "Maja" }],
          version: updated.version,
          reason: "Zastępstwo",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("PUT", d.base, {
          ...parentData,
          children: updated.children,
          version: updated.version,
          reason: "",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("PUT", "/api/events/" + event.id, {
          ...event,
          status: "closed",
        })
      ).statusCode,
    ).toBe(400);
  });
  it("preserves previous admissions after an already collected child is replaced", async () => {
    const d = await approve();
    const entered = (
      await request("POST", d.base + "/attendance", {
        childId: d.invitation.children[0].id,
        direction: "in",
        version: d.invitation.version,
      })
    ).json().invitation as InvitationView;
    const left = (
      await request("POST", d.base + "/attendance", {
        childId: entered.children[0].id,
        direction: "out",
        version: entered.version,
      })
    ).json().invitation as InvitationView;
    const result = await request("PUT", d.base, {
      ...parentData,
      children: [{ ...left.children[0], firstName: "Maja" }],
      version: left.version,
      reason: "Zastępstwo po wyjściu pierwszego dziecka",
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().pastAdmissions).toBe(1);
    expect(result.json().children[0].everCheckedIn).toBeUndefined();
  });
  it("pauses public registration and entry, while administrator can resume", async () => {
    const d = await approve();
    expect(
      (
        await request("PUT", "/api/settings", {
          paused: true,
          message: "Do zobaczenia wkrótce",
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject(d.path)).statusCode).toBe(503);
    expect(
      (
        await request("POST", d.base + "/attendance", {
          childId: d.invitation.children[0].id,
          direction: "in",
          version: d.invitation.version,
        })
      ).statusCode,
    ).toBe(503);
    expect(
      (
        await request("PUT", "/api/settings", {
          paused: false,
          message: "Do zobaczenia wkrótce",
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject(d.path)).statusCode).toBe(200);
  });
});
