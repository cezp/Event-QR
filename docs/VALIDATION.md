# Weryfikacja wdrożenia

Data: 18 września 2026.

## Automatyczne testy

- TypeScript oraz produkcyjny build Vite i Azure Functions: poprawne.
- 19 testów API: pełny dostęp globalnego administratora bez przypisania do wydarzeń, tożsamość z zamaskowanym lub zmienionym userDetails, odmowa przejęcia uprawnień przez inne userId, zakresy wydarzeń i odebranie dostępu.
- 3 scenariusze E2E: przechodzą lokalnie w Microsoft Edge oraz w Chromium na runnerze GitHub Actions.
- npm audit: brak zgłoszonych podatności dla zainstalowanych zależności.
- Test na rzeczywistym Azure Table Storage: transakcja dwóch rekordów, odczyt, zapytanie, aktualizacja ETag i odrzucenie starej wersji. Syntetyczne rekordy usunięto po teście.

Test E2E obejmuje tworzenie wydarzenia, prywatnego linku, formularz rodzica na ekranie telefonu, akceptację zgłoszenia, wyświetlenie QR, odczyt kodu w skanerze przez pole ręczne, zamianę dziecka z powodem, przyjęcie, historię i wyjście. Osobny scenariusz weryfikuje ograniczony interfejs crew i komunikat o braku sieci.

Test regresji zapisu wydarzenia wymusza błędy odczytu listy wydarzeń i zaproszeń po udanym zapisie. Formularz zamyka się, pokazuje potwierdzenie i wybiera zapisane wydarzenie bez powtórnego POST. Dwie kolejne edycje wykorzystują nowy ETag z odpowiedzi zapisu i również działają bez dodatkowego odczytu listy.

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

Potwierdzone przebiegi GitHub:

- [Testy i wdrożenie aplikacji](https://github.com/cezp/Event-QR/actions/runs/35355308387)
- [Poprawka rozpoznawania administratora: 19 testów API, 3 E2E i wdrożenie](https://github.com/cezp/Event-QR/actions/runs/35359376645)
- [Podgląd infrastruktury](https://github.com/cezp/Event-QR/actions/runs/35355370164)
- [Prywatna kopia danych](https://github.com/cezp/Event-QR/actions/runs/35355380666)

Pierwsza próba OIDC ujawniła nowy format subject GitHub zawierający niezmienne ID właściciela i repozytorium. Zaufanie w Entra poprawiono, a przebiegi powtórzono z wynikiem pozytywnym.

## Zakres, którego automatyzacja nie zastępuje

- Testy przeglądarkowe używają fikcyjnych danych i lokalnego logowania testowego, którego nie ma w produkcyjnym pakiecie.
- Weryfikację produkcyjną przeprowadzono w sesji Microsoft po zalogowaniu przez właściciela konta; sam proces MFA pozostaje po stronie właściciela.
- Rozpoznawanie QR fizycznym aparatem tabletu oraz instalacja PWA na rzeczywistym Androidzie wymagają próby na urządzeniu. Kod skanera, ścieżka obsługi QR i uprawnienia API zostały sprawdzone bez kamery fizycznej.
- Przywrócenie pełnej kopii do nowego środowiska nie było wykonywane.
