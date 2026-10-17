import {
  DOCUMENT_TEMPLATE_LIMITS,
  ERROR_CODES,
  ITEMS_TABLE_BLOCK_NAME,
  ITEMS_TABLE_LIMITS,
  itemsTablePropsSchema,
  documentContentByteSize,
  documentLanguageRe,
  documentTemplateTreeSchema,
  type DocumentTemplateTree,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';

/**
 * Save-time validation of one language's tree
 * (`specs/152-compare-pdf-template/data-model.md` §3, FR-008, FR-019).
 *
 * Every refusal is `DOCUMENT_TEMPLATE_INVALID` (422) with `details` naming what
 * was wrong — the path and the limit, the offending block, or the language —
 * so the editor can select the block and say why.
 */

export interface PaletteFacts {
  /** The names this type offers (registry palette). */
  readonly palette: ReadonlySet<string>;
  /** Whether a present module declares this block name at all. */
  readonly isDeclared: (name: string) => boolean;
  /** The languages the type allows; `null` = any language code. */
  readonly languages: readonly string[] | null;
  /** The line collections the type declares (feature 153); absent = none. */
  readonly collections?: readonly string[];
}

/** Which named limit a too-long list of the Line items table broke. */
const ITEMS_TABLE_LIST_LIMITS: Readonly<Record<string, { limit: string; max: number }>> = {
  columns: { limit: 'maxColumns', max: ITEMS_TABLE_LIMITS.maxColumns },
  'detailRow.entries': { limit: 'maxDetailEntries', max: ITEMS_TABLE_LIMITS.maxDetailEntries },
  totals: { limit: 'maxTotals', max: ITEMS_TABLE_LIMITS.maxTotals },
};

/**
 * Feature 153 (FR-043) — a Line items table's settings, refused with the path
 * of the setting (`content.<i>.props.<…>`), the block, and the limit when one
 * was broken. A collection the type does not declare is refused; a field path
 * the catalogue does not offer is accepted (FR-037).
 */
function validateItemsTable(index: number, props: Readonly<Record<string, unknown>>, facts: PaletteFacts): void {
  const parsed = itemsTablePropsSchema.safeParse(props);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    const limit = issue?.code === 'too_big' ? ITEMS_TABLE_LIST_LIMITS[path] : undefined;
    throw invalid(issue?.message ?? 'The table settings are not valid.', {
      path: `content.${index}.props${path ? `.${path}` : ''}`,
      blockName: ITEMS_TABLE_BLOCK_NAME,
      ...(limit ?? {}),
    });
  }
  const declared = facts.collections ?? [];
  const wanted = parsed.data.collection ?? declared[0];
  if (wanted === undefined || !declared.includes(wanted)) {
    throw invalid('This table is bound to lines this document type does not have.', {
      path: `content.${index}.props.collection`,
      blockName: ITEMS_TABLE_BLOCK_NAME,
      collection: wanted ?? null,
    });
  }
}

function invalid(message: string, details: Record<string, unknown>): HttpError {
  return new HttpError(422, ERROR_CODES.DOCUMENT_TEMPLATE_INVALID, message, details);
}

export function assertLanguageAllowed(language: string, facts: Pick<PaletteFacts, 'languages'>): void {
  if (!documentLanguageRe.test(language)) {
    throw invalid('This is not a language code.', { language });
  }
  if (facts.languages !== null && !facts.languages.includes(language)) {
    throw invalid('Templates of this document type are not printed in this language.', {
      language,
      languages: facts.languages,
    });
  }
}

/**
 * The tree, parsed, or a refusal. A block a present module declares that this
 * document type does not offer is refused by name (FR-019); a name nobody
 * present declares — a block of an absent owner — is accepted and kept as
 * entered (FR-018).
 */
export function validateTree(tree: unknown, facts: PaletteFacts): DocumentTemplateTree {
  const parsed = documentTemplateTreeSchema.safeParse(tree);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const params = (issue as { params?: { limit?: string } } | undefined)?.params;
    throw invalid(issue?.message ?? 'The layout is not valid.', {
      path: issue?.path.join('.') ?? '',
      ...(params?.limit ? { limit: params.limit } : {}),
      ...(issue?.code === 'too_big' && issue.path.join('.') === 'content'
        ? { limit: 'maxNodesPerLanguage', max: DOCUMENT_TEMPLATE_LIMITS.maxNodesPerLanguage }
        : {}),
    });
  }
  for (const [index, node] of parsed.data.content.entries()) {
    if (facts.palette.has(node.type)) {
      if (node.type === ITEMS_TABLE_BLOCK_NAME) validateItemsTable(index, node.props, facts);
      continue;
    }
    if (facts.isDeclared(node.type)) {
      throw invalid('This block cannot be used in templates of this document type.', {
        path: `content.${index}`,
        blockName: node.type,
      });
    }
  }
  return parsed.data;
}

/** The limits a whole envelope is held to after one language changed. */
export function assertEnvelopeLimits(languages: Readonly<Record<string, unknown>>): void {
  const count = Object.keys(languages).length;
  if (count > DOCUMENT_TEMPLATE_LIMITS.maxLanguages) {
    throw invalid(`A template holds at most ${DOCUMENT_TEMPLATE_LIMITS.maxLanguages} languages.`, {
      path: 'languages',
      limit: 'maxLanguages',
    });
  }
  if (documentContentByteSize({ schemaVersion: 1, languages }) > DOCUMENT_TEMPLATE_LIMITS.maxContentBytes) {
    throw invalid(`A template's content may not exceed ${DOCUMENT_TEMPLATE_LIMITS.maxContentBytes / 1024} KiB.`, {
      path: '',
      limit: 'maxContentBytes',
    });
  }
}
