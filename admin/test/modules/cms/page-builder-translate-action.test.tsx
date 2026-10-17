import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resolveAllData, type Data } from '@puckeditor/core';
import type {
  CmsPageBuilderTranslateRequest,
  CmsPageBuilderTranslateResponse,
  CmsPageBuilderTranslationCapability,
} from '@endora-commerce/contracts';
import { defaultPageBuilderConfig } from '@endora-commerce/cms-components';
import { ApiError } from '@endora-commerce/admin-kit/lib';
import { passthroughBundle, renderWithI18n } from '../../helpers/render-with-i18n';
import {
  PageBuilderTranslateAction,
  translationScopeOf,
  type PageBuilderTranslateActionProps,
  type TranslationScopeState,
} from '../../../../packages/modules/cms/src/admin/components/PageBuilderTranslateAction';
import {
  TranslationNotice,
  useTranslationNotice,
} from '../../../../packages/modules/cms/src/admin/components/TranslationNotice';

/**
 * Feature 151 — the Translate action (`contracts/admin-surfaces.md` §2, §3,
 * §3a): render matrix, request, scope, source tab, cancel, failure, and the
 * notice with *Restore previous content*. Keys resolve to themselves so the
 * assertions name the copy they expect; a hard-coded string would show up as
 * text that is not a key.
 */

const KEYS = [
  'button', 'title', 'target', 'sourceLabel', 'sourceCurrent', 'sourceLanguage', 'provider',
  'replaceWarning', 'confirm', 'cancel', 'running', 'success', 'untranslated', 'untranslatable',
  'widened', 'restore', 'dismiss', 'nothing', 'notConfigured', 'unavailable', 'selectionNotTranslatable',
  'scope.canvas', 'scope.component', 'scope.text', 'scopeDescription.canvas', 'scopeDescription.component',
  'scopeDescription.text', 'failed',
].map((key) => `pageBuilder.translate.${key}`);
const BUNDLE = passthroughBundle('cms', KEYS);

const READY: CmsPageBuilderTranslationCapability = {
  status: 'ready',
  provider: 'anthropic',
  model: 'claude-test',
  maxCharacters: 40000,
};

const canvas = (text = 'Witaj'): Data => ({
  root: { props: {} },
  content: [{ type: 'cms.Heading', props: { id: 'h1', text } }],
});

const response = (over: Partial<CmsPageBuilderTranslateResponse['report']> = {}): CmsPageBuilderTranslateResponse => ({
  data: canvas('Welcome') as CmsPageBuilderTranslateResponse['data'],
  report: {
    translatedSegments: 1,
    untranslatedSegments: 0,
    untranslatableBlocks: [],
    characters: 5,
    provider: 'anthropic',
    model: 'claude-test',
    sourceLanguage: null,
    scope: { kind: 'canvas', widened: false },
    ...over,
  },
});

function renderAction(over: Partial<PageBuilderTranslateActionProps> = {}) {
  const props: PageBuilderTranslateActionProps = {
    capability: READY,
    activeLanguage: 'en-US',
    languages: ['pl-PL', 'en-US'],
    currentData: canvas(),
    scope: { kind: 'canvas' },
    resource: { type: 'cms_page', id: '0b7c3a2e-5b0a-4c55-9d43-7d6c1f8a1e11' },
    onTranslated: vi.fn(),
    onNothingToTranslate: vi.fn(),
    translate: vi.fn(async () => response()),
    ...over,
  };
  renderWithI18n(<PageBuilderTranslateAction {...props} />, BUNDLE);
  return props;
}

describe('render matrix (§2)', () => {
  it('is absent when the function is switched off', () => {
    renderAction({ capability: { status: 'disabled', maxCharacters: 40000 } });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    ['not_configured', 'pageBuilder.translate.notConfigured'],
    ['unavailable', 'pageBuilder.translate.unavailable'],
  ] as const)('is disabled with a reason when %s', (status, reason) => {
    renderAction({ capability: { status, maxCharacters: 40000 } });
    const button = screen.getByRole('button', { name: 'pageBuilder.translate.scope.canvas' });
    expect(button).toHaveProperty('disabled', true);
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(reason);
  });

  it('is disabled with "nothing to translate" for an empty canvas with no other tab', () => {
    renderAction({ currentData: { root: { props: {} }, content: [] }, languages: ['en-US'] });
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
    expect(screen.getByText('pageBuilder.translate.nothing')).toBeTruthy();
  });

  it('names its scope', () => {
    const scopes: Array<[TranslationScopeState, string]> = [
      [{ kind: 'canvas' }, 'pageBuilder.translate.scope.canvas'],
      [{ kind: 'component', componentId: 'h1', blocked: false }, 'pageBuilder.translate.scope.component'],
      [{ kind: 'text', componentId: 'h1', selectedText: 'Wit' }, 'pageBuilder.translate.scope.text'],
    ];
    for (const [scope, label] of scopes) {
      const { unmount } = renderWithI18n(
        <PageBuilderTranslateAction
          capability={READY}
          activeLanguage="en-US"
          languages={['en-US']}
          currentData={canvas()}
          scope={scope}
          onTranslated={vi.fn()}
          onNothingToTranslate={vi.fn()}
        />,
        BUNDLE,
      );
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
      unmount();
    }
  });

  it('is disabled for a selected block that cannot be translated', () => {
    renderAction({ scope: { kind: 'component', componentId: 'sp', blocked: true } });
    const button = screen.getByRole('button', { name: 'pageBuilder.translate.scope.component' });
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByText('pageBuilder.translate.selectionNotTranslatable')).toBeTruthy();
  });
});

describe('translating (US1, US3, US6)', () => {
  it('names target, provider and model, and sends the current tab with no source language', async () => {
    const props = renderAction();
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.scope.canvas' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('pageBuilder.translate.provider')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' }));
    await waitFor(() => expect(props.onTranslated).toHaveBeenCalled());
    const [body] = (props.translate as ReturnType<typeof vi.fn>).mock.calls[0] as [CmsPageBuilderTranslateRequest];
    expect(body).toEqual({
      targetLanguage: 'en-US',
      sourceLanguage: null,
      context: 'cms',
      data: canvas(),
      resource: props.resource,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers the other tabs as a source, warns about replacing, and sends that tab with its language', async () => {
    const resolve = vi.fn(async () => canvas('Treść polska'));
    const props = renderAction({ onResolveLanguageContent: resolve });
    await userEvent.click(screen.getByRole('button'));
    const select = screen.getByLabelText('pageBuilder.translate.sourceLabel');
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(['__current__', 'pl-PL']);
    expect(screen.queryByText('pageBuilder.translate.replaceWarning')).toBeNull();
    await userEvent.selectOptions(select, 'pl-PL');
    expect(screen.getByText('pageBuilder.translate.replaceWarning')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' }));
    await waitFor(() => expect(props.onTranslated).toHaveBeenCalled());
    const [body] = (props.translate as ReturnType<typeof vi.fn>).mock.calls[0] as [CmsPageBuilderTranslateRequest];
    expect(body.sourceLanguage).toBe('pl-PL');
    expect(body.data).toEqual(canvas('Treść polska'));
    expect(resolve).toHaveBeenCalledWith('pl-PL');
  });

  it('tells the editor an empty source tab has nothing to translate, and sends nothing', async () => {
    const props = renderAction({ onResolveLanguageContent: async () => ({ root: { props: {} }, content: [] }) });
    await userEvent.click(screen.getByRole('button'));
    await userEvent.selectOptions(screen.getByLabelText('pageBuilder.translate.sourceLabel'), 'pl-PL');
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'pageBuilder.translate.nothing');
    expect(props.translate).not.toHaveBeenCalled();
  });

  it('sends the selection scope and offers no source choice for it', async () => {
    const props = renderAction({ scope: { kind: 'text', componentId: 'h1', selectedText: 'Wit' } });
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.scope.text' }));
    expect(screen.queryByLabelText('pageBuilder.translate.sourceLabel')).toBeNull();
    expect(screen.getByText('pageBuilder.translate.scopeDescription.text')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' }));
    await waitFor(() => expect(props.translate).toHaveBeenCalled());
    const [body] = (props.translate as ReturnType<typeof vi.fn>).mock.calls[0] as [CmsPageBuilderTranslateRequest];
    expect(body.scope).toEqual({ kind: 'text', componentId: 'h1', selectedText: 'Wit' });
  });

  it('sends a component scope', async () => {
    const props = renderAction({ scope: { kind: 'component', componentId: 'row', blocked: false } });
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' }));
    await waitFor(() => expect(props.translate).toHaveBeenCalled());
    expect(((props.translate as ReturnType<typeof vi.fn>).mock.calls[0] as [CmsPageBuilderTranslateRequest])[0].scope).toEqual({
      kind: 'component',
      componentId: 'row',
    });
  });

  it('shows the running state and cancels: the request is aborted and nothing is applied', async () => {
    let seen: AbortSignal | null = null;
    const props = renderAction({
      translate: (_body, signal) => {
        seen = signal;
        return new Promise(() => {});
      },
    });
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' }));
    expect(await screen.findByText('pageBuilder.translate.running')).toBeTruthy();
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.cancel' }));
    expect(seen!.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(props.onTranslated).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the server message on failure, ready to retry', async () => {
    const props = renderAction({
      translate: async () => {
        throw new ApiError(502, {
          error: { code: 'CMS_TRANSLATION_PROVIDER_FAILED', message: 'Provider rejected the credentials.' },
        } as never);
      },
    });
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Provider rejected the credentials.');
    expect(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' })).toHaveProperty('disabled', false);
    expect(props.onTranslated).not.toHaveBeenCalled();
  });

  it('reports "nothing to translate" instead of applying an empty result', async () => {
    const props = renderAction({ translate: async () => response({ translatedSegments: 0, untranslatedSegments: 0 }) });
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.confirm' }));
    await waitFor(() => expect(props.onNothingToTranslate).toHaveBeenCalled());
    expect(props.onTranslated).not.toHaveBeenCalled();
  });
});

describe('translationScopeOf (research R22)', () => {
  const declarationOf = (type: string) =>
    type === 'cms.Heading' ? [{ path: 'text' }] : type === 'cms.Spacer' || type === 'cms.Row' ? [] : undefined;

  it('prefers a text selection, then the selected block, then the canvas', () => {
    const selected = { id: 'h1', type: 'cms.Heading', props: { id: 'h1' } };
    expect(translationScopeOf({ textSelection: { text: 'Wit', componentId: null }, selected, declarationOf })).toEqual({
      kind: 'text',
      componentId: 'h1',
      selectedText: 'Wit',
    });
    expect(translationScopeOf({ textSelection: null, selected, declarationOf })).toEqual({
      kind: 'component',
      componentId: 'h1',
      blocked: false,
    });
    expect(translationScopeOf({ textSelection: { text: '  ', componentId: null }, selected: null, declarationOf })).toEqual({
      kind: 'canvas',
    });
  });

  it('blocks a selected block with nothing translatable, but not a container with children', () => {
    const spacer = { id: 's', type: 'cms.Spacer', props: { id: 's' } };
    const widget = { id: 'w', type: 'acme.Widget', props: { id: 'w' } };
    const row = { id: 'r', type: 'cms.Row', props: { id: 'r', content: [{ type: 'cms.Heading', props: { id: 'x' } }] } };
    expect(translationScopeOf({ textSelection: null, selected: spacer, declarationOf })).toMatchObject({ blocked: true });
    expect(translationScopeOf({ textSelection: null, selected: widget, declarationOf })).toMatchObject({ blocked: true });
    expect(translationScopeOf({ textSelection: null, selected: row, declarationOf })).toMatchObject({ blocked: false });
  });
});

describe('the notice and Restore previous content (US4)', () => {
  const previous = canvas('Przed tłumaczeniem');

  it('counts, warns about widening and restores the exact previous canvas', async () => {
    const onRestore = vi.fn();
    renderWithI18n(
      <TranslationNotice
        notice={{
          kind: 'translated',
          language: 'en-US',
          previous,
          report: response({ untranslatedSegments: 2, untranslatableBlocks: [{ name: 'acme.Widget', count: 3 }], scope: { kind: 'text', widened: true } }).report,
        }}
        onRestore={onRestore}
        onDismiss={vi.fn()}
      />,
      BUNDLE,
    );
    expect(screen.getByRole('status').textContent).toContain('pageBuilder.translate.success');
    expect(screen.getByText('pageBuilder.translate.untranslated')).toBeTruthy();
    expect(screen.getByText('pageBuilder.translate.untranslatable')).toBeTruthy();
    expect(screen.getByText('pageBuilder.translate.widened')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'pageBuilder.translate.restore' }));
    expect(onRestore).toHaveBeenCalledWith(previous);
  });

  it('is gone after a save or a tab change, and replaced by the next translation', () => {
    const { result, rerender } = renderHook(
      ({ key, version }: { key: string; version: number }) => useTranslationNotice(key, version),
      { initialProps: { key: 'p:en-US', version: 1 } },
    );
    act(() => result.current[1]({ kind: 'translated', language: 'en-US', previous, report: response().report }));
    expect(result.current[0]).not.toBeNull();
    rerender({ key: 'p:en-US', version: 2 });
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]({ kind: 'nothing' }));
    rerender({ key: 'p:pl-PL', version: 2 });
    expect(result.current[0]).toBeNull();
  });
});

describe('applying a result (research R6)', () => {
  it('regenerates derived rich-text html from the translated TipTap through resolveAllData', async () => {
    const translated: Data = {
      root: { props: {} },
      content: [
        {
          type: 'cms.RichContent',
          props: {
            id: 'rc',
            content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Translated' }] }] },
            html: '<p>Przetłumaczone</p>',
          },
        },
      ],
    };
    const resolved = await resolveAllData(translated, defaultPageBuilderConfig);
    const html = String((resolved.content[0]!.props as { html: string }).html);
    expect(html).toContain('Translated');
    expect(html).not.toContain('Przetłumaczone');
  });
});
