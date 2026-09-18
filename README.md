# Samych Swoich · Wydarzenia

Platforma wydarzeń Dobrzykowickiego Stowarzyszenia Samych Swoich. Polski interfejs, panel organizatora, prywatne formularze rodziców, zaproszenia QR, obsługa wejść i historia zmian.

- Adres docelowy: https://eventy.samychswoich.pl
- Adres techniczny: https://zealous-coast-032818a03.3.azurestaticapps.net
- Azure: grupa **rg-eventy-samychswoich**, region **West Europe**.
- Pierwszy administrator: **cpytka@samychswoich.pl**, logowanie kontem Microsoft.

## Możliwości

- Wiele wydarzeń: szkic, zapisy otwarte, w trakcie, zakończone.
- Role administrator, administrator wydarzenia i obsługa wejścia. Uprawnienia sprawdza API przy każdej operacji.
- Nowe zaproszenie: prywatny link na podstawie telefonu i limitu dzieci albo pełne dane rodziny wpisane od razu przez organizatora. Dane można później poprawić w profilu.
- Jeden lub dwoje rodziców, e-mail, główny telefon i opcjonalny drugi telefon.
- Kolejka zgłoszeń do weryfikacji. QR udostępniany po akceptacji.
- Skanowanie aparatem, ręczne podanie kodu i wyszukiwanie nazwisk z podpowiedziami, także bez polskich znaków.
- Osobne wejście i wyjście każdego dziecka. Aktualna lista obecnych.
- Zamiana dziecka przed wejściem z obowiązkowym powodem. Historia zawiera autora, czas oraz poprzednie i nowe dane.
- Ochrona przed podwójnym wejściem i nadpisaniem zmian z drugiego tabletu.
- Instalacja na Androidzie jako PWA. Działa w Chrome / Edge przez HTTPS.
- Tryb przerwy: strona z logo i komunikatem, wstrzymane zapisy i obsługa.
- GitHub Actions: testy i deploy, podgląd / aktualizacja infrastruktury, prywatne kopie danych.

Nie ma automatycznej wysyłki SMS ani e-maili — organizator kopiuje wygenerowany link i przekazuje go rodzicowi. Rodzice nie zakładają kont.

## Uruchomienie lokalne

Wymagany Node.js 22.12+ lub nowszy LTS.

    npm ci
    npm run dev

Otwórz http://127.0.0.1:5173 i wybierz logowanie zespołu. Lokalny login używa wyłącznie fikcyjnego konta admin@example.test. Dane testowe zapisują się w ignorowanym pliku .local/data.json. Serwer lokalny nasłuchuje tylko na 127.0.0.1. Login demonstracyjny nie jest częścią pakietu produkcyjnego.

    npm run check
    npx playwright install --with-deps chromium
    npm run test:e2e

Na Windows można użyć już zainstalowanego Edge:

    $env:PLAYWRIGHT_CHANNEL='msedge'
    npm run test:e2e

Testy API sprawdzają role, CSRF, ograniczenia formularza, ważność i rotację linków, QR, równoczesne wejścia, zastępstwo i audyt. E2E przechodzi od utworzenia wydarzenia i linku przez zgłoszenie, akceptację, skaner, zmianę dziecka i wejście/wyjście. Testuje również widoki telefonu i tabletu oraz brak internetu.

## Wdrożenia

Push na main uruchamia **Test and deploy application**. Deploy następuje po kompilacji, testach API, sprawdzeniu zależności i E2E. Pull request uruchamia testy, bez dostępu do produkcji. Środowisko GitHub production dopuszcza wyłącznie main.

**Setup or update Azure infrastructure** jest uruchamiany ręcznie w Actions:

1. mode=preview — podgląd planowanych zmian;
2. mode=apply — wdrożenie Bicep;
3. hosting Free domyślnie, Standard opcjonalnie.

GitHub loguje się do Azure przez OIDC. Nie zapisujemy sekretu service principal ani tokenu deploymentu w repozytorium. Tożsamość ma Contributor tylko w RG aplikacji oraz DNS Zone Contributor tylko do strefy samychswoich.pl. Skrypty configure-identity.ps1 i configure-ci.mjs dokumentują konfigurację startową.

Workflow używa actions/checkout@v7, actions/setup-node@v7, actions/upload-artifact@v7 oraz azure/login@v3, działających na Node.js 24. Node.js 22 ustawiany przez setup-node jest wersją aplikacji zgodną z Azure Functions. Azure/static-web-apps-deploy@v1 jest akcją kontenerową (Docker), niezależną od środowiska Node akcji.

Kod infrastruktury znajduje się w infra/main.bicep. Tworzy SWA, Storage, tabelę eventqr i prywatny kontener backups. Ustawienia API zawierają klucz Storage i adres pierwszego administratora.

## DNS

CNAME: **eventy → zealous-coast-032818a03.3.azurestaticapps.net**, TTL 300.

Publiczna delegacja samychswoich.pl wskazuje ns1–ns4.bdm.microsoftonline.com. Rekord CNAME został dodany w aktywnym DNS 18.09.2026. W subskrypcji istnieje też nieautorytatywna strefa Azure DNS (ns1–ns4-38.azure-dns.*). Jej zmiana nie aktualizuje publicznego DNS; przy zmianie nazwy hosta trzeba również zaktualizować rekord u faktycznego operatora.

Po propagacji:

    az staticwebapp hostname set -g rg-eventy-samychswoich -n swa-eventy-samychswoich --hostname eventy.samychswoich.pl --validation-method cname-delegation

Azure wystawia i odnawia certyfikat TLS. Workflow aplikacji używa adresu technicznego do smoke testu, dzięki czemu oczekiwanie na DNS nie blokuje weryfikacji deploymentu.

## Instrukcja dla organizatora

1. Zaloguj się kontem Microsoft i utwórz wydarzenie.
2. W Zespół i uprawnienia dodaj adresy kont Microsoft obsługi, nadaj role i przypisz wydarzenia.
3. Ustaw wydarzenie na Zapisy otwarte.
4. W Nowe zaproszenie wybierz Link dla rodzica (telefon i limit dzieci) albo Wpisz dane rodziny (rodzice, dzieci, e-mail i telefony). Wpisane przez organizatora dane zapisują się jako Do weryfikacji; przycisk Otwórz profil zaproszenia prowadzi do akceptacji. Link pozostaje dostępny w obu wariantach.
5. Zweryfikuj zgłoszenia. Po akceptacji rodzic zobaczy QR pod swoim linkiem.
6. Przed wydarzeniem wybierz W trakcie. Na tablecie otwórz Obsługa wejścia.
7. Zeskanuj QR lub wpisz nazwisko. Sprawdź dane, w razie potrzeby edytuj z powodem i potwierdź każde dziecko osobno.
8. Przy odbiorze potwierdź wyjście. Dashboard pokazuje dzieci pozostające pod opieką.
9. Po wyjściu wszystkich dzieci można zakończyć wydarzenie.
10. Między wydarzeniami administrator włącza przerwę w sekcji Platforma.

## Android

Otwórz stronę w Chrome na Androidzie → menu → Zainstaluj aplikację / Dodaj do ekranu głównego. Zezwól na aparat przy pierwszym skanowaniu. PWA nie wymaga sklepu Play. Potrzebne jest połączenie z internetem; aplikacja nie potwierdza wejść offline. Zapewnij Wi-Fi lub hotspot przy wejściu.

## Kopie i utrzymanie

**Backup event data** uruchamia się raz na tydzień lub ręcznie. Eksport nie jest publikowany jako GitHub artifact — trafia do prywatnego kontenera Azure. Przed wydarzeniem i po nim uruchom kopię ręczną. Kopię należy odtwarzać najpierw do oddzielnej tabeli; nie nadpisywać produkcji bez porównania danych. Table Storage nie ma w tej konfiguracji automatycznego point-in-time restore.

SWA Free nie ma SLA. Koszty Storage zależą od wykorzystania i zwykle będą małe przy kilkuset odsłonach; nie jest to gwarancja bezpłatności. Tryb przerwy zachowuje dane i nie usuwa zasobów.

Szczegóły modelu danych, uwierzytelniania, ochrony i retencji: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
