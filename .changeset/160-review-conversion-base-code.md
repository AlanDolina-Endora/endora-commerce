---
'@endora-commerce/mod-price-lists': patch
---

The upgrade to price books no longer stops on an old price list coded like a base book.

The conversion migration `20261022T111815_price_lists_price_books_conversion` inserted each new currency's base book with the code `base-<currency>` before it removed the old lists, so an existing list coded `base-eur` (for example) failed the whole upgrade on `price_lists_code_unique`. The base book's code is now derived from its own new id; the column is dropped later in the same migration, so nothing reads it.
