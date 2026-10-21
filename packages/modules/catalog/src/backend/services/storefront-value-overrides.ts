import type { EntityManager } from '@mikro-orm/postgresql';
import {
  SYSTEM_ATTRIBUTE_SCOPES,
  resolveAttribute,
  type AttributeScope,
  type OverrideRow,
} from '@endora-commerce/contracts';

import { loadOverridesByProduct } from './product-value-resolver.service.js';

/**
 * Issue #384 — what a storefront read needs to show a product's
 * per-(sales channel, language) overrides (features 022/023).
 *
 * **Only the override slots are taken from the resolver.** The fallback chain
 * is `resolveAttribute` in `@endora-commerce/contracts` — the one the admin
 * scope editor previews with and the search indexer indexes with — and this
 * file adds no second implementation of it. What it deliberately does *not*
 * take from the resolver is the baseline leg: the storefront reads have always
 * walked their own language fallback over the baseline JSONB (`preferred` →
 * the channel's default language → `en-US` → `en` → first key), which differs
 * from the resolver's (`languageCode` → primary language → first sorted key)
 * in its edges. Replacing it would change what every product *without* an
 * override shows, so an override answers here only when the resolver says a
 * channel slot produced the value, and the caller's existing baseline pick
 * answers otherwise.
 */

/** The request's resolution context, as the storefront reads hold it. */
export interface StorefrontOverrideContext {
  channelId: string;
  /**
   * The languages a (channel, language) override is looked up for, in order:
   * the `Accept-Language` pick, then the channel's default language — the
   * first two legs the baseline language pick walks, so an override answers
   * for exactly the language whose baseline text the page would otherwise
   * show. Empty when neither is known: only channel-only slots can answer.
   */
  languages: readonly string[];
}

/** The ordered, de-duplicated language legs for a request. */
export function overrideLanguages(
  preferredLanguage: string | undefined,
  channelDefaultLanguage: string | undefined,
): string[] {
  return [...new Set([preferredLanguage, channelDefaultLanguage])].filter(
    (l): l is string => typeof l === 'string' && l.length > 0,
  );
}

/**
 * Every override row the request's sales channel holds for a set of products,
 * in one statement, bucketed by product id. Rows are independent of the
 * viewer, so one fetch serves a whole read section. The one read of the table
 * is `loadOverridesByProduct` in the resolver service; this narrows it to the
 * channel.
 */
export function loadChannelOverridesByProduct(
  em: EntityManager,
  productIds: readonly string[],
  channelId: string,
): Promise<Map<string, OverrideRow[]>> {
  return loadOverridesByProduct(em, { productIds, channelId });
}

/**
 * The override value for one attribute in this context, or `undefined` when no
 * channel slot applies and the caller's baseline should stand.
 *
 * The resolver takes one language and falls through to the channel-only slot
 * inside the same call, so each language leg is asked for its
 * (channel, language) slot alone, and the channel-only slot is asked last.
 */
export function channelOverrideFor(
  overrides: readonly OverrideRow[] | undefined,
  attributeKey: string,
  scope: AttributeScope,
  ctx: StorefrontOverrideContext,
): unknown {
  if (!overrides || overrides.length === 0) return undefined;
  const resolve = (languageCode: string | null) =>
    resolveAttribute({
      attributeKey,
      // No baseline: the baseline leg is the caller's (see the file comment).
      baseline: undefined,
      overrides,
      scope,
      ctx: {
        channelId: ctx.channelId,
        languageCode,
        // Unused: with no baseline, the resolver's primary-language leg cannot answer.
        primaryLanguage: languageCode ?? '',
      },
    });
  for (const languageCode of ctx.languages) {
    const resolved = resolve(languageCode);
    if (resolved.source === 'channel+language') return resolved.value;
  }
  const channelOnly = resolve(null);
  return channelOnly.source === 'channel' ? channelOnly.value : undefined;
}

/**
 * The effective Name or Description: the channel override when one applies
 * and is a non-empty string, else `baselineText` — the caller's existing
 * language pick over the baseline JSONB.
 */
export function effectiveSystemText(
  overrides: readonly OverrideRow[] | undefined,
  attributeKey: 'name' | 'description',
  ctx: StorefrontOverrideContext,
  baselineText: string,
): string {
  const v = channelOverrideFor(overrides, attributeKey, SYSTEM_ATTRIBUTE_SCOPES[attributeKey]!, ctx);
  return typeof v === 'string' && v.length > 0 ? v : baselineText;
}

/**
 * The product's `attributeValues` with every channel-scoped user attribute
 * replaced by its override for this context. Returns the input record itself
 * when no user-attribute override row exists, so a product without overrides
 * costs no attribute-metadata read and no copy.
 */
export async function effectiveAttributeValues(
  values: Record<string, unknown>,
  overrides: readonly OverrideRow[] | undefined,
  ctx: StorefrontOverrideContext,
  scopeOf: () => Promise<Map<string, AttributeScope>>,
): Promise<Record<string, unknown>> {
  const userRows = (overrides ?? []).filter(
    (o) => !Object.prototype.hasOwnProperty.call(SYSTEM_ATTRIBUTE_SCOPES, o.attributeKey),
  );
  if (userRows.length === 0) return values;
  const scopes = await scopeOf();
  const out: Record<string, unknown> = { ...values };
  for (const key of new Set(userRows.map((o) => o.attributeKey))) {
    const scope = scopes.get(key);
    if (!scope) continue;
    const v = channelOverrideFor(userRows, key, scope, ctx);
    if (v !== undefined) out[key] = v;
  }
  return out;
}
