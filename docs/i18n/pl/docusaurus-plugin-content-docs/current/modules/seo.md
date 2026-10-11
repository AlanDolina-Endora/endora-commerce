---
title: seo
description: Wyznaczanie meta tagów, mapa witryny XML z pamięcią podręczną i domyślne ustawienie robots dla wyszukiwarek
---

# `seo`

Wyznaczanie meta tagów dla każdej strony, publiczna mapa witryny XML oraz to, co wyszukiwarki
dowiadują się o całym sklepie danego kanału sprzedaży.

## API publiczne

| Metoda i ścieżka | Kto | Przeznaczenie |
| --- | --- | --- |
| `GET /api/v1/catalog/sitemap.xml` | roboty wyszukiwarek | Mapa witryny XML z pamięci podręcznej; gdy jest nieaktualna, jest generowana od razu w trakcie żądania |
| `GET /api/v1/storefront/seo/robots-policy` | sklep | Domyślna polityka robots kanału sprzedaży, którego dotyczy żądanie, w postaci `{ index, follow }` |
| `GET /api/v1/admin/seo/sitemap` | administrator (`catalog:write`) | Jeden wiersz na kanał sprzedaży: adres sklepu, czas ostatniego wygenerowania, rozmiar, liczba adresów URL |
| `POST /api/v1/admin/seo/sitemap/:channelCode/regenerate` | administrator (`catalog:write`) | Wymuszenie ponownego wygenerowania dla tego kanału |
| `GET /api/v1/admin/seo/sitemap/:channelCode/status` | administrator (`catalog:write`) | Czas ostatniego wygenerowania, rozmiar i liczba adresów URL dla tego kanału |
| `GET /api/v1/admin/seo/sitemap/:channelCode/xml` | administrator (`catalog:write`) | Zapisany XML tego kanału, do podglądu lub pobrania (`?download=1`) |
| `GET /api/v1/admin/seo/meta/:entityType/:entityId` | administrator (`catalog:write`) | Wyznaczone meta tagi i wiersz nadpisania dla (encja, język) |
| `PUT /api/v1/admin/seo/meta/:entityType/:entityId` | administrator (`catalog:write`) | Utworzenie lub aktualizacja nadpisania (dla danego języka) |
| `DELETE /api/v1/admin/seo/meta/:entityType/:entityId` | administrator (`catalog:write`) | Usunięcie nadpisania (wracają wartości wyznaczane z reguły) |

## Roboty wyszukiwarek

**Ustawienia → SEO → Default robots** decyduje o tym, co wyszukiwarki dowiadują się o każdej
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

Dla kanału, którego ustawienie coś ogranicza, sklep dodaje dyrektywę do **każdej odpowiedzi**
wysyłanej dla tego kanału:

- nagłówek odpowiedzi `X-Robots-Tag` — na stronach, w `/sitemap.xml`, na zoptymalizowanych
  obrazach (`/_next/image`) i na plikach z katalogu `public/`;
- jeden dodatkowy element `<meta name="robots">` w sekcji `<head>` każdej strony.

Pominięte są wyłącznie pliki skryptów i stylów samego builda w `/_next/static`.

**Ustawienie wyłącznie dodaje ograniczenia.** Strona, która sama deklaruje `noindex` — koszyk,
kasa, strony konta — zachowuje własny tag niezależnie od wyboru, a wtedy ma dwa tagi robots.
Wyszukiwarka, która odczytuje kilka dyrektyw robots dla jednego adresu, stosuje najbardziej
restrykcyjną z nich, więc ustawienie nigdy nie sprawi, że prywatna strona stanie się
indeksowalna. Przy `INDEX, FOLLOW` nic nie jest dodawane, a odpowiedzi sklepu są takie same jak
przed wprowadzeniem tego ustawienia.

### Dlaczego `robots.txt` pozostaje otwarty

*Default robots* nie zmienia pliku `robots.txt`, a kanał z `NOINDEX` nie może go zamykać wpisem
`Disallow: /`. Robot musi pobrać stronę, żeby odczytać, że nie wolno jej indeksować; strona,
której nie wolno mu pobrać, nadal może trafić do wyników — po samym adresie — jeśli linkują do
niej inne witryny.

### Ile trwa wprowadzenie zmiany

Sklep pyta backend o politykę kanału najwyżej raz na minutę, więc zapisana zmiana obowiązuje
w sklepie w ciągu minuty lub dwóch. Wyszukiwarki uwzględniają ją przy kolejnej wizycie na każdej
stronie, co trwa dni lub tygodnie; strona, która jest już w indeksie, znika z niego dopiero po
ponownym odwiedzeniu przez robota.

### Gdy moduł jest wyłączony

Wyłączenie modułu `seo` na ekranie modułów platformy wycofuje ustawienie: sklep w ciągu minuty
lub dwóch przestaje wysyłać nagłówek i dodatkowy tag, więc **kanał ustawiony na `NOINDEX` znów
staje się indeksowalny**. Ustawienie przechodzi w tryb tylko do odczytu i zachowuje zapisaną
wartość, pozycje w palecie poleceń znikają, a `GET /api/v1/storefront/seo/robots-policy`
odpowiada `503` `MODULE_DISABLED`. Ponowne włączenie modułu przywraca działanie zapisanej
wartości.

### Dwa ograniczenia

- **Pliki serwowane przez backend nie są objęte.** Zdjęcia produktów i inne przesłane media
  serwuje backend, pod własnym adresem, bez nagłówka `X-Robots-Tag`. Strony kanału z `NOINDEX`
  znikają z wyszukiwarek; pliki jego obrazów nadal może znaleźć wyszukiwarka grafiki, która
  trafi do nich bezpośrednio.
- **Świeżo uruchomiony sklep jeszcze nic nie wie.** Sklep przechowuje ostatnio odczytaną
  politykę w pamięci własnego procesu i stosuje ją dalej, gdy backend jest niedostępny. Sklep
  uruchomiony w czasie, gdy backend jest niedostępny, nie ma czego zastosować i do pierwszego
  udanego odczytu serwuje strony tego kanału bez domyślnej dyrektywy. Żadna strona nigdy nie
  kończy się błędem dlatego, że nie udało się odczytać polityki.

### Sklep utworzony przed tą funkcją

Dyrektywę nakładają pliki samego sklepu: `middleware.ts` i `app/layout.tsx`. Sklep utworzony
z wcześniejszego wydania działa dalej ze zaktualizowanym backendem, ale **ignoruje to
ustawienie**, dopóki te pliki nie zostaną zaktualizowane: ekran Ustawień pokazuje wybór, a nic
w takim sklepie go nie stosuje. Lista plików do skopiowania jest w informacjach o wydaniu.

### Dla własnego sklepu

`GET /api/v1/storefront/seo/robots-policy` jest publiczny i ustala kanał sprzedaży na podstawie
nagłówka `X-Sales-Channel` żądania, a gdy go brak — przyjmuje domyślny kanał systemowy:

```json
{ "data": { "index": false, "follow": false } }
```

Odpowiedź jest wysyłana z `Cache-Control: no-store`; zakłada się, że buforuje ją odbiorca.
Schemat to `storefrontRobotsPolicyResponseSchema` w `@endora-commerce/contracts`.

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
