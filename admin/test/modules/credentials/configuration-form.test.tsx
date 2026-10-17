import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConfigurationTypeDescriptor } from '@endora-commerce/contracts';
import { passthroughBundle, renderWithI18n } from '../../helpers/render-with-i18n';
import { ConfigurationForm } from '../../../../packages/modules/credentials/src/admin/components/ConfigurationForm';
import { llmConfigurationType } from '../../../../packages/modules/credentials/src/backend/types/llm.type';

/**
 * Feature 151, FR-007 / research R21 — the credential form renders a
 * `format: 'url'` field as a URL input, and the OpenAI-compatible provider
 * marks its Base URL required.
 */
const BUNDLE = passthroughBundle('credentials', [
  'form.name',
  'form.code',
  'form.type',
  'form.provider',
  'form.secretSet',
  'form.secretUnset',
  'action.cancel',
  'action.save',
]);

const TYPES: ConfigurationTypeDescriptor[] = [llmConfigurationType];

function renderForm(onCreate = vi.fn(async () => undefined)) {
  renderWithI18n(
    <ConfigurationForm types={TYPES} onCreate={onCreate} onUpdate={vi.fn()} onCancel={vi.fn()} />,
    BUNDLE,
  );
  return onCreate;
}

describe('ConfigurationForm — Base URL', () => {
  it('renders the Base URL as a URL input with its placeholder', () => {
    renderForm();
    const input = document.getElementById('cred-field-baseUrl') as HTMLInputElement;
    expect(input.type).toBe('url');
    expect(input.inputMode).toBe('url');
    expect(input.placeholder).not.toBe('');
  });

  it('offers the OpenAI-compatible provider and marks its Base URL required', async () => {
    renderForm();
    const provider = screen.getByLabelText('form.provider');
    expect(screen.getByRole('option', { name: /OpenAI-compatible/ })).toBeTruthy();
    await userEvent.selectOptions(provider, 'openai_compatible');
    const label = document.querySelector('label[for="cred-field-baseUrl"]')!;
    expect(label.textContent).toContain('*');
  });

  it('submits the Base URL as typed', async () => {
    const onCreate = renderForm();
    await userEvent.selectOptions(screen.getByLabelText('form.provider'), 'openai_compatible');
    await userEvent.type(document.getElementById('cred-field-baseUrl')!, 'https://openrouter.ai/api/v1');
    await userEvent.click(screen.getByRole('button', { name: 'action.save' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCode: 'openai_compatible',
        values: expect.objectContaining({ baseUrl: 'https://openrouter.ai/api/v1' }),
      }),
    );
  });
});
