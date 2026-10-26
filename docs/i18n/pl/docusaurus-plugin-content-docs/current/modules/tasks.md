---
title: tasks
description: Zadania przypisane administratorom, z terminem i statusem, które inne moduły mogą przejmować przez kontekst zadania
---

# `tasks`

Moduł Zadania przechowuje **zadania**: pracę do wykonania przez administratora,
z tytułem, opisem, osobą przypisaną, terminem i statusem. To celowo mała,
pierwsza wersja — podstawa, na której budują inne moduły.

## Co robi

Każde zadanie ma numer, np. `TSK-000042`, nadawany przy utworzeniu i nigdy
nieużywany ponownie. Status to jeden z czterech, a po każdym może nastąpić
każdy inny:

| Status | Znaczenie |
| --- | --- |
| `todo` | Nierozpoczęte — od tego statusu zaczyna się każde nowe zadanie. |
| `in_progress` | W toku. |
| `done` | Zakończone. Moment zakończenia jest zapisywany i czyszczony, gdy zadanie opuści `done`. |
| `cancelled` | Nie zostanie wykonane. |

Zadanie, którego termin minął, a które wciąż ma status `todo` lub
`in_progress`, jest **przeterminowane**.

Zadanie może istnieć samodzielnie albo należeć do rekordu, którego właścicielem
jest inny moduł — na przykład do projektu. Ten rekord to **kontekst** zadania.
Zadanie bez kontekstu widzi każdy, kto może przeglądać zadania. Zadanie z
kontekstem widzą tylko osoby, którym moduł będący właścicielem kontekstu
pozwala zobaczyć ten rekord: kto nie widzi projektu, nie widzi też nigdzie jego
zadań — ani na liście, ani pod ich adresem. Dla takiej osoby to zadanie nie
istnieje.

Gdy moduł będący właścicielem kontekstu zostanie wyłączony, zadania tego
kontekstu znikają z modułu Zadania do czasu jego ponownego włączenia; nic nie
jest usuwane.

## W panelu administracyjnym

Ekrany zadań — lista zadań, *Moje zadania* i ekran pojedynczego zadania —
pojawią się w następnym wydaniu tego modułu. Do tego czasu zadania tworzy się,
odczytuje i zmienia przez opisane niżej API oraz przez moduły będące
właścicielami kontekstów.

## Praca z zadaniami

**Tworzenie zadania.** Zadanie potrzebuje tylko tytułu; może mieć też opis,
osobę przypisaną — dowolnego aktywnego administratora — i termin. Dostaje
numer, zaczyna ze statusem `todo` i zapamiętuje, kto je utworzył. Można je
umieścić w rekordzie innego modułu — w tym wydaniu w etapie projektu, który
tworzący może zobaczyć; zadanie projektu zawsze należy do jednego z jego
etapów.

**Zmiana zadania.** Można zmienić jego tytuł, opis, termin, osobę przypisaną,
status i rekord, do którego należy. Po każdym statusie może nastąpić każdy
inny: przejście do `done` zapisuje, kiedy zadanie wykonano, a wyjście z `done`
ponownie to czyści.

**Przypisywanie.** Gdy zadanie zostaje przypisane komuś innemu niż osoba,
która je przypisuje — przy tworzeniu albo później — ta osoba dostaje
powiadomienie w dzwonku panelu administracyjnego, tylko z numerem zadania i
odnośnikiem do niego. Przypisanie zadania sobie albo usunięcie przypisania
nikogo nie powiadamia. Gdy moduł **Powiadomienia administratora** jest
wyłączony, przypisywanie działa tak samo, a nikt nie dostaje powiadomienia.

**Moje zadania** to twoja otwarta praca: zadania przypisane tobie, które nie
mają statusu `done` ani `cancelled`, najpierw te z najbliższym terminem, na
końcu te bez terminu, z oznaczeniem przeterminowanych.

**Usunięcie zadania** usuwa je na stałe.

**Historia.** Każda zmiana zadania — utworzenie, zmiana, przypisanie, zmiana
statusu, usunięcie — jest zapisywana z tym, kto ją wykonał i kiedy, a historia
zadania wymienia je od najnowszych. Historia zapisuje długość opisu, nigdy jego
treść.

## Włączanie i wyłączanie

Zadania to moduł opcjonalny. Jest domyślnie włączony, a operator wyłącza go i
włącza ponownie na ekranie **Moduły** panelu administracyjnego
(`/platform/modules`).

Gdy moduł jest wyłączony:

- każdy endpoint `/api/v1/admin/tasks…` odpowiada `503` z kodem
  `MODULE_DISABLED`;
- jego uprawnień nie można już nadać żadnej roli;
- inne moduły nie mogą ani odczytywać, ani tworzyć zadań: moduł, który pokazuje
  zadania na swoich ekranach, oznacza je jako niedostępne.

Nic nie jest usuwane. Każde zadanie zostaje w bazie danych, a po ponownym
włączeniu modułu wszystko wraca dokładnie do poprzedniego stanu.

## Uprawnienia

| Kod | Na co pozwala |
| --- | --- |
| `tasks:read` | Przeglądanie zadań — listy, *Moich zadań*, pojedynczego zadania i jego historii — z zastrzeżeniem widoczności kontekstu każdego zadania. |
| `tasks:write` | Tworzenie, zmienianie, przypisywanie i usuwanie zadań. Wymaga `tasks:read`. |

## Dla programistów

### API

| Metoda i ścieżka | Uprawnienie | Odpowiedź |
| --- | --- | --- |
| `GET /api/v1/admin/tasks` | `tasks:read` | Strona zadań, od najnowszych: `{ items, nextCursor }`. Filtry: `status` (powtarzalny), `assignee` (identyfikator administratora, `me` albo `none`), `dueFrom`, `dueTo`, `overdue`, `contextType`, `contextId`, `q` (numer lub tytuł), `cursor`, `limit` (najwyżej 100). |
| `GET /api/v1/admin/tasks/mine` | `tasks:read` | `{ data: TaskSummary[] }` — otwarte zadania wywołującego, według terminu, bez terminu na końcu (najwyżej 500). |
| `POST /api/v1/admin/tasks` | `tasks:write` | `{ title, description?, assignedAdminUserId?, dueOn?, context? }` → `201` `{ data: TaskDetail }`; `422` `TASK_CONTEXT_INVALID`, `TASK_ASSIGNEE_INVALID`. |
| `GET /api/v1/admin/tasks/:id` | `tasks:read` | `{ data: TaskDetail }` albo `404` `TASK_NOT_FOUND` — tak samo dla zadania, które nie istnieje, i dla zadania, którego kontekstu nie możesz zobaczyć. |
| `PATCH /api/v1/admin/tasks/:id` | `tasks:write` | Dowolne z pól `title`, `description`, `dueOn`, `assignedAdminUserId`, `status`, `context` → `{ data: TaskDetail }`. |
| `DELETE /api/v1/admin/tasks/:id` | `tasks:write` | `204`. |
| `GET /api/v1/admin/tasks/lookups/assignees` | `tasks:write` | `{ data: { id, name, email }[] }` — aktywni administratorzy pasujący do `q` (imię i nazwisko lub e-mail), najwyżej 50. |
| `GET /api/v1/admin/tasks/:id/history` | `tasks:read` | Ślad audytu zadania, od najnowszych: `{ data, pagination, truncated }` (`RecordHistoryPage`). |

Kontekst (`context`) zapisywany przez API musi należeć do włączonego modułu,
który wskazuje rekord jako widoczny dla ciebie, a gdy rekord ma grupy — jak
etapy projektu — musi wskazywać jedną z nich; w przeciwnym razie `422`
`TASK_CONTEXT_INVALID`. Kontekst zadania jest odczytywany jako `{ type, id,
groupId, available, label, href, groupLabel }`. Gdy moduł będący właścicielem
przestaje opisywać rekord, `available` ma wartość `false`, `label` brzmi
*Niedostępny rekord* w twoim języku, a `href` i `groupLabel` mają wartość
`null`.

Kształty żądań i odpowiedzi to schematy Zod z `@endora-commerce/contracts`
(`tasks.ts`).

### Konteksty zadań

Moduł Zadania nie wymienia z nazwy żadnego innego modułu. Moduł, który chce mieć
własne zadania, rejestruje **kontekst zadania** — typ kontekstu, którego jest
właścicielem, np. `project` — i od tej pory zadania mogą nosić ten typ,
identyfikator jednego z jego rekordów i opcjonalnie identyfikator grupy wewnątrz
rekordu (etapu projektu).

Rejestr to wpis kontenera `taskContextRegistry` (`TaskContextRegistryPort`).
Jest rejestrowany bez bramki, więc dodawaj do niego wpis z **hooka startowego
wyłącznie wnoszącego wkład, bez sprawdzania obecności**, a krawędź zadeklaruj w
`nonBindingDependencies` manifestu jako `contributes-to`:

```ts
ctx.onBoot(() => {
  lazyPort<TaskContextRegistryPort>(ctx, 'taskContextRegistry').register({
    contextType: 'project',
    ownerModuleId: 'projects',
    allVisibleContextIds: () => /* every record id the caller may see */,
    visibleContextIds: (ids) => /* which of these ids the caller may see */,
    describe: (ids) => /* id → { label, href, groups: groupId → label } */,
  });
});
```

Zobowiązania deskryptora:

- **Każda metoda działa w kontekście dzierżawy samego wywołującego.** Odpowiadaj
  dla wywołującego dokładnie tak, jak odpowiadałyby twoje własne ekrany.
- `allVisibleContextIds()` to filtr wstępny listy: lista zadań pyta o niego raz
  na żądanie i zawęża zapytanie do tych identyfikatorów, więc strony pozostają
  dokładne. Niech będzie tani.
- `visibleContextIds(ids)` odpowiada dla jednego zadania albo kilku.
- `describe(ids)` określa, jak zadanie pokazuje swój kontekst: etykietę, adres w
  panelu administracyjnym i etykiety grup rekordu.
- Jeden typ kontekstu ma jednego właściciela; rejestracja drugiego, innego
  deskryptora dla zajętego już typu zatrzymuje backend przy starcie.
- **Zasada to fail-closed.** Zadanie, którego typu kontekstu nikt nie
  zarejestrował albo którego właściciel jest wyłączony, jest ukryte na listach,
  w licznikach i pod swoim identyfikatorem, a wraca, gdy właściciel zostanie
  włączony. System — zadanie w tle bez administratora za nim — nigdy nie jest
  zawężany.

### Odczyt i zapis zadań z innego modułu

Dwa porty, oba za bramką — rozwiązanie któregokolwiek przy wyłączonym module
Zadania rzuca wyjątek, a wywołanie odpowiada `503` `MODULE_DISABLED`.
Rozwiązuj je przez `lazyPort` i deklaruj jako `degrades-without` ze zdaniem
`whenAbsent`.

| Port | Metody |
| --- | --- |
| `taskReadPort` (`TaskReadPort`) | `findById`, `listInContext`, `listOpenInContext` (ani `done`, ani `cancelled`), `countInContext` — zawężane widocznością kontekstu dla administratora, nie dla systemu. |
| `taskWritePort` (`TaskWritePort`) | `createMany({ context, tasks })` — najwyżej 100 zadań, jedno audytowane polecenie `tasks.task.create` i jedno zdarzenie `tasks.task.created.v1` na zadanie; odrzucane z `TASK_CONTEXT_INVALID`, gdy żaden włączony moduł nie jest właścicielem typu kontekstu, i z `TASK_ASSIGNEE_INVALID`, gdy osoba przypisana nie jest aktywnym administratorem — zanim cokolwiek zostanie zapisane. `deleteInContext({ contextType, contextId })` — wszystkie zadania jednego rekordu, każde przez osobne audytowane polecenie `tasks.task.delete`. |

Wywołuj `createMany` **dopiero po zatwierdzeniu własnej transakcji**: każde
zadanie jest zapisywane we własnej transakcji.

### Zdarzenia

| Zdarzenie | Treść |
| --- | --- |
| `tasks.task.created.v1` | `{ taskId, contextType, contextId, contextGroupId, assignedAdminUserId }` |
| `tasks.task.status_changed.v1` | `{ taskId, from, to, contextType, contextId, contextGroupId }` |
| `tasks.task.assigned.v1` | `{ taskId, from, to }` |
| `tasks.task.deleted.v1` | `{ taskId, contextType, contextId }` |

Każde jest emitowane raz na polecenie, po jego zatwierdzeniu. Zmiana kilku
rodzajów naraz — `PATCH` z nowym tytułem, osobą przypisaną i statusem — to
jedno polecenie na rodzaj (`tasks.task.update`, `tasks.task.assign`,
`tasks.task.status_change`), każde z własnym wierszem audytu, a dwa ostatnie
także z własnym zdarzeniem.
