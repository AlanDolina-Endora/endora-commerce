import {
  DOCUMENT_TEMPLATE_LIMITS,
  ERROR_CODES,
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
    if (facts.palette.has(node.type)) continue;
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
