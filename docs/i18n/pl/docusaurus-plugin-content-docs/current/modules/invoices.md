---
title: invoices
description: Generowanie faktur i faktur proforma w PDF oraz powiązanie z plikami
---

# `invoices`

Generuje faktury proforma i faktury końcowe w PDF, rejestruje je w module `assets` i wiąże z
zamówieniem, z którego pochodzą.

## API publiczne

Lista w panelu administracyjnym jest chroniona przez `orders:read`.

| Metoda i ścieżka | Kto | Przeznaczenie |
| --- | --- | --- |
| `GET /api/v1/orders/:id/invoice` | klient | Pobranie faktury PDF (404 `INVOICE_NOT_READY`, dopóki status nie jest `ready`; potem odpowiedź binarna z odpowiednim Content-Type). Administrator pobiera fakturę ponownie przez ten sam endpoint, pod adresem storefrontu. |
| `GET /api/v1/admin/invoices` | administrator | Lista wszystkich faktur z `filter[status]` / `filter[orderId]`; domyślnie 50, najwyżej 200 |

## Generowanie

`invoice-service.ts#generate()` uruchamia się po `order.confirmed`: pobiera zamówienie, pozycje i
zapisaną kopię adresu kupującego, generuje PDF lekkim mechanizmem bez ciężkich zależności, zapisuje
plik przez moduł `assets` i zapisuje identyfikator pliku w zamówieniu. Błędy emitują
`invoice.generation_failed.v1` do kolejki ponowień w panelu administracyjnym.

## Encje

`Invoice` (numer, daty wystawienia i dokumentu, odwołanie do pliku, `type ∈ {proforma, final}`).

## Numeracja

Dwie cechy numeru faktury pozornie sobie przeczą — obie są zamierzone:

- **kolejny numer** jest pobierany osobno dla każdej trójki `(kanał sprzedaży, rodzaj, rok)`, bez
  luk, z blokadą wiersza — `invoice_number_counters`;
- **numer faktury** jest unikalny w całej platformie — `invoices_number_unique`.

Pierwsze w drugie zamienia wzorzec zapisany w ustawieniu dla każdego rodzaju dokumentu, które może
mieć wartość osobną dla kanału sprzedaży:

| Rodzaj | Ustawienie | Wartość domyślna |
| --- | --- | --- |
| Faktura VAT | `invoices.numbering.invoice.pattern` | `FV {seq}/{channel}/{YYYY}` |
| Faktura proforma | `invoices.numbering.proforma.pattern` | `PRO {seq}/{channel}/{YYYY}` |
| Korekta | `invoices.numbering.correction.pattern` | `KOR {seq}/{channel}/{YYYY}` |

### Znaczniki

| Znacznik | Zamieniany na |
| --- | --- |
| `{seq}` | pobrany kolejny numer |
| `{seq:N}` | to samo, uzupełnione zerami do szerokości `N` |
| `{channel}` | `code` kanału sprzedaży, wielkimi literami |
| `{YYYY}` / `{YY}` | rok wystawienia, 4 lub 2 cyfry |
| `{MM}` | miesiąc wystawienia |

Reszta to stały tekst. `code` kanału jest niezmienny i unikalny, więc numeru już wygenerowanego z
`{channel}` nie unieważni zmiana nazwy kanału; po obu stronach znacznika zostaw separator, bo
`FV {channel}{seq}` zaciera granicę między dwoma polami o zmiennej długości i daje `FV A12` zarówno
dla (`a1`, 2), jak i (`a`, 12).

### Trzy odmowy i która z nich jest gwarancją

Ponieważ numeracja kolejna jest osobna dla każdego kanału, a numer faktury nie, dwa kanały, których
wzorce mogą dać ten sam ciąg znaków, to kolizja, która tylko czeka, by się wydarzyć. Między nią a
dokumentem trafiającym do klienta stoją trzy warstwy:

1. **Domyślny wzorzec zawiera `{channel}`**, więc utworzenie kanału sprzedaży nie przygotowuje
   kolizji. Domyślny kanał systemowy jest raz, przy starcie, przypisywany do historycznego wzorca
   `FV {seq}/{YYYY}` — seria numerów istniejącego wdrożenia nie zmienia postaci — i tylko dopóki
   nikt nie skonfigurował tego ustawienia.
2. **`400 INVOICE_NUMBER_PATTERN_COLLIDES`** przy zapisie ustawień, ze wskazaniem kanału, z którym
   wzorzec koliduje. Odrzuca *możliwą* kolizję: przy zapisie konfiguracji nic jeszcze nie jest
   zagrożone, więc ostrożna odmowa kosztuje tylko jedną poprawkę.
3. **`409 INVOICE_NUMBER_ALREADY_ISSUED`** przy wystawianiu, ze wskazaniem kanału, który już ma
   ten numer. To jest gwarancja — jedyny punkt kontroli, przez który przechodzi każdy numer — i
   odrzuca tylko *rzeczywisty* duplikat. Transakcja jest wycofywana, więc pobrany numer kolejny
   wraca i nie powstaje luka.

Wdrożenie, które już ma kolidującą konfigurację, jest zgłaszane przy starcie, raz dla każdej
kolidującej pary, i **nie jest blokowane**: dającą się naprawić pomyłkę w konfiguracji faktur nie
można zamieniać w awarię storefrontu.

## Punkty rozszerzenia

- **Schemat numeracji** — `services/invoice-number-generator.ts` zamienia wzorzec na numer
  (`formatInvoiceNumber`) i pobiera numer kolejny; `services/invoice-number-collisions.ts`
  rozstrzyga, czy dwa kanały mogą dać ten sam ciąg znaków. Dodaj znacznik w pierwszym pliku, a
  zestaw przykładów sprawdzanych w drugim go uwzględni.
- **E-fakturowanie** — dla KSeF, Peppol i podobnych systemów podłącz adapter wysyłki, który obsługuje
  zdarzenia `invoice.issued.v1`.

## Szablony PDF

Układy PDF faktur projektuje się w **Szablonach dokumentów → Faktura** (otwiera je zakładka
**Szablony** w **Fakturach**; dawne adresy `/invoices/templates` przekierowują tam). Paletę szablonu
faktury tworzą bloki faktury — nagłówek, strony, pozycje, podsumowanie VAT, sumy, uwagi, odstęp,
separator, logo, stopka — oraz bloki, które dla faktur udostępniają inne zainstalowane moduły (sekcja
KSeF). Każdy PDF faktury — pobierany przez administratora i przez klienta, generowany ponownie oraz
dołączany do e-maila z fakturą — powstaje z domyślnego szablonu faktury kanału sprzedaży faktury,
a w jego braku z domyślnego szablonu dla wszystkich kanałów, a w jego braku z wbudowanego układu
faktury. PDF faktur jest drukowany po polsku.

Numer KSeF jest drukowany dokładnie raz: przez umieszczony blok, który go drukuje, a w przeciwnym razie
przez nagłówek.

Dawne API administracji szablonami faktur (`/api/v1/admin/invoice-templates*`) zostało wycofane;
szablonami faktur zarządza się przez `/api/v1/admin/document-templates`. Fakturowania nie można
włączyć bez Szablonów dokumentów, a Szablonów dokumentów nie można wyłączyć, dopóki fakturowanie jest
włączone.
