import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FocusTrapOptions {
  /**
   * Focused when the trap activates, instead of the first focusable element
   * (feature 147 — a dialog whose first control is not the one to type into).
   */
  initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  /**
   * Focused when the trap releases, instead of the element that held focus
   * when it activated. Read at release time, so a caller can decide late — a
   * ref still `null` then falls back to that element.
   */
  finalFocusRef?: RefObject<HTMLElement | null> | undefined;
}

/**
 * Trap focus inside `containerRef` while `active` (feature 029 mobile drawer).
 *
 * On activation it focuses `initialFocusRef` or the first focusable element;
 * on release it returns focus to `finalFocusRef` or to whatever was focused
 * before. Both are decided inside the one effect, so React's StrictMode
 * mount → cleanup → mount cycle re-captures the same opener and stays
 * idempotent.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  options: FocusTrapOptions = {},
): void {
  const { initialFocusRef, finalFocusRef } = options;
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const root = containerRef.current;
    const previous = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );

    const initial = initialFocusRef?.current ?? focusables()[0];
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const current = document.activeElement as HTMLElement | null;
      const idx = items.indexOf(current as HTMLElement);
      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          items[items.length - 1]?.focus();
        }
      } else if (idx === items.length - 1) {
        e.preventDefault();
        items[0]?.focus();
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return (): void => {
      root.removeEventListener('keydown', onKeyDown);
      const target = finalFocusRef?.current ?? previous;
      target?.focus?.();
    };
  }, [active, containerRef, initialFocusRef, finalFocusRef]);
}
