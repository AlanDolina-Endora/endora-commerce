import { ERROR_CODES, type DocumentTemplateChoices, type DocumentTemplateContent } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';

/**
 * Which layout a document is produced from
 * (`specs/152-compare-pdf-template/contracts/document-type-registry.md` §4).
 *
 * The resolver answers an **ordered list of candidates** and leaves "does this
 * candidate place anything printable" to the renderer, which alone knows the
 * type's palette and which block owners are present (FR-031's "a layout
 * placing nothing printable counts as absent"):
 *
 *  1. an explicitly named template, for a type that allows per-document
 *     selection — global or of the document's channel, else refused (FR-037,
 *     FR-038); a named template that no longer exists falls through and the
 *     outcome says so (FR-039);
 *  2. the default of the document's channel (never when the channel is
 *     unresolved — a `null` channel matches no channel row, Constitution XII);
 *  3. the default for all channels;
 *  4. the type's built-in layout.
 *
 * The defaults are read in **one** query and each candidate is the row object
 * as read, so a document is produced from one version of a template in full
 * (FR-034).
 */

export interface TemplateRow {
  readonly id: string;
  /** Read where a selection list needs it (feature 153); the resolver ignores it. */
  readonly name?: string;
  readonly documentType: string;
  readonly salesChannelId: string | null;
  readonly isDefault: boolean;
  readonly version: number;
  readonly content: { readonly schemaVersion: 1; readonly languages: Readonly<Record<string, unknown>> };
}

export interface TemplateReader {
  /** The defaults of a type for a channel and for all channels — one query. */
  findDefaults(documentType: string, salesChannelId: string | null): Promise<readonly TemplateRow[]>;
  findById(id: string): Promise<TemplateRow | null>;
  /** Every template of a type whose scope is all channels or this channel — one query (feature 153). */
  findApplicable(documentType: string, salesChannelId: string | null): Promise<readonly TemplateRow[]>;
}

export interface LayoutCandidate {
  readonly source: 'explicit' | 'default' | 'built_in';
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  /** The tree language actually used. */
  readonly language: string;
  readonly tree: unknown;
}

export interface ResolvedLayouts {
  readonly candidates: readonly LayoutCandidate[];
  readonly requestedTemplateMissing: boolean;
}

/**
 * The language of a content envelope to use for a wanted language: exact, then
 * one with the same primary subtag, then `en-US`, then `en`, then the first
 * (FR-032). For an invoice's `pl-PL`-only content this is today's exact-or-first.
 */
export function pickLanguage(languages: Readonly<Record<string, unknown>>, wanted: string): string | null {
  const keys = Object.keys(languages);
  if (keys.length === 0) return null;
  if (keys.includes(wanted)) return wanted;
  const primary = wanted.split('-')[0]?.toLowerCase() ?? wanted;
  const sameBase = keys.find((key) => key.split('-')[0]?.toLowerCase() === primary);
  if (sameBase) return sameBase;
  if (keys.includes('en-US')) return 'en-US';
  if (keys.includes('en')) return 'en';
  return keys[0] ?? null;
}

function candidateOf(
  source: LayoutCandidate['source'],
  content: { readonly languages: Readonly<Record<string, unknown>> },
  wanted: string,
  row: TemplateRow | null,
): LayoutCandidate | null {
  const language = pickLanguage(content.languages, wanted);
  if (language === null) return null;
  return {
    source,
    templateId: row?.id ?? null,
    templateVersion: row?.version ?? null,
    language,
    tree: content.languages[language],
  };
}

export class TemplateResolver {
  constructor(private readonly reader: TemplateReader) {}

  /**
   * The selection list for one document (153 contract §5): global templates
   * and those of the document's channel — channel first, then global, each by
   * name — and the default a document without a choice would use. It names the
   * default row; it does not apply the "renders nothing" fall-through.
   */
  async listChoices(input: {
    readonly documentType: string;
    readonly salesChannelId: string | null;
    readonly builtIn: DocumentTemplateContent;
  }): Promise<DocumentTemplateChoices> {
    const rows = (await this.reader.findApplicable(input.documentType, input.salesChannelId)).filter(
      (row) =>
        row.documentType === input.documentType &&
        (row.salesChannelId === null || (input.salesChannelId !== null && row.salesChannelId === input.salesChannelId)),
    );
    const byName = (a: TemplateRow, b: TemplateRow): number =>
      (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id);
    const ofChannel = rows.filter((row) => row.salesChannelId !== null).sort(byName);
    const global = rows.filter((row) => row.salesChannelId === null).sort(byName);
    const channelDefault = ofChannel.find((row) => row.isDefault);
    const globalDefault = global.find((row) => row.isDefault);
    return {
      templates: [...ofChannel, ...global].map((row) => ({
        id: row.id,
        name: row.name ?? '',
        salesChannelId: row.salesChannelId,
        languages: Object.keys(row.content.languages),
        isDefault: row.isDefault,
      })),
      effectiveDefaultId: channelDefault?.id ?? globalDefault?.id ?? null,
      builtInLanguages: Object.keys(input.builtIn.languages),
    };
  }

  async resolve(input: {
    readonly documentType: string;
    readonly salesChannelId: string | null;
    readonly language: string;
    readonly selection: 'default_only' | 'per_document';
    readonly builtIn: DocumentTemplateContent;
    readonly templateId?: string;
  }): Promise<ResolvedLayouts> {
    let requestedTemplateMissing = false;
    if (input.templateId !== undefined) {
      if (input.selection !== 'per_document') {
        throw new HttpError(
          422,
          ERROR_CODES.DOCUMENT_TEMPLATE_NOT_SELECTABLE,
          'This document type does not allow choosing a template for a single document.',
          { documentType: input.documentType },
        );
      }
      const chosen = await this.reader.findById(input.templateId);
      if (chosen) {
        const ofOtherChannel = chosen.salesChannelId !== null && chosen.salesChannelId !== input.salesChannelId;
        if (chosen.documentType !== input.documentType || ofOtherChannel) {
          throw new HttpError(
            422,
            ERROR_CODES.DOCUMENT_TEMPLATE_NOT_SELECTABLE,
            'The chosen template does not apply to this document.',
            { documentType: input.documentType, templateId: input.templateId },
          );
        }
        const explicit = candidateOf('explicit', chosen.content, input.language, chosen);
        if (explicit) return { candidates: [explicit], requestedTemplateMissing: false };
      } else {
        requestedTemplateMissing = true;
      }
    }

    const defaults = await this.reader.findDefaults(input.documentType, input.salesChannelId);
    const ofChannel =
      input.salesChannelId === null
        ? undefined
        : defaults.find((row) => row.isDefault && row.salesChannelId === input.salesChannelId);
    const global = defaults.find((row) => row.isDefault && row.salesChannelId === null);
    const candidates: LayoutCandidate[] = [];
    for (const row of [ofChannel, global]) {
      if (!row || row.documentType !== input.documentType) continue;
      const candidate = candidateOf('default', row.content, input.language, row);
      if (candidate) candidates.push(candidate);
    }
    const builtIn = candidateOf('built_in', input.builtIn, input.language, null);
    if (builtIn) candidates.push(builtIn);
    return { candidates, requestedTemplateMissing };
  }
}
