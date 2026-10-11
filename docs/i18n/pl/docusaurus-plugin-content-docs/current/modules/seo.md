---
title: seo
description: Wyznaczanie meta tagów, mapa witryny XML z pamięcią podręczną i ustawienia robots dla wyszukiwarek
---

# `seo`

Wyznaczanie meta tagów dla każdej strony, publiczna mapa witryny XML oraz to, co wyszukiwarki
dowiadują się o całym sklepie danego kanału sprzedaży.

## API publiczne

| Metoda i ścieżka | Kto | Przeznaczenie |
| --- | --- | --- |
| `GET /api/v1/catalog/sitemap.xml` | roboty wyszukiwarek | Mapa witryny XML z pamięci podręcznej; gdy jest nieaktualna, jest generowana od razu w trakcie żądania |
| `GET /api/v1/storefront/seo/robots-policy` | sklep | Domyślna polityka robots kanału sprzedaży, którego dotyczy żądanie, w postaci `{ index, follow }` |
| `GET /api/v1/storefront/seo/crawler-files` | sklep | To, z czego powstaje plik `robots.txt` kanału sprzedaży, którego dotyczy żądanie: jego własne instrukcje wraz z polityką i nazwą sklepu |
| `GET /api/v1/admin/seo/sitemap` | administrator (`catalog:write`) | Jeden wiersz na kanał sprzedaży: adres sklepu, czas ostatniego wygenerowania, rozmiar, liczba adresów URL |
| `POST /api/v1/admin/seo/sitemap/:channelCode/regenerate` | administrator (`catalog:write`) | Wymuszenie ponownego wygenerowania dla tego kanału |
| `GET /api/v1/admin/seo/sitemap/:channelCode/status` | administrator (`catalog:write`) | Czas ostatniego wygenerowania, rozmiar i liczba adresów URL dla tego kanału |
| `GET /api/v1/admin/seo/sitemap/:channelCode/xml` | administrator (`catalog:write`) | Zapisany XML tego kanału, do podglądu lub pobrania (`?download=1`) |
| `GET /api/v1/admin/seo/meta/:entityType/:entityId` | administrator (`catalog:write`) | Wyznaczone meta tagi i wiersz nadpisania dla (encja, język) |
| `PUT /api/v1/admin/seo/meta/:entityType/:entityId` | administrator (`catalog:write`) | Utworzenie lub aktualizacja nadpisania (dla danego języka) |
| `DELETE /api/v1/admin/seo/meta/:entityType/:entityId` | administrator (`catalog:write`) | Usunięcie nadpisania (wracają wartości wyznaczane z reguły) |

## Roboty wyszukiwarek

**Ustawienia → SEO → Domyślne robots** decyduje o tym, co wyszukiwarki dowiadują się o każdej
stronie sklepu danego kanału sprzedaży. To przełącznik, którym można wyłączyć cały sklep
z wyników wyszukiwania — kopię testową, wersję demonstracyjną, sklep przed otwarciem — bez
zmieniania jakiejkolwiek strony.

| Wybór | O co prosi wyszukiwarki |
| --- | --- |
| `INDEX, FOLLOW` (domyślnie) | o nic: każda strona mówi to, co mówiła wcześniej |
| `NOINDEX, FOLLOW` | aby nie pokazywały stron sklepu w wynikach, ale podążały za ich linkami |
| `INDEX, NOFOLLOW` | aby pokazywały strony, ale nie podążały za ich linkami |
| `NOINDEX, NOFOLLOW` | aby nie pokazywały stron i nie podążały za ich linkami |

Cztery opcje to same dyrektywy i w każdym języku wyglądają tak samo. Jak każde ustawienie, to
również ma wartość dla wszystkich kanałów sprzedaży oraz wartości dla poszczególnych kanałów;
własna wartość kanału ma pierwszeństwo, a jej zresetowanie przywraca dziedziczenie. Zmiana
wymaga uprawnienia `settings:write` i jest zapisywana w dzienniku audytu: kto ją wprowadził,
kiedy i jaką wartość zapisał. Paleta poleceń (⌘K / CTRL+K) otwiera ekran Ustawień pod hasłem
*Roboty wyszukiwarek*.

### Co robi z tym sklep

Dla kanału, którego ustawienie coś ogranicza, sklep dodaje dyrektywę do odpowiedzi wysyłanych
dla tego kanału, w dwóch postaciach:

- nagłówek odpowiedzi `X-Robots-Tag` — na każdej stronie, także na stronach „nie znaleziono"
  (`404`) i na stronie offline, w `/sitemap.xml`, na zoptymalizowanych obrazach (`/_next/image`)
  i na plikach z katalogu `public/`;
- jeden dodatkowy element `<meta name="robots">` w sekcji `<head>` stron, które sklep renderuje
  dla żądania.

Trzy rodzaje odpowiedzi są poza tym zakresem i żadnego z nich wyszukiwarka nie indeksuje:

- pliki skryptów i stylów samego builda w `/_next/static` nie mają ani nagłówka, ani elementu;
- przekierowanie zadeklarowane w pliku `next.config.js` sklepu (na przykład dawne adresy
  `/cms/…`) nie ma ani jednego, ani drugiego — odpowiedź powstaje, zanim uruchomi się
  middleware sklepu;
- strony „nie znaleziono" (`404`) i statycznie zbudowana strona `/offline` mają nagłówek, ale
  nie mają dodatkowego elementu. Obie same deklarują `noindex, nofollow`.

**Ustawienie wyłącznie dodaje ograniczenia.** Strona, która sama deklaruje `noindex` — koszyk,
kasa, strony konta — zachowuje własny tag niezależnie od wyboru, a wtedy ma dwa tagi robots.
Wyszukiwarka, która odczytuje kilka dyrektyw robots dla jednego adresu, stosuje najbardziej
restrykcyjną z nich, więc ustawienie nigdy nie sprawi, że prywatna strona stanie się
indeksowalna. Przy `INDEX, FOLLOW` nic nie jest dodawane, a odpowiedzi sklepu są takie same jak
przed wprowadzeniem tego ustawienia.

### Dlaczego `robots.txt` pozostaje otwarty

*Domyślne robots* nie zmienia pliku `robots.txt`, a kanał z `NOINDEX` nie może go zamykać wpisem
`Disallow: /`. Robot musi pobrać stronę, żeby odczytać, że nie wolno jej indeksować; strona,
której nie wolno mu pobrać, nadal może trafić do wyników — po samym adresie — jeśli linkują do
niej inne witryny.

To samo dotyczy tego, co operator wpisuje do pliku — zobacz niżej
[*Nie używaj ich, aby zniknąć z wyników wyszukiwania*](#nie-używaj-ich-aby-zniknąć-z-wyników-wyszukiwania).

### Ile trwa wprowadzenie zmiany

Sklep pyta backend o politykę kanału najwyżej raz na minutę, więc zapisana zmiana obowiązuje
w sklepie w ciągu minuty lub dwóch. Wyszukiwarki uwzględniają ją przy kolejnej wizycie na każdej
stronie, co trwa dni lub tygodnie; strona, która jest już w indeksie, znika z niego dopiero po
ponownym odwiedzeniu przez robota.

Odczyt polityki nie spowalnia sklepu, gdy backend odpowiada wolno. Sklep, który zna już politykę
kanału, daje odświeżeniu ułamek sekundy, a potem dalej serwuje to, co zna, i pozwala odświeżeniu
dokończyć się w tle.

### Gdy moduł jest wyłączony

Wyłączenie modułu `seo` na ekranie modułów platformy wycofuje ustawienie: sklep w ciągu minuty
lub dwóch przestaje wysyłać nagłówek i dodatkowy tag, więc **kanał ustawiony na `NOINDEX` znów
staje się indeksowalny**. Ustawienie przechodzi w tryb tylko do odczytu i zachowuje zapisaną
wartość, pozycje w palecie poleceń znikają, a `GET /api/v1/storefront/seo/robots-policy`
odpowiada `503` `MODULE_DISABLED`. Ponowne włączenie modułu przywraca działanie zapisanej
wartości.

Własne instrukcje `robots.txt` są wycofywane razem z nim, na tych samych zasadach: plik
`robots.txt` wraca do reguł generowanych przez sklep i pozostaje dostępny, ustawienie
przechodzi w tryb tylko do odczytu i zachowuje tekst, a po ponownym włączeniu modułu tekst jest
znów serwowany.

### Dwa ograniczenia

- **Pliki serwowane przez backend nie są objęte.** Zdjęcia produktów i inne przesłane media
  serwuje backend, pod własnym adresem, bez nagłówka `X-Robots-Tag`. Strony kanału z `NOINDEX`
  znikają z wyszukiwarek; pliki jego obrazów nadal może znaleźć wyszukiwarka grafiki, która
  trafi do nich bezpośrednio.
- **Świeżo uruchomiony sklep jeszcze nic nie wie.** Sklep przechowuje ostatnio odczytaną
  politykę w pamięci własnego procesu i stosuje ją dalej, gdy backend jest niedostępny. Sklep
  uruchomiony w czasie, gdy backend jest niedostępny, nie ma czego zastosować i do pierwszego
  udanego odczytu serwuje strony tego kanału bez domyślnej dyrektywy. To także jedyny moment,
  w którym odpowiedź czeka na politykę: na pierwszy odczyt kanału po uruchomieniu sklep czeka
  do dwóch sekund, jeden raz. Żadna strona nigdy nie kończy się błędem dlatego, że nie udało się
  odczytać polityki.

### Sklep utworzony przed tą funkcją

Dyrektywę nakładają pliki samego sklepu: `middleware.ts` i `app/layout.tsx`, a własne
instrukcje — jego plik `app/robots.txt/route.ts`. Sklep utworzony z wcześniejszego wydania
działa dalej ze zaktualizowanym backendem, ale **ignoruje te ustawienia**, dopóki te pliki nie
zostaną zaktualizowane: ekran Ustawień pokazuje wybór i tekst, a nic w takim sklepie ich nie
stosuje — jego `robots.txt` pozostaje plikiem, z którym sklep został zbudowany. Lista plików do
skopiowania oraz plik do usunięcia są podane w informacjach o wydaniu: sklep, który zachowa stary
plik `app/robots.ts` obok nowej trasy, nadal serwuje stary plik, a build tego nie zgłasza.

### Dla własnego sklepu

`GET /api/v1/storefront/seo/robots-policy` jest publiczny i ustala kanał sprzedaży na podstawie
nagłówka `X-Sales-Channel` żądania, a gdy go brak — przyjmuje domyślny kanał systemowy:

```json
{ "data": { "index": false, "follow": false } }
```

Odpowiedź jest wysyłana z `Cache-Control: no-store`; zakłada się, że buforuje ją odbiorca.
Schemat to `storefrontRobotsPolicyResponseSchema` w `@endora-commerce/contracts`; odbiorca
powinien ignorować pola, których nie zna, aby kolejne wydanie mogło dodać nowe.

Statusy należy traktować różnie. `503` z `error.code: "MODULE_DISABLED"` oraz `404` oznaczają,
że polityki nie ma — nie należy stosować żadnej. Każdy inny błąd, także `500`, oznacza, że
polityki nie udało się odczytać: należy zachować ostatnio odczytaną. Punkt końcowy odpowiada
`500`, a nie „brak ograniczeń", gdy zapisana wartość nie jest jedną z czterech opcji — do czego
trzeba wiersza zapisanego z pominięciem API ustawień.

## Własne instrukcje `robots.txt`

**Ustawienia → SEO → Własne instrukcje robots.txt** to tekst, który sklep dopisuje do pliku
`robots.txt` kanału sprzedaży — reguły dla konkretnego robota, dodatkowy wpis `Disallow`,
`Crawl-delay`. Domyślnie jest pusty, a pusty tekst pozostawia plik dokładnie takim, jaki był.

### Co zawiera plik i w jakiej kolejności

1. **Reguły generowane przez sklep.** Zamykają rodziny adresów, które nigdy nie są indeksowane —
   koszyk, kasę, konto, strony logowania, `/api/` — i wskazują mapę witryny. Odzwierciedlają
   trasy samego sklepu; nie są ustawieniem i na ekranie Ustawień nie da się ich edytować ani
   usunąć.
2. **Pusty wiersz.**
3. **Twój tekst**, w takiej postaci, w jakiej został wpisany.

Na przykład po zapisaniu dla kanału wierszy `User-agent: GPTBot` i `Disallow: /`:

```text
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /account
…
Disallow: /offline

Sitemap: https://shop.example.com/sitemap.xml

User-agent: GPTBot
Disallow: /
```

Tekst jest serwowany **tak, jak został wpisany**: każdy znak zostaje zachowany, w tej samej
kolejności — wcięcia, puste wiersze, komentarze. Ujednolicane są dwie rzeczy dotyczące końców
wierszy: każdy koniec wiersza jest serwowany jako znak nowego wiersza (LF), niezależnie od tego,
jak tekst został zapisany, a plik zawsze kończy się dokładnie jednym. Nic w tekście nie jest
sprawdzane ani poprawiane; wiersz, którego robot nie rozumie, jest serwowany jak każdy inny.

Jak każde ustawienie, to również ma wartość dla wszystkich kanałów sprzedaży oraz wartości dla
poszczególnych kanałów, a własna wartość kanału ma pierwszeństwo — także pusta, która sprawia,
że kanał nie ma własnych instrukcji niezależnie od tekstu dla wszystkich kanałów. Tekst jednego
kanału nigdy nie trafia do pliku innego kanału. **Reset** usuwa własny tekst kanału, więc kanał
znów dziedziczy tekst dla wszystkich kanałów; zresetowanie także jego pozostawia same reguły
generowane. Zmiana tekstu wymaga uprawnienia `settings:write` i jest zapisywana w dzienniku
audytu.

### Limit rozmiaru

Tekst może mieć najwyżej **64 KiB** (65 536 bajtów w UTF-8 — litera spoza ASCII zajmuje dwa
bajty lub więcej). Większy tekst jest odrzucany przy zapisie, z komunikatem podającym limit,
a tekst zapisany wcześniej nadal obowiązuje. Wyszukiwarki czytają tylko pierwsze 500 KiB pliku
`robots.txt`; limit sprawia, że cały plik mieści się w tym z dużym zapasem.

### Nie używaj ich, aby zniknąć z wyników wyszukiwania

Plik `robots.txt` określa, co robot może **pobrać**. Nie określa, co wyszukiwarka **pokazuje**.
Strona, której nie wolno pobrać, nadal może pojawić się w wynikach — po samym adresie, bez
opisu — jeśli linkują do niej inne witryny.

Aby wyłączyć sklep z wyników wyszukiwania, ustaw *Domyślne robots* na `NOINDEX`. I nie dodawaj do
tego `Disallow: /`: robot, któremu nie wolno pobrać strony, nigdy nie odczyta umieszczonego na
niej `noindex`, więc reguła, która wygląda na mocniejszą, wyłącza tę, która działa. Nic, co
zostanie tu wpisane, nie sprawi, że strona deklarująca `noindex` stanie się indeksowalna; może
najwyżej sprawić, że roboty tego nie zobaczą.

### Ile trwa wprowadzenie zmiany w pliku

Sklep pyta backend o tekst kanału najwyżej raz na minutę i pozwala robotowi przechowywać plik
przez kolejną minutę, więc zapisana zmiana jest serwowana w ciągu około dwóch minut. Wyszukiwarki
pobierają `robots.txt` według własnego harmonogramu, zwykle mniej więcej raz na dobę.

### Gdy tekstu nie da się odczytać

Sklep, który choć raz odczytał tekst kanału, serwuje tę wersję tak długo, jak długo backend
jest niedostępny. Sklep, który tego nie zrobił — uruchomiony w czasie, gdy backend nie
działał — do pierwszego udanego odczytu odpowiada na `robots.txt` kodem `503`
z `Retry-After: 120`, zamiast serwować same reguły generowane.

To celowe i różni się od zachowania stron. Plik `robots.txt` zwrócony z kodem `200` jest pełnym
oświadczeniem o tym, co wolno pobierać, więc plik, w którym po cichu zabrakłoby Twoich wierszy
`Disallow`, byłby zgodą, której nie udzielono. Wyszukiwarka odczytuje `503` jako „zapytaj
później” i nadal korzysta z kopii, którą już ma. Żaden klient nie czyta tego pliku, więc nic, co
widzi klient, od niego nie zależy.

Na pierwszy odczyt kanału po uruchomieniu sklep czeka do dwóch sekund. Gdy moduł `seo` jest
wyłączony oraz gdy backend nie ma tej funkcji, sklep serwuje same reguły generowane z kodem
`200` — to są odpowiedzi, a nie błędy.

### Odczyt tekstu we własnym sklepie

`GET /api/v1/storefront/seo/crawler-files` jest publiczny i ustala kanał sprzedaży tak samo jak
`robots-policy`:

```json
{
  "data": {
    "index": true,
    "follow": true,
    "robotsTxtCustom": "User-agent: GPTBot\nDisallow: /\n",
    "llmsTxtAdditional": "",
    "shop": { "name": "Endora Demo" }
  }
}
```

`robotsTxtCustom` to tekst ustalony dla kanału, dokładnie w zapisanej postaci — backend nie
zmienia w nim żadnego znaku, także końców wierszy. `index` i `follow` powtarzają politykę
kanału, `shop.name` to skonfigurowana nazwa sklepu albo pusty ciąg znaków, a `llmsTxtAdditional`
jest w tym wydaniu zawsze puste. Schemat to `storefrontCrawlerFilesResponseSchema`
w `@endora-commerce/contracts`; pakiet eksportuje też `composeCrawlerFile(base, extra)` —
funkcję, którą referencyjny sklep łączy reguły generowane z tekstem — oraz
`CRAWLER_TEXT_MAX_BYTES`.

Odpowiedź jest wysyłana z `Cache-Control: no-store`. Statusy należy traktować tak jak dla
`robots-policy`: `503` `MODULE_DISABLED` oraz `404` oznaczają, że własnego tekstu nie ma; każdy
inny błąd, także `500`, oznacza, że tekstu nie udało się odczytać, a wtedy `robots.txt` powinien
być ostatnio serwowaną wersją albo odpowiedzią `503` — nie plikiem bez tekstu. Punkt końcowy
odpowiada `500`, a nie pustym tekstem, gdy zapisanej wartości nie można serwować — do czego
trzeba wiersza zapisanego z pominięciem API ustawień.

`robots.txt` referencyjnego sklepu odpowiada też na `GET /robots.txt?part=system` samymi
regułami generowanymi i oznacza każdą odpowiedź nagłówkiem `X-Endora-Crawler-Files: 1`.

## Wyznaczanie meta tagów

`MetaTagResolverService.resolve({ entityType, entityId, locale })` zwraca
`{ title, description, openGraph, source, locale }`. Kolejność:

1. Wyszukanie wiersza nadpisania dla pary (encja, język).
2. Jeśli pole jest ustawione w nadpisaniu, zostaje użyte dosłownie.
3. W przeciwnym razie używana jest reguła wyprowadzona z encji (nazwa i opis produktu, nazwa
   kategorii i automatyczne podsumowanie).
4. Wartość zastępcza języka dla każdego pola: gdy produkt nie ma tekstu w `pl-PL`, reguła używa
   `en-US`, a potem dowolnego dostępnego języka.

Tytuł i opis są skracane do 60 / 160 znaków z wielokropkiem. Skracanie odbywa się w jednej funkcji
pomocniczej, więc zmiany limitów SEO wprowadza się w jednym miejscu.

## Mapa witryny

`SitemapGeneratorService.regenerate()` przechodzi przez aktywne produkty z publiczną widocznością
oraz niezarchiwizowane i nieusunięte kategorie, buduje bezwzględne adresy URL względem
`STOREFRONT_BASE_URL` i zapisuje treść XML w jednym wierszu `sitemap_cache`.

Trasa publiczna (`GET /catalog/sitemap.xml`) zwraca treść z pamięci podręcznej; gdy wiersz jest
starszy niż `staleAfterMs` (domyślnie 6 h), mapa jest generowana od razu w trakcie żądania.
Odpowiedź ma nagłówek `Cache-Control: public, max-age=3600`, więc poprawnie działające CDN
przechowują ją przez godzinę.

## Tylko to, co widzi anonimowy użytkownik

Mapa witryny pomija:
- produkty ze `status != 'active'`
- produkty z `visibility != 'public'`
- wiersze zarchiwizowane (`archivedAt`) i usunięte miękko (`deletedAt`)
- kategorie usunięte miękko

Zasada jest prosta: robotom wyszukiwarek udostępnia się wyłącznie to, co może zobaczyć anonimowy
klient.

## Encje

`SeoMetaOverride` (entityType, entityId, locale, title?, description?, ogTitle?, ogDescription?,
ogImageUrl?), `SitemapCache` (pojedynczy klucz, treść, urlCount, byteSize, generatedAt).

## Punkty rozszerzenia

- **Strony CMS** — gdy powstanie moduł CMS, podłącz jego slug i treść do
  `MetaTagResolverService.loadRuleSource()` i `SitemapGeneratorService.regenerate()`.
- **Indeks map witryny** — dla katalogów powyżej 50 000 adresów URL podziel mapę na mapy dla
  poszczególnych sekcji i zwracaj `<sitemapindex>` z trasy tego modułu.
- **Generowanie według harmonogramu** — w produkcyjnym composition root podłącz powtarzalne zadanie
  BullMQ, które co noc wywołuje `regenerate()`.
