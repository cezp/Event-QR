import { createHash, randomUUID } from "node:crypto";
import type { Store } from "../server/store";
import type { Event, Invitation } from "../shared/types";
export async function seed(store: Store) {
  if ((await store.list("events")).length) return;
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const id = "a1111111-1111-4111-8111-111111111111";
  const event: Event = {
    id,
    name: "Mikołajki w Dobrzykowicach",
    description:
      "Popołudnie pełne uśmiechu, wspólnych zabaw i mikołajkowych niespodzianek.",
    location: "Świetlica wiejska w Dobrzykowicach",
    startsAt: "2026-12-06T14:00:00.000Z",
    endsAt: "2026-12-06T18:00:00.000Z",
    status: "live",
    capacity: 120,
    createdAt: new Date().toISOString(),
    version: "",
  };
  await store.commit("events", [{ key: id, value: event, create: true }]);
  for (const [email, role, name] of [
    ["admin@example.test", "admin", "Anna · konto demonstracyjne"],
    ["crew@example.test", "crew", "Marta · obsługa"],
    ["manager@example.test", "event_admin", "Piotr · organizator"],
  ]) {
    await store.commit("users", [
      {
        key: hash(email),
        create: true,
        value: { email, role, name, eventIds: [id], active: true },
      },
    ]);
  }
  const families = [
    ["Kowalska", "Zofia", "Anna", "approved"],
    ["Nowak", "Antoni", "Michał", "approved"],
    ["Wiśniewska", "Hanna", "Joanna", "pending"],
    ["Wójcik", "Aleksander", "Tomasz", "approved"],
    ["Kamińska", "Julia", "Magdalena", "approved"],
    ["Lewandowski", "Jan", "Paweł", "pending"],
    ["Zielińska", "Maja", "Katarzyna", "approved"],
    ["Szymański", "Leon", "Andrzej", "invited"],
    ["Woźniak", "Lena", "Agnieszka", "approved"],
    ["Dąbrowski", "Franciszek", "Marcin", "approved"],
  ];
  for (let n = 0; n < families.length; n++) {
    const [lastName, firstName, parent, status] = families[n];
    const stamp = new Date(
      Date.now() - (families.length - n) * 600000,
    ).toISOString();
    const inv: Invitation = {
      id: randomUUID(),
      eventId: id,
      phone: "+48500000" + String(n).padStart(3, "0"),
      secondPhone: "",
      email: "rodzina" + n + "@example.test",
      maxChildren: 2,
      parents: status === "invited" ? [] : [{ firstName: parent, lastName }],
      children:
        status === "invited"
          ? []
          : [
              {
                id: randomUUID(),
                firstName,
                lastName,
                ...(n % 3 === 0
                  ? { checkedInAt: stamp, everCheckedIn: true }
                  : {}),
              },
            ],
      status: status as Invitation["status"],
      note: "Dane fikcyjne do prezentacji.",
      createdAt: stamp,
      updatedAt: stamp,
      expiresAt: event.endsAt,
      registrationHash: hash("demo-" + n),
      qrToken: hash("demo-qr-" + n),
      version: "",
    };
    await store.commit(id, [
      { key: "invite_" + inv.id, value: inv, create: true },
      {
        key: "audit_" + n,
        create: true,
        value: {
          id: randomUUID(),
          invitationId: inv.id,
          at: stamp,
          actor: "admin@example.test",
          action: "Utworzono zaproszenie",
          changes: [],
        },
      },
    ]);
  }
}
