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
tego modułu. Do tego czasu projekty odczytuje się przez opisane niżej API.

## Prowadzenie projektu

*Tworzenie projektu, edycja jego etapów i przebiegu, przenoszenie go z etapu do
etapu oraz zamykanie jako zrealizowany lub utracony pojawią się w następnym
wydaniu tego modułu.*

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
| `projects:read` | Przeglądanie projektów — listy i pojedynczego projektu — z zastrzeżeniem obu reguł z sekcji *Kto widzi projekt*. |

## Zadania, szablony, powiązania, współpraca, powiadomienia o terminach i analityka

*Każda z tych funkcji pojawi się w jednym z kolejnych wydań modułu i zostanie tu
opisana, gdy to nastąpi.*

## Dla programistów

### API

| Metoda i ścieżka | Uprawnienie | Odpowiedź |
| --- | --- | --- |
| `GET /api/v1/admin/projects` | `projects:read` | Strona projektów, od najnowszych, oraz liczba projektów widocznych dla wywołującego: `{ items, nextCursor, total }`. Filtry: `state` (powtarzalny), `organizationId`, `memberId` (identyfikator administratora lub `me`), `roleId`, `templateId`, `stageName` (nazwa bieżącego etapu), `q` (numer lub tytuł), `order` (`asc` lub `desc`), `cursor`, `limit` (najwyżej 100). |
| `GET /api/v1/admin/projects/:id` | `projects:read` | `{ data: ProjectSummary }` albo `404` `PROJECT_NOT_FOUND` — tak samo dla projektu, który nie istnieje, jak dla takiego, którego wywołujący nie może zobaczyć. |

Kształty żądań i odpowiedzi to schematy Zod z `@endora-commerce/contracts`
(`projects.ts`).

### Jedna ścieżka odczytu

Każda tabela należąca do projektu jest sklasyfikowana jako **rule-scoped**:
żaden filtr ORM jej nie zawęża, a moduł sam egzekwuje obie reguły z sekcji *Kto
widzi projekt*, w jednym miejscu — w usłudze `ProjectAccess`. Każda lista,
liczba i odczyt po identyfikatorze w module albo zawiera jej predykat SQL, albo
zaczyna od projektu, który ona zwróciła, a własny test modułu odrzuca odczyt
tabeli projektu w każdym innym miejscu. Kod dodawany do tego modułu odczytuje
projekty przez nią.
