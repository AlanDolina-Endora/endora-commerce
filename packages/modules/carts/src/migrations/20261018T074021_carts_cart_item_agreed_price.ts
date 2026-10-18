import { Migration } from '@mikro-orm/migrations';

/**
 * `cart_items.agreed_quantity` / `agreed_unit_price` / `agreed_currency` — the
 * agreement a line seeded from an accepted Quote Request carries.
 *
 * A cart line is ordered at its stored unit price, and that price is now the
 * price for the line's current quantity: it is re-resolved whenever the
 * quantity changes and checked again at order placement. A line seeded at a
 * negotiated price needs to say which quantity that price was agreed for, so it
 * keeps the price at that quantity and is priced from the list at any other.
 *
 * Nullable, no backfill. No surviving record on the basket says which of a
 * historical quote-seeded basket's lines still hold their agreed quantity, so
 * such a line is priced from the list at placement; the buyer converts the
 * accepted quote again to restore the agreed prices.
 */
export class Migration20261018T074021CartsCartItemAgreedPrice extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "cart_items" ' +
        'add column "agreed_quantity" int null, ' +
        'add column "agreed_unit_price" numeric(12,2) null, ' +
        'add column "agreed_currency" varchar(3) null;',
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      'alter table "cart_items" ' +
        'drop column "agreed_quantity", ' +
        'drop column "agreed_unit_price", ' +
        'drop column "agreed_currency";',
    );
  }
}
