# Weryfikacja wdrożenia

Data: 18 września 2026.

## Automatyczne testy

- TypeScript oraz produkcyjny build Vite i Azure Functions: poprawne.
- 23 testy API: rejestracja rodziców, ręczne dodawanie pełnych danych, role, audyt, limit dzieci, weryfikacja, QR i obecność; dodatkowo rozpoznawanie konta po stabilnym userId i odebranie dostępu.
- 4 scenariusze E2E: testowane lokalnie w Microsoft Edge oraz w Chromium na runnerze GitHub Actions.
- npm audit: brak zgłoszonych podatności dla zainstalowanych zależności.
- Test na rzeczywistym Azure Table Storage: transakcja dwóch rekordów, odczyt, zapytanie, aktualizacja ETag i odrzucenie starej wersji. Syntetyczne rekordy usunięto po teście.

Test E2E obejmuje tworzenie wydarzenia, prywatnego linku, formularz rodzica na ekranie telefonu, akceptację zgłoszenia, wyświetlenie QR, odczyt kodu w skanerze przez pole ręczne, zamianę dziecka z powodem, przyjęcie, historię i wyjście. Osobny scenariusz weryfikuje ograniczony interfejs crew i komunikat o braku sieci.

Test regresji zapisu wydarzenia wymusza błędy odczytu listy wydarzeń i zaproszeń po udanym zapisie. Formularz zamyka się, pokazuje potwierdzenie i wybiera zapisane wydarzenie bez powtórnego POST. Dwie kolejne edycje wykorzystują nowy ETag z odpowiedzi zapisu i również działają bez dodatkowego odczytu listy.

Scenariusz ręcznego zaproszenia obejmuje dwoje rodziców, dwoje dzieci, oba telefony, e-mail, zachowanie danych przy zmianie sposobu zapisu, status Do weryfikacji, audyt autora i akceptację. Osobna sesja rodzica otwiera wygenerowany link i widzi QR. Sprawdzono formularz na tablecie 800×1000 i telefonie 390×844.

Każdy lokalny przebieg E2E uruchamia własny serwer i plik danych w katalogu tymczasowym systemu, poza synchronizacją OneDrive. Serwer API podczas E2E działa bez obserwowania zmian plików.

W sesji produkcyjnej odtworzono naprzemienne przekazywanie pełnego i zamaskowanego userDetails. Odczyt konta po samym adresie odrzucał część żądań poprawnie zalogowanego administratora. Testy regresji używają tego samego userId z pełnym adresem, maską, nowym aliasem i adresem innego użytkownika; weryfikują zachowanie uprawnień faktycznie powiązanego konta.

Zrzuty z testów sprawdzono w wymiarach desktop, tablet 800×1280 i telefon 390×844. Widok mobilny nie ma poziomego przewijania. Wybór wydarzenia pozostaje zachowany po odświeżeniu.

## Produkcja

Host: https://eventy.samychswoich.pl

- Domena w Azure ma status Ready, HTTPS działa bez pomijania weryfikacji certyfikatu.
- GET /api/health: 200 i status ok; sprawdzenie czyta ustawienia w Azure Storage.
- GET /api/public/config: 200.
- GET /api/events, /api/staff i /api/settings bez sesji: 401.
- Próba podszycia się pod administratora własnym x-ms-client-principal: 401 (Azure usuwa niezaufaną tożsamość).
- Niedozwolony provider logowania GitHub: 404.
- Dane API mają Cache-Control: no-store.
- CSP, Referrer-Policy, manifest PWA i przekierowanie do logowania Microsoft są poprawne.
- Po poprawce rozpoznawania konta: w istniejącej sesji Microsoft globalnego administratora utworzono i edytowano wydarzenie przez UI. Panel zespołu pokazał aktywnego administratora z dostępem do wszystkich wydarzeń; odczyt zaproszeń i ustawień platformy działał.
- Usunięto tylko dwa wydarzenia utworzone podczas tej weryfikacji i ich trzy wpisy audytu. Pierwotne wydarzenie użytkownika „Test1” pozostało zapisane.
- Po wdrożeniu ręcznego dodawania w sesji Microsoft utworzono fikcyjne zaproszenie z danymi rodzica, dziecka, telefonu, e-maila i notatki. Profil zawierał te dane i status Do weryfikacji, a historia autora oraz operację Utworzono zaproszenie z danymi rodziny. Po sprawdzeniu usunięto wyłącznie to testowe zaproszenie i jego wpis audytu. Istniejące zaproszenie użytkownika zachowano.

Potwierdzone przebiegi GitHub:

- [Pełne dane w nowym zaproszeniu: 23 testy API, 4 E2E i wdrożenie](https://github.com/cezp/Event-QR/actions/runs/35363047595)
- [Poprawka rozpoznawania administratora: 19 testów API, 3 E2E i wdrożenie](https://github.com/cezp/Event-QR/actions/runs/35359376645)
- [Podgląd infrastruktury na nowych akcjach](https://github.com/cezp/Event-QR/actions/runs/35363100528)
- [Prywatna kopia danych na nowych akcjach](https://github.com/cezp/Event-QR/actions/runs/35363106538)

Wszystkie trzy workflow zakończyły się sukcesem po aktualizacji checkout, setup-node i upload-artifact do v7 oraz Azure Login do v3. Sprawdzono adnotacje wszystkich zadań: brak ostrzeżeń o Node.js 20. Pozostał tylko komunikat informacyjny GitHub o planowanej migracji obrazu ubuntu-latest do Ubuntu 26.

Pierwsza próba OIDC ujawniła nowy format subject GitHub zawierający niezmienne ID właściciela i repozytorium. Zaufanie w Entra poprawiono, a przebiegi powtórzono z wynikiem pozytywnym.

## Zakres, którego automatyzacja nie zastępuje

- Testy przeglądarkowe używają fikcyjnych danych i lokalnego logowania testowego, którego nie ma w produkcyjnym pakiecie.
- Weryfikację produkcyjną przeprowadzono w sesji Microsoft po zalogowaniu przez właściciela konta; sam proces MFA pozostaje po stronie właściciela.
- Rozpoznawanie QR fizycznym aparatem tabletu oraz instalacja PWA na rzeczywistym Androidzie wymagają próby na urządzeniu. Kod skanera, ścieżka obsługi QR i uprawnienia API zostały sprawdzone bez kamery fizycznej.
- Przywrócenie pełnej kopii do nowego środowiska nie było wykonywane.
