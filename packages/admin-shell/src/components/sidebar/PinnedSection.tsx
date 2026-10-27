import { useId, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { ADMIN_PINNED_GROUP_KEY } from '@endora-commerce/contracts';
import { cn } from '../../lib/utils.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import type { ResolvedPin } from '../../lib/pinned-entries.js';
import type { NavItem, NavSection } from './nav-types.js';
import { PinToggleButton } from './PinToggleButton.js';

export interface PinnedSectionProps {
  /** The visible pins, in the admin's order (`resolvePinsFrom`). */
  pins: readonly ResolvedPin[];
  /** The composed sections, to name each pin's source section. */
  sections: readonly NavSection[];
  collapsed: boolean;
  onToggleCollapsed: (groupKey: string) => void;
  onUnpin: (pin: ResolvedPin) => void;
  navLabel: (item: NavItem) => string;
  /** The mobile drawer: pin controls always shown, 44 px targets. */
  touch: boolean;
}

/**
 * Feature 164 — the sidebar's Pinned section, expanded and in the mobile drawer
 * (FR-001 – FR-005; research R-7). The rail renders it as a `RailSection`
 * variant instead.
 *
 * Every row is the original entry's own object — its icon, its label, its
 * `end` flag — so the active state matches the original's (FR-003), and a pin
 * whose original is hidden never reaches this component (FR-006). It reuses the
 * sidebar's group, label and item classes; it folds under the group key
 * `pinned` like any other group (FR-013). Nothing is rendered without a visible
 * pin — no heading, no placeholder (FR-002).
 */
export function PinnedSection({
  pins,
  sections,
  collapsed,
  onToggleCollapsed,
  onUnpin,
  navLabel,
  touch,
}: PinnedSectionProps): ReactNode {
  const t = useTranslation('core');
  const baseId = useId();
  if (pins.length === 0) return null;

  const sourceOf = (sectionKey: string): string => {
    const section = sections.find((candidate) => candidate.key === sectionKey);
    return section?.labelKey
      ? t('appShell.pinned.fromSection', { section: t(section.labelKey) })
      : t('appShell.pinned.fromMain');
  };

  return (
    <div
      data-testid="sidebar-pinned"
      className={cn(
        'b2b-sidebar__group b2b-sidebar__group--pinned',
        collapsed && 'b2b-sidebar__group--collapsed',
      )}
    >
      <button
        type="button"
        className="b2b-sidebar__group-label"
        aria-expanded={!collapsed}
        onClick={(): void => onToggleCollapsed(ADMIN_PINNED_GROUP_KEY)}
      >
        <ChevronDown size={11} />
        <span>{t('appShell.pinned.heading')}</span>
      </button>
      <div className="b2b-sidebar__items">
        {pins.map((pin, index) => {
          const Icon = pin.item.icon;
          const label = navLabel(pin.item);
          const sourceId = `${baseId}-from-${index}`;
          return (
            <div key={pin.destination} className="b2b-nav-row">
              <NavLink
                to={pin.destination}
                end={pin.end}
                aria-describedby={sourceId}
                className={({ isActive }): string => cn('b2b-nav-item', isActive && 'is-active')}
              >
                <Icon size={16} />
                <span style={{ flex: 1 }}>{label}</span>
              </NavLink>
              <span id={sourceId} className="sr-only">
                {sourceOf(pin.sectionKey)}
              </span>
              <PinToggleButton label={label} pinned touch={touch} onToggle={(): void => onUnpin(pin)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
