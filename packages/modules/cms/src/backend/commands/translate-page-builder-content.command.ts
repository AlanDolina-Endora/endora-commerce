import { randomUUID } from 'node:crypto';
import type { Command } from '@endora-commerce/platform/commands';

/**
 * Feature 151 (research R13, `data-model.md` §5) — the audit entry of one
 * translation that sent content to a model provider.
 *
 * Audit-only: the translation writes no domain record (the editor saves the
 * result through the content's own audited write), so this Command's
 * transaction holds the audit insert and nothing else. It is the data-egress
 * trail — it records **who sent what kind of content where**, and never the
 * text, the prompt, the credential code or a key. Not reversible.
 */
export interface TranslationAuditInput {
  resource: { type: string; id: string | null } | undefined;
  targetLanguage: string;
  sourceLanguage: string | null;
  provider: string;
  model: string;
  segments: number;
  characters: number;
  translatedSegments: number;
  untranslatedSegments: number;
  outcome: 'completed' | 'partial' | 'failed';
  failure?: string | undefined;
  /** The source-character limit in effect for this request. */
  limit: number;
  scope: 'canvas' | 'component' | 'text';
  /** The selected block's type, for a component or text scope. */
  componentType?: string | undefined;
}

export const TRANSLATE_PAGE_BUILDER_CONTENT_ACTION = 'cms.page_builder.translate';

export function translatePageBuilderContentCommand(input: TranslationAuditInput): Command<void> {
  return {
    action: TRANSLATE_PAGE_BUILDER_CONTENT_ACTION,
    objectType: input.resource?.type ?? 'page_builder_canvas',
    // A canvas that is not (yet) a saved record has no id; the entry then
    // carries an operation id, which is what `objectId` means for a command
    // with no persisted subject.
    objectId: input.resource?.id ?? randomUUID(),
    run: async () => ({
      result: undefined,
      before: null,
      after: {
        targetLanguage: input.targetLanguage,
        sourceLanguage: input.sourceLanguage,
        provider: input.provider,
        model: input.model,
        segments: input.segments,
        characters: input.characters,
        translatedSegments: input.translatedSegments,
        untranslatedSegments: input.untranslatedSegments,
        outcome: input.outcome,
        ...(input.failure !== undefined ? { failure: input.failure } : {}),
        limit: input.limit,
        scope: input.scope,
        ...(input.componentType !== undefined ? { componentType: input.componentType } : {}),
      },
    }),
  };
}
