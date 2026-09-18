# Architektura i bezpieczeństwo

React + TypeScript + Vite. Backend Fastify jest pakowany jako zarządzana Azure Function w Azure Static Web Apps. Baza to Azure Table Storage (Standard LRS) w West Europe. UI i API mają wspólny origin. Nie ma stale działającej VM, kontenera ani płatnego serwera SQL.

## Konta i role

Azure Static Web Apps weryfikuje konto Microsoft i dostarcza podpisaną przez platformę tożsamość przez zaufany nagłówek x-ms-client-principal. API jest zarządzane i dostępne tylko przez SWA. Nie należy wystawiać tej funkcji jako osobnego publicznego backendu bez dodatkowej walidacji JWT.

API dopuszcza wyłącznie Microsoft (aad), a następnie sprawdza aktywne konto na liście zespołu. Pierwsze logowanie wiąże dopuszczony adres e-mail ze stabilnym userId. Administrator startowy jest wskazany przez BOOTSTRAP_ADMIN_EMAIL. Pozostałe konta tworzy globalny administrator. MFA stosuje dostawca tożsamości; zalecane jest wymaganie MFA dla zespołu w Entra.

Po powiązaniu konta uprawnienia są rozpoznawane po principalId odpowiadającym zaufanemu userId SWA. Jeśli userDetails jest zamaskowane, zmieniło się lub wskazuje adres innego wpisu, API odnajduje wcześniej powiązane konto. Zachowuje jego rolę, zakres wydarzeń i stan active. Nieznany userId nie przejmuje konta już powiązanego z innym identyfikatorem. Nie stosujemy dopasowania po prefiksie zamaskowanego adresu.

- admin: wszystkie wydarzenia, zespół i tryb przerwy;
- event_admin: wyłącznie przydzielone wydarzenia, zaproszenia i akceptacja;
- crew: tylko przydzielone wydarzenia, odczyt i wejścia/wyjścia; korekty zaakceptowanych zaproszeń w trakcie wydarzenia.

Lokalny serwer ma odrębny login demonstracyjny. Plik server/dev.ts nie jest importowany ani pakowany do API produkcyjnego.

## Zaproszenie

Jedno zaproszenie zawiera od 1 do 2 rodziców oraz dzieci z limitem nadanym przez organizatora. To relacja rodzina–dzieci przypisana do konkretnego wydarzenia; nie ma łączenia rodzin automatycznie po nazwisku lub telefonie pomiędzy wydarzeniami.

Link rodzica zawiera losowe 256 bitów. W bazie przechowywany jest wyłącznie skrót SHA-256 tego sekretu. Link wygasa z końcem wydarzenia i może być wymieniony; stary link natychmiast przestaje działać. Kod QR ma osobny losowy sekret i nie zawiera danych osobowych. Skanowanie wymaga konta obsługi. Rodzic otrzymuje QR dopiero po akceptacji zgłoszenia.

Formularz zbiera tylko imiona i nazwiska, e-mail i telefony. Główny telefon pochodzi ze wstępnego zapisu. Rodzic nie może ominąć limitu dzieci ani samodzielnie zatwierdzić zaproszenia. Ponowna wysyłka zaakceptowanego lub oczekującego zgłoszenia jest blokowana.

## Spójność

Każda korekta zaproszenia i wpis audytu są zapisywane w jednej transakcji Table Storage, w partycji danego wydarzenia. Operacje stosują ETag. Stare formularze zwracają 409 zamiast nadpisywać nowe dane. Równoczesne skany nie naliczają podwójnego wejścia. Powtórzenie wejścia już obecnego dziecka jest idempotentne.

Nie można zamienić tożsamości dziecka, które pozostaje wewnątrz. Należy najpierw odnotować wyjście. Zastępstwo tworzy nowy identyfikator dziecka i zachowuje oryginalne dane w audycie. Dashboard pokazuje aktualnie obecnych oraz łączną liczbę przyjętych dzieci; licznik zachowuje wcześniejsze wejścia także po zastąpieniu dziecka. Oryginalne nazwiska i operacje pozostają w historii zaproszenia.

## Ochrona danych

Azure szyfruje dane w spoczynku i w tranzycie. Storage nie ma publicznych blobów. Klucz Storage jest tylko w ustawieniach API i w pamięci procesu CI. Nie trafia do repozytorium ani klienta. Mutacje wymagają JSON i własnego nagłówka; cross-site fetch jest odrzucany. API zwraca no-store. Brak zewnętrznych skryptów, analityki, fontów i trackerów.

PWA nie cache'uje profili, API ani stron zaproszeń. Service worker przechowuje tylko neutralną stronę offline i logo. Wejścia nie są kolejkowane offline. Brak sieci musi być jasno widoczny dla obsługi.

Prywatne linki są sekretami okaziciela. Nie umieszczać ich w publicznych kanałach, systemach analitycznych ani logach URL. Aplikacja nie loguje treści żądań. Historię zmian mogą czytać upoważnieni członkowie zespołu wydarzenia; interfejs nie pozwala jej edytować.

## Kopie i retencja

Workflow Backup event data zapisuje raz na tydzień prywatny eksport w kontenerze backups. Dane testowe z lokalnego środowiska nie są wysyłane do Azure. Blob soft delete trwa 14 dni; to ochrona kopii, nie samej tabeli. Table Storage nie ma w tym projekcie automatycznego przywracania do punktu w czasie. Przed większym wydarzeniem i po nim należy uruchomić backup ręcznie.

Organizator powinien ustalić i przekazać rodzicom rzeczywistą podstawę przetwarzania, kontakt, zasady uczestnictwa i okres retencji. Aplikacja nie zgaduje tych ustaleń ani nie usuwa automatycznie historii dzieci. Procedurę usuwania należy realizować po ustaleniu retencji i zakresu kopii zapasowych.

## Tożsamość wdrożeniowa

Federacja Entra ufa dokładnemu subject repo:cezp@46568792/Event-QR@1375817888:environment:production. GitHub używa niezmiennych identyfikatorów właściciela i repozytorium dla nowych repozytoriów od lipca 2026; stary subject z samymi nazwami nie działa. Źródło: https://docs.github.com/en/actions/reference/security/oidc. Środowisko production akceptuje tylko gałąź main.

## Koszt i dostępność

Domyślnie SWA Free: statyczne pliki, zarządzane API, własna domena i TLS. Storage jest płatny za zajętość i operacje. Nie ma gwarancji zerowego kosztu i brak SLA Free. Dla kilkuset odsłon głównym niewielkim kosztem powinno być Storage; weryfikuj koszt w subskrypcji. Tryb przerwy blokuje rejestracje i obsługę, zachowując landing oraz możliwość zalogowania administratora. Nie usuwa zasobów ani danych.

Przejście na Standard jest opcjonalne w workflow infrastruktury. Nie włączono płatnego Front Door, SQL, Application Insights ani Log Analytics.
