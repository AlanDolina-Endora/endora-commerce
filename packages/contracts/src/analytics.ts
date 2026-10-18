import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

/**
 * Analytics event contracts (US10 / FR-110, FR-111).
 *
 * Storefront and admin emit a small, fixed set of event types into the
 * platform; backend persists them and exposes aggregated read paths for the
 * admin dashboard. Forwarding to an external analytics tool (e.g. GA4) is
 * a separate config-flagged path that consumes the same events.
 */

export const analyticsEventTypeSchema = z.enum([
  'product.viewed',
  'product.added_to_cart',
  'cart.abandoned',
  'order.placed',
  'search.performed',
  'filter.clicked',
  'category.viewed',
]);
export type AnalyticsEventType = z.infer<typeof analyticsEventTypeSchema>;

/**
 * A single inbound analytics event. The shape is intentionally permissive
 * inside `properties` — the storefront chooses what to send per event type.
 *
 * `salesChannelId`, `customerAccountId` and `organizationId` are accepted so
 * existing senders keep validating, but the server ignores them: a stored event
 * carries the channel the request resolved to and the identity of the signed-in
 * customer, if any.
 */
export const ingestAnalyticsEventSchema = z.object({
  type: analyticsEventTypeSchema,
  occurredAt: isoDateTimeSchema.optional(),
  /** @deprecated Ignored; the server uses the resolved request channel. */
  salesChannelId: uuidSchema.optional(),
  /** @deprecated Ignored; the server uses the signed-in customer, if any. */
  customerAccountId: uuidSchema.optional(),
  /** @deprecated Ignored; the server uses the signed-in customer's organization, if any. */
  organizationId: uuidSchema.optional(),
  sessionId: z.string().min(1).max(64).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});
export type IngestAnalyticsEvent = z.infer<typeof ingestAnalyticsEventSchema>;

/**
 * Storefront sends events in batches to amortise HTTP overhead.
 */
export const ingestAnalyticsBatchRequestSchema = z.object({
  events: z.array(ingestAnalyticsEventSchema).min(1).max(100),
});
export type IngestAnalyticsBatchRequest = z.infer<typeof ingestAnalyticsBatchRequestSchema>;

export const ingestAnalyticsBatchResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        reason: z.string(),
      }),
    )
    .default([]),
});
export type IngestAnalyticsBatchResponse = z.infer<typeof ingestAnalyticsBatchResponseSchema>;

/**
 * Admin aggregation read paths.
 */
export const analyticsSummaryQuerySchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  salesChannelId: uuidSchema.optional(),
});
export type AnalyticsSummaryQuery = z.infer<typeof analyticsSummaryQuerySchema>;

export const analyticsDailyPointSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  type: analyticsEventTypeSchema,
  count: z.number().int().nonnegative(),
});

export const analyticsSummaryResponseSchema = z.object({
  totalsByType: z.array(
    z.object({
      type: analyticsEventTypeSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  daily: z.array(analyticsDailyPointSchema),
});
export type AnalyticsSummaryResponse = z.infer<typeof analyticsSummaryResponseSchema>;
