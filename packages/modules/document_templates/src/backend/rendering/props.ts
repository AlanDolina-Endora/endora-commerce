/**
 * Readers for stored block props. Stored props are untrusted — an operator
 * edited them, an older editor wrote them, or a clipboard pasted them — so every
 * reader answers its fallback for a value of the wrong type or out of range
 * rather than throwing (FR-018, the facility's "hostile props" rule).
 */

export type Props = Readonly<Record<string, unknown>>;

export function num(props: Props, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const raw = props[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function bool(props: Props, key: string, fallback: boolean): boolean {
  const raw = props[key];
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export function str(props: Props, key: string, fallback: string): string {
  const raw = props[key];
  return typeof raw === 'string' ? raw : fallback;
}

const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A `#rgb` / `#rrggbb` / `#rrggbbaa` colour, or the fallback. */
export function color(props: Props, key: string, fallback: string | undefined): string | undefined {
  const raw = props[key];
  return typeof raw === 'string' && COLOR_RE.test(raw.trim()) ? raw.trim() : fallback;
}

export type Align = 'left' | 'center' | 'right';

export function align(props: Props, key: string, fallback: Align): Align {
  const raw = props[key];
  return raw === 'left' || raw === 'center' || raw === 'right' ? raw : fallback;
}

export function oneOf<T extends string>(props: Props, key: string, allowed: readonly T[], fallback: T): T {
  const raw = props[key];
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}
