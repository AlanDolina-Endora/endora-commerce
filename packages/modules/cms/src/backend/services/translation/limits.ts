/**
 * Feature 151 (research R8) — the fixed bounds of one translation request. The
 * per-request **source** limit is not here: it is the operator setting
 * `cms.page_builder.translation.max_source_characters` (default and bounds in
 * `@endora-commerce/contracts`, `CMS_TRANSLATION_*`).
 */
export const MAX_CHUNK_CHARACTERS = 6_000;
export const MAX_CHUNK_SEGMENTS = 150;
export const CHUNK_CONCURRENCY = 2;
export const CALL_TIMEOUT_MS = 60_000;
export const MAX_OUTPUT_TOKENS = 8_192;
