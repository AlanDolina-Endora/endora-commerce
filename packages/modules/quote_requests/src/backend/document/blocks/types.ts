import type { DocumentBlockRenderer, QuoteRequestDocumentData } from '@endora-commerce/contracts';

/** A block of the *Quote request* document — it reads only the quote's document data. */
export type QuoteBlockRenderer = DocumentBlockRenderer<QuoteRequestDocumentData, undefined>;

/** A date of the quote in the PDF's language, or `''` when it has none. */
export function formatQuoteDate(iso: string | null, language: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date);
  }
}
