import { afterAll, beforeAll } from 'vitest';

/**
 * Gives every element a non-null `offsetParent` for the duration of one test
 * file.
 *
 * The kit's `useFocusTrap` treats an element whose `offsetParent` is `null` as
 * hidden and skips it — correct in a browser, where only a `display: none`
 * subtree (or a fixed-position element itself) answers `null`. jsdom lays
 * nothing out and answers `null` for **every** element, so under test the trap
 * finds nothing to focus and nothing to cycle, and a focus assertion would be
 * measuring jsdom rather than the dialog. Returning the parent element restores
 * the browser's answer for the visible elements these tests render.
 *
 * Per file and restored afterwards, deliberately not in `setup.ts`: other
 * suites have been written against the trap's jsdom behaviour.
 */
export function installOffsetParentShim(): void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement): Element | null {
        return this.parentElement;
      },
    });
  });
  afterAll(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
  });
}
