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

Projekty są w menu bocznym w sekcji **Projekty i zadania → Projekty**
(`/projects`), dla administratorów, którzy mogą przeglądać projekty, a ich
szablony w sekcji **Projekty i zadania → Szablony** (`/projects/templates`), dla
administratorów, którzy mogą konfigurować projekty.

**Lista** pokazuje każdy projekt, który możesz zobaczyć: numer, tytuł,
organizacje — albo *Wewnętrzny* — bieżący etap z terminem, oznaczonym *Po
terminie*, gdy minie, wartość oraz kierowników projektu. Można ją zawęzić
według stanu, organizacji, do projektów, w których jesteś członkiem, albo
projektów dowolnego członka, według roli projektowej, którą ktoś w nich pełni,
według szablonu, z którego je utworzono, i według nazwy bieżącego etapu;
przeszukać po numerze lub tytule i posortować według daty utworzenia, wartości
lub terminu bieżącego etapu; projekty bez wartości lub terminu są zawsze na
końcu.

**Nowy projekt** (`/projects/new`) najpierw proponuje **szablony**: wybór
szablonu wypełnia opis, proponuje każdemu członkowi najpierw role szablonu i
wymienia etapy, które projekt z niego dostanie — z przebiegiem, blokadami,
alertami i zadaniami etapów — a te zmienia się w zakładce *Etapy* projektu, gdy
już istnieje. Bez szablonu formularz wymaga etapów, w kolejności — każdy z
nazwą, kolorem i planowanym czasem trwania w dniach, co najmniej jeden. W obu
przypadkach wymaga tytułu, a opcjonalnie organizacji, wartości z walutą, daty
rozpoczęcia, opisu oraz członków, każdego z rolami, które pełni; wszystko, co
wypełnił szablon, można nadal zmienić. Bez organizacji projekt jest wewnętrzny,
a formularz mówi, kto go zobaczy. Projekt stosuje ustawienie modułu *Kto widzi
projekt*; wybór dla pojedynczego projektu i pola własne pojawią się w
kolejnych wydaniach.

**Ekran projektu** pokazuje projekt, jego stan, wartość i organizacje. Pod
nimi jest **pasek etapów**: wszystkie etapy w kolejności, z zaznaczonym
bieżącym, jego termin i tylko to, co projekt może zrobić dalej — przycisk dla
każdego przejścia dozwolonego przez jego przebieg, *Zamknij jako zrealizowany*
tam, gdzie bieżący etap pozwala zakończyć projekt, oraz *Zamknij jako
utracony*, który pyta o powód utraty i opcjonalny komentarz. Zamknięty projekt
mówi, kiedy i w którym etapie się zakończył, i pozwala go *Otworzyć ponownie*.
Gdy w międzyczasie ktoś inny zmienił projekt albo inny moduł odrzuci zmianę,
ekran mówi dlaczego i pokazuje projekt w obecnym stanie; gdy zmianę odrzuci
blokada zakończenia, wymienia też otwarte zadania, które ją zatrzymały, każde
jako odnośnik do zadania.

*Usuń projekt* pyta przed usunięciem. Projekt z powiązanymi rekordami nie jest
usuwany: ekran to mówi, a rekordy trzeba najpierw odłączyć.

Jego zakładki:

- **Przegląd** — opis, data rozpoczęcia i członkowie według ról.
- **Etapy** — nazwa, kolor, planowany czas trwania, role odpowiedzialne, dni
  alertów, blokada zakończenia i informacja, czy z danego etapu można zakończyć
  projekt, zapisywane osobno dla każdego etapu; tutaj dodaje się etapy (na
  końcu), przesuwa je w górę lub w dół i usuwa. Gdy moduł Zadania jest
  włączony, każdy etap ma też listę **zadań etapu** — tytuł, liczbę dni od
  rozpoczęcia etapu do terminu zadania i odpowiedzialną rolę — zapisywaną w
  całości dla każdego etapu; etap, którego zadań nie udało się utworzyć przy
  wejściu projektu, mówi o tym i proponuje *Utwórz ponownie zadania etapu*.
  Pod etapami **przebieg** narysowany jako graf, w którym dodaje się i usuwa
  przejścia; etap, do którego nie prowadzi żadne przejście od pierwszego, jest
  wskazany w ostrzeżeniu.
- **Zadania** — gdy moduł Zadania jest włączony, dla administratorów, którzy
  mogą przeglądać zadania: wszystkie etapy w kolejności z ich zadaniami — numer
  (odnośnik do zadania), tytuł, status, osoba przypisana i termin, z
  oznaczeniem zadań po terminie — a dla administratorów, którzy mogą tworzyć
  zadania, pole pod każdym etapem, które dodaje do niego zadanie po tytule.
- **Historia etapów** — każde wejście do etapu, każde zamknięcie i każde
  ponowne otwarcie, od najnowszych, z tym, kto to zrobił i kiedy.

Bez uprawnienia do tworzenia i prowadzenia projektów ekran jest tylko do
odczytu: etapy, przebieg i historia są widoczne, ale niczego nie można zmienić.

**Szablony** (`/projects/templates`) wymienia szablony według nazwy z liczbą
etapów; zarchiwizowane są pokazywane na życzenie, oznaczone jako
*Zarchiwizowany*. Ekran szablonu — albo *Nowy szablon* — pozwala edytować jego
nazwę, domyślny opis i role projektowe oraz etapy z tymi samymi polami,
zadaniami etapów i grafem przebiegu co zakładka *Etapy* projektu; wszystko
zapisuje się razem przyciskiem *Zapisz szablon*. *Duplikuj* tworzy niezależną
kopię i ją otwiera; *Archiwizuj* usuwa szablon z wyboru w *Nowym projekcie*, a
*Przywróć* go przywraca.

Role i powody utraty nie mają jeszcze ekranów; pojawią się w kolejnym wydaniu
tego modułu.

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
inaczej. Etap przechowuje też to, czy jest **blokadą zakończenia** dla swoich
zadań, oraz własne **zadania etapu** — jedno i drugie opisano niżej w sekcji
*Zadania etapów i blokada zakończenia* — a także liczby dni przed terminem, w
które członkowie mają dostać powiadomienie; te zaczną działać w wydaniu, które
wprowadzi powiadomienia o terminach. Etapy można dodawać (na końcu), zmieniać
im nazwę i kolor, zmieniać ich kolejność i usuwać — z wyjątkiem etapu, w którym
projekt jest, jedynego etapu projektu i etapu, który zawiera zadania.

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

## Zadania etapów i blokada zakończenia

Gdy moduł Zadania jest włączony, etapy projektu zawierają **zadania** — zadanie
projektu zawsze należy do jednego z jego etapów. Zadanie w projekcie jest
zwykłym zadaniem modułu Zadania (jego numer, osobę przypisaną, termin i status
opisuje strona Zadań) i widzą je tylko osoby, które mogą zobaczyć projekt: dla
każdego innego nie istnieje nigdzie — ani na liście zadań, ani w *Moich
zadaniach*, ani pod swoim adresem, nawet gdy jest mu przypisane.

**Blokada zakończenia.** Etap może być blokadą zakończenia. Projekt nie opuści
takiego etapu — przejściem ani zamknięciem jako zrealizowany z tego etapu —
dopóki któreś z zadań etapu nie ma statusu *wykonane* ani *anulowane*:
przejście jest odrzucane, nic się nie zmienia, a odmowa wymienia otwarte
zadania. Anulowane zadanie liczy się jako zakończone. Zamknięcia projektu jako
**utracony** blokada nigdy nie zatrzymuje. Etap, który nie jest blokadą,
wypuszcza projekt mimo otwartych zadań; zostają one w tym etapie.

**Zadania etapu.** Każdy etap może mieć listę **zadań etapu** — tytuł, opis,
rolę odpowiedzialną i przesunięcie terminu w dniach. Stają się prawdziwymi
zadaniami, gdy projekt **wchodzi** do etapu: z terminem w dniu rozpoczęcia
etapu plus przesunięcie i przypisane członkowi, który pełni rolę
odpowiedzialną, jeśli pełni ją dokładnie jeden aktywny członek; w przeciwnym
razie zadanie pozostaje nieprzypisane, a jego notatka wskazuje rolę — w języku
osoby, która czyta zadanie, i z bieżącą nazwą roli. Tworzy się
je raz na etap: ponowne wejście do etapu niczego nie tworzy. Zadania są
tworzone w imieniu osoby, która przeniosła projekt, i zapisywane we własnej
historii modułu Zadania. Etap bez zadań etapu niczego nie tworzy; zadania etapu
dodane do niego później zostaną utworzone przy następnym wejściu projektu do
tego etapu.

Jeśli moduł Zadania zawiedzie przy ich tworzeniu, projekt i tak jest w nowym
etapie, historia etapów podaje *Tworzenie zadań etapu nie powiodło się.*, a
zadania można utworzyć ponownie — jeden raz — przyciskiem *Utwórz ponownie
zadania etapu* przy etapie w zakładce *Etapy*.

**Gdy moduł Zadania jest wyłączony**, projekt działa dalej z samymi swoimi
etapami i nic nie ginie:

- blokada zakończenia nie jest stosowana — projekt przechodzi dalej, a historia
  etapów podaje *Blokada zakończenia nie została zastosowana: moduł Zadania
  jest wyłączony.*;
- etap, do którego projekt wszedł przy wyłączonych zadaniach, nie tworzy swoich
  zadań etapu ani wtedy, ani później — historia etapów podaje *Zadania etapu
  nie zostały utworzone.*;
- etap można usunąć bez liczenia jego zadań;
- karta *Zadania* i zadania etapów na karcie *Etapy* nie są pokazywane;
- zadania etapów i blokady zostają zachowane i znów działają dla tego, co
  dzieje się po ponownym włączeniu modułu Zadania.

Usunięcie projektu usuwa razem z nim jego zadania (gdy moduł Zadania jest
włączony; przy wyłączonym zostają, ukryte, bo nikt nie może zobaczyć projektu,
do którego należą).

## Szablony

**Szablon** to struktura, od której może zacząć się nowy projekt — na przykład
*Aranżacja salonu* albo *Roczna umowa ramowa*: domyślny opis, role projektowe
oraz etapy ze wszystkim, co ma etap projektu — planowanym czasem trwania,
rolami odpowiedzialnymi, alertami o terminie, blokadą zakończenia, informacją,
czy z etapu można zakończyć projekt, i zadaniami etapu — a także przebieg
między nimi. Szablon nie ma organizacji, członków, wartości ani powiązanych
rekordów.

**Utworzenie projektu z szablonu** kopiuje to wszystko do nowego projektu:
etapy, przebieg, blokady, alerty, zadania etapów i domyślny opis. Kopia należy
do projektu. Zadania etapu **pierwszego etapu** stają się zadaniami w chwili
utworzenia projektu, a dalszego etapu — gdy projekt do niego wchodzi, jak w
każdym etapie. To, co wpisała osoba tworząca projekt, ma pierwszeństwo przed
szablonem — na przykład własny opis — a każdą część kopii można potem zmienić
w projekcie. Rolę szablonu można nadać członkowi nawet wtedy, gdy w
międzyczasie ją zarchiwizowano.

**Zmiana szablonu nie zmienia żadnego projektu.** Edycja, archiwizacja lub
usunięcie szablonu pozostawia każdy projekt z niego utworzony dokładnie takim,
jaki jest; projekt wskazuje szablon, z którego powstał, dopóki ten szablon
istnieje.

**Duplikowanie** szablonu tworzy niezależną kopię, nazwaną *… (kopia)*, którą
można zmieniać bez wpływu na oryginał. **Archiwizacja** szablonu usuwa go z
wyboru dla nowych projektów; szablon zostaje zachowany i można go przywrócić.

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

- pozycje *Projekty* i *Szablony* oraz wszystkie ekrany projektów i szablonów
  znikają z panelu administracyjnego;
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
| `projects.alerts_time_zone` | `Europe/Warsaw` | Strefa czasowa, w której liczony jest „dzisiejszy” dzień projektów — dzień rozpoczęcia etapu i to, czy jego termin minął. Musi to być nazwa strefy czasowej IANA, np. `Europe/Warsaw`; każda inna wartość jest odrzucana przy zapisie. |

## Uprawnienia

| Kod | Na co pozwala |
| --- | --- |
| `projects:read` | Przeglądanie projektów — listy, pojedynczego projektu i jego historii etapów — z zastrzeżeniem obu reguł z sekcji *Kto widzi projekt*. |
| `projects:write` | Tworzenie, edycja i usuwanie projektów; ustawianie ich organizacji, członków, etapów i przebiegu; przenoszenie, zamykanie i ponowne otwieranie. Wymaga `projects:read`. |
| `projects:configure` | Tworzenie, edycja, duplikowanie, archiwizacja i przywracanie szablonów. Wymaga `projects:read`; każdy, kto może przeglądać projekty, może odczytać szablony, aby zacząć od nich projekt. |

## Powiązania, współpraca, powiadomienia o terminach i analityka

*Każda z tych funkcji pojawi się w jednym z kolejnych wydań modułu i zostanie tu
opisana, gdy to nastąpi.*

## Dla programistów

### API

| Metoda i ścieżka | Uprawnienie | Odpowiedź |
| --- | --- | --- |
| `GET /api/v1/admin/projects` | `projects:read` | Strona projektów oraz liczba projektów widocznych dla wywołującego: `{ items, nextCursor, total }`. Filtry: `state` (powtarzalny), `organizationId`, `memberId` (identyfikator administratora lub `me`), `roleId`, `templateId`, `stageName` (nazwa bieżącego etapu), `q` (numer lub tytuł), `sort` (`createdAt` — domyślnie, `value` albo `deadline` — termin bieżącego etapu; projekty bez wartości lub terminu są zawsze na końcu), `order` (`asc` lub `desc`, domyślnie `desc`), `cursor`, `limit` (najwyżej 100). |
| `POST /api/v1/admin/projects` | `projects:write` | `201` `{ data: ProjectDetail }`. Bez `templateId` pole `stages` jest wymagane; z nim struktura szablonu jest kopiowana, a `stages` jest odrzucane (`422`), zaś nieznany lub zarchiwizowany szablon to `422` `PROJECT_TEMPLATE_NOT_FOUND`. |
| `GET /api/v1/admin/projects/:id` | `projects:read` | `{ data: ProjectDetail }` albo `404` `PROJECT_NOT_FOUND` — tak samo dla projektu, który nie istnieje, jak dla takiego, którego wywołujący nie może zobaczyć. |
| `PATCH /api/v1/admin/projects/:id` | `projects:write` | Tytuł, opis, wartość, data rozpoczęcia, razem z `version`. |
| `DELETE /api/v1/admin/projects/:id` | `projects:write` | `204`; `409` `PROJECT_HAS_LINKS`, dopóki są podpięte dokumenty. |
| `PUT /api/v1/admin/projects/:id/organizations` | `projects:write` | Cały zestaw; `422` `PROJECT_ORGANIZATION_OUT_OF_SCOPE`. |
| `PUT /api/v1/admin/projects/:id/members` | `projects:write` | Cały zestaw członków i ich ról; `422` `PROJECT_MEMBER_INVALID`. |
| `POST /api/v1/admin/projects/:id/stages` | `projects:write` | `201` `{ data: ProjectStage }`, dodany na końcu. |
| `PATCH /api/v1/admin/projects/:id/stages/:stageId` | `projects:write` | Dowolny atrybut; `deadlineOn` ustawia termin ręcznie, `null` przywraca termin liczony jako początek + czas trwania. |
| `DELETE /api/v1/admin/projects/:id/stages/:stageId` | `projects:write` | `204`; `409` `PROJECT_STAGE_CURRENT`, `PROJECT_STAGE_LAST` lub `PROJECT_STAGE_HAS_TASKS`. |
| `PUT /api/v1/admin/projects/:id/stages/order` | `projects:write` | Identyfikatory wszystkich etapów w nowej kolejności. |
| `PUT /api/v1/admin/projects/:id/moves` | `projects:write` | Cały przebieg → `{ data: { moves, unreachableStageIds } }`. |
| `POST /api/v1/admin/projects/:id/move` | `projects:write` | `{ toStageId, version }` → `{ data: { project, entry, createdTaskIds, notes } }` — `createdTaskIds` to zadania etapu utworzone przez przejście, `notes` to, co zapisał wpis (`gate_not_applied_tasks_off`, `stage_tasks_skipped`, `tasks_materialize_failed`); `409` `PROJECT_MOVE_NOT_PERMITTED`, `PROJECT_STAGE_GATE_OPEN_TASKS` (`details.openTasks`: `{ id, number, title }[]`), `PROJECT_CHANGED` lub `PROJECT_GUARD_REFUSED`. |
| `POST /api/v1/admin/projects/:id/close` | `projects:write` | `{ outcome: 'completed', version }` albo `{ outcome: 'lost', lossReasonId, comment?, version }`; `409` `PROJECT_COMPLETION_NOT_PERMITTED` albo, przy zakończeniu, `PROJECT_STAGE_GATE_OPEN_TASKS`; `422` `PROJECT_LOSS_REASON_INVALID`. |
| `POST /api/v1/admin/projects/:id/reopen` | `projects:write` | `{ version }` → powrót do etapu, w którym projekt zamknięto. |
| `GET /api/v1/admin/projects/:id/stage-history` | `projects:read` | Każde wejście do etapu, zamknięcie i ponowne otwarcie, od najstarszych. |
| `PUT /api/v1/admin/projects/:id/stages/:stageId/tasks` | `projects:write` | `{ tasks: StageTaskDefinition[] }` (najwyżej 100), zastępuje zadania etapu → `{ data: ProjectStage }`; `422` dla nieznanej roli odpowiedzialnej. |
| `POST /api/v1/admin/projects/:id/stages/:stageId/materialize-tasks` | `projects:write` | Ponownie tworzy zadania etapu po zapisanym błędzie — `tasksMaterializeFailed` etapu — → `{ data: { created } }`; w innym przypadku `409` `PROJECT_STAGE_TASKS_NOT_RETRYABLE`, a przy wyłączonym module Zadania `503` `MODULE_DISABLED`. |
| `GET /api/v1/admin/projects/:id/tasks` | `projects:read` | `{ data: { tasksAvailable, stages: [{ stageId, tasks: TaskSummary[] }] } }`, w kolejności etapów; `tasksAvailable: false` i brak etapów, gdy moduł Zadania jest wyłączony albo czytający nie ma `tasks:read`. |
| `GET /api/v1/admin/projects/roles`, `…/loss-reasons` | `projects:read` | Słowniki z polem `label` w języku czytającego; `active=true` pomija zarchiwizowane wiersze. |
| `GET /api/v1/admin/projects/templates` | `projects:read` | `{ data: ProjectTemplateSummary[] }` według nazwy; `active=true` pomija zarchiwizowane szablony. |
| `GET /api/v1/admin/projects/templates/:id` | `projects:read` | `{ data: ProjectTemplateDetail }` albo `404` `PROJECT_TEMPLATE_NOT_FOUND`. |
| `POST /api/v1/admin/projects/templates`, `PUT …/templates/:id` | `projects:configure` | Cały szablon w jednym body (`ProjectTemplateBody`: nazwa, opis, `roleIds`, `stages` — każdy z `key` i swoimi `tasks`, `moves` wskazujące etapy po kluczu — pominięte oznacza przejście każdego etapu do następnego) → `201` / `200` `{ data: ProjectTemplateDetail }`. Klucz, który jest identyfikatorem jednego z etapów szablonu, zachowuje identyfikator tego etapu. |
| `POST /api/v1/admin/projects/templates/:id/duplicate` | `projects:configure` | `201` `{ data: ProjectTemplateDetail }` — niezależna kopia. |
| `POST /api/v1/admin/projects/templates/:id/archive`, `…/restore` | `projects:configure` | `{ data: ProjectTemplateDetail }`. |

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

### Kontekst zadań `project`

Moduł jest właścicielem typu kontekstu zadań `project`, rejestrowanego w
`taskContextRegistry` modułu Zadania z haka startowego służącego wyłącznie do
kontrybucji (zob. stronę Zadań, *Konteksty zadań*). Zadanie projektu ma
`contextType: 'project'`, identyfikator projektu jako `contextId` i
identyfikator jednego z jego etapów jako `contextGroupId`; jego etykieta to
`<numer> <tytuł>`, odnośnik prowadzi do `/projects/:id`, a etykietą grupy jest
nazwa etapu. Każda odpowiedź przechodzi przez `ProjectAccess`, więc moduł
Zadania pokazuje zadania projektu dokładnie tym osobom, które mogą zobaczyć
projekt. Aby umieścić zadanie w etapie, utwórz je przez
`POST /api/v1/admin/tasks` z tym kontekstem.

Moduł odczytuje i zapisuje zadania wyłącznie przez `taskReadPort` i
`taskWritePort`, po ustaleniu, że moduł Zadania jest obecny (krawędzie
`degrades-without`). Zadania etapu są tworzone po zatwierdzeniu własnej
transakcji przejścia, każde przez osobne audytowane polecenie
`tasks.task.create`. Notatka nieprzypisanego zadania etapu jest zapisywana jako
rola odpowiedzialna (`role:<id>`), a nie jako zdanie; `renderNote` deskryptora
formułuje ją w języku każdego czytającego.

### Jedna ścieżka odczytu

Każda tabela należąca do projektu jest sklasyfikowana jako **rule-scoped**:
żaden filtr ORM jej nie zawęża, a moduł sam egzekwuje obie reguły z sekcji *Kto
widzi projekt*, w jednym miejscu — w usłudze `ProjectAccess`. Każda lista,
liczba i odczyt po identyfikatorze w module albo zawiera jej predykat SQL, albo
zaczyna od projektu, który ona zwróciła, a własny test modułu odrzuca odczyt
tabeli projektu w każdym innym miejscu. Kod dodawany do tego modułu odczytuje
projekty przez nią.
