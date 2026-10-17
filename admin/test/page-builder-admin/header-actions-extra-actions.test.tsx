import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageBuilderHeaderActions } from '@endora-commerce/page-builder-admin';

/**
 * Feature 151, T039 — the shared chrome gains one module-agnostic slot,
 * `extraActions`, rendered first in the right-hand header group. The chrome owns
 * no copy for it; without it the group is exactly what it was.
 */
const t = (key: string): string => key;

describe('PageBuilderHeaderActions extraActions', () => {
  it('renders the slot first in the header group', () => {
    const { container } = render(
      <PageBuilderHeaderActions
        fullscreen={false}
        onToggleFullscreen={(): void => {}}
        currentData={null}
        extraActions={<button type="button">module action</button>}
        t={t}
      />,
    );
    const group = container.querySelector('.cms-pb-header-actions')!;
    expect(group.firstElementChild?.textContent).toBe('module action');
    expect(screen.getByRole('button', { name: 'module action' })).toBeTruthy();
  });

  it('renders exactly as before without it', () => {
    const { container } = render(
      <PageBuilderHeaderActions fullscreen={false} onToggleFullscreen={(): void => {}} currentData={null} t={t} />,
    );
    const group = container.querySelector('.cms-pb-header-actions')!;
    expect(group.children).toHaveLength(1);
    expect(group.firstElementChild?.getAttribute('aria-label')).toBe('pageBuilder.fullscreen.enter');
  });
});
