/**
 * The agreed-price prefill queue of **Create quote request** (feature 145,
 * research R-11).
 *
 * Each line asks one question — "what does this customer pay for this product at
 * this quantity?" — and the answer is applied only while it is still the line's
 * question. Asking again for a product supersedes the earlier question, and
 * `forget` (the line was removed) drops it; a superseded or dropped answer is
 * discarded whenever it arrives, so the order in which answers come back does
 * not matter. Staleness is decided by the identity of the request, not by its
 * key: a line removed and added back with the same quantity and customer is a
 * new question, and the answer to the old one must not land on it.
 *
 * At most `maxInFlight` questions are asked at once, so a 200-product add does
 * not fire 200 simultaneous requests. A question superseded while still waiting
 * is never sent.
 *
 * Pure on purpose: the page injects `fetch` (over
 * `GET /api/v1/admin/products/:id/resolved-price`) and `onResult` (which must
 * itself refuse to overwrite a hand-typed price — the operator may type one
 * while its question is in flight).
 */

export const PRICE_PREFILL_MAX_IN_FLIGHT = 4;

export interface PricePrefillRequest {
  productId: string;
  quantity: number;
  customerId: string;
  organizationId: string;
}

export interface PricePrefillQueueOptions {
  /** The resolved amount, or `null` when no price resolves. A rejection counts as `null`. */
  fetch: (request: PricePrefillRequest) => Promise<string | null>;
  /** Called with the answer to a line's current question only. */
  onResult: (productId: string, amount: string | null) => void;
  maxInFlight?: number | undefined;
}

export interface PricePrefillQueue {
  /** Ask (again) for a product's price; supersedes any earlier question for it. */
  request: (request: PricePrefillRequest) => void;
  /** The product's line is gone: its question, waiting or in flight, is dropped. */
  forget: (productId: string) => void;
  /** Stop: nothing waiting is sent and no answer is applied. */
  dispose: () => void;
}

interface Ticket {
  request: PricePrefillRequest;
}

export function createPricePrefillQueue(options: PricePrefillQueueOptions): PricePrefillQueue {
  const maxInFlight = options.maxInFlight ?? PRICE_PREFILL_MAX_IN_FLIGHT;
  /** The current question per product — the only one whose answer is applied. */
  const latest = new Map<string, Ticket>();
  const waiting: Ticket[] = [];
  let inFlight = 0;
  let disposed = false;

  const isCurrent = (ticket: Ticket): boolean => latest.get(ticket.request.productId) === ticket;

  const settle = (ticket: Ticket, amount: string | null): void => {
    inFlight -= 1;
    if (!disposed && isCurrent(ticket)) {
      latest.delete(ticket.request.productId);
      options.onResult(ticket.request.productId, amount);
    }
    pump();
  };

  function pump(): void {
    while (!disposed && inFlight < maxInFlight && waiting.length > 0) {
      const ticket = waiting.shift()!;
      if (!isCurrent(ticket)) continue;
      inFlight += 1;
      options.fetch(ticket.request).then(
        (amount) => settle(ticket, amount),
        () => settle(ticket, null),
      );
    }
  }

  return {
    request(request) {
      if (disposed) return;
      const ticket: Ticket = { request: { ...request } };
      latest.set(request.productId, ticket);
      waiting.push(ticket);
      pump();
    },
    forget(productId) {
      latest.delete(productId);
    },
    dispose() {
      disposed = true;
      latest.clear();
      waiting.length = 0;
    },
  };
}
