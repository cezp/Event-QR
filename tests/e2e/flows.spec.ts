import { test, expect } from "@playwright/test";
test("a successful event save survives a failed background refresh without duplicate creation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Logowanie dla zespołu" }).click();
  await expect(
    page.getByRole("button", { name: "Nowe wydarzenie" }),
  ).toBeVisible();
  let creates = 0;
  let saves = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/events" &&
      request.method() === "POST"
    )
      creates++;
    if (
      /\/api\/events\/[^/]+$/.test(new URL(request.url()).pathname) &&
      request.method() === "PUT"
    )
      saves++;
  });
  await page.route("**/api/events", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 403,
        json: { error: "Odmowa odświeżenia listy" },
      });
    } else await route.continue();
  });
  await page.route("**/api/events/*/invitations", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Chwilowy błąd odświeżenia zaproszeń" },
    }),
  );
  const name = "Zapis bez duplikatu " + Date.now();
  await page.getByRole("button", { name: "Nowe wydarzenie" }).click();
  await page.getByLabel("Nazwa wydarzenia").fill(name);
  await page.getByLabel("Początek", { exact: true }).fill("2099-12-06T15:00");
  await page.getByLabel("Koniec", { exact: true }).fill("2099-12-06T19:00");
  await page.getByRole("button", { name: "Zapisz wydarzenie" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Wydarzenie jest gotowe.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(creates).toBe(1);
  await page
    .getByRole("button", { name: "Ustawienia wydarzenia", exact: true })
    .click();
  for (const suffix of ["poprawione", "ponownie"]) {
    await page.getByLabel("Nazwa wydarzenia").fill(name + " " + suffix);
    await page.getByRole("button", { name: "Zapisz wydarzenie" }).click();
    await expect(
      page.getByText("Zapisano wydarzenie.", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("combobox", { name: "Wybierz wydarzenie" })
        .locator("option:checked"),
    ).toHaveText(name + " " + suffix);
  }
  expect(creates).toBe(1);
  expect(saves).toBe(2);
});

test("full family journey, substitution, QR lookup and attendance history", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Logowanie dla zespołu" }).click();
  await expect(
    page.getByRole("heading", { name: "Wszystko gotowe na uśmiechy." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nowe wydarzenie" }).click();
  await page
    .getByLabel("Nazwa wydarzenia")
    .fill("Wydarzenie testowe " + Date.now());
  await page.getByLabel("Początek", { exact: true }).fill("2099-12-06T15:00");
  await page.getByLabel("Koniec", { exact: true }).fill("2099-12-06T19:00");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("live");
  await page.getByRole("button", { name: "Zapisz wydarzenie" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Zaproszenia/ }).click();
  await page.getByRole("button", { name: "Nowe zaproszenie" }).click();
  await page.getByLabel("Numer telefonu rodzica").fill("+48600777888");
  await page.getByLabel("Maksymalna liczba dzieci").fill("2");
  await page.getByRole("button", { name: "Utwórz prywatny link" }).click();
  const link = await page
    .getByRole("textbox", { name: "Link dla rodzica", exact: true })
    .inputValue();
  expect(link).toContain("/r/");
  const parentContext = await browser.newContext({
    baseURL: page.url(),
    viewport: { width: 390, height: 844 },
  });
  const parent = await parentContext.newPage();
  await parent.goto(link);
  await parent.getByLabel("Imię", { exact: true }).fill("Anna");
  await parent.getByLabel("Nazwisko", { exact: true }).fill("Testowska");
  await parent.getByLabel("Adres e-mail").fill("anna@example.test");
  await parent.getByLabel("Imię dziecka", { exact: true }).fill("Zofia");
  await parent
    .getByLabel("Nazwisko dziecka", { exact: true })
    .fill("Testowska");
  await parent.getByRole("checkbox").check();
  await parent
    .getByRole("button", { name: "Wyślij zgłoszenie do weryfikacji" })
    .click();
  await expect(
    parent.getByRole("heading", { name: "Zgłoszenie dotarło!" }),
  ).toBeVisible();
  await parent.screenshot({
    path: "artifacts/parent-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Zamknij", exact: true }).click();
  await page.reload();
  // Reload retains the selected event even when several events share a date.
  await page.getByRole("button", { name: /^Zaproszenia/ }).click();
  await page
    .getByRole("combobox", { name: "Szukaj po nazwisku" })
    .fill("Testowska");
  await page.getByRole("option", { name: /Zofia Testowska/ }).click();
  await page.getByRole("button", { name: "Akceptuj zgłoszenie" }).click();
  await expect(
    page.getByText("Zgłoszenie zaakceptowane. Kod QR jest już dostępny."),
  ).toBeVisible();
  await parent.getByRole("button", { name: "Sprawdź status" }).click();
  await expect(
    parent.getByRole("img", { name: "Indywidualny kod QR zaproszenia" }),
  ).toBeVisible();
  const parts = new URL(link).pathname.split("/");
  const invitation = (
    await (
      await page.request.get(
        "/api/events/" + parts[2] + "/invitations/" + parts[3],
      )
    ).json()
  ).invitation;
  const code = ["SS1", parts[2], parts[3], invitation.qrToken].join(".");
  await page.getByRole("button", { name: "Zamknij", exact: true }).click();
  await page
    .getByRole("button", { name: "Obsługa wejścia", exact: true })
    .click();
  await page.getByRole("button", { name: "Uruchom skaner" }).click();
  await page.getByLabel("Kod z zaproszenia").fill(code);
  await page
    .getByRole("button", { name: "Otwórz zaproszenie", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Profil zaproszenia" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edytuj / zmień dziecko" }).click();
  await page.getByLabel("Imię dziecka", { exact: true }).fill("Maja");
  await page
    .getByLabel("Powód zmiany")
    .fill("Zamiast Zofii przyszła jej siostra Maja.");
  await page
    .getByRole("button", { name: "Zapisz zmiany", exact: true })
    .click();
  await expect(page.getByText("Maja Testowska", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Potwierdź wejście", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Potwierdź wyjście", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Historia/ }).click();
  await expect(
    page.getByText("Potwierdzono wejście", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Zamiast Zofii przyszła jej siostra Maja.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/invitation-history.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dane i obecność" }).click();
  await page
    .getByRole("button", { name: "Potwierdź wyjście", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Potwierdź wejście", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zamknij", exact: true }).click();
  await page.getByRole("button", { name: "Przegląd", exact: true }).click();
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.screenshot({
    path: "artifacts/dashboard-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Otwórz menu" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await parentContext.close();
});
test("staff enters a complete family, reviews it and gives the parent a working QR link", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".brand")).toContainText("Samych Swoich");
  await page.getByRole("link", { name: "Logowanie dla zespołu" }).click();
  await page
    .getByRole("combobox", { name: "Wybierz wydarzenie" })
    .selectOption("a1111111-1111-4111-8111-111111111111");
  await page.getByRole("button", { name: /^Zaproszenia/ }).click();
  await page.getByRole("button", { name: "Nowe zaproszenie" }).click();
  await page.getByLabel("Numer telefonu rodzica").fill("+48600555444");
  await page.getByRole("radio", { name: /Wpisz dane rodziny/ }).check();
  await expect(
    page.getByLabel("Telefon kontaktowy", { exact: true }),
  ).toHaveValue("+48600555444");
  await page.getByLabel("Maksymalna liczba dzieci").fill("2");
  await page.getByRole("button", { name: "Dodaj drugiego rodzica" }).click();
  await page.getByLabel("Imię", { exact: true }).nth(0).fill("Anna");
  await page.getByLabel("Nazwisko", { exact: true }).nth(0).fill("Wpisowska");
  await page.getByLabel("Imię", { exact: true }).nth(1).fill("Piotr");
  await page.getByLabel("Nazwisko", { exact: true }).nth(1).fill("Wpisowski");
  await page.getByLabel("Drugi telefon").fill("+48600555333");
  await page.getByLabel("Adres e-mail").fill("wpisana@example.test");
  await page.getByRole("button", { name: "Dodaj kolejne dziecko" }).click();
  await page.getByLabel("Imię dziecka", { exact: true }).nth(0).fill("Maja");
  await page
    .getByLabel("Nazwisko dziecka", { exact: true })
    .nth(0)
    .fill("Wpisowska");
  await page.getByLabel("Imię dziecka", { exact: true }).nth(1).fill("Jan");
  await page
    .getByLabel("Nazwisko dziecka", { exact: true })
    .nth(1)
    .fill("Wpisowski");
  await expect(
    page.getByRole("button", { name: "Dodaj kolejne dziecko" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Notatka dla zespołu")
    .fill("Dane testowe wpisane przez organizatora.");
  await page.getByRole("radio", { name: /Link dla rodzica/ }).check();
  await page.getByRole("radio", { name: /Wpisz dane rodziny/ }).check();
  await expect(page.getByLabel("Imię", { exact: true }).nth(1)).toHaveValue(
    "Piotr",
  );
  await expect(
    page.getByLabel("Imię dziecka", { exact: true }).nth(1),
  ).toHaveValue("Jan");
  await page.screenshot({ path: "artifacts/manual-invitation-tablet.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Zapisz zaproszenie z danymi" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/manual-invitation-mobile.png" });
  await page
    .getByRole("button", { name: "Zapisz zaproszenie z danymi" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Zaproszenie jest gotowe" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Zaproszenie ma status „Do weryfikacji”/),
  ).toBeVisible();
  const link = await page
    .getByRole("textbox", { name: "Link dla rodzica", exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Otwórz profil zaproszenia" }).click();
  await expect(page.getByText("Maja Wpisowska", { exact: true })).toBeVisible();
  await expect(page.getByText("Jan Wpisowski", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Historia/ }).click();
  await expect(
    page.getByText("Utworzono zaproszenie z danymi rodziny", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dane i obecność" }).click();
  await page.getByRole("button", { name: "Akceptuj zgłoszenie" }).click();
  await expect(
    page.getByText("Zgłoszenie zaakceptowane. Kod QR jest już dostępny."),
  ).toBeVisible();
  const parentContext = await browser.newContext();
  const parent = await parentContext.newPage();
  await parent.goto(link);
  await expect(
    parent.getByRole("img", { name: "Indywidualny kod QR zaproszenia" }),
  ).toBeVisible();
  await expect(
    parent.getByText("Maja Wpisowska", { exact: true }),
  ).toBeVisible();
  await parentContext.close();
});

test("crew has no administrative screens and offline confirmation is disabled", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "dev_staff",
      value: "crew%40example.test",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Obsługa wejścia", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Zespół i uprawnienia" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nowe wydarzenie" }),
  ).toHaveCount(0);
  await context.setOffline(true);
  await expect(
    page.getByText(/Brak internetu. Wejścia nie są zapisywane/),
  ).toBeVisible();
  await context.setOffline(false);
});
