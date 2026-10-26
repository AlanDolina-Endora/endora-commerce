---
title: projects
description: Projekty dla zera lub wielu organizacji, prowadzone przez własne etapy przez członków pełniących role projektowe
---

# `projects`

Moduł Projekty przechowuje **projekty**: pracę dla jednej lub wielu organizacji
— albo dla żadnej, czyli projekt wewnętrzny — prowadzoną przez własne
**etapy** przez **członków** pełniących **role projektowe**, takie jak
*Handlowiec* czy *Kierownik Projektu*.

## Co robi

Każdy projekt ma numer, np. `PRJ-000042`, nadawany przy utworzeniu i nigdy
nieużywany ponownie, tytuł, opcjonalną wartość z walutą oraz datę rozpoczęcia.
Projekt jest **otwarty**, dopóki trwa, a kończy się jako **zrealizowany** lub
**utracony**; zamknięty projekt można ponownie otworzyć.

Projekt dotyczy **zera lub wielu organizacji**. Projekt bez żadnej organizacji
to projekt **wewnętrzny**.

Każdy projekt ma własne **etapy** — nazwę, kolor i planowany czas trwania w
dniach — oraz własny **przebieg**: dozwolone przejścia między etapami. Otwarty
projekt jest zawsze dokładnie w jednym etapie.

Role projektowe to lista prowadzona przez operatora. Dwie istnieją od początku,
*Handlowiec* i *Kierownik Projektu*; można zmienić ich nazwy lub je
zarchiwizować, ale nie można ich usunąć. Rola to etykieta członka jednego
projektu: nie nadaje żadnych uprawnień. Ta sama osoba może pełnić różne role w
różnych projektach. Powody utraty projektu — *Cena*, *Wybór konkurencji*,
*Anulowany przez klienta*, *Brak decyzji* i *Inny powód* — to lista prowadzona
przez operatora w ten sam sposób.

## W panelu administracyjnym

Ekrany projektów — lista projektów, ekran projektu z paskiem etapów oraz
konfiguracja ról, szablonów i powodów utraty — pojawią się w kolejnych wydaniach
tego modułu. Do tego czasu projekty tworzy się, prowadzi i odczytuje przez
opisane niżej API.

## Prowadzenie projektu

**Tworzenie projektu.** Projekt tworzy się z tytułem i etapami, w kolejności;
opcjonalnie z opisem, wartością z walutą, datą rozpoczęcia (dzisiejszą, jeśli
jej nie podano), organizacjami, członkami z ich rolami oraz ustawieniem, kto go
widzi. Projekt dostaje numer, jest **otwarty** i zaczyna od **pierwszego
etapu**. Każda wskazana organizacja musi być dostępna dla osoby tworzącej
projekt, a każdy członek i każda dopisana osoba musi być aktywnym
administratorem. Członek może pełnić dowolną liczbę ról, także żadnej.

**Etapy.** Każdy etap ma nazwę, kolor, planowany czas trwania w dniach, role
odpowiedzialne za niego oraz informację, czy z tego etapu można zakończyć
projekt. Zakończenie jest dozwolone z ostatniego etapu, chyba że etapy mówią
inaczej. Etap przechowuje też liczby dni przed terminem, w które członkowie
mają dostać powiadomienie, oraz to, czy blokuje zakończenie do czasu wykonania
jego zadań; obie te rzeczy zaczną działać w kolejnych wydaniach, które wprowadzą
powiadomienia o terminach i zadania. Etapy można dodawać (na końcu), zmieniać
im nazwę i kolor, zmieniać ich kolejność i usuwać — z wyjątkiem etapu, w którym
projekt jest, oraz jedynego etapu projektu.

**Przebieg.** Przejścia, które projekt może wykonać między etapami, są jego
własne. Domyślnie każdy etap przechodzi do następnego, a do etapu dodanego na
końcu prowadzi przejście z etapu, który był wcześniej ostatni. Przebieg można
zastąpić dowolnym zestawem przejść — z powrotem z *Dostawy* do *Projektu* albo z
pominięciem *Pilotażu*. Etap, do którego nie prowadzi żadne przejście od
pierwszego, jest dozwolony; projekt wskazuje go jako **nieosiągalny**, żeby
można było poprawić przebieg.

**Przenoszenie.** Projekt przechodzi tylko dozwolonym przejściem; każde inne
jest odrzucane i nic się nie zmienia. Wejście do etapu zapisuje dzień jego
rozpoczęcia — dzisiejszy, w strefie czasowej z `projects.alerts_time_zone` —
oraz jego termin: ten dzień plus planowany czas trwania etapu, albo ten sam
dzień przy czasie trwania zero. Termin ustawiony ręcznie zostaje bez zmian.
Ponowne wejście do etapu rozpoczyna go od nowa.

**Zamykanie.** Projekt zamyka się jako **zrealizowany** z etapu, z którego
zakończenie jest dozwolone, albo jako **utracony** z dowolnego etapu — z
powodem utraty z listy i opcjonalnym komentarzem; zapisywany jest etap, w
którym projekt utracono. Zamknięty projekt można **ponownie otworzyć**: wraca do
etapu, w którym go zamknięto, a jego wynik zostaje wyczyszczony.

**Dwie osoby naraz.** Każde przejście, zamknięcie, ponowne otwarcie i edycja
wskazuje wersję projektu, na której ją wykonano. Jeśli w międzyczasie ktoś inny
zmienił projekt, zmiana jest odrzucana i nic nie zostaje zastosowane dwa razy:
trzeba odświeżyć projekt i spróbować ponownie.

**Historia.** Każde wejście do etapu, każde zamknięcie i każde ponowne otwarcie
to wiersz historii etapów projektu, z nazwami etapów takimi, jakie wtedy były,
z tym, kto to zrobił i kiedy; każda zmiana trafia też do dziennika audytu.

**Logika innych modułów.** Inny moduł albo wdrożenie może zarejestrować
sprawdzenie, które uruchamia się przed przejściem, zamknięciem lub ponownym
otwarciem i odrzuca je z własnym uzasadnieniem; wyłączonego modułu nie pyta
się. To, co się stało, jest potem ogłaszane jako zdarzenie.

Do niczego z tego nie jest potrzebny moduł Zadania: projekt przechodzi przez
swoje etapy także przy wyłączonych zadaniach.

## Kto widzi projekt

Decydują o tym dwie reguły, zawsze w tej kolejności.

**1. Dostęp do organizacji.** Administrator, który ma dostęp do wszystkich
organizacji — każda rola poza rolą przedstawiciela handlowego — widzi każdy
projekt. Przedstawiciel handlowy widzi projekt tylko wtedy, gdy **każda**
organizacja projektu jest do niego przypisana; projekt dla dwóch organizacji, z
których ma dostęp do jednej, dla niego nie istnieje. Projekt wewnętrzny widzą
tylko administratorzy z dostępem do wszystkich organizacji. Nic, co opisano
niżej, nie poszerza tej reguły.

**2. Widoczność.** W granicach swojego dostępu administrator widzi projekt,
gdy:

- ma uprawnienie do wglądu we wszystkie projekty (*Wgląd we wszystkie
  projekty*), lub
- jest członkiem projektu, lub
- jest jedną z osób dopisanych do projektu, lub
- projekt jest otwarty dla wszystkich.

To, czy projekt jest otwarty dla wszystkich, wynika z ustawienia modułu **Kto
widzi projekt** (`projects.visibility`) — *wszyscy*, którzy mogą przeglądać
projekty, albo tylko jego *członkowie* i dopisane osoby (domyślnie) — chyba że
sam projekt ustawiono na *wszyscy* albo na *członkowie i dopisane osoby*.

Projekt, którego ktoś nie może zobaczyć, nie istnieje dla niego nigdzie: ani na
liście, ani w jej łącznej liczbie, ani pod swoim adresem. Adres takiego
projektu odpowiada dokładnie tak samo jak adres projektu, którego nigdy nie
utworzono.

## Włączanie i wyłączanie

Projekty to moduł opcjonalny. Jest domyślnie włączony, a operator wyłącza go i
włącza ponownie na ekranie **Moduły** panelu administracyjnego
(`/platform/modules`).

Gdy moduł jest wyłączony:

- każdy endpoint `/api/v1/admin/projects…` odpowiada `503` z kodem
  `MODULE_DISABLED`;
- jego uprawnień nie można już nadać żadnej roli, a jego ustawień nie można
  zmieniać — z wyjątkiem samego przełącznika.

Nic nie jest usuwane. Każdy projekt, jego etapy i historia zostają w bazie
danych, a po ponownym włączeniu modułu wszystko wraca dokładnie do stanu
sprzed wyłączenia.

## Ustawienia

| Ustawienie | Domyślnie | O czym decyduje |
| --- | --- | --- |
| `projects.enabled` | włączone | Czy moduł jest włączony. |
| `projects.visibility` | `members` | Kto widzi projekt korzystający z ustawienia: `everyone` — wszyscy, którzy mogą przeglądać projekty, albo `members` — jego członkowie i dopisane osoby. |
| `projects.alerts_time_zone` | `Europe/Warsaw` | Strefa czasowa, w której liczony jest „dzisiejszy” dzień projektów — dzień rozpoczęcia etapu i to, czy jego termin minął. |

## Uprawnienia

| Kod | Na co pozwala |
| --- | --- |
| `projects:read` | Przeglądanie projektów — listy, pojedynczego projektu i jego historii etapów — z zastrzeżeniem obu reguł z sekcji *Kto widzi projekt*. |
| `projects:write` | Tworzenie, edycja i usuwanie projektów; ustawianie ich organizacji, członków, etapów i przebiegu; przenoszenie, zamykanie i ponowne otwieranie. Wymaga `projects:read`. |

## Zadania, szablony, powiązania, współpraca, powiadomienia o terminach i analityka

*Każda z tych funkcji pojawi się w jednym z kolejnych wydań modułu i zostanie tu
opisana, gdy to nastąpi.*

## Dla programistów

### API

| Metoda i ścieżka | Uprawnienie | Odpowiedź |
| --- | --- | --- |
| `GET /api/v1/admin/projects` | `projects:read` | Strona projektów oraz liczba projektów widocznych dla wywołującego: `{ items, nextCursor, total }`. Filtry: `state` (powtarzalny), `organizationId`, `memberId` (identyfikator administratora lub `me`), `roleId`, `templateId`, `stageName` (nazwa bieżącego etapu), `q` (numer lub tytuł), `sort` (`createdAt` — domyślnie, `value` albo `deadline` — termin bieżącego etapu; projekty bez wartości lub terminu są zawsze na końcu), `order` (`asc` lub `desc`, domyślnie `desc`), `cursor`, `limit` (najwyżej 100). |
| `POST /api/v1/admin/projects` | `projects:write` | `201` `{ data: ProjectDetail }`. Bez szablonu pole `stages` jest wymagane. |
| `GET /api/v1/admin/projects/:id` | `projects:read` | `{ data: ProjectDetail }` albo `404` `PROJECT_NOT_FOUND` — tak samo dla projektu, który nie istnieje, jak dla takiego, którego wywołujący nie może zobaczyć. |
| `PATCH /api/v1/admin/projects/:id` | `projects:write` | Tytuł, opis, wartość, data rozpoczęcia, razem z `version`. |
| `DELETE /api/v1/admin/projects/:id` | `projects:write` | `204`; `409` `PROJECT_HAS_LINKS`, dopóki są podpięte dokumenty. |
| `PUT /api/v1/admin/projects/:id/organizations` | `projects:write` | Cały zestaw; `422` `PROJECT_ORGANIZATION_OUT_OF_SCOPE`. |
| `PUT /api/v1/admin/projects/:id/members` | `projects:write` | Cały zestaw członków i ich ról; `422` `PROJECT_MEMBER_INVALID`. |
| `POST /api/v1/admin/projects/:id/stages` | `projects:write` | `201` `{ data: ProjectStage }`, dodany na końcu. |
| `PATCH /api/v1/admin/projects/:id/stages/:stageId` | `projects:write` | Dowolny atrybut; `deadlineOn` ustawia termin ręcznie, `null` przywraca termin liczony jako początek + czas trwania. |
| `DELETE /api/v1/admin/projects/:id/stages/:stageId` | `projects:write` | `204`; `409` `PROJECT_STAGE_CURRENT` lub `PROJECT_STAGE_LAST`. |
| `PUT /api/v1/admin/projects/:id/stages/order` | `projects:write` | Identyfikatory wszystkich etapów w nowej kolejności. |
| `PUT /api/v1/admin/projects/:id/moves` | `projects:write` | Cały przebieg → `{ data: { moves, unreachableStageIds } }`. |
| `POST /api/v1/admin/projects/:id/move` | `projects:write` | `{ toStageId, version }` → `{ data: { project, entry, createdTaskIds, notes } }`; `409` `PROJECT_MOVE_NOT_PERMITTED`, `PROJECT_CHANGED` lub `PROJECT_GUARD_REFUSED`. |
| `POST /api/v1/admin/projects/:id/close` | `projects:write` | `{ outcome: 'completed', version }` albo `{ outcome: 'lost', lossReasonId, comment?, version }`; `409` `PROJECT_COMPLETION_NOT_PERMITTED`, `422` `PROJECT_LOSS_REASON_INVALID`. |
| `POST /api/v1/admin/projects/:id/reopen` | `projects:write` | `{ version }` → powrót do etapu, w którym projekt zamknięto. |
| `GET /api/v1/admin/projects/:id/stage-history` | `projects:read` | Każde wejście do etapu, zamknięcie i ponowne otwarcie, od najstarszych. |
| `GET /api/v1/admin/projects/roles`, `…/loss-reasons` | `projects:read` | Słowniki z polem `label` w języku czytającego; `active=true` pomija zarchiwizowane wiersze. |

Kształty żądań i odpowiedzi to schematy Zod z `@endora-commerce/contracts`
(`projects.ts`).

### Strażnicy etapów i zdarzenia

Moduł lub wdrożenie odrzuca przejście, zamknięcie albo ponowne otwarcie,
rejestrując strażnika w `projectStageGuardRegistry`
(`ProjectStageGuardRegistryPort` z `@endora-commerce/contracts`) z haka
startowego służącego wyłącznie do kontrybucji i deklarując krawędź jako
`contributes-to`. Strażnik jest pytany — z projektem, etapami i rodzajem
(`move`, `close_completed`, `close_lost`, `reopen`) — zanim cokolwiek zostanie
zapisane, i odpowiada `{ allow: true }` albo `{ allow: false, reason }`;
odmowa to `409` `PROJECT_GUARD_REFUSED` z uzasadnieniem jako komunikatem.
Strażnik wyłączonego modułu jest pomijany.

Po każdym zatwierdzonym zapisie moduł emituje, jeden raz:
`projects.project.created.v1`, `projects.stage.moved.v1` (z nazwami etapów
takimi, jakie wtedy były), `projects.project.closed.v1` (z wynikiem, etapem i —
przy utracie — kodem powodu utraty) oraz `projects.project.reopened.v1`.

### Jedna ścieżka odczytu

Każda tabela należąca do projektu jest sklasyfikowana jako **rule-scoped**:
żaden filtr ORM jej nie zawęża, a moduł sam egzekwuje obie reguły z sekcji *Kto
widzi projekt*, w jednym miejscu — w usłudze `ProjectAccess`. Każda lista,
liczba i odczyt po identyfikatorze w module albo zawiera jej predykat SQL, albo
zaczyna od projektu, który ona zwróciła, a własny test modułu odrzuca odczyt
tabeli projektu w każdym innym miejscu. Kod dodawany do tego modułu odczytuje
projekty przez nią.
