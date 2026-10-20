/**
 * Feature 159 — the layout of a new order's lines
 * (`specs/159-quote-request-item-groups/contracts/orders-api.md` §1–§2,
 * research R-16, R-17; invariants I-O2, I-O3).
 *
 * Pure. `OrderService.placeOrder` asks one of three questions inside its
 * transaction and writes the answer before the order's lines:
 *
 * - {@link carryQuoteGrouping} — the order is the vouched order of an accepted
 *   quote: its lines take the quote lines' groups and order (FR-050, FR-051);
 * - {@link adminLayout} — an administrator created the order with a grouping
 *   (FR-061);
 * - {@link basketLayout} — every other order: no group, the basket's order.
 *
 * A layout names groups by a *source* reference — the quote group's id, or the
 * request's group key — which the writer turns into fresh `order_item_groups`
 * rows. Every group of a layout holds at least one line (D2, I-O2), groups and
 * each section's lines are numbered `0…` (I-O3).
 */

/** A quote line as `quoteRequestReadPort.listItems` answers it, in the quote's display order. */
export interface QuoteLineForCarry {
  readonly productId: string;
  readonly variantId: string | null;
  readonly agreedUnitPrice: string | null;
  /** Absent on a record from a port written before feature 159. */
  readonly position?: number;
  /** Absent as above; `null` = ungrouped. */
  readonly group?: { readonly id: string; readonly name: string; readonly position: number } | null;
}

/** An order line about to be written, in basket order; `key` is the caller's handle on it. */
export interface OrderLineForCarry {
  readonly key: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly unitPrice: string;
}

export interface LaidOutGroup {
  /** The quote group's id, or the request's group key. */
  readonly sourceId: string;
  readonly name: string;
  readonly position: number;
}

export interface OrderLineLayout {
  /** Non-empty groups, in display order, positions `0…g-1`. */
  readonly groups: LaidOutGroup[];
  /** Every order line by key: its group (`null` = ungrouped) and its position within its section. */
  readonly lines: Map<string, { groupSourceId: string | null; position: number }>;
}

/** The contract's name for a carried layout. */
export type CarriedGrouping = OrderLineLayout;

/** `(productId, variantId)` as one map key — the basket merges lines of one product and variant. */
export function orderLineGroupingKey(productId: string, variantId: string | null | undefined): string {
  return `${productId}:${variantId ?? ''}`;
}

/**
 * The grouping an administrator's creation request carries into placement
 * (`placeOrder`'s `options.lineGrouping`; not on `OrderPlacementPort`).
 */
export interface OrderLineGroupingInput {
  /** In display order. */
  readonly groups: readonly { readonly key: string; readonly name: string }[];
  /** {@link orderLineGroupingKey} → the request line's group key and its index in the request. */
  readonly lines: ReadonlyMap<string, { readonly groupKey: string | null; readonly index: number }>;
}

/** No group; positions in basket order. */
export function basketLayout(order: readonly OrderLineForCarry[]): OrderLineLayout {
  return {
    groups: [],
    lines: new Map(order.map((line, position) => [line.key, { groupSourceId: null, position }])),
  };
}

/**
 * Assemble a layout from each line's section and rank. `groupOrder` lists
 * candidate groups in display order; those receiving no line are dropped and
 * the rest renumbered. Within a section lines sort by rank, ties by basket order.
 */
function assemble(
  order: readonly OrderLineForCarry[],
  groupOrder: readonly { sourceId: string; name: string }[],
  placeOf: (line: OrderLineForCarry, basketIndex: number) => { groupSourceId: string | null; rank: number },
): OrderLineLayout {
  const sections = new Map<string | null, Array<{ key: string; rank: number; basketIndex: number }>>();
  order.forEach((line, basketIndex) => {
    const place = placeOf(line, basketIndex);
    const section = sections.get(place.groupSourceId) ?? [];
    section.push({ key: line.key, rank: place.rank, basketIndex });
    sections.set(place.groupSourceId, section);
  });
  const lines = new Map<string, { groupSourceId: string | null; position: number }>();
  const groups: LaidOutGroup[] = [];
  const known = new Set(groupOrder.map((group) => group.sourceId));
  const write = (groupSourceId: string | null) => {
    const members = sections.get(groupSourceId) ?? [];
    members
      .sort((a, b) => a.rank - b.rank || a.basketIndex - b.basketIndex)
      .forEach((member, position) => lines.set(member.key, { groupSourceId, position }));
  };
  for (const group of groupOrder) {
    if ((sections.get(group.sourceId)?.length ?? 0) === 0) continue;
    groups.push({ sourceId: group.sourceId, name: group.name, position: groups.length });
    write(group.sourceId);
  }
  // A line naming a group the candidates do not hold is ungrouped.
  for (const [section, members] of sections) {
    if (section !== null && !known.has(section)) {
      const ungrouped = sections.get(null) ?? [];
      ungrouped.push(...members);
      sections.set(null, ungrouped);
      sections.delete(section);
    }
  }
  write(null);
  return { groups, lines };
}

/**
 * The quote's grouping, carried onto the order placed from it (FR-050–FR-051).
 *
 * Each order line, in basket order, claims a quote line: first by product,
 * variant and agreed unit price (every line's exact match is claimed before
 * any fallback, so a line whose price moved cannot take the quote line another
 * line matches exactly), then by product and variant alone. A matched line
 * takes its quote line's group and its place in the quote's display order; an
 * unmatched line is ungrouped, after the matched ungrouped lines, in basket
 * order. Quote groups receiving no line are dropped.
 *
 * Records carrying neither `group` nor `position` (a port written before the
 * feature) carry nothing: the basket's order, no group.
 */
export function carryQuoteGrouping(
  quote: readonly QuoteLineForCarry[],
  order: readonly OrderLineForCarry[],
): CarriedGrouping {
  if (quote.every((line) => line.group === undefined && line.position === undefined)) return basketLayout(order);

  const sameItem = (q: QuoteLineForCarry, o: OrderLineForCarry) =>
    q.productId === o.productId && (q.variantId ?? null) === (o.variantId ?? null);
  const claimed = new Set<number>();
  const matchOf = new Map<string, number>();
  const claim = (accept: (q: QuoteLineForCarry, o: OrderLineForCarry) => boolean) => {
    for (const line of order) {
      if (matchOf.has(line.key)) continue;
      const index = quote.findIndex((q, i) => !claimed.has(i) && accept(q, line));
      if (index < 0) continue;
      claimed.add(index);
      matchOf.set(line.key, index);
    }
  };
  claim(
    (q, o) => sameItem(q, o) && q.agreedUnitPrice != null && Number(q.agreedUnitPrice) === Number(o.unitPrice),
  );
  claim(sameItem);

  // Candidate groups by their quote position, ties by first appearance.
  const groupOrder: Array<{ sourceId: string; name: string; position: number; seen: number }> = [];
  quote.forEach((line, seen) => {
    if (line.group && !groupOrder.some((group) => group.sourceId === line.group!.id)) {
      groupOrder.push({ sourceId: line.group.id, name: line.group.name, position: line.group.position, seen });
    }
  });
  groupOrder.sort((a, b) => a.position - b.position || a.seen - b.seen);

  return assemble(order, groupOrder, (line, basketIndex) => {
    const index = matchOf.get(line.key);
    if (index === undefined) return { groupSourceId: null, rank: quote.length + basketIndex };
    return { groupSourceId: quote[index]!.group?.id ?? null, rank: index };
  });
}

/** An administrator's grouping applied to the placed lines (FR-061). */
export function adminLayout(order: readonly OrderLineForCarry[], grouping: OrderLineGroupingInput): OrderLineLayout {
  const groupOrder = grouping.groups.map((group) => ({ sourceId: group.key, name: group.name }));
  const requestSize = Math.max(0, ...[...grouping.lines.values()].map((line) => line.index + 1));
  return assemble(order, groupOrder, (line, basketIndex) => {
    const requested = grouping.lines.get(orderLineGroupingKey(line.productId, line.variantId));
    if (!requested) return { groupSourceId: null, rank: requestSize + basketIndex };
    return { groupSourceId: requested.groupKey, rank: requested.index };
  });
}

/**
 * Read an administrator's creation request into a {@link OrderLineGroupingInput}
 * and find the lines the basket could not honour: one product and variant on
 * lines of two different groups (FR-062). The basket merges such lines into one,
 * so the request is refused, each conflicting line named by its index.
 */
export function planAdminLineGrouping(
  groups: readonly { key: string; name: string }[],
  items: readonly { productId: string; variantId?: string | null | undefined; groupKey?: string | null | undefined }[],
): { grouping: OrderLineGroupingInput; conflicts: Array<{ index: number; productId: string }> } {
  const lines = new Map<string, { groupKey: string | null; index: number }>();
  const conflicts: Array<{ index: number; productId: string }> = [];
  items.forEach((item, index) => {
    const key = orderLineGroupingKey(item.productId, item.variantId);
    const groupKey = item.groupKey ?? null;
    const first = lines.get(key);
    if (!first) {
      lines.set(key, { groupKey, index });
    } else if (first.groupKey !== groupKey) {
      conflicts.push({ index, productId: item.productId });
    }
  });
  return { grouping: { groups: groups.map(({ key, name }) => ({ key, name })), lines }, conflicts };
}

/** The layout's shape — `stateAfter.groups` of the `order.place_on_behalf` audit entry (FR-081). */
export function layoutShape(layout: OrderLineLayout): Array<{ name: string; lineCount: number }> {
  const lines = [...layout.lines.values()];
  return layout.groups.map((group) => ({
    name: group.name,
    lineCount: lines.filter((line) => line.groupSourceId === group.sourceId).length,
  }));
}
