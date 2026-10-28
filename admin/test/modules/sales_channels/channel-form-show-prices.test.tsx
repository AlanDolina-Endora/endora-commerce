import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SalesChannelDetail } from '@endora-commerce/contracts';
import { renderWithI18n } from '../../helpers/render-with-i18n';
import { adminSession, modulePresence, renderWithSession } from '../../helpers/render-with-session';
import { expectNoAxeViolations } from '../../helpers/axe';

/**
 * Issue #467 — the operator's control for whether a channel shows prices
 * (`isPublic`). It had no control anywhere: a new channel was created with
 * prices hidden and the only way to show them was a direct SQL update.
 *
 * The form carries *Show prices* under *Open to anonymous visitors*, off for a
 * new channel (what every channel got before), with a hint that says what off
 * means — no prices for anyone on the channel, signed in or not, and no
 * *Add to cart*. The edit and create pages send the value in their bodies.
 */

vi.mock('@endora-commerce/admin-kit/lib', async () => {
  const actual = await vi.importActual<typeof import('@endora-commerce/admin-kit/lib')>(
    '@endora-commerce/admin-kit/lib',
  );
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      get: async (url: string) => {
        if (url.startsWith('/api/v1/admin/dictionary/languages')) return { data: [] };
        if (url.startsWith('/api/v1/admin/dictionary/currencies')) return { data: [] };
        throw new Error(`unexpected request: ${url}`);
      },
    },
  };
});

const getByCodeSpy = vi.fn();
const updateSpy = vi.fn();
const createSpy = vi.fn();

vi.mock('../../../../packages/modules/sales_channels/src/admin/api/sales-channels-client', () => ({
  salesChannelsClient: {
    getByCode: (...a: unknown[]) => getByCodeSpy(...a),
    update: (...a: unknown[]) => updateSpy(...a),
    create: (...a: unknown[]) => createSpy(...a),
  },
}));

const { ChannelIdentityForm } = await import(
  '../../../../packages/modules/sales_channels/src/admin/components/ChannelIdentityForm'
);
const { SalesChannelEditPage } = await import(
  '../../../../packages/modules/sales_channels/src/admin/pages/SalesChannelEditPage'
);

// `process.cwd()` is `admin/` under the admin workspace's vitest run.
const enBundlePath = resolve(process.cwd(), '../packages/modules/sales_channels/i18n/en.json');
const en = JSON.parse(readFileSync(enBundlePath, 'utf8')) as Record<string, string>;
const pl = JSON.parse(readFileSync(enBundlePath.replace('en.json', 'pl.json'), 'utf8')) as Record<
  string,
  string
>;
const bundle = { sales_channels: en };

const NEW_KEYS = ['identity.isPublic.label', 'identity.isPublic.hint'] as const;

function channel(over: Partial<SalesChannelDetail> = {}): SalesChannelDetail {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    code: 'serwis-a',
    name: { 'en-US': 'Serwis A' },
    active: true,
    anonymousAccess: true,
    isPublic: false,
    systemDefault: false,
    defaultLanguage: 'en-US',
    defaultCurrency: 'PLN',
    themeCode: null,
    logoAssetId: null,
    version: 3,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    languages: ['en-US'],
    currencies: ['PLN'],
    logoUrl: null,
    ...over,
  };
}

function showPrices(): HTMLInputElement {
  return screen.getByRole('checkbox', { name: en['identity.isPublic.label']! });
}

beforeEach(() => {
  getByCodeSpy.mockReset();
  updateSpy.mockReset();
  createSpy.mockReset();
});

describe('bundle', () => {
  it('ships every new key in English and Polish', () => {
    for (const key of NEW_KEYS) {
      expect(en[key], key).toBeTruthy();
      expect(pl[key], key).toBeTruthy();
    }
    expect(en['identity.isPublic.label']).toBe('Show prices');
    expect(pl['identity.isPublic.label']).toBe('Pokazuj ceny');
  });
});

describe('ChannelIdentityForm — Show prices', () => {
  it('is present, off for a new channel, and described by its hint', async () => {
    const { container } = renderWithI18n(
      <StrictMode>
        <ChannelIdentityForm mode="create" onSubmit={() => undefined} />
      </StrictMode>,
      bundle,
    );
    const input = showPrices();
    expect(input.checked).toBe(false);
    const hintId = input.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toBe(en['identity.isPublic.hint']);
    await expectNoAxeViolations(container);
  });

  it('reflects a channel that shows prices and submits the operator\'s choice', () => {
    let submitted: { isPublic: boolean } | null = null;
    renderWithI18n(
      <StrictMode>
        <ChannelIdentityForm
          mode="edit"
          initial={channel({ isPublic: true })}
          onSubmit={(value) => {
            submitted = value;
          }}
        />
      </StrictMode>,
      bundle,
    );
    const input = showPrices();
    expect(input.checked).toBe(true);
    fireEvent.click(input);
    expect(input.checked).toBe(false);
    fireEvent.submit(input.closest('form')!);
    expect(submitted).not.toBeNull();
    expect(submitted!.isPublic).toBe(false);
  });

  it('stays editable on a store closed to anonymous visitors and on the system default', () => {
    // Off withholds prices from signed-in customers too, so the control means
    // something on a members-only store and must not be disabled there.
    renderWithI18n(
      <ChannelIdentityForm
        mode="edit"
        initial={channel({ anonymousAccess: false, systemDefault: true })}
        onSubmit={() => undefined}
      />,
      bundle,
    );
    expect(showPrices().disabled).toBe(false);
  });
});

describe('SalesChannelEditPage — saving', () => {
  it('sends isPublic in the update body', async () => {
    getByCodeSpy.mockResolvedValue(channel());
    updateSpy.mockImplementation(async (_code: string, body: { isPublic: boolean }) =>
      channel({ isPublic: body.isPublic, version: 4 }),
    );
    renderWithSession(
      <StrictMode>
        <MemoryRouter initialEntries={['/sales-channels/serwis-a']}>
          <Routes>
            <Route path="/sales-channels/:code" element={<SalesChannelEditPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
      {
        session: adminSession({ permissions: ['*'] }),
        presence: modulePresence({ present: ['sales_channels'] }),
        bundle,
      },
    );
    // Settle the page, pending re-seed effect included, before clicking — see
    // the same wait in channel-form-anonymous-access.test.tsx.
    await screen.findByRole('button', { name: 'Delete' });
    await waitFor(() => expect(showPrices().checked).toBe(false));
    fireEvent.click(showPrices());
    fireEvent.click(screen.getByRole('button', { name: en['identity.action.save']! }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy.mock.calls[0]![0]).toBe('serwis-a');
    expect(updateSpy.mock.calls[0]![1]).toMatchObject({ expectedVersion: 3, isPublic: true });
  });

  it('sends isPublic in the create body', async () => {
    createSpy.mockResolvedValue(channel({ code: 'b2b', isPublic: true }));
    getByCodeSpy.mockResolvedValue(channel({ code: 'b2b', isPublic: true }));
    renderWithSession(
      <MemoryRouter initialEntries={['/sales-channels/new']}>
        <Routes>
          <Route path="/sales-channels/:code" element={<SalesChannelEditPage />} />
        </Routes>
      </MemoryRouter>,
      {
        session: adminSession({ permissions: ['*'] }),
        presence: modulePresence({ present: ['sales_channels'] }),
        bundle,
      },
    );
    fireEvent.change(document.getElementById('sc-code')!, { target: { value: 'b2b' } });
    fireEvent.change(document.getElementById('sc-name')!, { target: { value: 'B2B' } });
    fireEvent.click(showPrices());
    fireEvent.submit(showPrices().closest('form')!);
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy.mock.calls[0]![0]).toMatchObject({ code: 'b2b', isPublic: true });
  });
});
