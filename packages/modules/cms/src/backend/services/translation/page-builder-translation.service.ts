import {
  ERROR_CODES,
  type CmsPageBuilderTranslateRequest,
  type CmsPageBuilderTranslateResponse,
  type CmsPageBuilderTranslationCapability,
} from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import { HttpError } from '@endora-commerce/platform/http';
import {
  translatePageBuilderContentCommand,
  type TranslationAuditInput,
} from '../../commands/translate-page-builder-content.command.js';
import { capabilityOf, type TranslationConfig } from './capability.js';
import { SelectionNotFoundError, type Declarations } from './extract.js';
import {
  TranslationProviderFailedError,
  TranslationTooLargeError,
  translateCanvas,
} from './translation.service.js';

/**
 * Feature 151 — what the two admin routes call. It turns the configuration
 * state and the core's outcomes into the HTTP answers of
 * `contracts/page-builder-translation-api.md`, and records the audit entry of
 * every request that sent content to a provider (FR-031) — completed, partial
 * or failed — and of no other.
 */
export class PageBuilderTranslationService {
  constructor(
    private readonly deps: {
      config: () => Promise<TranslationConfig>;
      declarations: Declarations;
      commandBus: Pick<CommandBus, 'run'>;
    },
  ) {}

  async capability(): Promise<CmsPageBuilderTranslationCapability> {
    return capabilityOf(await this.deps.config());
  }

  /** The `409` of a function that is switched off, unavailable or not configured. */
  private refuse(status: 'disabled' | 'not_configured' | 'unavailable'): never {
    if (status === 'disabled') {
      throw new HttpError(409, ERROR_CODES.CMS_TRANSLATION_DISABLED, 'Page Builder translation is switched off.');
    }
    if (status === 'unavailable') {
      throw new HttpError(
        409,
        ERROR_CODES.CMS_TRANSLATION_UNAVAILABLE,
        'Translation is unavailable because the Credentials module is switched off.',
      );
    }
    throw new HttpError(
      409,
      ERROR_CODES.CMS_TRANSLATION_NOT_CONFIGURED,
      'No translation model is configured for the Page Builder.',
    );
  }

  async translate(request: CmsPageBuilderTranslateRequest): Promise<CmsPageBuilderTranslateResponse> {
    const resolved = await this.deps.config();
    if (resolved.status !== 'ready') this.refuse(resolved.status);
    const config = resolved as Extract<TranslationConfig, { status: 'ready' }>;
    const audit = (entry: Omit<TranslationAuditInput, 'resource' | 'targetLanguage' | 'sourceLanguage' | 'provider' | 'model' | 'limit'>) =>
      this.deps.commandBus.run(
        translatePageBuilderContentCommand({
          resource: request.resource,
          targetLanguage: request.targetLanguage,
          sourceLanguage: request.sourceLanguage,
          provider: config.provider,
          model: config.model,
          limit: config.maxCharacters,
          ...entry,
        }),
      );

    let result;
    try {
      result = await translateCanvas(
        {
          data: request.data,
          targetLanguage: request.targetLanguage,
          sourceLanguage: request.sourceLanguage,
          scope: request.scope,
        },
        {
          declarations: this.deps.declarations,
          maxCharacters: config.maxCharacters,
          model: { adapter: config.adapter, provider: config.provider, model: config.model },
        },
      );
    } catch (error) {
      if (error instanceof SelectionNotFoundError) {
        throw new HttpError(
          422,
          ERROR_CODES.CMS_TRANSLATION_SELECTION_NOT_FOUND,
          'The selected text could not be found. Select it again and retry.',
          { selection: error.what },
        );
      }
      if (error instanceof TranslationTooLargeError) {
        throw new HttpError(
          413,
          ERROR_CODES.CMS_TRANSLATION_TOO_LARGE,
          `The content is too large to translate at once: ${error.characters} characters, the limit is ${error.limit}.`,
          { limit: error.limit, characters: error.characters },
        );
      }
      if (error instanceof TranslationProviderFailedError) {
        await audit({
          segments: error.sent.segments,
          characters: error.sent.characters,
          translatedSegments: 0,
          untranslatedSegments: 0,
          outcome: 'failed',
          failure: error.token,
          scope: error.scope.kind,
          componentType: error.scope.componentType,
        });
        throw new HttpError(
          502,
          ERROR_CODES.CMS_TRANSLATION_PROVIDER_FAILED,
          'The translation model could not complete the translation.',
          { code: error.token },
        );
      }
      throw error;
    }

    if (result.sent !== null && result.outcome !== null) {
      await audit({
        segments: result.sent.segments,
        characters: result.sent.characters,
        translatedSegments: result.report.translatedSegments,
        untranslatedSegments: result.report.untranslatedSegments,
        outcome: result.outcome,
        scope: result.report.scope.kind,
        componentType: result.componentType,
      });
    }
    return { data: result.data as CmsPageBuilderTranslateResponse['data'], report: result.report };
  }
}
