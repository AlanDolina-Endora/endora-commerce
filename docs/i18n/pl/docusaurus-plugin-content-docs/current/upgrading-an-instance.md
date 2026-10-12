---
title: Aktualizacja instancji
description: Przeniesienie instancji Endora Commerce i jej storefrontu z jednego wydania na następne jednym poleceniem — co zmienia, czego nie rusza, co uruchomić ponownie i co zrobić w instancji, której CLI nie zna jeszcze tego polecenia.
sidebar_position: 4
---

# Aktualizacja instancji

Instancja nie zawiera kopii platformy: platforma, powłoka panelu administracyjnego i każdy moduł
to pakiety, od których zależy. Aktualizacja polega na przeniesieniu **wszystkich pakietów
wydania** razem na nową wersję, zainstalowaniu ich i uruchomieniu własnego `setup` instancji —
który generuje pliki, buduje, wykonuje migracje i instaluje każdy moduł zadeklarowany
w instancji. Moduł nowy w wydaniu nie jest jednym z nich, dopóki go nie zadeklarujesz: zobacz
[Dodawanie modułu, który jest nowy w wydaniu](#adding-a-new-module).

Robi to jedno polecenie:

```bash
pnpm run upgrade             # do najnowszego wydania
pnpm run upgrade 0.102.0     # do wskazanego wydania
```

Uruchom je w katalogu głównym instancji. Jeśli instancję utworzyło wydanie, którego CLI nie ma
polecenia `upgrade`, zobacz [Instancje utworzone przed tym poleceniem](#before-the-command).

## Nie używaj `pnpm update`

`pnpm update` wygląda na oczywisty wybór, a zostawia instancję w stanie, który działa — do czasu —
i kończy się kodem `0`:

- Twój `package.json` przypina pakiety wydania do **dokładnych** wersji, żeby drzewo instalowało
  to samo każdego dnia i tylko jedną kopię każdego pakietu. `pnpm update` nigdy nie przesuwa
  dokładnego przypięcia, więc w instancji utworzonej przez wydanie późniejsze niż `0.101.x` nie
  zmienia żadnego z nich. W instancji utworzonej przez `0.101.x` lub starsze dokładny jest tylko
  `@endora-commerce/contracts`: `pnpm update` przesuwa wszystkie pozostałe pakiety, a ten
  zostawia, więc instalują się dwie kopie i pnpm wypisuje ostrzeżenie *unmet peer* dla każdego
  modułu.
- Przed `1.0.0` zakres `^0.101.0` kończy się poniżej `0.102.0`, więc `pnpm update` w ogóle nie
  sięga następnego wydania minor.
- Przepisuje zakresy Twoich pozostałych zależności — `"react": "^19"` staje się `"^19.3.0"` —
  i nigdy nie przesuwa pakietu, który pnpm zainstalował sam jako peer, na przykład
  `@endora-commerce/page-builder-core`.

## Zanim zaczniesz

- **Zatwierdź (commit) bieżący stan**, żeby aktualizacja była jednym diffem do przeczytania
  i cofnięcia: `package.json` każdego członka, `pnpm-lock.yaml` i te same dwa pliki storefrontu.
- **Zrób kopię zapasową bazy danych.** `setup` wykonuje migracje nowego wydania, a migracje nie
  działają wstecz. Z tego samego powodu polecenie odrzuca wersję starszą niż zainstalowana.
- **Zatrzymaj API i jego workery (konsumentów kolejek)**, żeby nic nie obsługiwało żądań w czasie
  zmiany schematu.
- **Podejrzyj wynik** poleceniem `pnpm run upgrade --dry-run`: każdy zakres, który by przesunęło,
  każdy wpis pliku blokady, który by usunęło, i każde polecenie, które by uruchomiło. Niczego nie
  zapisuje i niczego nie uruchamia.

## Co robi

1. Najpierw wszystko sprawdza: że działa w instancji, że platforma jest zainstalowana, że wersja
   istnieje i że **każdy** pakiet wydania zadeklarowany w Twoich manifestach jest opublikowany
   w tej wersji. Każdy problem trafia do jednej odmowy i nic nie zostaje zapisane.
2. W każdym `package.json` instancji — w katalogu głównym, w `backend/`, `admin/` i `docs/` —
   oraz w storefroncie obok niej przesuwa każdy pakiet wydania na nową wersję. Dokładne
   przypięcie pozostaje dokładne, a `^` pozostaje `^`. Żadna inna linia się nie zmienia.
3. W każdym `pnpm-lock.yaml` usuwa wpisy, które wskazują pakiet wydania w innej wersji, żeby pnpm
   rozwiązał je ponownie — także peery, które zainstalował sam.
4. Uruchamia `pnpm install` i `pnpm run setup` w instancji, a potem `pnpm install` w repozytorium
   storefrontu. Każde polecenie jest wypisywane, zanim się wykona.

Jeśli instancja jest już w żądanej wersji, polecenie to mówi i niczego nie zmienia.

### Czego nie rusza

- **Pakietów, które nie należą do wydania.** O tym, które należą, decyduje samo wydanie, a nie
  zakres `@endora-commerce/`, więc moduł wersjonowany osobno, poza wydaniem, i każdy pakiet
  zewnętrzny zachowują zakres, który wpisałeś. Każdy pominięty pakiet z tego zakresu jest
  wymieniony w wyniku.
- **Zależności, która nie jest zakresem wersji** — `file:`, `link:`, `workspace:`, tag. Zostaje
  wymieniona i zachowana.
- **Własnych plików storefrontu.** Storefront to Twoje repozytorium; przesuwają się tylko jego
  pakiety wydania. `--no-storefront` zostawia go całkowicie w spokoju, a
  `--storefront-dir <path>` wskazuje storefront, który nie leży obok instancji. Storefront
  zachowuje więc źródła, z którymi powstał: gdy wydanie zmienia storefront, jaki dostaje nowa
  instalacja, Twój zyska tę zmianę dopiero wtedy, gdy sam ją przeniesiesz — zmianę z wydania
  `0.103.0` opisuje sekcja
  [Bloki modułów w istniejącym storefroncie](#storefront-block-renderers), a dwie z wydania
  `0.104.0` — sekcja [Po aktualizacji do wydania 0.104.0](#after-0-104-0), a zmiany z wydania
  `0.105.0` — sekcja [Po aktualizacji do wydania 0.105.0](#after-0-105-0).

## Po zakończeniu

Na koniec polecenie wymienia, co uruchomić ponownie:

```bash
pnpm run start                                   # API i jego workery
pnpm run preview:admin                           # setup zbudował panel od nowa
cd ../my-shop-storefront && pnpm run build && pnpm run start
```

Zaloguj się i otwórz **Modules** (`/platform/modules`), żeby sprawdzić, że lista się wczytuje.

Jeśli po aktualizacji pnpm zgłasza *unmet peer* dla pakietu zewnętrznego, nowe wydanie podniosło
zakres, który Twój `package.json` wciąż ma niższy. Podnieś go tam do zakresu podanego
w ostrzeżeniu i uruchom `pnpm install`.

### Dodawanie modułu, który jest nowy w wydaniu {#adding-a-new-module}

Aktualizacja przesuwa pakiety, które Twoja instancja już deklaruje. Moduł, który pojawia się
w wydaniu po raz pierwszy, do nich nie należy, więc po aktualizacji nie jest ani zainstalowany,
ani widoczny na ekranie **Modules**. Żeby go mieć, zadeklaruj jego pakiet w głównym
`package.json` i uruchom `setup` — w katalogu głównym instancji:

```bash
pnpm add -w -E @endora-commerce/mod-<name>@<version>
pnpm run setup
```

`<version>` to wydanie, w którym jest instancja — wersja, jaką `@endora-commerce/platform` ma
w głównym `package.json`. Potem uruchom ponownie API i podgląd panelu, jak wyżej: `setup` wykonał
migracje modułu, zainstalował go i zbudował panel od nowa.

Obie flagi mają znaczenie:

- **`-w`** — katalog główny instancji jest katalogiem głównym workspace'u, a lista modułów to
  jego `dependencies`. Bez tej flagi pnpm 9 odmawia z błędem `ERR_PNPM_ADDING_TO_ROOT`.
- **`-E` i wersja** — każdy pakiet wydania jest w tym pliku przypięty dokładnie do jednej wersji.
  Bez nich pnpm zapisuje dla tego jednego pakietu zakres `^<version>`, a instalacja, która
  rozwiązuje go od nowa, może wybrać dla niego późniejsze wydanie poprawkowe niż dla reszty: to
  niespójny zestaw opisany w sekcji
  [Instancja niespójna od początku](#instancja-niespójna-od-początku). `pnpm run upgrade`
  zachowuje dokładne przypięcie jako dokładne, a `^` jako `^`, więc zakres zapisany tutaj
  pozostaje zakresem.

O tym, czy moduł jest po instalacji włączony, decyduje deklaracja samego modułu; podaje to sekcja
wydania, które go wprowadza.

## Jeśli krok się nie powiedzie

Polecenie kończy się kodem wyjścia tego kroku i wypisuje, co zostało, jako polecenia do wpisania.
Manifesty wskazują już nową wersję, więc ponowne `pnpm run upgrade <version>` zaczyna od
instalacji. Samo `pnpm run setup` zawsze można bezpiecznie uruchomić ponownie.

## Instancje utworzone przed tym poleceniem {#before-the-command}

Polecenie `upgrade` należy do `@endora-commerce/cli`. Instancja utworzona przez wydanie `0.101.x`
lub starsze ma CLI bez niego i nie ma skryptu `upgrade`. Zainstaluj CLI wydania, na które
przechodzisz, i uruchom polecenie przez nie:

```bash
pnpm add -D -w @endora-commerce/cli@<version>
pnpm exec endora upgrade <version>
```

Żeby od tej chwili mieć `pnpm run upgrade`, dodaj `"upgrade": "endora upgrade"` do `scripts`
w głównym `package.json`.

### Instancje utworzone w wydaniu 0.100.x

Zmierzone z `0.100.2` do `0.101.1`: powyższe polecenia aktualizują instancję i naprawiają to, co
naprawiły pakiety platformy — ekran **Modules** się wczytuje, a `module:enable`,
`module:disable` i `module:uninstall` działają. Trzech rzeczy nie naprawiają pakiety i aktualizacja
ich nie zmienia:

- Dwóch plików, których instalator `0.100.x` nie zapisał — linii `DEPLOYMENT` w `.env` i zależności
  `@endora-commerce/contracts`. Zobacz
  [Instancje utworzone w wydaniu 0.100.2 lub wcześniejszym](./create-your-first-module.md#older-instances).
- Instalator `0.100.x` nie zapisywał storefrontu poza klonem repozytorium. Utwórz go poleceniem
  `endora new storefront` — zobacz [Sklep](./getting-started.md#sklep).
- Instalator `0.100.x` nie zmieniał zajętego portu, więc zanim cokolwiek uruchomisz, sprawdź, czy
  `.env` nie wskazuje bazy danych innego środowiska.

### Instancje utworzone przed wydaniem 0.102.0 {#puck-rename}

Wydanie `0.102.0` przeniosło Page Builder z `@measured/puck` na `@puckeditor/core` — Puck
zmienił nazwę pakietu w wersji 0.21 — a aktualizacja nie zmienia tej nazwy w Twoich plikach. Gdy
`pnpm run upgrade` się zakończy, zastąp `"@measured/puck"` wpisem
`"@puckeditor/core": "^0.23.0"` w każdym `package.json`, który go deklaruje (w katalogu głównym
instancji i w storefroncie), a w swoich plikach — w `app/`, `components/` i `test/` storefrontu
oraz we wszystkim, co Twoje, w `admin/src` lub w module nakładkowym (overlay) — zmień importy
`'@measured/puck'` na `'@puckeditor/core'` i `'@measured/puck/puck.css'` na
`'@puckeditor/core/puck.css'`. Znajdzie je w każdym z drzew
`grep -rl "@measured/puck" --exclude-dir=node_modules .`. Potem uruchom `pnpm install` w obu.
Bez tej zmiany `pnpm run build` storefrontu kończy się błędem sprawdzania typów. Zapisane strony,
bloki i szablony nie wymagają zmian.

### Po aktualizacji do wydania 0.103.0 {#after-0-103-0}

Wydanie `0.103.0` usuwa błąd izolacji tenantów w każdej instancji utworzonej z opublikowanych
pakietów do wydania `0.102.0` włącznie: żądania nie były ograniczane do organizacji klienta ani
klucza API, który je wysyłał, zasięg administratora nie wynikał z jego roli, a wpisy audytu nie
zapisywały administratora, który wykonał operację. **Poprawką jest sama aktualizacja.** Niczego
w instancji nie trzeba w tym celu edytować — `backend/src/index.ts` zostaje bez zmian.

**Przenieś wszystkie pakiety `@endora-commerce/*` razem.** `pnpm run upgrade` tak robi. Jeśli
ustawiasz wersje ręcznie, nie zostaw żadnego z tyłu: gdy platforma jest zaktualizowana,
a `@endora-commerce/mod-organizations` zostaje we wcześniejszej wersji, żaden administrator —
także administrator platformy — nie ma dostępu do żadnej organizacji, a ekrany ograniczone do
organizacji są puste. Backend zapisuje wtedy przy starcie ostrzeżenie, w którym pada nazwa
`adminTenantScopePort`.

Trzy rzeczy, których aktualizacja nie zrobi za Ciebie.

**Przypisz rolę każdemu kontu administratora, które jej nie ma.** Uprawnienia administratora
i organizacje, do których ma dostęp, wynikają z roli przypisanej do konta. Konto bez roli było
dotąd traktowane jak konto z dostępem do wszystkich organizacji; od wydania `0.103.0` jest
odrzucane. Nadal może się zalogować i wylogować, a każda trasa panelu chroniona uprawnieniem —
oraz pierwszy odczyt danych organizacji na każdej innej — odpowiada `403 ADMIN_ROLE_REQUIRED`.
Aktualizacja nie przypisuje takim kontom żadnej roli, bo każda domyślna oznaczałaby nadanie
dostępu, o którym nikt nie zdecydował. Backend przy każdym starcie zapisuje ostrzeżenie z liczbą
takich kont; brak ostrzeżenia oznacza, że ich nie ma.

Administrator, który może się zalogować, wybiera rolę na ekranie **Użytkownicy**. Gdy nie może
żaden, uruchom w katalogu głównym instancji:

```bash
pnpm run admin:create -- --email=<adres e-mail konta> --password-stdin \
  --first-name=<imię> --last-name=<nazwisko> [--role=<kod>]
```

Polecenie znajduje konto po adresie e-mail i je aktualizuje: przypisuje rolę administratora
platformy (`platform_admin`) albo rolę wskazaną przez `--role`, **i ustawia podane hasło** —
dotychczasowe hasło konta przestaje działać. Ustawia też konto jako aktywne, więc nie uruchamiaj
go dla konta, które celowo zdezaktywowano. `--password-stdin` wczytuje hasło, co najmniej
12 znaków, ze standardowego wejścia. Od tego wydania każda instancja ma rolę `platform_admin`:
każdy start upewnia się, że istnieje, i nie da się jej już usunąć. Zobacz
[Każdy administrator ma rolę](./modules/admin_users.md#każdy-administrator-ma-rolę).

Jeśli coś Twojego tworzy konta administratorów przez API, musi teraz przesyłać rolę już przy
tworzeniu: `POST /api/v1/admin/admin-users` bez `adminRoleId` oraz `PATCH`, który ustawia je na
`null`, odpowiadają `400 ADMIN_USER_ROLE_REQUIRED`.

**Uruchom raz przebieg próbny naprawy zamówień.** Wcześniejsze wydanie mogło zostawić zamówienie
anulowane albo opłacone, a mimo to nadal trzymające stan magazynowy lub rezerwację limitu
kredytowego — i nic nie zwalnia ich samo. W katalogu głównym instancji, gdy `pnpm run upgrade`
się zakończy:

```bash
pnpm run cli orders transition-effects-repair           # wypisuje, niczego nie zapisuje
pnpm run cli orders transition-effects-repair --apply   # zwalnia to, co wymieniła lista
```

Przeczytaj listę, zanim ją zastosujesz: zwolnienie zmienia liczniki zarezerwowanego stanu
i dostępny limit. `--except=<identyfikator zamówienia>` pomija zamówienie,
a `--order=<identyfikator zamówienia>` naprawia tylko wskazane — zobacz
[Naprawa zamówień pozostawionych przez wcześniejszą wersję](./modules/orders.md#naprawa-zamówień-pozostawionych-przez-wcześniejszą-wersję).
Polecenie, które wypisuje `No projects matched the filters`, niczego nie uruchomiło, niezależnie
od kodu wyjścia: to `pnpm --filter backend …`, czyli postać dla klonu repozytorium Endora
Commerce, wpisana w instancji.

**Dodaj jedną linię do `vitest.config.mts` storefrontu.** Własne testy `.tsx` storefrontu kończą
się błędem *Failed to parse source for import analysis*, gdy jego instalacja wybierze Vite 8.
Obok bloku `esbuild` w tym pliku dodaj:

```ts
oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
```

#### Bloki modułów w istniejącym storefroncie {#storefront-block-renderers}

Od wydania `0.103.0` pakiet modułu może zawierać komponenty, które wyświetlają w storefroncie
jego własne bloki Page Buildera, a storefront utworzony przez wydanie `0.103.0` lub nowsze
podłącza je sam. **Storefront utworzony wcześniej nie zyskuje tego przez aktualizację**:
aktualizacja przesuwa jego pakiety, a nie źródła. Po aktualizacji buduje się i wyświetla strony,
które wyświetlał wcześniej. Czego mu brakuje:

- blok, który wyświetla wyłącznie pakiet modułu, nie jest rysowany — nie ma skryptu
  `blocks:generate`, który znalazłby pakiet, ani niczego, co zaimportowałoby jego komponent;
- blok modułu, który wyłączyłeś, nie jest ukrywany, podczas gdy nowszy storefront nie wyświetla
  w jego miejscu niczego;
- nie ma pliku `lib/page-builder/local-blocks.tsx` na blok, który storefront wyświetla sam.

Jeśli nie korzystasz z żadnej z tych rzeczy, możesz zostawić storefront bez zmian. Żeby go
uzupełnić, weź pliki ze storefrontu zapisanego przez nowe CLI. Utwórz go obok swojego — ustawienia
wczyta z pliku `.env`, który skopiujesz, a nic nie zostanie zainstalowane ani uruchomione:

```bash
mkdir ../storefront-0.103.0
cp ../my-shop-storefront/.env ../storefront-0.103.0/.env
pnpm exec endora new storefront ../storefront-0.103.0
```

Następnie przenieś z tego katalogu do swojego storefrontu:

1. **Skopiuj pliki, które są nowe**: `components/BlockRenderScope.tsx`, katalog
   `lib/page-builder/`, `scripts/block-discovery.mjs`, `scripts/generate-blocks.mjs`,
   `app/blocks.generated.css` oraz testy `test/block-registry.test.ts`
   i `test/ssr/module-blocks.test.tsx`.
2. **Weź nową wersję plików, które się zmieniły** — a jeśli któryś edytowałeś, nanieś różnicę
   ręcznie: `components/PageBuilderRender.tsx`, `app/layout.tsx`, `app/globals.css`,
   `app/blog/_components/BlogCategoryPage.tsx`, `app/blog/_components/BlogPostBody.tsx`,
   `components/Megamenu/MenuCmsBlockEmbed.tsx`, `lib/api/module-presence.ts`,
   `scripts/theme-discovery.mjs` oraz testy `test/lib/module-presence.test.ts`
   i `test/ssr/block-degradation.test.tsx`.
   `diff -ru ../my-shop-storefront ../storefront-0.103.0` pokazuje każdą różnicę, obok Twoich
   własnych zmian.
3. **Dodaj skrypt do `package.json`** i uruchamiaj go w `dev` i `build`, po `themes:generate`:

   ```json
   "dev": "pnpm run themes:generate && pnpm run blocks:generate && node --env-file-if-exists=.env node_modules/next/dist/bin/next dev",
   "build": "pnpm run themes:generate && pnpm run blocks:generate && next build && pnpm run check:themes",
   "blocks:generate": "node scripts/generate-blocks.mjs",
   ```

4. Jeśli Twój storefront gdziekolwiek sam montuje komponent `<Render>` z Pucka, użyj tam
   `PageBuilderRender`: to jedyne miejsce, w którym stosowane są bloki modułów i reguła
   wyłączonego modułu.
5. Uruchom `pnpm run typecheck`, `pnpm test` i `pnpm run build`, a potem usuń katalog, z którego
   kopiowałeś.

Na ile ta procedura została sprawdzona: na storefroncie utworzonym przez wydanie `0.102.0`
i od tego czasu nieedytowanym daje te same pliki, które ma storefront `0.103.0`, a sprawdzanie
typów, testy i build przechodzą. Nie sprawdzono jej na storefroncie, którego pliki zmieniono, ani
przez wyświetlenie bloku modułu w storefroncie uzupełnionym w ten sposób — przed wdrożeniem
sprawdź strony, które zawierają treść z Page Buildera.

### Po aktualizacji do wydania 0.104.0 {#after-0-104-0}

`pnpm run upgrade 0.104.0` to cała aktualizacja: niczego w instancji nie trzeba w tym celu
edytować. Poniżej: jeden moduł, którego aktualizacja nie dodaje, trzy rzeczy, które po niej
działają inaczej, oraz to, co warto przenieść do istniejącego storefrontu i do własnego kodu.

**Nowy moduł, CRM, nie zostaje dodany przez aktualizację.** `0.104.0` to pierwsze wydanie modułu
`crm` (`@endora-commerce/mod-crm`): szanse sprzedaży z konfigurowalnym przepływem statusów,
tablicą, kalendarzem i analityką, w panelu administracyjnym. Instancja utworzona w wydaniu
`0.103.x` lub wcześniejszym po aktualizacji go nie ma — nie widać go na ekranie **Modules**, a
`/crm/board` odpowiada *Page not found*. (Instancja utworzona przez instalator wydania `0.104.0`
już deklaruje ten pakiet, a `pnpm add` odpowiada *Already up to date*.) Żeby go dodać, w katalogu
głównym instancji:

```bash
pnpm add -w -E @endora-commerce/mod-crm@0.104.0
pnpm run setup
```

Jeśli instancja jest już w nowszym wydaniu, wpisz jego wersję zamiast `0.104.0` — obie flagi
opisuje sekcja [Dodawanie modułu, który jest nowy w wydaniu](#adding-a-new-module). Potem uruchom
ponownie API i podgląd panelu.

- **Po instalacji jest włączony.** `setup` go instaluje, a od ponownego uruchomienia moduł jest
  aktywny, z sekcją **CRM** w menu bocznym. Jeśli chcesz mieć pakiet bez tej funkcji, wyłącz moduł
  na ekranie **Modules** (`/platform/modules`): jego ekrany, uprawnienia i ustawienia znikają,
  jego trasy odpowiadają `503 MODULE_DISABLED`, a nic nie zostaje usunięte.
- **Żadna rola nie dostaje jego uprawnień.** `crm:read`, `crm:write`, `crm:configure`
  i `crm:analytics` nie są automatycznie nadawane żadnej roli. Administrator platformy ma
  wszystkie uprawnienia i widzi moduł od razu; każdej innej roli, która ma z niego korzystać,
  nadaj te cztery.
- **Dane demonstracyjne.** W instancji z załadowanym sklepem demonstracyjnym
  `pnpm run cli demo seed` dodaje demonstracyjny lejek sprzedaży. `pnpm run cli demo reset`
  wycofuje go niezależnie od tego, czy CRM jest włączony; trzy demonstracyjne etykiety wycofuje
  tylko reset uruchomiony przy włączonym CRM.

Co robi moduł, opisuje strona [CRM](./modules/crm.md).

**Trzy rzeczy działają po aktualizacji inaczej.** Żadna nie wymaga kroku, chyba że chcesz
zachować wcześniejsze zachowanie.

- **Na frazę wyszukiwania odpowiada moduł wyszukiwania.** `GET /api/v1/catalog/products` z frazą
  (`q`) — to, co czyta strona `/search` storefrontu — było dotąd obsługiwane z bazy danych,
  chyba że ustawiono `CATALOG_SEARCH_BACKEND=meilisearch`. Gdy zmienna nie jest ustawiona, fraza
  trafia teraz do modułu `search`, o ile jest włączony: wyniki są uporządkowane według trafności
  i wybaczają literówkę, a fragment ze środka słowa lub SKU już nie pasuje. Żeby zachować
  wcześniejsze zachowanie, ustaw `CATALOG_SEARCH_BACKEND=postgres` w pliku `.env` instancji.
- **Zapytania ofertowego z niewycenioną pozycją nie da się zatwierdzić ani zamienić na
  zamówienie.** Akceptacja, zatwierdzenie i zamiana zapytania ofertowego na zamówienie odpowiadają
  teraz `409`, dopóki któraś pozycja nie ma uzgodnionej ceny jednostkowej. Zapytania, które już
  ma status `Approved` i taką pozycję, nie da się zamienić na zamówienie; w tym statusie jego
  pozycji nie można edytować, więc pozostaje złożyć je ponownie (`resubmit`). Żeby je znaleźć:

  ```sql
  select distinct qr.id, qr.business_id
    from quote_requests qr
    join quote_request_items it on it.quote_request_id = qr.id
   where qr.status = 'Approved' and it.agreed_unit_price is null;
  ```

  To samo zapytanie z `qr.status = 'Completed'` wypisuje zapytania ofertowe, z których w ten
  sposób już złożono zamówienia; same zamówienia pozostają bez zmian.
- **Słownik zawiera każdy język ISO 639-1.** Brakujące wiersze są dodawane przy pierwszym starcie
  po aktualizacji jako nieaktywne, więc nic, co czyta aktywne języki, się nie zmienia; `en-US`
  i `pl-PL` pozostają jedynymi aktywnymi, dopóki nie aktywujesz kolejnego. Dodany wiersz, który
  usuniesz, wraca przy następnym starcie — zamiast usuwać, zostaw go nieaktywnym.

**W istniejącym storefroncie**, który zachowuje źródła, z którymi powstał:

- W `lib/api/cms.ts` zmień tag pamięci podręcznej przy pobraniu `getCmsPageIndex` z `'cms:page'`
  na `CMS_STOREFRONT_CACHE_TAGS.pageIndex`, importowany z `@endora-commerce/contracts`. Bez tej
  zmiany wszystko działa dalej, a nowo opublikowana strona CMS trafia do `sitemap.xml` dopiero
  po upływie 60-sekundowego okna pamięci podręcznej.
- Kategoria może teraz mieć treść z Page Buildera, edytowaną przez akcję **Content** w drzewie
  kategorii. Storefront pokazuje ją tylko wtedy, gdy ją wyświetla. Storefront zapisany przez CLI
  wydania `0.104.0` to robi: `app/(catalog)/c/[slug]/page.tsx` wywołuje
  `getCategoryPageContent(node.id, ctx)`, funkcję z `lib/api/catalog.ts`, i rysuje wynik
  komponentem `components/CategoryContent.tsx`. Żeby je przenieść, utwórz storefront, z którego
  skopiujesz pliki, tak jak w sekcji
  [Bloki modułów w istniejącym storefroncie](#storefront-block-renderers).

**`@dnd-kit/core` to nowa zależność peer pakietu `@endora-commerce/admin-kit`.** pnpm sam
instaluje brakujący peer, o ile tego nie wyłączyłeś, więc instancja nie musi nic robić. Jeśli
Twój `.npmrc` ustawia `auto-install-peers=false`, dodaj `"@dnd-kit/core": "^6.3.1"` do
`dependencies` w `admin/package.json`, który deklaruje ten pakiet, i uruchom `pnpm install`.

**Jeśli Twój własny kod implementuje port platformy albo buduje jeden z jej rekordów** — moduł
nakładkowy albo dubler testowy — cztery kształty z `@endora-commerce/contracts` zyskały wymagany
element i taki kod nie skompiluje się, dopóki go nie ma: `CartRecord.sourceQuoteRequestId`
(`null`, gdy koszyk nie powstał z zapytania ofertowego), `CatalogAttributeView.isPriceRule`
(`false`), `AuthSessionReadPort.lastSeenByAdminUser` i `LanguageSeedPort.ensureSeeded`.

Na ile zostało to sprawdzone: aktualizacja z `0.103.1`, w instancji utworzonej z demonstracyjnym
zestawem modułów, przeszła do końca z pnpm 9 i bez żadnej ręcznej edycji, a panel i niezmieniony
storefront zbudowały się potem i wyświetlały swoje strony; następnie dodano `crm` poleceniami
`pnpm add -w` i `setup` — po instalacji był włączony. Dokładną postać `pnpm add` podaną wyżej
uruchomiono w pomocniczym workspace'ie, a nie w zaktualizowanej instancji. Nie sprawdzono
wyłączenia `crm`, obu zmian w storefroncie, instancji z `auto-install-peers=false` ani instancji
z modułami nakładkowymi; to, co ta sekcja o nich mówi, pochodzi z dzienników zmian wydania.

### Po aktualizacji do wydania 0.105.0 {#after-0-105-0}

`pnpm run upgrade 0.105.0` przenosi pakiety i wykonuje migracje wydania, a instancja uruchamia się
potem bez edycji żadnego ze swoich plików. To wydanie zmienia zachowanie: sposób logowania
administratorów i czas życia sesji, kanał sprzedaży, do którego należy zamówienie i metoda, to,
kto odczytuje pole niestandardowe, oraz szereg odpowiedzi API. Ta sekcja mówi, co zrobić i w
jakiej kolejności, a potem — co działa inaczej, osobno dla każdego czytelnika:
[operatorów](#after-0-105-0-operators), [klientów API i integratorów](#after-0-105-0-api),
[autorów modułów i modułów nakładkowych](#after-0-105-0-authors) oraz właściciela
[istniejącego storefrontu](#after-0-105-0-storefront).

#### Co zrobić i w jakiej kolejności {#after-0-105-0-steps}

Przed aktualizacją:

1. **Odczytaj `quote_requests.expiry_days`** — *Automatyczne wygaszenie oczekujących po (dni)* na
   karcie Zapytania ofertowe w **Ustawieniach** — dla domyślnego kanału sprzedaży. Przy `0`,
   wartości domyślnej, nic z tego nie wynika. Przy każdej innej wartości zadanie wygaszające,
   które od tego wydania rzeczywiście działa, w pierwszych przebiegach po aktualizacji wygasza
   każde otwarte zapytanie ofertowe nieaktywne przez tyle dni. Jeśli chcesz najpierw przejrzeć
   otwarte zapytania, ustaw wcześniej `0`; regułę opisuje punkt *Zapytania ofertowe wygasają* w
   części [Dla operatorów](#after-0-105-0-operators).
2. **W instancji z jednym kanałem sprzedaży odczytaj `orders.min_order_value`.** Ustawione dla
   kanału domyślnego, a nie dla wszystkich kanałów, nie było egzekwowane dla zamówień ze
   storefrontu, a teraz jest.
3. **Jeśli Twoje zadanie uruchamia `demo reset`**, zdecyduj, czy jego wiersz poleceń potrzebuje
   `--force-delete-financial-records`: bez tej flagi reset odmawia teraz wycofania danych
   demonstracyjnych, w których przyjęto płatność albo wystawiono fakturę.

Po aktualizacji, zanim instancja znów przyjmie ruch:

4. **Za reverse proxy sprawdź, czy ustawiono `TRUSTED_PROXY_HOPS` albo `TRUSTED_PROXY_ADDRESSES`**
   w środowisku backendu. Żadna z tych zmiennych nie jest nowa. Nowy jest limit błędnych haseł
   administratora liczony dla adresu klienta: bez jednej z nich każde żądanie ma adres proxy, więc
   pięć błędnych haseł do jednego konta, wysłanych przez kogokolwiek, opóźnia logowanie na to
   konto z każdego urządzenia, na którym wcześniej się na nie nie zalogowano. Jak dobrać wartość,
   mówi
   [punkt G3 listy kontrolnej pierwszego wdrożenia](./deployment/first-deployment-checklist.md#g3-wskaż-backendowi-któremu-serwerowi-pośredniczącemu-wolno-podawać-adres-ip-klienta).
5. **W instancji z więcej niż jednym kanałem sprzedaży** — a jest nią każda instancja z
   załadowanymi danymi demonstracyjnymi — przejrzyj każdą metodę dostawy i
   płatności (*Metody dostawy i płatności są udostępniane w wybranych kanałach sprzedaży* poniżej)
   i wprowadź zmiany z części [W istniejącym storefroncie](#after-0-105-0-storefront).
6. **Przejrzyj definicje pól niestandardowych** na ekranie Pola niestandardowe. Aktualizacja
   oznacza każdą istniejącą definicję jako `customer`, więc nic, co klienci i integracje dotąd
   otrzymywali, nie zostaje wycofane. Każde pole, którego wartości są przeznaczone tylko dla
   administratorów, przestaw na `internal`.
7. **Jeśli skrypt albo integracja wywołuje `POST /api/v1/admin/i18n/reload` lub
   `GET /api/v1/admin/i18n/coverage`**, nadaj roli administratora, jako który się loguje,
   uprawnienie `settings:write` dla pierwszej trasy i `settings:read` dla drugiej.
8. **Tylko w publicznej instancji demonstracyjnej, która celowo publikuje hasło administratora**,
   rozważ `ADMIN_AUTH_ACCOUNT_WIDE_LIMIT=off` — punkt *Logowanie administratora jest ograniczane*
   poniżej mówi, kiedy i co ta zmienna wyłącza.
9. **Zbuduj własne moduły ponownie z tym wydaniem.** Źródła, które implementują jeden z portów
   wymienionych w części [Dla autorów modułów i modułów nakładkowych](#after-0-105-0-authors), nie
   skompilują się, dopóki ich nie zmienisz, a moduł, który tworzy metodę dostawy lub płatności,
   trzeba wydać ponownie.

W dowolnym momencie:

10. Dodaj trzy wiersze do pliku `.gitignore` instancji, który zachowuje treść, z jaką powstał:

    ```
    docs/build/
    docs/.docusaurus/
    backend/var/
    ```

    Zbudowanie strony dokumentacji instancji zapisuje dwa pierwsze katalogi, a gdy git je śledzi,
    różnica po aktualizacji to już nie `package.json` każdego członka workspace'u i plik
    blokady — w aktualizacji opisanej na końcu tej sekcji były to 162 pliki. Jeśli któryś z nich
    jest już w repozytorium, uruchom raz `git rm -r --cached docs/build docs/.docusaurus`: git
    nigdy nie ignoruje pliku, który śledzi. `backend/var/` to miejsce, w którym zapisywane są
    pliki przesłane do biblioteki zasobów, dopóki `assets.local.base_dir` ma wartość domyślną
    `var/assets`. Plik `.gitignore` z żadnego wydania go nie obejmuje, więc katalog pojawia się
    jako nieśledzony obok różnicy z aktualizacji. To dane Twojego sklepu, a nie źródła: trzymaj
    go poza repozytorium i twórz jego kopię zapasową razem z bazą danych — baza odtworzona bez
    niego zawiera zasoby, których plików brakuje.
11. W instancji z załadowanym sklepem demonstracyjnym uruchom ponownie `pnpm run cli demo seed`.
    Demonstracyjna rola `sales_representative` dostała przy tworzeniu kod uprawnienia, którego
    nie deklaruje żaden moduł, przez co edytor ról odrzuca każdy zapis tej roli odpowiedzią
    `400 Unknown permission(s): organizations:read.assigned`; ponowne załadowanie danych wycofuje
    ten kod z roli i niczego więcej w niej nie zmienia.

#### Dla operatorów {#after-0-105-0-operators}

**Logowanie administratora jest ograniczane.** Hasło albo kod drugiego składnika dla konta
administratora można próbować tylko kilka razy z rzędu: pięć błędnych prób z jednego adresu na
jedno konto albo dwadzieścia na jedno konto ze wszystkich adresów łącznie rozpoczyna opóźnienie
jednej minuty, które podwaja się z każdą kolejną błędną próbą, najwyżej do piętnastu minut. W
czasie opóźnienia próba otrzymuje odpowiedź `429 ADMIN_AUTHENTICATION_THROTTLED`, a poprawne hasło
również jest odrzucane. Nic nie jest blokowane na stałe: licznik zeruje udana próba, a bez niej
jest zapominany trzydzieści minut po pierwszej błędnej.

- Zakończone logowanie hasłem zostawia na urządzeniu plik cookie `b2b_admin_device`. To nie jest
  sesja i niczego nie daje; urządzenie, które go ma, jest liczone we własnym limicie pięciu prób,
  a nie w limicie dwudziestu dla konta, więc błędne hasła wysyłane przez kogoś innego nie
  odcinają administratora od urządzenia, z którego już korzystał.
- Żeby wyzerować wszystkie liczniki jednego konta, w katalogu głównym instancji:

  ```bash
  pnpm run cli admin_users unlock --email=<their e-mail>
  ```

  W obrazie produkcyjnym to samo polecenie to
  `node dist/cli.js admin_users unlock --email=<their e-mail>`, uruchomione w kontenerze backendu.
  Pierwszy wiersz jego wyjścia podaje, na której instancji Redis zadziałało.
- Każde opóźnienie rozpoczęte dla istniejącego konta zapisuje jeden wpis w dzienniku audytu,
  `admin_user.authentication_throttled`.
- Liczniki są przechowywane w Redis. Dopóki Redis nie odpowiada, logowanie jest odrzucane
  odpowiedzią `503 ADMIN_AUTHENTICATION_UNAVAILABLE`.
- **Publiczna instancja demonstracyjna.** Limit dwudziestu prób zakłada, że hasło jest tajne. W
  instancji, która celowo publikuje adres e-mail i hasło administratora, każdy odwiedzający jest
  urządzeniem logującym się po raz pierwszy i korzysta z tego wspólnego limitu. W takiej
  instancji, i tylko w takiej, ustaw `ADMIN_AUTH_ACCOUNT_WIDE_LIMIT=off` w środowisku backendu i
  uruchom go ponownie. Zmienna wyłącza liczenie błędnych **haseł** dla całego konta i nic więcej —
  limit dla adresu, limit dla znanego urządzenia, oba limity kodów drugiego składnika i
  opóźnienia pozostają — a backend, dopóki limit jest wyłączony, zapisuje ostrzeżenie w logu
  przy każdym starcie. Działa wyłącznie dokładna wartość `off`. To nie jest ustawienie i nie da
  się go zmienić w panelu administracyjnym. Plik `compose.prod.yml` zapisany przez wcześniejsze
  wydanie nie przekazuje tej zmiennej do backendu: dodaj
  `ADMIN_AUTH_ACCOUNT_WIDE_LIMIT: ${ADMIN_AUTH_ACCOUNT_WIDE_LIMIT}` obok wiersza
  `TRUSTED_PROXY_ADDRESSES`. Nie ustawiaj jej tam, gdzie hasła administratorów nie są publiczne.

Liczby są stałymi modułu, a nie ustawieniami. Zobacz
[Ograniczanie powtarzanych błędnych haseł i kodów](./modules/admin_users.md#ograniczanie-powtarzanych-błędnych-haseł-i-kodów).

**Zmiana danych uwierzytelniających kończy sesje uzyskane przed nią.** Spodziewaj się, że
administratorzy i klienci zostaną wylogowani na pozostałych urządzeniach tam, gdzie dotąd nie
byli:

- administrator, który zmienia własne hasło albo wyłącza własne uwierzytelnianie dwuskładnikowe,
  kończy wszystkie pozostałe sesje konta i zachowuje tę, z której dokonano zmiany;
- dezaktywacja albo usunięcie administratora kończy wszystkie sesje konta, a sesja konta, które
  nie jest aktywne, jest odrzucana niezależnie od tego, czy cokolwiek ją unieważniło;
- `pnpm run admin:create` uruchomione ponownie dla istniejącego konta zastępuje jego hasło, jak
  dotąd, a teraz kończy też wszystkie sesje tego konta;
- klient, który zmienia hasło albo wyłącza uwierzytelnianie dwuskładnikowe, kończy wszystkie
  pozostałe sesje konta; użycie odnośnika resetującego hasło kończy je wszystkie, podobnie jak
  zresetowanie drugiego składnika klienta przez administratora.

Każda z tych operacji wycofuje też logowanie rozpoczęte i niedokończone — oczekujące wyzwanie
drugiego składnika albo bilet konfiguracji. Klucze API nie są sesjami i pozostają bez zmian.
Zobacz [Sesje a zmiana hasła](./modules/admin_users.md#sesje-a-zmiana-hasła).

**Żeby zmienić własne hasło, administrator podaje obecne.** Ekran profilu ma pole *Obecne hasło*
nad polem *Nowe hasło*, wymagane tylko wtedy, gdy wpisano nowe hasło, a nowe hasło równe obecnemu
jest odrzucane. Reset hasła innego administratora na ekranie **Users** oraz `admin:create`
pozostają bez zmian.

**Czas bezczynności do wylogowania obowiązuje każdego administratora.**
`admin.idle_logout_minutes` trafia teraz do każdego zalogowanego administratora. Administrator,
którego rola nie obejmuje `settings:read`, był wylogowywany po wbudowanych 60 minutach niezależnie
od ustawienia, a teraz jest wylogowywany po skonfigurowanym czasie.

**Pole niestandardowe ma odbiorców.** Każda definicja mówi, komu zwracane są jej wartości:
`internal` — tylko administratorom — albo `customer` — także w odpowiedziach dla klienta
dotyczących jego zamówień i zapytań ofertowych oraz w zewnętrznych (dla klucza API) odpowiedziach
z zamówieniami. Definicje istniejące przed aktualizacją mają `customer`; pole utworzone od teraz
ma `internal`, chyba że autor wybierze inaczej w formularzu definicji (*Kto widzi wartość*).
Zmiana odbiorców działa od następnego odczytu, a do każdego procesu API może dotrzeć z opóźnieniem
do pięciu sekund. Zobacz
[Widoczność: kto odczytuje wartości pola](./architecture/custom-fields.md#widoczność-kto-odczytuje-wartości-pola).

**Zapytania ofertowe wygasają.** Zadanie wygaszające, które opisuje dokumentacja modułu
`quote_requests`, teraz działa: co 30 minut, w każdym procesie obsługującym kolejki, dopóki moduł
jest włączony. `quote_requests.expiry_days = 0`, wartość domyślna, wyłącza je. W przeciwnym razie
zapytanie, które nadal ma status `Pending` albo `Created from admin`, od tylu dni nie dostało
żadnego wpisu w historii i nie zawiera oferty, której termin ważności jeszcze nie minął,
otrzymuje status `Expired`.

- **Włączenie ustawienia albo obniżenie jego wartości wygasza zaległości.** Reguła dotyczy
  wszystkiego, co jest otwarte, a nie liczy się od dnia ustawienia — a instancja, która ma już to
  ustawienie, trafia na te zaległości w pierwszych przebiegach po tej aktualizacji.
- Jeden przebieg wygasza najwyżej 500 zapytań, od najstarszych; większe zaległości są
  obsługiwane w kolejnych przebiegach.
- Dla zapytania, które powinno było wygasnąć ponad 24 godziny przed przebiegiem, który do niego
  dotarł, nie jest zapisywany rekord powiadomienia. Wpis w historii nadal powstaje, a
  `rfq.expired.v1` nadal jest emitowane.
- Zadanie odczytuje wartość domyślnego kanału sprzedaży i stosuje ją do zapytań z każdego kanału;
  kanał ustawiony na `0` nie jest wyjątkiem.

Zobacz [Zadania w tle](./modules/quote_requests.md#zadania-w-tle).

**Zamówienie złożone w storefroncie jest zapisywane w kanale sprzedaży, w którym wykonano
żądanie.** `POST /api/v1/orders` brał dotąd kanał zamówienia z opcjonalnego pola `salesChannelId`
w treści żądania, a gdy go nie było — używał kanału domyślnego; teraz używa kanału rozpoznanego dla
żądania — `X-Sales-Channel`, `?salesChannel=`, mapa hostów, a w ostatniej kolejności kanał
domyślny — i odrzuca treść żądania, która wskazuje inny kanał. Co to oznacza, zależy od liczby
kanałów sprzedaży w instancji. Instancja z załadowanymi danymi demonstracyjnymi ma dwa —
`pl_retail`, domyślny, oraz `pl_b2b_vip` — więc dotyczy jej przypadek *Więcej niż jeden*, tutaj i
przy metodach poniżej.

- **Jeden kanał sprzedaży.** Zmienić może się jedna rzecz. Jeśli `orders.min_order_value` jest
  ustawione **dla kanału domyślnego**, a nie dla wszystkich kanałów, to nie było egzekwowane dla
  zamówień ze storefrontu, a teraz jest. Jeśli nie masz pewności, który to przypadek, sprawdź
  wartość w **Ustawieniach** przed aktualizacją.
- **Więcej niż jeden.** Nowe zamówienia składane w storefroncie kanału innego niż domyślny są
  zapisywane w tym kanale, a nie w domyślnym, i obowiązują dla nich jego minimalna wartość
  zamówienia, magazyny, ustawienia realizacji, numeracja zamówień, dane sprzedawcy i numeracja
  faktur oraz język wiadomości e-mail. Istniejące zamówienia nie są zmieniane. Koszyki nadal
  powstają w kanale domyślnym, więc ceny pozycji i promocje takiego zamówienia są nadal z kanału
  domyślnego, a każdy produkt został sprawdzony względem kanału żądania, które dodało go do
  koszyka, a nie względem kanału zamówienia — zobacz *Który kanał sprzedaży zapisuje zamówienie*
  na stronie modułu `orders`.

**Metody dostawy i płatności są udostępniane w wybranych kanałach sprzedaży.** Na ekranach
`/delivery-methods` i `/payment-methods` każda metoda ma teraz pole **Kanały sprzedaży**, a wybór
jest egzekwowany: storefront pokazuje tylko metody dostępne w kanale, w którym kupuje klient, a
zamówienie z metodą niedostępną w jego kanale jest odrzucane. Metoda nieprzypisana do żadnego
kanału jest dostępna w każdym kanale.

- **Jeden kanał sprzedaży.** Nic się nie zmienia: każda metoda jest dostępna w jedynym kanale,
  niezależnie od tego, czy jest do niego przypisana, czy nie jest przypisana do żadnego.
- **Więcej niż jeden: przejrzyj każdą metodę.** Kolumna **Kanały sprzedaży** na obu ekranach
  pokazuje stan każdej z nich.
  - Przypisane **tylko do kanału domyślnego**, a więc po aktualizacji niedostępne przy składaniu
    zamówienia w pozostałych kanałach: każda metoda utworzona dotąd w panelu administracyjnym, bo
    ekrany nie dawały innej możliwości, oraz każda metoda utworzona przez moduł bramki płatności
    lub przewoźnika **we wcześniejszym wydaniu** w instancji, która była już uruchomiona. Nic nie
    poszerza ich za Ciebie — takiej metody nie da się odróżnić od ograniczonej celowo.
  - Nieprzypisane **do żadnego kanału**, a więc dostępne w każdym kanale: każda metoda tworzona
    przez moduł od tego wydania, niezależnie od chwili instalacji; metody utworzone przez moduł we
    wcześniejszym wydaniu podczas pierwszej konfiguracji instancji, przed jej pierwszym
    uruchomieniem; oraz metody z danych demonstracyjnych.

  Otwórz każdą metodę i wybierz jej kanały albo odznacz wszystkie, aby była dostępna wszędzie.
- **Metoda dostawy utworzona w panelu administracyjnym we wcześniejszym wydaniu może nie być
  oferowana przy składaniu zamówienia w żadnym kanale**, niezależnie od liczby kanałów w
  instancji — i nie była też przed aktualizacją. Ekran nie wysyłał adaptera, więc metoda została
  zapisana z własnym kodem jako adapterem, a jeśli ten kod nie jest kluczem zarejestrowanego
  adaptera, nie ma czym jej oferować. To wydanie oznacza taki wiersz jako *Nieoferowana przy
  składaniu zamówienia*, wraz z przyczyną. Otwórz metodę i wybierz adapter w nowym polu
  **Adapter** — *Wysyłka własna (ręczna)* dla przesyłek, które nadajesz samodzielnie. Od tej
  chwili jest oferowana w kanałach, do których jest przypisana, czyli dla metody utworzonej w ten
  sposób — tylko w kanale domyślnym. Metod płatności to nie dotyczy: nie dało się utworzyć metody
  z adapterem, który nie jest zarejestrowany.

Przypisywanie kanałów sprzedaży wymaga `delivery_methods:write` / `payment_methods:write` i
niczego więcej; uprawnienia kanałów sprzedaży nie są potrzebne.

**Listy dozwolonych metod organizacji obowiązują przy każdym sposobie składania zamówienia.**
Metoda dostawy lub płatności spoza niepustej listy dozwolonych metod organizacji, dla której
składane jest zamówienie, jest odrzucana przy składaniu zamówienia i przy jego podglądzie — w
storefroncie, przy przyjmowaniu zamówień z kluczem API oraz wtedy, gdy administrator tworzy
zamówienie dla klienta. Żadne ustawienie nie zwalnia z tego administratora: formularz tworzenia
pokazuje każdą metodę, a podgląd i utworzenie odrzucają tę, której organizacja nie dopuszcza.
Pusta lista, jak dotąd, niczego nie ogranicza. Zobacz
[Listy dozwolonych metod przy składaniu zamówienia](./modules/orders.md#listy-dozwolonych-metod-przy-składaniu-zamówienia).

**Adapter metody dostawy wybiera się na ekranie `/delivery-methods`.** Formularz ma wymagane pole
wyboru **Adapter**. Metoda, której adaptera nie dostarcza żaden włączony moduł, jest oznaczona
jako *Nieoferowana przy składaniu zamówienia* wraz z przyczyną, a naprawia się ją, otwierając ją
i wybierając zarejestrowany adapter; nic nie jest za Ciebie przepisywane ani usuwane. Adaptera
metody, do której odwołują się przesyłki, nie da się zmienić: ustaw metodę jako nieaktywną i
utwórz drugą dla innego adaptera.

**Ekran Webhooks oferuje te typy zdarzeń, które są dostarczane, i żadnych innych.** Zapisana
subskrypcja, która wskazuje typ przez nic niedostarczany, zostaje zachowana, jest na ekranie
oznaczona jako niedostarczana i niczego nie otrzymuje, jak dotąd. Dostarczanych jest sześć typów,
których dotąd nie dostarczano: `product.created.v1`, `product.updated.v1`,
`product.archived.v1`, `rfq.created.v1`, `rfq.expired.v1` i `credit_limit.adjusted.v1`. Nic nie
jest grupowane — subskrypcja `product.updated.v1` otrzymuje jedno dostarczenie na każdy produkt
zapisany przez import albo edycję zbiorczą. Zobacz
[Które zdarzenia są dostarczane](./modules/webhooks.md#które-zdarzenia-są-dostarczane).

**Wiadomość e-mail, która została tylko zapisana w logu serwera, nie jest odnotowywana jako
wysłana.** W instancji bez `SMTP_URL` wiersze `email_deliveries` są zapisywane z
`status = 'logged'` zamiast `'sent'` (wiersze zapisane wcześniej zachowują `sent`), wystawienie
faktury albo ponowne wysłanie jej wiadomości z panelu administracyjnego informuje, że wiadomości
nie wysłano, bo nie skonfigurowano serwera poczty, a przypomnienie o wydarzeniu CRM jest
odnotowywane jako dostarczone wyłącznie do dzwonka powiadomień.

**`demo reset` to jedna transakcja i odmawia, gdy dane demonstracyjne obejmują dokumenty
finansowe.** Albo kończy się w całości, albo niczego nie zmienia. Wycofuje też to, co zostało po
korzystaniu ze sklepu demonstracyjnego w ramach organizacji demonstracyjnej — zamówienia, koszyki,
zapytania ofertowe, adresy i podobne; te wiersze są usuwane, a dane innej organizacji pozostają
nietknięte. Polecenie kończy się kodem 1, zanim cokolwiek usunie, gdy organizacja demonstracyjna
ma płatność opłaconą lub zwróconą, fakturę albo korektę, rekord systemu księgowego albo zwrot, i
wypisuje, ile każdego z nich znalazło. Zamówienia złożone i nigdy nieopłacone się nie liczą. Żeby
usunąć dokumenty finansowe razem z resztą:

```bash
pnpm run cli demo reset --force-delete-financial-records
```

Flaga jest odczytywana wyłącznie z tego wiersza poleceń. Pełną listę tego, co się liczy, podaje
strona [Pierwsze kroki](./getting-started.md).

**Endpoint stanu podaje wydanie.** Pole `version` w `GET /api/v1/_health` to wersja pakietu
`@endora-commerce/platform` załadowanego przez proces — `0.105.0` — albo `unknown`, podczas gdy
dotąd każda instancja podawała `0.0.0`. Monitoring, który porównywał to pole z `0.0.0`, albo
wdrożenie, które sterowało nim zmienną `npm_package_version`, wymaga zmiany. Panel administracyjny
pokazuje to samo wydanie jako znaczek pod logotypem w menu bocznym. Zobacz
[Pole `version`](./operations/health-endpoint.md#pole-version).

**W dzienniku audytu przybywa wpisów i ubywa szumu.** Każdy zapis bloku, szablonu albo hooka CMS
wykonany w panelu zostawia teraz wpis w dzienniku audytu (`cms_block.*`, `cms_template.*`,
`cms_hook.*`), tak jak dotąd zapisy stron. Zmiana własnego hasła przez administratora jest
zapisywana jako `admin_user.change_password` z `via: 'self_service'`, a nie jako
`admin_user.update`. A cztery zadania cykliczne — domykanie następstw zamówień, przypomnienia o
wydarzeniach CRM, porządkowanie przebiegów plików produktowych i przegląd statusów cenników —
nie zapisują już wiersza `tenant.escape_hatch` w przebiegu, który nie ma nic do zrobienia, co w
spokojnej instancji dawało kilka tysięcy wierszy dziennie.

Trzy drobniejsze rzeczy: administrator, którego konto nie ma roli, widzi o tym komunikat w panelu
administracyjnym; karty szansy sprzedaży w CRM pokazują liczniki, a migracja, która dodaje
liczniki nieprzeczytanych wiadomości, oznacza każdą wiadomość napisaną przed nią jako przeczytaną
przez wszystkich; a kampania newslettera bez kanału sprzedaży jest podglądana i wysyłana z
identyfikacją wizualną kanału domyślnego.

#### Dla klientów API i integratorów {#after-0-105-0-api}

Uwierzytelnianie i autoryzacja:

- **Zabezpieczenie trasy odpowiada przed walidacją treści żądania.** Na każdej trasie, która
  deklaruje zabezpieczenie sesją, uprawnieniem albo kluczem API, żądanie bez ważnych danych
  uwierzytelniających otrzymuje `401`, a bez uprawnienia `403`, niezależnie od treści. Klient,
  który dla niepoprawnej treści wysłanej bez danych uwierzytelniających oczekiwał
  `400 VALIDATION_FAILED`, zobaczy `401`/`403`. Uprawniony klient z niepoprawną treścią otrzymuje
  to samo `400` co dotąd, a treść odrzucana przez sam parser — błędny JSON, nieobsługiwany typ
  mediów, treść ponad limit — nadal otrzymuje odpowiedź jako pierwsza.
- **`PATCH /api/v1/admin/me` wymaga `currentPassword` do zmiany hasła.** `password` bez tego pola
  to `400 VALIDATION_FAILED`; błędne — `403 CURRENT_PASSWORD_INVALID`; nowe hasło równe obecnemu —
  `400 NEW_PASSWORD_UNCHANGED`. Odrzucone żądanie niczego nie zmienia, także imienia i nazwiska
  wysłanych razem z nim. Żądanie bez `password` działa jak dotąd.
- **Trasy danych uwierzytelniających administratora mogą odpowiedzieć
  `429 ADMIN_AUTHENTICATION_THROTTLED`**, z nagłówkiem `Retry-After` i tą samą liczbą w
  `error.details.retryAfterSeconds`, albo `503 ADMIN_AUTHENTICATION_UNAVAILABLE`:
  `POST /api/v1/auth/admin/login`, obecne hasło w `PATCH /api/v1/admin/me`,
  `POST /api/v1/auth/admin/mfa/verify`, `POST /api/v1/admin/account/mfa/disable` i
  `POST /api/v1/admin/account/mfa/recovery-codes/regenerate`. Trasy klientów pozostają bez zmian.
- **Jedno wyzwanie drugiego składnika dopuszcza pięć kodów**, dla klientów i administratorów,
  niezależnie od tego, jak są wysyłane; kolejny kod to `429 MFA_TOO_MANY_ATTEMPTS`, a logowanie
  zaczyna się od nowa.
- **Sesja konta administratora, które jest zdezaktywowane albo usunięte, otrzymuje
  `401 UNAUTHORIZED`** na każdej trasie panelu; trasa z kodem uprawnienia odpowiadała jej
  `403 FORBIDDEN`. Aktywne konto bez uprawnienia nadal otrzymuje `403`.
- **Przy logowaniu klienta `403 ACCOUNT_BLOCKED` pojawia się tylko wtedy, gdy hasło jest
  poprawne.** Błędne hasło do zablokowanego konta to `401 INVALID_CREDENTIALS`.
- **`POST /api/v1/admin/i18n/reload` wymaga `settings:write`, a
  `GET /api/v1/admin/i18n/coverage` wymaga `settings:read`**; sesja bez tego kodu otrzymuje `403`.
- **Subskrypcje push należą do tego, kto je utworzył.**
  `DELETE /api/v1/storefront/pwa/subscriptions` usuwa subskrypcję tylko wtedy, gdy żądanie zawiera
  jej własne klucze — `{ endpoint, keys: { p256dh, auth } }` — albo sesję klienta, do którego
  należy; w obu przypadkach odpowiada `204`. `POST` na tę samą ścieżkę aktualizuje już
  zarejestrowany endpoint na podstawie tego samego dowodu, a w przeciwnym razie odpowiada `201` z
  nowym `id` i niczego nie zapisuje.

Zamówienia, metody i zapytania ofertowe:

- **`POST /api/v1/orders` zapisuje kanał rozpoznany dla żądania.** `salesChannelId` w treści,
  które wskazuje inny kanał, to `422 VALIDATION_FAILED` z
  `details.code = "order_sales_channel_mismatch"`. Przestań wysyłać to pole i podaj kanał w
  `X-Sales-Channel`.
- **Składanie zamówienia i jego podgląd odrzucają metodę, której nie dopuszcza kanał zamówienia
  albo organizacja** — `400 VALIDATION_FAILED` z `error.details.code` równym
  `delivery_method_not_in_sales_channel`, `payment_method_not_in_sales_channel`,
  `delivery_method_not_allowed_for_organization` albo
  `payment_method_not_allowed_for_organization`, na `POST /api/v1/orders`,
  `POST /api/v1/orders/preview-total`, `POST /api/v1/admin/orders`,
  `POST /api/v1/admin/orders/preview` i `POST /api/v1/external/orders`. Na ostatniej z nich odmowa
  z powodu listy dozwolonych metod już istniała; jej `error.message` kończy się teraz *"… is not
  available to this Organization."*, `error.details` jest obecne, a gdy obie metody są spoza
  list, wskazywana jest metoda dostawy. Dopasowuj po `error.details.code`.
- **`GET /api/v1/delivery-methods` i `GET /api/v1/payment-methods` zwracają metody kanału
  rozpoznanego dla żądania.** Klient, który nie wysyła `X-Sales-Channel`, otrzymuje odpowiedź dla
  kanału domyślnego. Zakup jednym kliknięciem działa tak samo:
  `GET /api/v1/quick-order/one-click/eligibility` odpowiada
  `{ enabled: false, reason: "missing_defaults" }`, gdy domyślna metoda kupującego nie jest
  dostępna w kanale żądania.
- **`salesChannelIds` w `PUT /api/v1/admin/{delivery,payment}-methods/:code`**: pominięte —
  zostawia przypisanie bez zmian (a nową metodę przypisuje do kanału domyślnego), jak dotąd;
  **`[]` usuwa teraz wszystkie przypisania**, udostępniając metodę w każdym kanale, podczas gdy
  dotąd było ignorowane; identyfikator, który nie wskazuje żadnego kanału sprzedaży, to
  `400 VALIDATION_FAILED`, a nie `500`.
- **`PUT /api/v1/admin/delivery-methods/:code` odpowiada `409` na zmianę `adapter`** metody, do
  której odwołują się przesyłki. Wiersze `GET /api/v1/admin/delivery-methods` zawierają
  `availability: { ownerModule, available, ownerPresence }`, a
  `GET /api/v1/admin/delivery-methods/adapters` wymienia adaptery do wyboru. Utworzenie metody bez
  `adapter` nadal przyjmuje kod metody jako adapter: wysyłaj to pole i odczytuj
  `availability.available` z odpowiedzi.
- **Odpowiedzi z zamówieniami.** Odpowiedzi dla klienta i zewnętrzne zawierają
  `placedOnBehalf: boolean` i nie zawierają już `placedOnBehalfByAdminUserId`; odpowiedzi dla
  panelu zawierają oba pola. Zastąp `order.placedOnBehalfByAdminUserId !== null` przez
  `order.placedOnBehalf`. `customFieldValues` w tych odpowiedziach zawiera tylko pola, których
  odbiorcą jest `customer`.
- **Odpowiedzi dla klienta nie zawierają identyfikatorów administratorów.** Odpowiedzi z
  zapytaniami ofertowymi dla klienta nie zawierają już `createdByAdminUserId` i
  `assignedAdminUserId`, a ich `events[]` — `actorAdminUserId` (`actorRoleLabel` nadal mówi, kto
  działał); odpowiedzi z komentarzami do zamówienia dla klienta nie zawierają już
  `authorAdminUserId` — komentarz, którego `authorCustomerAccountId` ma wartość `null`, napisał
  pracownik. Odpowiedzi dla panelu pozostają bez zmian.
- **Z dwóch równoczesnych przejść jednego zapytania ofertowego wygrywa jedno.** Akceptacja albo
  odrzucenie przez kupującego, edycja przez klienta oraz zatwierdzenie, rewizja, anulowanie albo
  przypisanie przez sprzedawcę, które przegrywają z innym przejściem albo z zadaniem
  wygaszającym, otrzymują `409 VERSION_CONFLICT`.

Pola niestandardowe, webhooki i zdarzenia:

- **`POST /api/v1/admin/custom-fields/definitions` bez `audience` tworzy pole `internal`.** Wyślij
  `"audience": "customer"` dla pola, które mają odczytywać klienci i integracje. Ponowne
  utworzenie, jako `customer`, usuniętego klucza, który nadal ma zapisane wartości, to
  `409 CUSTOM_FIELD_DEFINITION_INVALID`: utwórz pole jako `internal`, a potem zmień odbiorców.
  `PATCH …/definitions/:id` przyjmuje `audience` i nie zeruje już `config`, gdy treść go nie
  wymienia.
- **`eventTypes` webhooka są walidowane.** `POST /api/v1/admin/webhooks` i
  `PATCH /api/v1/admin/webhooks/:id` odpowiadają `422 WEBHOOK_EVENT_TYPE_NOT_DELIVERABLE`, z
  odrzuconymi nazwami w `error.details.eventTypes`, dla typu, który nie jest ani wbudowany, ani
  wniesiony przez włączony moduł. Sprawdzana jest tylko nazwa, którą zapis dodaje; zapisana
  subskrypcja zachowuje nazwy, które ma. Dostarczane w tym wydaniu: `order.created.v1` i
  `order.status_changed.v1`; `crm.opportunity.created.v1`, `crm.opportunity.status_changed.v1` i
  `crm.opportunity.closed.v1`, dopóki `crm` jest włączony; oraz sześć nowych, dopóki ich moduł
  jest włączony — `product.created.v1`, `product.updated.v1`, `product.archived.v1`,
  `rfq.created.v1`, `rfq.expired.v1` i `credit_limit.adjusted.v1`.
  `GET /api/v1/admin/webhooks/event-types` zwraca typy wniesione przez moduły. Zdarzenia
  produktów trafiają wyłącznie do subskrypcji ogólnoplatformowych.
- **Wniesiony typ zdarzenia jest dostarczany tylko wtedy, gdy jego moduł jest włączony**; zapisane
  subskrypcje zostają zachowane i w tym czasie niczego nie otrzymują.
- **`order.created.v1` jest ogłaszane po zatwierdzeniu transakcji zamówienia**, więc nieudane
  złożenie zamówienia niczego nie ogłasza. `rfq.expired.v1` zyskuje `organizationId` i występuje
  tylko tam, gdzie działa zadanie wygaszające. `product.archived.v1` jest teraz emitowane zawsze,
  gdy status produktu zmienia się na `inactive`.

Kody błędów i drobniejsze zmiany:

- **Dwie odmowy dotyczące pozycji koszyka mają własny kod zamiast `VALIDATION_FAILED`**:
  `400 CART_PRODUCT_QUOTE_ONLY` (`details.productId`), którym poza `POST /api/v1/cart/items` mogą
  odpowiedzieć także szybkie zamówienie, zakup jednym kliknięciem, dodanie listy zakupów do
  koszyka, tworzenie zamówienia w panelu i przyjmowanie zamówień z kluczem API; oraz
  `422 CART_QUANTITY_INVALID`, do którego nie prowadzi żadna trasa HTTP — otrzymuje go moduł
  wywołujący `CartWritePort.addItem` w procesie.
- **`details` zyskało pola**, przy niezmienionym kodzie i statusie: `409 LIMIT_INSUFFICIENT` —
  `availableAmount`, `orderTotal` (napisy z dwoma miejscami po przecinku) i `currency`;
  `409 STOCK_UNAVAILABLE` — `productId`, `sku`, `productName` i `requestedQuantity`;
  `413 ASSET_UPLOAD_TOO_LARGE` — `maxFileSizeMb`; `403 API_KEY_OUT_OF_SCOPE` — `requiredScope`.
  Klient, który porównywał `error.message`, zobaczy dłuższe zdania, teraz także po polsku.
- **`details` zmieniło kształt w `400 SETTING_VALUE_SHAPE_MISMATCH`.** To obiekt z
  `details.code` — `wrong_type` albo `not_an_option` — oraz `settingCode`; tablica
  `{ path, issue }`, którą odmowa z powodu typu zwracała jako samo `details`, to teraz
  `details.issues`, a odmowa z powodu opcji zawiera `allowedValues` i `enumOptions`.
- **Niepoprawny identyfikator to `404`, a nie `500`**, na każdej trasie
  `/api/v1/admin/customers/:id…` (`CUSTOMER_NOT_FOUND`) i na samoobsługowych trasach adresów
  (`CUSTOMER_ADDRESS_NOT_FOUND`).
- **`GET /api/v1/catalog/products` wycina stronę z produktów, które pasują.** Na domyślnej
  ścieżce listy strona zawiera `limit` pasujących produktów, o ile tyle istnieje, a `hasMore` ma
  wartość `true` tylko wtedy, gdy istnieje kolejny. `filter[category]` wskazujące kategorię,
  która nie istnieje, zwraca jedną pustą stronę z `hasMore: false`. Kształt odpowiedzi i format
  kursora pozostają bez zmian.
- **`POST /api/v1/organizations/register` odpowiada `emailVerificationSent: false`** w instancji
  bez serwera poczty, w której wiadomość została tylko zapisana w logu.
- **Nowe elementy**: `idleLogoutMinutes` w `GET /api/v1/admin/me`;
  `GET /api/v1/admin/platform-info` (`{ "version": string | null }`, dla każdego zalogowanego
  administratora); `noteCount`, `attachmentCount` i `unreadMessageCount` w szansie sprzedaży CRM
  oraz `POST /api/v1/admin/crm/opportunities/:id/messages/read`.

#### Dla autorów modułów i modułów nakładkowych {#after-0-105-0-authors}

**Zabezpieczenie zadeklarowane na trasie działa przed walidacją.** Łańcuch `preHandler`, który
trasa deklaruje we własnych opcjach, jest przy rejestracji trasy przenoszony do jej
`preValidation`; żadne miejsce wywołania się nie zmienia, a moduł zbudowany z wcześniejszą
platformą jest objęty bez ponownego budowania. Dwie rzeczy do sprawdzenia we własnym kodzie:

- Funkcja przekazana jako `preHandler` trasy widzi `request.body` sparsowane, ale
  **niezwalidowane** — dowolną wartość JSON — oraz `request.params` / `request.query` bez
  konwersji i wartości domyślnych ze schematu. Praca wymagająca zwalidowanego żądania należy do
  handlera, do interceptora API albo do `preHandler` dodanego przez `addHook` w zasięgu Twojej
  wtyczki.
- `addHook('preHandler')` w zasięgu wtyczki działa teraz **po** zabezpieczeniach trasy. To, co
  zabezpieczenie trasy odczytuje z żądania, musi się tam znaleźć w `onRequest` albo
  `preValidation`.

Zobacz [Kiedy działa zabezpieczenie](./architecture/permissions.md#kiedy-działa-zabezpieczenie).

**Kod, który implementuje opublikowany port albo buduje jeden z jego rekordów, nie skompiluje
się, dopóki nie ma nowego elementu** — własna implementacja w module nakładkowym albo dubler
testowy o typie portu:

| Gdzie | Nowy wymagany element |
| --- | --- |
| `AdminPermissionChecker` (`@endora-commerce/platform`) | `isActiveAdministrator(adminUserId)` |
| `SalesChannelMembershipPort` (`@endora-commerce/platform`) | `entityIdsInChannelSubquery`, `filterEntityIdsAvailableInChannel`, `clearChannelsForEntity` |
| `MfaLoginPort` | `invalidatePending(subject)` |
| `CustomFieldValuePort` | `projectForCustomer(entityType, bag)` |
| `DeliveryMethodReadPort`, `PaymentMethodReadPort` | `isAvailableInChannel(id, salesChannelId)` |
| `CustomFieldDefinitionRecord`, `CreateCustomFieldDefinitionRequest` | `audience` |
| `Order` (typ wywnioskowany) | `customFieldValues` (`{}`), `placedOnBehalf` |

Wiersze bez podanego pakietu dotyczą `@endora-commerce/contracts`. Moduł, który zwraca wartości pól
niestandardowych komuś innemu niż administrator, przepuszcza zapisany zbiór wartości przez
`CustomFieldValuePort.projectForCustomer` w swoim serializatorze.

**Usunięte.** `AdminAuthService.changePassword` w `@endora-commerce/mod-admin-users`, razem z
czwartym argumentem konstruktora tej klasy — jedyną implementacją jest
`AdminUserService.updateSelf`, a `AdminUserService.update` nie przyjmuje już `password`.
`ChallengeStore.recordFailedAttempt` w `@endora-commerce/mod-mfa`, zastąpione przez `takeAttempt`
i `returnAttempt`. Oraz `bindToDefaultChannel`:

**Jeśli Twój własny moduł tworzy metodę dostawy lub płatności w swoim `installHook`**, funkcja
`bindToDefaultChannel` zniknęła z interfejsu tworzenia metod: usuń jej wywołanie po
`ensureMethodForAdapter`. Nic jej nie zastępuje — utworzona metoda jest dostępna w każdym kanale.
Źródła modułu nie skompilują się, dopóki tego nie zrobisz. Wcześniej opublikowana wersja modułu
nie jest kompilowana ponownie, więc zawiedzie później — błędem `TypeError` w `installHook`, gdy po
raz pierwszy będzie tworzyć swoją metodę — i trzeba ją wydać ponownie dla tego wydania. Instancji,
która ma już wiersz tej metody, to nie dotyczy, bo hook wykonuje to wywołanie tylko dla wiersza,
który właśnie utworzył. Nie ma mechanizmu tworzenia metody ograniczonej do wybranych kanałów;
ogranicz ją w panelu administracyjnym.

**Wyniki wysyłki poczty zyskały `logged`.** `EmailMailerSendOutcome`, `TransactionalSendOutcome`,
`EmailDeliveryStatus` i `InvoiceEmailNotSentReason` mają nowy element, którym konsolowy mailer
odpowiada zamiast `sent`. Kod z wyczerpującym `switch` po jednym z nich przestaje się kompilować,
dopóki nie obsłuży `logged`; kod, który odczytuje `outcome.reason` po
`outcome.status !== 'sent'`, musi najpierw zawęzić typ do `'suppressed'`; kod, który porównuje z
`=== 'sent'`, kompiluje się dalej i traktuje teraz wiadomość zapisaną w logu jako niewysłaną.
`logged` nie jest błędem i nie ma czego ponawiać.

**Kompozycja danych demonstracyjnych i kod resetu działają wewnątrz transakcji resetu.**

- Obiekt zwracany przez `createDemoComposition` musi deklarować
  `withdrawsInsideTransaction: true`. Reset na kompozycji, która tego nie robi, jest odrzucany,
  zanim się zacznie.
- Kod `demo.reset` modułu i `withdraw` kompozycji muszą zapisywać przez `EntityManager`, który
  otrzymują (`em.nativeDelete`, `em.execute`), a nie przez `em.getConnection().execute(…)`: samo
  połączenie jest poza transakcją, a w czasie resetu drugie połączenie jest odrzucane komunikatem
  *a reset body wrote outside the reset transaction*.
- `@endora-commerce/platform/demo` eksportuje `DemoResetRefusedError`, którym kompozycja odmawia
  resetu z komunikatem, oraz `DEMO_FORCE_DELETE_FINANCIAL_RECORDS_FLAG`.

**Zachowania, na które może trafić Twój kod.**

- `AdminPasswordVerificationPort.verifyPassword` może teraz odrzucić wywołanie odpowiedzią `429`
  albo `503` limitu logowania, zamiast zawsze zwracać wartość logiczną, i przyjmuje opcjonalny
  trzeci argument opisujący pochodzenie żądania. Moduł, który sam weryfikuje dane uwierzytelniające
  administratora, korzysta z tych samych liczników przez `adminAuthenticationThrottlePort`.
- `AuthSessionPort.destroyAllForAdmin` i `destroyAllForCustomer` przyjmują opcjonalne
  `{ exceptSessionId }`. Implementacja, która je ignoruje, nadal przechodzi sprawdzenie typów i
  kończy także sesję wywołującego.
- `validateUseOnStorefront` adaptera płatności lub dostawy otrzymuje identyfikator kanału
  zamówienia w `salesChannelId` przy zamówieniu ze storefrontu, podczas gdy dotąd otrzymywało
  `null`.
- Subskrybent `order.created.v1` albo `promotion.used.v1` na szynie zdarzeń w procesie działa po
  zatwierdzeniu transakcji zamówienia. `product.archived.v1` jest teraz emitowane na każdej
  ścieżce, która zmienia status produktu na `inactive`, a zapis czeka na subskrybentów.
- Moduł udostępnia własne zdarzenia webhookom, dopisując ich nazwy do `webhookEventRegistry` w
  hooku startowym i deklarując krawędź jako `contributes-to`.
- `CustomFieldValuesPanel` w `@endora-commerce/admin-kit` przekazuje do `save` i `onChange`
  `null`, a nie `undefined`, dla wyczyszczonej liczby, daty albo pola wyboru.
- Nadpisanie motywu, które styluje dolną krawędź `.b2b-sidebar__brand`, należy przenieść na
  `.b2b-sidebar__brand-row`, do którego należy teraz linia oddzielająca.
- `npm_package_version` nie jest już zadeklarowaną zmienną środowiskową platformy.

**Jeśli sam konstruujesz te klasy**, a nie przez `composeApp` albo zestaw testowy:
`CmsBlockService`, `CmsTemplateService` i `CmsHookService` przyjmują `CommandBus` jako drugi
argument konstruktora; `PasswordResetService` przyjmuje port sesji jako drugi argument, a port
audytu jako trzeci; `makeEnqueuer` w `@endora-commerce/mod-google-analytics` przyjmuje drugi,
wymagany argument; a cykliczne konsumenty z `mod-orders`, `mod-crm`, `mod-product-feeds` i
`mod-price-lists` przyjmują pytanie, czy przebieg ma coś do zrobienia — dziennik zmian każdego
pakietu wymienia te elementy.

#### W istniejącym storefroncie {#after-0-105-0-storefront}

**W istniejącym storefroncie**, który zachowuje źródła, z jakimi go utworzono, ani wywołania
dotyczące zamówień, ani oba katalogi metod nie informują backendu, w którym kanale jest kupujący:
są wykonywane bez kontekstu żądania, więc nagłówek `X-Sales-Channel` nie jest wysyłany i backend
rozpoznaje dla nich kanał domyślny. W instancji z jednym kanałem sprzedaży to poprawna odpowiedź i
niczego nie trzeba zmieniać. W instancji z więcej niż jednym wprowadź wszystkie poniższe zmiany
razem — przy tylko części z nich składanie zamówienia pokazywałoby metody jednego kanału, a
zamówienie trafiałoby do innego i byłoby odrzucane:

- W `lib/api/orders.ts` dodaj `import type { RequestContext } from './client';`, dodaj ostatni
  parametr `ctx: RequestContext` do funkcji `placeOrder`, `previewOrderTotal` i
  `cloneOrderToQuote` oraz dodaj `ctx,` do obiektu opcji, który każda z nich podaje do `apiMutate`.
- W `lib/api/quick-order.ts`, który już importuje `RequestContext`, zrób to samo dla
  `placeOneClickOrder` (`apiMutate`) i `getOneClickEligibility` (`apiGetAuthed`).
- W `lib/api/methods.ts`:
  - zmień pierwszy import na `import { apiGet, type RequestContext } from './client';`;
  - dodaj parametr do obu eksportowanych funkcji i przekaż go dalej —
    `listDeliveryMethods(ctx: RequestContext)` zwracające
    `withModuleAbsence(() => fetchDeliveryMethods(ctx), [])` oraz
    `listPaymentMethods(ctx: RequestContext)` zwracające
    `withModuleAbsence(() => fetchPaymentMethods(ctx), [])`;
  - dodaj ten sam parametr do obu prywatnych funkcji, `fetchDeliveryMethods(ctx: RequestContext)`
    i `fetchPaymentMethods(ctx: RequestContext)`, i w każdej przekaż `ctx` jako drugi argument jej
    wywołania `apiGet`.
- W plikach `test/checkout/delivery-catalogue-absence.test.tsx` i
  `test/checkout/payment-catalogue-absence.test.tsx`, które utworzony storefront zawiera i które
  obejmuje jego `tsconfig.json`, obie funkcje są wywoływane bez argumentu — po cztery razy w każdym
  pliku. Zmień każde `listDeliveryMethods()` na `listDeliveryMethods({})` i każde
  `listPaymentMethods()` na `listPaymentMethods({})`. Bez tego sprawdzenie typów storefrontu kończy
  się błędem `Expected 1 arguments, but got 0` w tych dwóch plikach. Pomiń ten krok, jeśli je
  usunąłeś.
- Przekaż kontekst w miejscach wywołań. `getServerContext` jest już importowany we wszystkich
  czterech plikach:
  - `app/(commerce)/checkout/page.tsx`: komponent strony zawiera
    `const { locale } = await getServerContext();` — zmień to na
    `const { locale, ctx } = await getServerContext();` i przekaż `ctx` do znajdujących się niżej
    wywołań `listDeliveryMethods` i `listPaymentMethods`. W `submitAction`, osobnej funkcji, dodaj
    `const { ctx } = await getServerContext();` przed wywołaniem `placeOrder` i przekaż `ctx` jako
    ostatni argument.
  - `app/(account)/preferences/page.tsx`: ta sama zmiana wiersza
    `const { locale } = await getServerContext();` i `ctx` przekazane do obu wywołań list.
  - `app/(catalog)/p/[slug]/page.tsx`: komponent strony **ma już** `ctx` w zasięgu, więc przekaż
    go do `getOneClickEligibility` i niczego nie deklaruj; w `oneClickAction`, osobnej funkcji,
    dodaj `const { ctx } = await getServerContext();` przed wywołaniem `placeOneClickOrder` i
    przekaż `ctx`.
  - `app/(account)/orders/[id]/page.tsx`, w `reorderToQuoteAction`: dodaj
    `const { ctx } = await getServerContext();` przed wywołaniem `cloneOrderToQuote` i przekaż
    `ctx`.

`getServerContext()` bierze kanał z nagłówka `x-sales-channel` żądania, które otrzymuje sam
storefront — tego samego, który Twoje reverse proxy albo middleware już ustawia dla każdego hosta,
aby strony renderowały się we właściwym kanale.

Trzy kolejne zmiany, których storefront utworzony we wcześniejszym wydaniu nie otrzymuje:

- **Usuwanie subskrypcji push.** W `lib/api/pwa.ts` funkcja `unsubscribeFromPush()` wysyła sam
  endpoint, na co backend reaguje teraz tylko dla zalogowanego klienta, do którego subskrypcja
  należy. Wysyłaj razem z nim klucze — przed `fetch` odczytaj
  `const json = subscription.toJSON();` i ustaw treść żądania na

  ```ts
  body: JSON.stringify({
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
  }),
  ```

  Bez tego wyłączenie powiadomień w przeglądarce bez zalogowanego klienta zostawia subskrypcję
  zarejestrowaną w backendzie, dopóki usługa push nie zgłosi, że już jej nie ma.
- **Bloki katalogu w HTML renderowanym na serwerze.** `ProductGrid`, `ProductSlider`,
  `ProductCard`, `CategoryList` i `CategoryGrid` na stronie CMS nadal pobierają dane w
  przeglądarce, jak dotąd, dopóki storefront nie rozwiąże ich danych na serwerze. Storefront
  zapisany przez CLI wydania `0.105.0` to robi: weź z niego `components/CatalogBlockData.tsx` i
  `lib/page-builder/catalog-block-data.ts`, weź jego `components/CmsPageRenderer.tsx` i
  `components/Hook.tsx` oraz przekaż `ctx` do `CmsPageRenderer` w `app/page.tsx` i
  `app/(content)/[...slug]/page.tsx` — ta właściwość jest tam wymagana. Utwórz storefront, z
  którego skopiujesz pliki, tak jak w sekcji
  [Bloki modułów w istniejącym storefroncie](#storefront-block-renderers).
- **Twoje własne typy.** `lib/api/rfq.ts` deklaruje `createdByAdminUserId`, `assignedAdminUserId`
  i `actorAdminUserId`, których odpowiedzi dla klienta już nie zawierają; referencyjny storefront
  nie odczytywał żadnego z nich. Jeśli Twój kod je odczytuje — albo
  `placedOnBehalfByAdminUserId` zamówienia — odczyta teraz `undefined`.

Storefront zapisany przez CLI wydania `0.105.0` ma też w stopce wzmiankę o platformie; istniejący
jej nie zyskuje.

Na ile zostało to sprawdzone: instancję utworzoną przez instalator wydania `0.104.0` z danymi
demonstracyjnymi — API, panel i storefront — zaktualizowano poleceniem `pnpm run upgrade 0.105.0`
z pnpm 9, z pakietami wydania udostępnionymi z lokalnego rejestru, i polecenie przeszło do końca.
Co w niej zaobserwowano:

- wykonały się dokładnie dwie migracje, odbiorców pól niestandardowych i znaczników przeczytania
  wiadomości CRM; endpoint stanu i znaczek w panelu administracyjnym podają `0.105.0`;
- pięć błędnych haseł administratora otrzymuje `401`, a szóste
  `429 ADMIN_AUTHENTICATION_THROTTLED` z `Retry-After: 60`, co ustępuje po upływie opóźnienia albo
  po poleceniu `unlock`; żądanie bez sesji i z niepoprawną treścią otrzymuje `401`;
- metody utworzone w panelu przed aktualizacją są dostępne tylko w kanale domyślnym, metody
  utworzone przez moduły — w każdym kanale, a metoda przypisana do innego kanału jest tam
  dostępna; metoda dostawy utworzona w panelu była oznaczona jako *Nieoferowana przy składaniu
  zamówienia*, a wybranie adaptera to naprawiło;
- zamówienie albo jego podgląd są odrzucane dla metody, której kanał nie oferuje, dla treści
  wskazującej inny kanał i dla metody spoza listy dozwolonych metod organizacji, a po każdej
  odmowie koszyk i liczba zamówień były bez zmian;
- ze storefrontem w postaci zapisanej przez `0.104.0` składanie zamówienia w kanale innym niż
  domyślny pokazuje metody kanału domyślnego, a zamówienie jest zapisywane w kanale domyślnym; z
  powyższymi zmianami — naniesionymi dokładnie tak, jak je opisano, na siedem plików źródłowych i
  dwa pliki testów, przy czym każdy cytowany fragment został znaleziony — pokazuje metody tego
  kanału, zamówienie jest zapisywane w tym kanale, a `tsc --noEmit`, testy storefrontu i
  `next build` kończą się powodzeniem;
- każda istniejąca definicja pola niestandardowego zachowuje `customer`, a jej wartość nadal jest
  w zamówieniu kupującego; definicja utworzona później ma `internal` i jej wartości tam nie ma;
- szansa sprzedaży CRM sprzed aktualizacji nie pokazuje nikomu licznika nieprzeczytanych, a
  wiadomość napisana później jest nieprzeczytana tylko dla drugiego administratora;
- subskrypcja webhooka sprzed aktualizacji się wczytuje, a nieznany typ zdarzenia to `422`.

Nie sprawdzono: instancji starszej niż `0.104.0`, instancji z modułami nakładkowymi ani modułu,
który nadal wywołuje `bindToDefaultChannel`; zmiennych proxy, limitu dla całego konta i
`ADMIN_AUTH_ACCOUNT_WIDE_LIMIT`, limitu kodów drugiego składnika ani sesji kończonych przez zmianę
danych uwierzytelniających; zadania wygaszającego zapytania ofertowe; zakupu jednym kliknięciem,
strony preferencji ani ponownego zamówienia jako zapytania ofertowego w działaniu; formularza
tworzenia zamówienia w panelu ani przyjmowania zamówień z kluczem API; `demo reset`; dostarczenia
webhooka; zmian w storefroncie dotyczących subskrypcji push i bloków katalogu, wiersza w
`compose.prod.yml` ani wierszy `.gitignore` dla `backend/var/`; ani odtworzenia kopii zapasowej.
To, co ta sekcja o nich mówi, pochodzi z dzienników zmian wydania, sprawdzonych ze źródłami tego
wydania.

### Po aktualizacji do wydania 0.106.0 {#after-0-106-0}

`pnpm run upgrade 0.106.0` przenosi 73 pakiety wydania z `0.105.0` i wykonuje jego jedyną migrację,
która dodaje kolumnę do tabeli `settings` i nie przepisuje żadnego wiersza; instancja uruchamia się
potem bez edycji żadnego ze swoich plików, a wydanie nie dodaje żadnej zmiennej środowiskowej ani
żadnego uprawnienia. To, co dodaje, znajduje się na karcie SEO w **Ustawieniach**: storefront
kanału sprzedaży można wyłączyć z wyszukiwarek, dopisać mu własne reguły do `robots.txt` i nadać
mu plik `llms.txt` — i żadna z tych trzech rzeczy nie dociera do storefrontu utworzonego we
wcześniejszym wydaniu, dopóki jego pliki nie zostaną zaktualizowane. Ta sekcja mówi, co zrobić i w
jakiej kolejności, a potem — co działa inaczej, osobno dla każdego czytelnika:
[operatorów](#after-0-106-0-operators), [klientów API i integratorów](#after-0-106-0-api),
[autorów modułów i modułów nakładkowych](#after-0-106-0-authors) oraz właściciela
[istniejącego storefrontu](#after-0-106-0-storefront).

#### Co zrobić i w jakiej kolejności {#after-0-106-0-steps}

Przed aktualizacją: nic poza tym, co opisuje [Zanim zaczniesz](#zanim-zaczniesz). Migracja
`Migration20261011T135250CoreSettingsMultiline` dodaje kolumnę `settings.multiline boolean not null
default false`, nie wymaga żadnego uzupełnienia danych i nie zmienia wartości ani znaczenia
żadnego ustawienia. Cofaj ją wyłącznie razem z pakietami: kod tego wydania oczekuje tej kolumny,
więc cofnięcie samej migracji zostawia instancję, która nie uruchomi się, podczas gdy cofnięcie
jej w ramach obniżenia wersji `@endora-commerce/platform` i `@endora-commerce/mod-settings` traci
tylko tę flagę.

Po aktualizacji, zanim instancja znów przyjmie ruch:

1. **Zdecyduj, czy storefront przejmie pliki z tego wydania.** Trzy nowe ustawienia na karcie SEO —
   *Domyślne robots*, *Własne instrukcje robots.txt* i *Dodatkowa treść llms.txt* — pojawiają się w
   każdej zaktualizowanej instancji, a storefront utworzony we wcześniejszym wydaniu nie reaguje na
   żadne z nich: kanał ustawiony na `NOINDEX` nadal jest indeksowany, `robots.txt` pozostaje
   plikiem, z którym storefront został zbudowany, i nic nie serwuje `llms.txt`. Wiersz *Domyślne
   robots* i oba podglądy informują o tym, dopóki tak jest. Zmiany opisuje część
   [W istniejącym storefroncie](#after-0-106-0-storefront); dopóki nie zostaną wprowadzone, nie
   polegaj na tych ustawieniach.
2. **W storefroncie, który obsługuje więcej niż jeden kanał sprzedaży za reverse proxy albo siecią
   CDN**, spraw, by proxy samo ustawiało nagłówek `X-Sales-Channel`, osobno dla każdego hosta, i nie
   przekazywało dalej wartości przysłanej przez odwiedzającego. Po zaktualizowaniu storefrontu
   `robots.txt` i `llms.txt` różnią się między kanałami, a kanał wskazuje właśnie ten nagłówek. W
   nginx to jeden wiersz w bloku `location` storefrontu —
   `proxy_set_header X-Sales-Channel "<kod kanału tego hosta>";` we wdrożeniu wielokanałowym albo
   `proxy_set_header X-Sales-Channel "";`, aby usunąć nagłówek we wdrożeniu jednokanałowym, którego
   poza tym zmiana nie dotyczy. Plik `nginx.example.conf`, z którym utworzono instancję, nie
   zawiera tego wiersza; `deploy/nginx.example.conf` w repozytorium platformy pokazuje oba warianty,
   zakomentowane. Współdzielona pamięć podręczna, która ignoruje `Vary` dla tego nagłówka, musi
   włączyć go do klucza albo nie buforować `/robots.txt`.
3. **Ustaw *Domyślne robots* dla każdego kanału sprzedaży, którego storefront ma pozostać poza
   wyszukiwarkami** — `NOINDEX, FOLLOW` albo `NOINDEX, NOFOLLOW`, w **Ustawienia → SEO** — i nie
   dopisuj do tego `Disallow: /` we własnych instrukcjach `robots.txt`: robot, któremu nie wolno
   pobrać strony, nigdy nie odczyta jej `noindex`. Przy zaktualizowanym storefroncie
   `curl -sI https://<twój sklep>/ | grep -i x-robots-tag` pokazuje nagłówek w ciągu minuty lub
   dwóch.
4. **Sprawdź, czy `robots.txt` storefrontu nadal serwuje to, co powinien.** Po wprowadzeniu zmian
   z części [W istniejącym storefroncie](#after-0-106-0-storefront) lista tras w wyniku budowania
   musi pokazywać `ƒ /robots.txt`, a nie `○ /robots.txt`, a
   `curl -sI https://<twój sklep>/robots.txt | grep -i x-endora-crawler-files` musi wypisać
   nagłówek. Jeśli lista tras nadal pokazuje `○`, plik `app/robots.ts` nie został usunięty i stary
   plik z czasu budowania nadal wygrywa — po cichu. Jeśli edytowano listę `disallow` w
   `app/robots.ts`, te same wiersze muszą teraz być w `ROBOTS_SYSTEM_RULES` w
   `lib/seo/robots-system-rules.ts`.

W dowolnym momencie:

5. Jeśli utrzymujesz ustawienie `cms.reserved_slug_segments`, dodaj do niego `robots.txt` i
   `llms.txt`, tak jak zmiany w storefroncie dodają je do `RESERVED_TOP_LEVEL_SEGMENTS` w
   `app/reserved-segments.ts`.
6. **Zbuduj własne moduły ponownie z tym wydaniem tylko wtedy**, gdy któryś z Twoich testów
   konstruuje `SettingWriteValidationInput` albo renderuje samodzielnie `SettingRowEditor` lub
   `SettingsPage` — część [Dla autorów modułów i modułów nakładkowych](#after-0-106-0-authors)
   mówi, czego każdy z nich potrzebuje. Moduł, który tylko dostarcza `SettingWriteValidator` albo
   tylko deklaruje ustawienia, nie wymaga zmian.

#### Dla operatorów {#after-0-106-0-operators}

**Storefront kanału sprzedaży można wyłączyć z wyszukiwarek jednym ustawieniem: Ustawienia → SEO →
Domyślne robots.** Do wyboru są `INDEX, FOLLOW` (wartość domyślna), `NOINDEX, FOLLOW`,
`INDEX, NOFOLLOW` i `NOINDEX, NOFOLLOW`, dla wszystkich kanałów sprzedaży albo osobno dla kanału.
Dla kanału, którego wartość coś ogranicza, zaktualizowany storefront dodaje dyrektywę do tego, co
serwuje w tym kanale: nagłówek `X-Robots-Tag` na stronach (także na stronach „nie znaleziono” i na
stronie offline), na `/sitemap.xml`, na `/_next/image` i na plikach z katalogu `public/`, oraz
jeden dodatkowy element `<meta name="robots">` w `<head>` stron renderowanych dla żądania. Strony
„nie znaleziono” i statycznie zbudowana strona `/offline` niosą nagłówek bez dodatkowego elementu —
obie same deklarują `noindex, nofollow` — a przekierowania zadeklarowane w `next.config.js` i pliki
w `/_next/static` nie niosą ani jednego, ani drugiego. Ustawienie tylko dodaje ograniczenia: strona,
która sama deklaruje `noindex`, zachowuje własny tag, a `robots.txt` się nie zmienia. Przy
wartości domyślnej nic nie jest dodawane. Zapisana zmiana obowiązuje w storefroncie w ciągu minuty
lub dwóch. Dwa ograniczenia: pliki serwowane przez backend (zdjęcia produktów i inne przesłane
media) nie niosą `X-Robots-Tag`, a storefront uruchomiony, gdy jego backend jest nieosiągalny,
serwuje strony bez domyślnej dyrektywy aż do pierwszego udanego odczytu. Ustawienie jest też
osiągalne z palety poleceń jako *Roboty wyszukiwarek* dla posiadacza `settings:read`. Zobacz
[Roboty wyszukiwarek](./modules/seo.md#roboty-wyszukiwarek).

**Do `robots.txt` kanału sprzedaży można dopisać reguły: Ustawienia → SEO → Własne instrukcje
robots.txt.** Tekst jest dopisywany po regułach, które storefront generuje sam — za nimi,
oddzielony jednym pustym wierszem — dla wszystkich kanałów sprzedaży albo osobno dla kanału.
Generowane reguły (zamknięte rodziny adresów i wiersz `Sitemap:`) się nie zmieniają i nie można ich
edytować ani usunąć z ekranu Ustawień. Bez tekstu `robots.txt` jest bajt w bajt tym, czym był;
zresetowanie ustawienia usuwa tekst; zapisana zmiana jest serwowana w ciągu około dwóch minut.

- Tekst jest serwowany tak, jak go napisano: każdy znak jest zachowany, w tej samej kolejności, i
  nic w nim nie jest walidowane. Dwie rzeczy dotyczące końców wierszy są ujednolicane — każdy
  koniec wiersza jest serwowany jako znak nowej linii (`LF`), niezależnie od tego, czy zapisano go
  jako `LF`, `CRLF` czy `CR`, a plik kończy się dokładnie jednym — a jeden znacznik kolejności
  bajtów (`U+FEFF`) na samym początku tekstu nie jest serwowany, bo robot nie rozpoznaje wiersza, do
  którego jest doklejony.
- Generowanych wierszy nie da się zmienić, ale ich skutek dla jednego robota — tak: grupa
  napisana dla robota wskazanego z nazwy zastępuje dla niego grupę `*`. Powtórz w takiej grupie
  generowane reguły, jeśli mają go nadal dotyczyć. Indeksowanie od tego nie zależy — strony, które
  te reguły zamykają, same deklarują `noindex`.
- Tekst może mieć najwyżej **64 KiB** (65 536 bajtów UTF-8). Większy jest odrzucany przy zapisie
  odpowiedzią `400 SEO_CRAWLER_TEXT_TOO_LARGE` z komunikatem podającym limit, a zapisany wcześniej
  tekst zostaje zachowany.
- **`robots.txt` nie usuwa stron z wyników wyszukiwania.** Decyduje o tym, co robot może pobrać.
  Aby storefront pozostał poza wyszukiwarkami, użyj *Domyślne robots* = `NOINDEX` i nie dopisuj do
  tego `Disallow: /`. Opis ustawienia mówi o tym, po angielsku i po polsku.

Zobacz [Własne instrukcje `robots.txt`](./modules/seo.md#własne-instrukcje-robotstxt).

**Pod polem znajduje się podgląd pliku, który serwuje storefront wybranego kanału**, jako jeden
blok będący tym plikiem: wiersze generowane przez storefront, oznaczone jako tylko do odczytu,
potem pusty wiersz, potem Twoje wiersze, oznaczone paskiem i etykietą. Gdy nic nie jest
niezapisane, nagłówek brzmi *robots.txt serwowany obecnie*; w miarę pisania blok podąża za polem,
a nagłówek zmienia się na *robots.txt po zapisaniu* — plik, który storefront będzie serwował po
zapisaniu; do tego czasu serwuje poprzednią wersję. W widoku **Wszystkie kanały** wybierasz kanał
do podglądu, a podgląd wymienia kanały, które mają własną wartość i których zmiana w związku z tym
nie dotyczy. W kanale, którego *Domyślne robots* to `NOINDEX`, mówi, że `robots.txt` celowo
pozostaje otwarty, i ostrzega, gdy Twój tekst zabrania wszystkim robotom pobierania czegokolwiek.
Administrator, który może odczytywać ustawienia, ale nie może ich zmieniać, też go widzi, a temu,
kto nie może wyświetlać listy kanałów sprzedaży, pokazywany jest systemowy kanał domyślny.
Podgląd niczego nie zmienia w tym, co serwuje storefront.

Generowane reguły nie są kopiowane do backendu ani do panelu administracyjnego: za każdym razem
backend pyta o nie storefront kanału. Dlatego **storefront musi być osiągalny z backendu pod
adresem skonfigurowanym dla kanału** — ustawienie **Storefront URL** kanału, a w jego braku
`STOREFRONT_BASE_URL`. Gdy nie jest, podgląd o tym informuje i pokazuje sam Twój tekst; zapis
nigdy nie jest blokowany. Trzy komunikaty i co z każdym zrobić:

- *Nie udało się połączyć ze sklepem* — brak odpowiedzi w ciągu trzech sekund, odrzucone
  połączenie, błąd, przekierowanie albo odpowiedź, która nie jest plikiem tekstowym. Sprawdź, czy
  storefront działa i czy skonfigurowany adres to ten, pod którym sam odpowiada. Wiersz dziennika
  serwera `seo: the crawler-file preview could not show the storefront’s part` podaje przyczynę.
- *Ten kanał sprzedaży nie ma skonfigurowanego adresu sklepu* — ustaw **Storefront URL** dla
  kanału albo `STOREFRONT_BASE_URL`.
- *Ten sklep nie potwierdził, że obsługuje własne instrukcje* — odpowiedział bez nagłówka
  `X-Endora-Crawler-Files`. Zwykle storefront został utworzony w wydaniu sprzed tych ustawień:
  serwuje tylko swoje generowane reguły i ignoruje zarówno własne instrukcje, jak i *Domyślne
  robots*. Tak samo wygląda proxy, które usuwa ten nagłówek, albo storefront zaktualizowany tylko
  częściowo. Odpowiednia informacja pojawia się w wierszu *Domyślne robots*, żeby nie uznać sklepu
  za wyłączony z wyszukiwarek, gdy jego storefront może ignorować to ustawienie. Wprowadź zmiany z
  części [W istniejącym storefroncie](#after-0-106-0-storefront) i sprawdź, czy nagłówek dociera.

Backend wysyła jedno żądanie na podgląd: `GET <origin>/robots.txt?part=system`, wyłącznie do
originu skonfigurowanego adresu, z kodem kanału w nagłówku `X-Sales-Channel`. Nie podąża za
przekierowaniem, czeka najwyżej trzy sekundy, czyta najwyżej 512 KiB, przyjmuje wyłącznie
`text/plain`, nie wysyła ciasteczek ani danych uwierzytelniających i niczego nie zapisuje. Ścieżka
ani zapytanie w skonfigurowanym adresie nie są używane. Adresy prywatne i pętli zwrotnej **nie**
są odrzucane, bo własny storefront instancji jest rutynowo osiągany pod takim adresem; o tym, kto
może wskazać adres kanału, decyduje jak dotąd posiadanie `settings:write`.

**Storefront serwuje `llms.txt` osobno dla każdego kanału sprzedaży, a Ty możesz go uzupełnić:
Ustawienia → SEO → Dodatkowa treść llms.txt.** `/llms.txt` to plik tekstowy, który mówi
asystentom AI, czym jest sklep i gdzie są jego publiczne strony. Zaktualizowany storefront serwuje
po jednym dla każdego kanału sprzedaży: część generowaną — nazwę sklepu, odnośniki do strony
głównej, katalogu, wyszukiwania, bloga i strony kontaktowej oraz do mapy witryny — a po niej tekst
zapisany w tym ustawieniu. Ustawienie jest domyślnie puste, przyjmuje wartość dla wszystkich
kanałów sprzedaży i wartość osobno dla kanału jak każde inne i mieści najwyżej 64 KiB — limit
instrukcji `robots.txt`. Zapisana zmiana jest serwowana w ciągu około dwóch minut. Adresy w
generowanej części używają jedynego publicznego originu storefrontu (`NEXT_PUBLIC_SITE_URL`,
ustalonego przy budowaniu storefrontu), tak jak mapa witryny: storefront obsługujący kilka kanałów
sprzedaży podaje ten origin w pliku każdego kanału, z nazwą sklepu właściwą dla tego kanału. Dwie
rzeczy, które warto wiedzieć, zanim na nim polegasz:

- **Kanał sprzedaży, którego *Domyślne robots* to `NOINDEX`, nie ma `llms.txt`.** Storefront
  odpowiada tam na `/llms.txt` „nie znaleziono”, niezależnie od zawartości ustawienia: sklep, który
  prosi wyszukiwarki, by trzymały się z daleka, nie zaprasza asystentów AI. Tekst jest zachowany i
  serwowany ponownie, gdy kanał zezwoli na indeksowanie. `robots.txt` to nie dotyczy — w takim
  kanale pozostaje otwarty, jak dotąd.
- **Wyłączenie modułu `seo` wycofuje ten plik**, razem z polityką *Domyślne robots* i własnymi
  instrukcjami `robots.txt` (poniżej).

Pod polem znajduje się podgląd, taki sam jak przy *Własnych instrukcjach robots.txt*: jeden blok
będący plikiem, z Twoimi wierszami oznaczonymi w środku, pod nagłówkiem *llms.txt serwowany
obecnie* albo *llms.txt po zapisaniu*. W kanale `NOINDEX` zamiast bloku mówi *llms.txt nie jest
serwowany*, z podaniem przyczyny. Komunikaty dla storefrontu, z którym nie udało się połączyć,
który nie ma skonfigurowanego adresu albo nie potwierdził, że serwuje plik, są tymi, które pokazuje
podgląd `robots.txt`, a żądanie, które backend wysyła w tym celu, jest ograniczone tak samo — jedno
`GET <origin>/llms.txt?part=base`, bez podążania za przekierowaniem, trzy sekundy, 512 KiB,
wyłącznie `text/plain`, nic z żądania administratora w środku. Jak dotąd adresy prywatne i pętli
zwrotnej nie są odrzucane, a ten podgląd mówi posiadaczowi `settings:read` nieco więcej o
skonfigurowanym adresie niż podgląd `robots.txt`: `404` bez nagłówka storefrontu jest zgłaszane
jako „nie potwierdził, że serwuje plik llms.txt”, a nie jako „nie udało się połączyć”, więc adres,
pod którym odpowiada jakiś serwer HTTP, da się odróżnić od takiego, pod którym nie odpowiada nic.
Zobacz [Dodatkowa treść `llms.txt`](./modules/seo.md#dodatkowa-treść-llmstxt).

**Wyłączenie modułu `seo` wycofuje wszystkie trzy.** Storefront nie wysyła domyślnej dyrektywy
robots, więc kanał ustawiony na `NOINDEX` znów jest indeksowany, dopóki moduł nie zostanie
ponownie włączony; `robots.txt` jest serwowany z samymi generowanymi regułami; a `llms.txt` nie
jest serwowany. Zapisane wartości są zachowane i obowiązują ponownie po włączeniu modułu. Opis
modułu i jego ustawienie aktywacji na ekranie `/platform/modules` mówią o tym. Zobacz
[Gdy moduł jest wyłączony](./modules/seo.md#gdy-moduł-jest-wyłączony).

**`robots.txt` nie zależy już od tego, czy *Domyślne robots* da się odczytać.** Wartość *Domyślne
robots* spoza czterech dostępnych — co wymaga wiersza zapisanego z pominięciem API ustawień —
sprawiała, że `GET /api/v1/storefront/seo/crawler-files` odpowiadało `500`, więc świeżo
uruchomiony storefront odpowiadał na `robots.txt` tego kanału kodem `503`, choć ten plik nigdy od
tego ustawienia nie zależał. Endpoint odpowiada teraz i wskazuje, czego nie udało się odczytać.
Taki kanał zachowuje swój `robots.txt`; jego `llms.txt`, który od tego ustawienia zależy, odpowiada
`503`, dopóki wartość nie zostanie naprawiona przez ponowne zapisanie *Domyślne robots*. Korzysta
na tym także niezaktualizowany storefront: jego `robots.txt` również jest serwowany.

**Ślad audytowy zmiany wartości ustawienia zapisuje wartość sprzed zmiany.** Dotąd
`setting.global_value_set` i `setting.value_set` niosły tylko `stateAfter`, a oba resety
(`setting.global_value_reset`, `setting.value_reset`) odnotowywały, że wartość została usunięta,
nie odnotowując której. Każde z tych czterech zdarzeń niesie teraz także `stateBefore`:

```json
{ "settingCode": "your_module.base_url", "value": "https://old.example", "valueType": "string", "stored": true }
```

a w dwóch akcjach dotyczących kanału dodatkowo `salesChannelId`. Przeglądarka dziennika audytu już
renderuje `stateBefore` obok `stateAfter`, więc poprzednia wartość pojawia się tam bez żadnej
dalszej zmiany. `value` to wartość **zapisana** na poziomie, na którym następuje zapis — wartość
dla wszystkich kanałów przy zapisie lub resecie dla wszystkich kanałów, własna wartość danego
kanału przy zapisie lub resecie dla kanału — a nie wartość, do której kanał się rozstrzygnął:
pierwszy zapis odnotowuje `"value": null, "stored": false`, nie wartość domyślną z manifestu ani
odziedziczoną wartość dla wszystkich kanałów. `stored` odróżnia „nic nie było zapisane” od
zapisanego `null`, który ustawienie typu `json` może zgodnie z prawem przechowywać. Poprzednia
wartość ustawienia typu `secret` jest odnotowywana jako `"[redacted]"`, dokładnie tak, jak już
była odnotowywana jego nowa wartość — ani tekst jawny, ani zapisany szyfrogram nie trafia do śladu
audytowego — a `credential_ref` odnotowuje po obu stronach kod konfiguracji, jak dotąd. Sam zapis
się nie zmienia, odrzucony zapis nadal niczego nie odnotowuje, a wpisy zapisane przed tym wydaniem
zachowują pusty stan sprzed zmiany.

**Ekran Ustawień może pokazywać nazwę i opis ustawienia w języku administratora.** Dotąd pokazywał
`name` i `description` zadeklarowane w manifeście ustawień, po angielsku, niezależnie od języka, w
którym pracuje administrator. Teraz najpierw szuka ich we własnym pakiecie tłumaczeń modułu
będącego właścicielem ustawienia, a gdy brakuje klucza, wraca do zadeklarowanego tekstu; filtr na
ekranie dopasowuje przetłumaczoną nazwę i opis tak samo jak zadeklarowane, a opcje ustawienia z
`enumOptions` są wartościami zapisywanymi i pozostają nieprzetłumaczone. **Dla operatora nic się
nie zmienia, dopóki moduł nie dostarczy tych kluczy.** Wydanie dodaje tylko sam mechanizm
wyszukiwania i żadne istniejące wcześniej ustawienie nie jest przez niego tłumaczone; jedynym
modułem, który w tym wydaniu dostarcza klucze, jest `seo` — dla swojej grupy i czterech ustawień
(*SEO włączone*, *Domyślne robots*, *Własne instrukcje robots.txt*, *Dodatkowa treść llms.txt*), po
angielsku i po polsku. Własny moduł dodaje je tak, jak opisuje część
[Dla autorów modułów i modułów nakładkowych](#after-0-106-0-authors).

**Ustawienie może być wielowierszowe.** Ustawienie typu `string`, które jego moduł tak zadeklaruje,
jest edytowane na ekranie Ustawień w polu wielowierszowym, które dokładnie zachowuje końce
wierszy, puste wiersze, wcięcia i końcowy znak nowej linii; pole jest nazwane po ustawieniu na
potrzeby technologii wspomagających, a wiersz pod nim, który podgląda wartość domyślną i bieżącą,
pokazuje jeden skrócony wiersz zamiast całego tekstu. W tym wydaniu takimi ustawieniami są oba
teksty SEO. Każde istniejące wcześniej ustawienie pozostaje jednowierszowe, więc ekran Ustawień
wygląda i zachowuje się dokładnie tak jak dotąd, dopóki zainstalowany moduł nie zadeklaruje tej
flagi.

#### Dla klientów API i integratorów {#after-0-106-0-api}

- **Dwa publiczne endpointy storefrontu rozstrzygane dla kanału.**
  `GET /api/v1/storefront/seo/robots-policy` odpowiada `{ "data": { "index", "follow" } }` z
  `Cache-Control: no-store`; `503 MODULE_DISABLED`, gdy moduł `seo` jest wyłączony; i `500` — nigdy
  odpowiedzią zezwalającą — gdy zapisana wartość nie jest jedną z czterech dostępnych.
  `GET /api/v1/storefront/seo/crawler-files` odpowiada
  `{ "data": { "index", "follow", "robotsTxtCustom", "llmsTxtAdditional", "shop": { "name" } } }` z
  `Cache-Control: no-store`, `503 MODULE_DISABLED`, gdy moduł jest wyłączony, i `500` — nigdy pustym
  tekstem — gdy zapisanych instrukcji `robots.txt` nie da się zaserwować. Jego `data` ma opcjonalny
  element **`unreadable`**: nazwy elementów, których backend nie zdołał odczytać z tego, co
  zapisano — `'policy'` (`index` i `follow` są wtedy oba `false` i znaczą „nieznane”) oraz
  `'llmsTxtAdditional'` (ten element jest wtedy `''` i znaczy „nieznane”). Brakuje go, gdy
  wszystko udało się odczytać, a konsument, który odczytuje z tego endpointu `index`, `follow` lub
  `llmsTxtAdditional`, powinien traktować wymieniony element jako nieznany, a nie jako jego
  wartość. Oba schematy odrzucają elementy, których nie znają, więc późniejsze wydanie może dodać
  nowy bez odrzucenia odpowiedzi przez starszego konsumenta. Kanał sprzedaży to rozstrzygnięty
  kanał żądania, jak na każdej trasie storefrontu.
- **Endpoint podglądu dla administratorów.**
  `GET /api/v1/admin/seo/crawler-files/preview?file=robots|llms&salesChannelCode=<code>`, chroniony
  uprawnieniem `settings:read`. `salesChannelCode` jest opcjonalny i oznacza systemowy kanał
  domyślny; odpowiedź wskazuje kanał, którego dotyczy, i jeden z pięciu stanów: `ok`,
  `storefront-outdated` (storefront odpowiedział bez nagłówka `X-Endora-Crawler-Files`; brak
  `base`), `not-served` (`404` **z** nagłówkiem — brak pliku dla tego kanału, czym jest `llms.txt` w
  kanale `NOINDEX`), `storefront-unreachable` i `address-unknown`.
- **Zapis zbyt długiego tekstu dla robotów odpowiada `400 SEO_CRAWLER_TEXT_TOO_LARGE`** z
  komunikatem podającym limit 65 536 bajtów UTF-8; zapisany wcześniej tekst zostaje zachowany.
- **`SettingDto` zyskuje `multiline: boolean`**, które `GET /api/v1/admin/settings` i
  `GET /api/v1/admin/settings/:code` teraz zawsze wysyłają. Odczytaj je, jeśli renderujesz własny
  edytor ustawienia.
- **Cztery akcje audytu zyskują `stateBefore`** — `setting.global_value_set`, `setting.value_set`,
  `setting.global_value_reset` i `setting.value_reset` — w kształcie podanym w części
  [Dla operatorów](#after-0-106-0-operators). `stateAfter` zachowuje swój kształt.
- **Szczegóły automatyzacji newslettera** — `GET /api/v1/admin/newsletter/automations/:id` oraz
  odpowiedź każdego zapisu, który zwraca szczegóły — niosą `salesChannelId: null` dla
  automatyzacji bez przypisanego kanału sprzedaży, także po ponownym wczytaniu rekordu z bazy
  danych; wcześniej tego elementu w nich brakowało. Lista, która nigdy tego elementu nie niosła,
  się nie zmienia.
- **Nowe w `@endora-commerce/contracts`**, wszystko eksportowane z korzenia pakietu i z podścieżki
  `seo`: `storefrontRobotsPolicySchema`, `storefrontRobotsPolicyResponseSchema` oraz typy
  `StorefrontRobotsPolicy` i `StorefrontRobotsPolicyResponse`; `storefrontCrawlerFilesSchema`,
  `storefrontCrawlerFilesResponseSchema`, typy `StorefrontCrawlerFiles` i
  `StorefrontCrawlerFilesResponse`, `CRAWLER_FILES_UNREADABLE_POLICY` i
  `CRAWLER_FILES_UNREADABLE_LLMS_TXT`; `composeCrawlerFile(base, extra)` — opisane wyżej złączenie
  części generowanej z tekstem operatora, którym storefront serwuje plik, a podgląd go renderuje;
  `CRAWLER_TEXT_MAX_BYTES` i `ERROR_CODES.SEO_CRAWLER_TEXT_TOO_LARGE`;
  `adminCrawlerFilePreviewQuerySchema`, `adminCrawlerFilePreviewResponseSchema`,
  `adminCrawlerFilePreviewSchema`, `adminCrawlerFilePreviewStateSchema`, `adminCrawlerFileSchema`
  i ich wywnioskowane typy; oraz `CRAWLER_FILES_CAPABILITY_HEADER` (`X-Endora-Crawler-Files`) —
  nagłówek odpowiedzi, którym storefront informuje, że serwuje pliki dla robotów w bieżący sposób.
- **`SettingWriteValidationInput` zyskuje `proposedValue`** — wartość, którą proponuje zapis
  ustawienia, obok rzutowania na kanały, które już niósł. Zapis dla wszystkich kanałów nie dociera
  do żadnego kanału mającego własną wartość, więc w instancji, w której każdy kanał ją ma,
  proponowana wartość nie była w rzutowaniu żadnego kanału i walidator, którego reguła dotyczy
  samej wartości, nie mógł jej zobaczyć. Kod, który *konstruuje* to wejście, musi teraz podać ten
  element; zobacz [Dla autorów modułów i modułów nakładkowych](#after-0-106-0-authors).

#### Dla autorów modułów i modułów nakładkowych {#after-0-106-0-authors}

**Ustawienie typu `string` można zadeklarować jako wielowierszowe.** Dodaj `multiline: true` do
jego wpisu w manifeście ustawień modułu:

```ts
defineModuleSettingsManifest({
  moduleCode: 'your_module',
  settings: [
    {
      code: 'your_module.footer_note',
      name: 'Footer note',
      valueType: 'string',
      defaultValue: '',
      multiline: true,
    },
  ],
});
```

Nic więcej się nie zmienia: wartość nadal jest typu `string`, jest odczytywana przez
`SettingsService.get` jak dotąd i rozstrzyga się dla kanału sprzedaży jak każde inne ustawienie.
To, co wpisano, jest tym, co zapisano. `SettingManifestEntrySchema` przyjmuje `multiline` tylko
przy `valueType: 'string'` i nie razem z `enumOptions`; każda inna kombinacja zawodzi przy
parsowaniu manifestu, z błędem wskazanym na `multiline`. Flaga dotyczy prezentacji, `ManifestReconciler`
utrzymuje ją w zgodzie z manifestem przy każdym starcie w obu kierunkach, więc jej późniejsze
dodanie lub usunięcie nie jest zmianą łamiącą zgodność i nigdy nie dotyka zapisanej wartości.

**Moduł może dołożyć coś pod ustawieniem, które zadeklarował: strefa `settings.setting.after`.**
`AdminZoneNameSchema` ma nowy element, montowany przez ekran Ustawień raz na wiersz ustawienia,
pod polem. Dołóż do niej, aby pokazać, co z ustawienia wynika — podgląd, konsekwencję, ostrzeżenie:

```ts
import { zoneComponent, type AdminContributions } from '@endora-commerce/admin-kit/contributions';

export const contributions: AdminContributions = {
  zones: [
    zoneComponent('settings.setting.after', () => import('./zones/FooterNotePreview.js'), {
      match: { settingCode: 'your_module.footer_note' },
      requiredPermission: 'settings:read',
    }),
  ],
};
```

Komponent otrzymuje `SettingsSettingAfterZoneProps`: `settingCode`, `ownerModule`, `channelCode`
(edytowany kanał sprzedaży albo `null` dla wartości dla wszystkich kanałów), `draftText` (tekst w
polu **w tej chwili**, zapisany lub nie, dla ustawienia typu `string`; `null` dla każdego innego
typu wartości) oraz `dirty`. Zawęź przez `match` po `settingCode` albo `ownerModule` — fragment
niedopasowanego wkładu nigdy nie jest pobierany. Właściwości płyną w jedną stronę: wkład nie może
zmienić wartości ani wstrzymać zapisu wiersza i powinien powiedzieć słowami, gdy to, co pokazuje,
nie jest jeszcze zapisane. Strefa nie jest montowana dla ustawienia typu `secret`, więc wkład nigdy
nie otrzymuje roboczej wartości sekretu. Wkład znika razem ze swoim modułem, a zawodzący wkład nie
pociąga za sobą wiersza. Oba podglądy SEO są wkładami do tej strefy.

**Jeśli sam renderujesz `SettingRowEditor`.** Edytor wiersza w `@endora-commerce/mod-settings`
montuje teraz strefę, więc musi być renderowany pod `AdminContributionsProvider` i dostawcami
sesji, jak każdy ekran hosta montujący strefę. Panel administracyjny już to robi; test, który
renderuje wiersz albo `SettingsPage` samodzielnie, potrzebuje wokół nich tych dostawców.

**Moduł może tłumaczyć nazwy i opisy własnych ustawień.** Ekran Ustawień szuka ich w pakiecie
tłumaczeń modułu będącego właścicielem pod trzema rodzinami kluczy i wraca do zadeklarowanego
tekstu, gdy klucza brakuje:

| Klucz | Zastępuje |
| --- | --- |
| `settingLabels.<kod ustawienia>.name` | `name` ustawienia |
| `settingLabels.<kod ustawienia>.description` | `description` ustawienia |
| `settingGroups.<kod grupy>.name` | `name` grupy |

Kod jest zapisywany w całości, z kropkami, a klucze są płaskie jak każdy inny klucz w pakiecie
tłumaczeń. Dla modułu `your_module`, który deklaruje ustawienie `your_module.base_url` w grupie
`your_section`, dodaj do `i18n/pl.json` (a angielskie brzmienie do `i18n/en.json`):

```json
{
  "settingGroups.your_section.name": "Twoja sekcja",
  "settingLabels.your_module.base_url.name": "Bazowy adres URL",
  "settingLabels.your_module.base_url.description": "Adres, pod którym usługa jest dostępna."
}
```

Rozstrzyganie odbywa się dla każdego klucza z osobna — język administratora, potem angielski,
potem tekst z manifestu — więc ustawienia można tłumaczyć pojedynczo. Odczytywany jest wyłącznie
pakiet tłumaczeń modułu, którego manifest ustawień zadeklarował dany wiersz (jego `moduleCode`,
który musi być równy `id` modułu); klucz dla ustawienia innego modułu jest ignorowany. Tekst jest
pokazywany tak, jak go napisano, bez podstawiania parametrów. `name` i `description` w manifeście
pozostają wymagane: to je zwraca API i to one są ostatnim wariantem zapasowym.

**Kod, który konstruuje `SettingWriteValidationInput`, musi podać `proposedValue`** — zwykle
test wywołujący walidator bezpośrednio. Moduł, który dostarcza `SettingWriteValidator`, nie
wymaga zmian, a taki, którego reguła dotyczy samej wartości, może ją teraz tam odczytać.

**`check:channel-resolution` nie zgłasza już nagłówka, który jest wysyłany.** Pierwszy sygnał tej
reguły oznacza każdy literał tekstowy `x-sales-channel`, bo moduł nie może odczytywać tego nagłówka
z żądania — robi to resolver. Zgłaszany był również moduł, który sam wysyła żądanie do innego
serwera i wskazuje w nim kanał sprzedaży. Klucz literału obiektu pod właściwością `headers:` —
`fetch(url, { headers: { 'X-Sales-Channel': channel.code } })` — jest teraz wyłączony z reguły, tak
jak już wcześniej tablica `allowedHeaders` polityki CORS. Co nadal jest zgłaszane: dostęp
indeksowy do obiektu nagłówków, argument `.get(...)`, nazwa trzymana w stałej, klucz obliczany,
deklaracja destrukturyzująca oraz *przypisanie* destrukturyzujące
(`({ headers: { 'x-sales-channel': code } } = request)`, także jako zmienna pętli `for…of` lub
`for…in`), które ma wyłączony kształt, a jest odrzucane ze względu na swoje położenie.

**`@endora-commerce/mod-seo` deklaruje `lucide-react` jako opcjonalną zależność peer**, tak jak
pozostałe pakiety modułów z powierzchnią w panelu administracyjnym; aplikacja, która ma panel
administracyjny, już ją ma.

#### W istniejącym storefroncie {#after-0-106-0-storefront}

**Istniejący storefront nie zmienia się przez aktualizację i dopóki nie zostanie zaktualizowany,
ignoruje wszystkie trzy ustawienia.** `endora new storefront` kopiuje wzorzec raz, a potem projekt
należy do Ciebie. Przy zaktualizowanym backendzie i starszym storefroncie ekran Ustawień pokazuje
trzy ustawienia i nic na nie nie reaguje: kanał ustawiony na `NOINDEX` nadal jest indeksowany,
`robots.txt` pozostaje plikiem, z którym storefront został zbudowany, i nic nie serwuje
`llms.txt`. Aby przejąć te funkcje, przenieś poniższe zmiany ze wzorcowego storefrontu do projektu
storefrontu, zachowując własne edycje. Storefront do kopiowania utwórz tak, jak opisuje
[Bloki modułów w istniejącym storefroncie](#storefront-block-renderers). Trzy grupy budują jedna na
drugiej i **trzeba je wprowadzać w tej kolejności**; każdą można przejąć bez następnych.

**1. *Domyślne robots* — cztery pliki, bez podnoszenia zależności.** Nie importują niczego z
pakietu, którego wcześniejszy storefront by nie miał, więc nic nie trzeba podnosić, aby się
zbudowały i działały:

- `lib/seo/crawler-policy.ts` — nowy: odczytuje politykę, buforuje ją na minutę dla kanału i
  zachowuje ostatnio odczytaną wartość, gdy backend jest nieosiągalny;
- `lib/seo/robots-directive.ts` — nowy: co polityka umieszcza w odpowiedzi;
- `middleware.ts` — zmieniony: odczyt polityki, nagłówek odpowiedzi, nagłówek żądania dla layoutu
  i rozszerzony `config.matcher`. Middleware działa teraz dla każdej ścieżki poza `/_next/static`
  (dotąd pomijał pliki publiczne, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` i
  `/_next/image`); dla tych ścieżek tylko dodaje nagłówek. Zmierzone na wzorcowym storefroncie,
  kosztuje to plik publiczny około jednej milisekundy. Storefront, który już zna politykę kanału,
  nigdy nie czeka na odświeżenie dłużej niż ułamek sekundy; czeka się tylko na pierwszy odczyt po
  starcie, najwyżej dwie sekundy, raz;
- `app/layout.tsx` — zmieniony: renderuje dodatkowy `<meta name="robots">` w obu dokumentach,
  które zwraca. Nie przenoś dyrektywy do eksportu `metadata` layoutu: własne `robots` strony
  zastępuje tam `robots` layoutu, więc zostałaby pominięta na każdej stronie, która je deklaruje.

Potem zbuduj storefront ponownie. `curl -sI https://<twój sklep>/ | grep -i x-robots-tag` pokazuje
nagłówek po zapisaniu wartości ograniczającej. Testy wzorcowego storefrontu dla tych plików
(`test/seo/crawler-policy.test.ts`, `robots-directive.test.ts`, `middleware-robots.test.ts`,
`middleware-effect.test.ts`, `layout-robots.test.ts`, `layout-outage-render.test.tsx` i
`test/conformance/robots-directive.spec.ts`) można skopiować opcjonalnie; jeden z nich,
`crawler-policy.test.ts`, porównuje własne sprawdzenie odpowiedzi w storefroncie z opublikowanym
schematem i dlatego wymaga w projekcie storefrontu `@endora-commerce/contracts` w tym wydaniu lub
nowszym; nic innego w tej grupie tego nie wymaga.

**2. Własne instrukcje `robots.txt` — `robots.txt` staje się trasą, a projekt potrzebuje
`@endora-commerce/contracts` w wersji `0.106.0` lub nowszej.** `lib/seo/robots-txt.ts` importuje
`composeCrawlerFile` z `@endora-commerce/contracts/seo`, czego cztery powyższe pliki nie
potrzebowały. `middleware.ts` i `app/layout.tsx` nie zmieniają się w tej grupie:

- **usuń** `app/robots.ts`. Musi zniknąć i nic Ci nie powie, jeśli nie zniknął: gdy istnieje
  razem z `app/robots.txt/route.ts`, Next buduje się bez ostrzeżenia, dalej serwuje stary plik z
  czasu budowania i nigdy nie dociera do nowej trasy. Lista tras w wyniku budowania pokazuje, który
  wygrał — `○ /robots.txt` to stary plik, `ƒ /robots.txt` to nowa trasa;
- **dodaj** `app/robots.txt/route.ts` — trasę;
- **dodaj** `lib/seo/robots-txt.ts` — to, czym trasa odpowiada, i kiedy odpowiada `503`;
- **dodaj** `lib/seo/robots-system-rules.ts` — generowane reguły, przeniesione bez zmian z
  `app/robots.ts`. **Jeśli edytowano listę `disallow` w Twoim `app/robots.ts`, przenieś te zmiany
  do `ROBOTS_SYSTEM_RULES` w tym pliku**;
- **zastąp** `lib/seo/crawler-policy.ts` nową wersją. Odczytuje teraz pliki dla robotów obok
  domyślnej polityki robots i porzuca odczyt z backendu, który zamrożony proces zostawił w
  zawieszeniu, zamiast czekać na niego w nieskończoność;
- **edytuj** `app/reserved-segments.ts`: dodaj `'robots.txt'` do `RESERVED_TOP_LEVEL_SEGMENTS` i
  dodaj ten sam wpis do ustawienia `cms.reserved_slug_segments` wdrożenia, jeśli je utrzymujesz;
- w `test/seo/route-declarations.test.ts`, jeśli go skopiowano, zastąp import z
  `'../../app/robots'` importem `ROBOTS_SYSTEM_RULES` i `robotsSitemapUrl` z
  `'../../lib/seo/robots-system-rules'`, tak jak robi to wersja wzorcowa.

Potem zbuduj storefront ponownie;
`curl -sI https://<twój sklep>/robots.txt | grep -i x-endora-crawler-files` pokazuje nagłówek, gdy
serwuje już nowa trasa. Czym trasa odpowiada:

- `200` z generowanymi regułami i tekstem kanału; `Content-Type: text/plain; charset=utf-8`,
  `Cache-Control: public, max-age=60`, `Vary: X-Sales-Channel`, `X-Endora-Crawler-Files: 1`. Dotąd
  plik był prerenderowany i wysyłany z `Cache-Control: public, max-age=0, must-revalidate` i
  `Content-Type: text/plain`;
- samymi generowanymi regułami, gdy moduł `seo` jest wyłączony, oraz wobec backendu, który nie ma
  tej funkcji;
- **`503` z `Retry-After: 120`**, gdy tekstu kanału nie da się odczytać, a proces storefrontu nigdy
  go nie odczytał — zamiast plikiem, który po cichu pomija reguły operatora. Proces, który raz
  odczytał tekst, serwuje tę wersję tak długo, jak backend jest nieosiągalny. Storefront
  uruchomiony, gdy jego backend nie działa, odpowiada więc na `robots.txt` kodem `503`, dopóki
  backend nie wróci; stron to nie dotyczy;
- `GET /robots.txt?part=system` odpowiada samymi generowanymi regułami, bez pytania backendu przez
  trasę, i jest wysyłane z `Cache-Control: no-store`.

Origin w wierszu `Sitemap:` to nadal `NEXT_PUBLIC_SITE_URL` wkompilowany przy budowaniu. Testy
wzorcowego storefrontu dla tych plików (`test/seo/robots-system-rules.test.ts` z jego fixture
`test/seo/__fixtures__/robots-before.txt`, `test/seo/robots-txt-route.test.ts` oraz uzupełnienia
w `test/seo/crawler-policy.test.ts`) można skopiować opcjonalnie. Fixture to własne generowane
reguły wzorca z originem `http://localhost:3000`; projekt, który zmienił swoją listę, dostosowuje
fixture do niej.

**3. `llms.txt` — zakłada, że grupy 1 i 2 są na miejscu**: `lib/seo/crawler-policy.ts`,
`lib/seo/robots-txt.ts`, `lib/seo/robots-system-rules.ts`, `lib/seo/robots-directive.ts` i
`app/robots.txt/route.ts` istnieją, a `app/robots.ts` jest usunięty. `middleware.ts` i
`app/layout.tsx` nie zmieniają się także w tej grupie:

- **dodaj** `app/llms.txt/route.ts` — trasę;
- **dodaj** `lib/seo/llms-txt.ts` — to, czym trasa odpowiada, i kiedy odpowiada `404` i `503`;
- **dodaj** `lib/seo/llms-txt-base.ts` — część generowaną. Wymienia `SITEMAP_STATIC_ROUTES` z
  Twojego `app/sitemap.ts`; **jeśli zmieniono tę listę, nadaj każdej ze swoich tras tytuł w
  `LLMS_TXT_PAGE_TITLES`** i wskaż w `LLMS_TXT_CONDITIONAL_PAGES` te z nich, które mogą odpowiedzieć
  „nie znaleziono”;
- **dodaj** `lib/seo/llms-txt-pages.ts` — czy strona warunkowa jest w tej chwili serwowana (dziś:
  blog), zapamiętywane dla kanału w pamięci podręcznej eksportowanej przez
  `lib/seo/crawler-policy.ts`;
- **dodaj** `lib/seo/crawler-file-response.ts` — nagłówki i tymczasową awarię wspólne dla obu
  plików;
- **zastąp** `lib/seo/robots-txt.ts` i `lib/seo/crawler-policy.ts` nowymi wersjami. Pierwszy bierze
  teraz nagłówki z `crawler-file-response.ts`; drugi odczytuje `unreadable` i eksportuje pamięć
  podręczną kanału, z której korzysta pytanie o stronę;
- **edytuj** `lib/seo/robots-directive.ts`: `isDocumentPath` musi odpowiadać `false` dla
  `/llms.txt`, tak jak wersja wzorcowa. **Nie pomijaj tego kroku**: bez niego storefront nadal
  serwuje plik, ale gdy backend jest nieosiągalny, odpowiada na `/llms.txt` stroną awarii zamiast
  ostatnią znaną wersją;
- **edytuj** `app/reserved-segments.ts`: dodaj `'llms.txt'` do `RESERVED_TOP_LEVEL_SEGMENTS` i
  dodaj ten sam wpis do ustawienia `cms.reserved_slug_segments` wdrożenia, jeśli je utrzymujesz;
- **upewnij się, że nie ma pliku `public/llms.txt`.** Plik w tym miejscu jest serwowany zamiast
  trasy — dla każdego kanału, bez tekstu operatora i w kanale ustawionym na `NOINDEX` — a ani
  budowanie, ani serwer tego nie zgłaszają.
  `curl -sI https://<twój sklep>/llms.txt | grep -i x-endora-crawler-files` pokazuje nagłówek, gdy
  odpowiada trasa.

Potem zbuduj storefront ponownie — lista tras w wyniku budowania pokazuje `ƒ /llms.txt`. Testy
wzorcowego storefrontu dla tych plików (`test/seo/llms-txt-base.test.ts`,
`test/seo/llms-txt-route.test.ts` oraz uzupełnienia w `test/seo/crawler-policy.test.ts`,
`test/seo/robots-txt-route.test.ts`, `test/seo/middleware-robots.test.ts` i
`test/seo/middleware-effect.test.ts`) można skopiować opcjonalnie.

**Podpis w stopce.** Storefront utworzony przez CLI `0.106.0` pokazuje podpis „Built with ❤️ using
Endora Commerce” jako ostatni wiersz stopki — osobny wiersz pod wszystkim, co stopka renderuje
(kolumnami, wierszem praw autorskich i tym, co moduł dodaje przez hooki `footer.bottom` i
`footer.copyright`), wyśrodkowany, w jednym wierszu, dopóki szerokość na to pozwala, ze znakiem
Endora Commerce obok nazwy produktu — podczas gdy dotąd siedział wewnątrz wiersza praw autorskich,
między danymi firmy a odnośnikami prawnymi. Odnośnik i jego parametry UTM się nie zmieniają.
Istniejący storefront się nie zmienia; aby przejąć ten układ, wprowadź tę samą zmianę w
`components/Footer.tsx` w projekcie storefrontu.

**Własny storefront**, który nie pochodzi od wzorca, serwuje pliki na tych samych zasadach:
`GET /robots.txt?part=system` odpowiada samymi jego generowanymi regułami, a
`GET /llms.txt?part=base` generowaną częścią `llms.txt`, oba jako `text/plain` z
`X-Endora-Crawler-Files: 1`, a kanał bez `llms.txt` odpowiada `404` z tym samym nagłówkiem; bez
nagłówka podgląd traktuje storefront jako nieaktualny. Odpowiada `503` zamiast plikiem, dopóki
`unreadable` w `GET /api/v1/storefront/seo/crawler-files` wskazuje `policy` lub
`llmsTxtAdditional`. Zobacz [Dla własnego sklepu](./modules/seo.md#dla-własnego-sklepu).

Jak dalece to sprawdzono: to, co mówi ta sekcja, pochodzi z dzienników zmian wydania, sprawdzonych
ze źródłami tego wydania — trasami i manifestem ustawień modułu `seo`, migracją platformy,
kontraktami, plikami wzorcowego storefrontu i przykładową konfiguracją nginx. W chwili pisania tej
sekcji żadna instancja nie została zaktualizowana z `0.105.0` poleceniem
`pnpm run upgrade 0.106.0` i w żadnym storefroncie utworzonym we wcześniejszym wydaniu nie
wprowadzono trzech powyższych grup plików; kolejność kroków, wiersz dla proxy i zmiany w
storefroncie nie były wypróbowane.

## Instancja niespójna od początku

Instalator `0.101.x` lub starszy zapisywał każdy pakiet wydania z `^` poza
`@endora-commerce/contracts`. Uruchomiony po opublikowaniu nowszego wydania poprawkowego,
instalował to wydanie poprawkowe każdego pakietu poza `@endora-commerce/contracts`, który
zostawał przy starszym; instalacja wypisuje *unmet peer @endora-commerce/contracts* raz na moduł.
`pnpm run upgrade` — albo, przed tym poleceniem, dwa polecenia powyżej — ustawia wszystkie
pakiety na jedną wersję. Późniejsze instalatory zapisują każdy pakiet wydania dokładnie w wersji,
którą instalujesz, więc nowa instancja nigdy nie jest niespójna.

## Bez CLI

To, co robi polecenie, można zrobić ręcznie: w każdym `package.json` instancji i storefrontu
ustaw każdy pakiet `@endora-commerce/*` należący do wydania na nową wersję, zachowując `^`
i dokładne przypięcia; usuń `pnpm-lock.yaml` i uruchom `pnpm install` (co przesuwa też Twoje
pozostałe zależności w ramach ich zakresów); potem uruchom `pnpm run setup`, a w repozytorium
storefrontu `pnpm install`.
