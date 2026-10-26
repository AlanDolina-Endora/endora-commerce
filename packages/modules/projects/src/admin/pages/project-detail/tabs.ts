import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ProjectDetail } from '@endora-commerce/contracts';

/**
 * The tabs of a Project's screen, as data
 * (`specs/163-projects-and-tasks/contracts/admin-surfaces.md` §2).
 *
 * **A story adds a tab by adding one file and one line here** — Tasks, Linked
 * records, Notes, Messages, Attachments and History each arrive that way — so
 * the stories meet in one array and not in the body of `ProjectDetail.tsx`.
 * Each component is lazy: a tab nobody opens is never downloaded.
 *
 * **A tab's `id` is part of an address**: the screen selects a tab from
 * `?tab=<id>`, so an id that is renamed breaks every link somebody saved.
 */

/** What the page hands every tab. */
export interface ProjectTabProps {
  project: ProjectDetail;
  /** Put a newer read of the Project on screen (the answer of a write). */
  onChange: (next: ProjectDetail) => void;
  /** Read the Project again; resolves once the new read is on screen. */
  reload: () => Promise<void>;
}

export interface ProjectTab {
  id: string;
  /** Relative to the module's namespace. */
  labelKey: string;
  component: LazyExoticComponent<ComponentType<ProjectTabProps>>;
}

/** The tab a visit opens on when its address names none. */
export const DEFAULT_TAB_ID = 'overview';

/** The query parameter that names the selected tab. */
export const TAB_PARAM = 'tab';

export const PROJECT_TABS: readonly ProjectTab[] = [
  {
    id: DEFAULT_TAB_ID,
    labelKey: 'tabs.overview',
    component: lazy(() => import('./tabs/OverviewTab.js')),
  },
  {
    id: 'stages',
    labelKey: 'tabs.stages',
    component: lazy(() => import('./tabs/StagesTab.js')),
  },
  {
    // The Stage history of User Story 1; the audit trail is a later *History* tab.
    id: 'stage-history',
    labelKey: 'tabs.history',
    component: lazy(() => import('./tabs/StageHistoryTab.js')),
  },
];

/** The tab an address selects; an id nobody declares is the default tab. */
export function tabFromSearch(search: URLSearchParams): string {
  const asked = search.get(TAB_PARAM);
  return asked && PROJECT_TABS.some((tab) => tab.id === asked) ? asked : DEFAULT_TAB_ID;
}

/** The query string that selects `tabId`, keeping every other parameter; the default tab is the bare address. */
export function searchForTab(search: URLSearchParams, tabId: string): URLSearchParams {
  const next = new URLSearchParams(search);
  if (tabId === DEFAULT_TAB_ID) next.delete(TAB_PARAM);
  else next.set(TAB_PARAM, tabId);
  return next;
}
