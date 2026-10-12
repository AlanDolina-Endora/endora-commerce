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
| `GET /api/v1/admin/seo/crawler-files/preview` | administrator (`settings:read`) | Podgląd pliku `robots.txt` kanału sprzedaży: reguły generowane przez jego sklep, pobrane z tego sklepu, obok zapisanego tekstu |
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
stosuje — jego `robots.txt` pozostaje plikiem, z którym sklep został zbudowany. Ekran Ustawień
informuje o tym tam, gdzie może to stwierdzić: gdy taki sklep odpowiada backendowi, zarówno
wiersz *Domyślne robots*, jak i podgląd `robots.txt` pokazują, że sklep tego kanału nie stosuje
jeszcze ustawienia. Lista plików do
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
jak tekst został zapisany, a plik zawsze kończy się dokładnie jednym. Pomijany jest też jeden
niewidoczny znak: znacznik kolejności bajtów (BOM) na samym początku tekstu, który niektóre
edytory dodają przy zapisie pliku — robot nie rozpoznałby wiersza, do którego jest doklejony.
Nic w tekście nie jest sprawdzane ani poprawiane; wiersz, którego robot nie rozumie, jest
serwowany jak każdy inny.

**Grupa napisana dla jednego robota zastępuje dla niego reguły generowane.** Robot stosuje się
do grupy, która go wymienia, i pomija wtedy grupę `*`, więc po wierszu `User-agent: GPTBot`
i Twoich regułach GPTBot nie widzi już generowanych wierszy `Disallow`. Powtórz je w tej grupie,
jeśli nadal mają go obowiązywać. Samych wierszy generowanych nie da się zmienić, ale wpis `Allow`
tej samej długości co generowany `Disallow` ma przed nim pierwszeństwo. To, czy stronę można
indeksować, nie zależy od żadnej z tych rzeczy: strony zamykane przez te reguły same deklarują
`noindex`.

Jak każde ustawienie, to również ma wartość dla wszystkich kanałów sprzedaży oraz wartości dla
poszczególnych kanałów, a własna wartość kanału ma pierwszeństwo — także pusta, która sprawia,
że kanał nie ma własnych instrukcji niezależnie od tekstu dla wszystkich kanałów. Tekst jednego
kanału nigdy nie trafia do pliku innego kanału. **Reset** usuwa własny tekst kanału, więc kanał
znów dziedziczy tekst dla wszystkich kanałów; zresetowanie także jego pozostawia same reguły
generowane. Zmiana tekstu wymaga uprawnienia `settings:write` i jest zapisywana w dzienniku
audytu.

### Podgląd

Pod polem ekran Ustawień pokazuje plik `robots.txt`, który serwuje sklep danego kanału
sprzedaży, w dwóch blokach — w kolejności, w jakiej występują w pliku:

- **Generowane przez sklep** — reguły, które ten sklep generuje sam, wraz z jego linią
  `Sitemap:`. Tylko do odczytu: należą do sklepu, a panel administracyjny za każdym razem pyta
  o nie sklep, zamiast przechowywać kopię, która mogłaby się zdezaktualizować.
- **Twoje instrukcje** — tekst z pola w postaci, w jakiej będzie serwowany. Podąża za tym, co
  wpisujesz, jeszcze przed zapisaniem; dopóki różni się od zapisanego, podgląd informuje:
  **Jeszcze niezapisane — sklep nadal udostępnia zapisaną wersję**. Podgląd niczego nie zmienia
  w tym, co serwuje sklep.

Podgląd dotyczy kanału sprzedaży wybranego u góry ekranu Ustawień. W trybie **Wszystkie
kanały** pokazuje wynik dla jednego kanału, który wybierasz w podglądzie, i wymienia kanały
mające własną wartość — tekst dla wszystkich kanałów ich nie dotyczy, a po wybraniu jednego
z nich podgląd pokazuje to, co ten kanał faktycznie serwuje.

W kanale sprzedaży, w którym *Domyślne robots* ma wartość `NOINDEX`, podgląd informuje, że
`robots.txt` celowo pozostaje otwarty, i ostrzega, gdy Twój tekst zawiera `Disallow: /` dla
wszystkich robotów — zobacz [dlaczego `robots.txt` pozostaje otwarty](#dlaczego-robotstxt-pozostaje-otwarty).

Administrator, który może przeglądać ustawienia, ale nie może ich zmieniać, również widzi
podgląd.

#### Gdy podgląd nie może pokazać reguł generowanych

Podgląd nigdy nie pokazuje reguł, których przed chwilą nie pobrał. W każdym z poniższych
przypadków Twój własny blok jest nadal widoczny, a zapisywanie działa jak zwykle:

| Komunikat w podglądzie | Co oznacza | Co zrobić |
| --- | --- | --- |
| *Nie udało się połączyć ze sklepem* | Sklep nie odpowiedział w ciągu trzech sekund, odrzucił połączenie, odpowiedział błędem lub przekierowaniem albo czymś, co nie jest tekstowym plikiem `robots.txt` | Sprawdź, czy sklep działa i czy **Storefront URL** kanału to jego rzeczywisty adres — taki, pod którym sklep sam odpowiada, a nie taki, który do niego przekierowuje. **Sprawdź ponownie** pyta jeszcze raz. Przyczynę podaje log serwera |
| *Ten kanał sprzedaży nie ma skonfigurowanego adresu sklepu* | Nie ustawiono ani ustawienia **Storefront URL** kanału, ani zmiennej `STOREFRONT_BASE_URL`, więc nie ma adresu, pod który można zapytać | Ustaw **Ustawienia → Sales Channels → Storefront URL** dla tego kanału |
| *Ten sklep nie udostępnia jeszcze własnych instrukcji* | Sklep odpowiedział, ale działa w wersji sprzed tej funkcji: serwuje wyłącznie reguły generowane, pokazane pod komunikatem, i ignoruje Twój tekst oraz *Domyślne robots* | Zaktualizuj sklep — zobacz [sklep utworzony przed tą funkcją](#sklep-utworzony-przed-tą-funkcją). Ten sam komunikat pojawia się w wierszu *Domyślne robots* |
| *Ten adres jest wspólny dla wszystkich kanałów sprzedaży* | Adres pochodzi ze zmiennej `STOREFRONT_BASE_URL`, jednej dla wszystkich kanałów, więc podgląd dotyczy tego wspólnego sklepu | Nic, jeśli instancja ma jeden sklep. Gdy każdy kanał ma własny sklep, ustaw **Storefront URL** każdego kanału |

#### O co backend pyta sklep

Aby pokazać reguły generowane, backend wysyła jedno żądanie do sklepu danego kanału:
`GET <origin adresu sklepu kanału>/robots.txt?part=system`, z kodem kanału w nagłówku
`X-Sales-Channel`. Żądanie jest wysyłane wyłącznie dla zalogowanego administratora, który może
przeglądać ustawienia, wyłącznie pod skonfigurowany adres — nic z tego, co wysyła przeglądarka
administratora, nie jest jego częścią — i wyłącznie do originu tego adresu: ścieżka i parametry
zapisane w skonfigurowanym adresie nie są używane, ponieważ `robots.txt` znajduje się
w katalogu głównym witryny. Żądanie nie podąża za przekierowaniami, czeka najwyżej trzy sekundy,
odczytuje najwyżej 512 KiB, przyjmuje wyłącznie `text/plain` i nie wysyła ciasteczek ani danych
uwierzytelniających. Nic z odpowiedzi nie jest zapisywane.

Sklep musi więc być osiągalny **z backendu** pod skonfigurowanym adresem. Sklep, który jest
publiczny, ale nieosiągalny z sieci backendu, w podglądzie jest pokazywany jako niedostępny,
a poza tym działa bez zmian.

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

### Za serwerem proxy lub siecią CDN

Plik jest inny dla każdego kanału sprzedaży, a sklep rozpoznaje kanał po nagłówku żądania
`X-Sales-Channel`. Wysyła plik z nagłówkami `Cache-Control: public, max-age=60`
i `Vary: X-Sales-Channel`. Dla tego, co stoi przed sklepem obsługującym więcej niż jeden kanał,
wynikają z tego dwie rzeczy:

- serwer proxy musi sam ustawiać `X-Sales-Channel`, osobno dla każdego hosta, i nie może
  przepuszczać wartości przysłanej przez odwiedzającego — inaczej odwiedzający sam wybiera, czyj
  plik zobaczy;
- współdzielona pamięć podręczna, która pomija `Vary` dla takiego nagłówka, musi uwzględniać go
  w kluczu pamięci podręcznej albo w ogóle nie przechowywać `/robots.txt` — inaczej plik jednego
  kanału zostanie podany dla innego.

Sklep obsługujący jeden kanał nie potrzebuje żadnej z nich; jego serwer proxy może ten nagłówek
usuwać.

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

Na pierwszy odczyt kanału po uruchomieniu sklep czeka do dwóch sekund — a żądanie pliku
`robots.txt` wykonuje dwa takie odczyty jeden po drugim: domyślnej polityki robots kanału,
a potem jego tekstu. Gdy backend przyjmuje połączenia, ale nie odpowiada, pierwsze żądanie może
więc trwać od czterech do pięciu sekund. Następnie sklep przez pięć sekund nie pyta ponownie
i odpowiada od razu. Gdy moduł `seo` jest wyłączony oraz gdy backend nie ma tej funkcji, sklep
serwuje same reguły generowane z kodem `200` — to są odpowiedzi, a nie błędy.

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
regułami generowanymi — z nagłówkiem `Cache-Control: no-store`, ponieważ jest to plik bez tekstu
operatora pod adresem, który pamięć podręczna mogłaby pomylić z właściwym — i oznacza każdą
odpowiedź nagłówkiem `X-Endora-Crawler-Files: 1`.

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
