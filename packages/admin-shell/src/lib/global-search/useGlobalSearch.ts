import { useEffect, useRef, useState } from 'react';
import type { AdminSearchGroup, SupportedAdminLanguage } from '@endora-commerce/contracts';
import { getAdminSearchCapability, searchAdminRecords } from './api.js';

/** How long typing has to pause before records are searched (contracts/admin-ui.md §1.1). */
export const GLOBAL_SEARCH_DEBOUNCE_MS = 250;

export interface GlobalSearchState {
  /** Whether record search is offered in this open (probe answered, at least one type). */
  readonly available: boolean;
  /** `idle` below the minimum length or before the first search; `loading` while one runs. */
  readonly state: 'idle' | 'loading' | 'ready';
  readonly groups: readonly AdminSearchGroup[];
  /** The trimmed text the shown groups answer; `''` when none. */
  readonly searchedQuery: string;
  readonly minimumQueryLength: number;
}

const IDLE = (available: boolean, minimumQueryLength: number): GlobalSearchState => ({
  available,
  state: 'idle',
  groups: [],
  searchedQuery: '',
  minimumQueryLength,
});

/**
 * Record search for the command palette (FR-001, FR-002, FR-007, FR-008).
 *
 *  - **One capability probe per open**, never remembered across opens: global
 *    search, a record type's module or the admin's role can change on another
 *    screen of this same page (the assistant probe's lesson). Any failure, or
 *    no type the admin may search, means no records for this open.
 *  - Below the minimum length nothing is requested and the palette is what it
 *    was before this feature.
 *  - Otherwise a 250 ms pause, the previous request aborted, and a response for
 *    any text other than the current one ignored — an older, slower answer can
 *    never replace a newer one.
 */
export function useGlobalSearch(
  open: boolean,
  query: string,
  language: SupportedAdminLanguage,
): GlobalSearchState {
  const [capability, setCapability] = useState<{ minimumQueryLength: number; resultsPerEntity: number } | null>(
    null,
  );
  const [result, setResult] = useState<GlobalSearchState>(IDLE(false, 3));
  const current = useRef('');

  useEffect(() => {
    if (!open) {
      setCapability(null);
      return;
    }
    const controller = new AbortController();
    void getAdminSearchCapability(language, controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return;
        setCapability(
          answer.entityTypes.length > 0
            ? { minimumQueryLength: answer.minimumQueryLength, resultsPerEntity: answer.resultsPerEntity }
            : null,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setCapability(null);
      });
    return (): void => controller.abort();
  }, [open, language]);

  const trimmed = query.trim();
  useEffect(() => {
    current.current = trimmed;
    if (!open || capability === null) {
      setResult(IDLE(false, capability?.minimumQueryLength ?? 3));
      return;
    }
    if (trimmed.length < capability.minimumQueryLength) {
      setResult(IDLE(true, capability.minimumQueryLength));
      return;
    }
    setResult((previous) => ({ ...previous, available: true, state: 'loading' }));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchAdminRecords(
        { q: trimmed, language, limit: capability.resultsPerEntity },
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted || response.data.query !== current.current) return;
          setResult({
            available: true,
            state: 'ready',
            groups: response.data.groups,
            searchedQuery: response.data.query,
            minimumQueryLength: capability.minimumQueryLength,
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // The request as a whole failed (a type that failed alone arrives as
          // an unavailable group): show no records rather than stale ones.
          setResult({
            available: true,
            state: 'ready',
            groups: [],
            searchedQuery: trimmed,
            minimumQueryLength: capability.minimumQueryLength,
          });
        });
    }, GLOBAL_SEARCH_DEBOUNCE_MS);
    return (): void => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmed, language, capability]);

  return result;
}
