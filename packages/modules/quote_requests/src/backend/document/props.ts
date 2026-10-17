/**
 * Readers for a quote block's stored props — untrusted, so every reader
 * answers its fallback for a value of the wrong type or out of range.
 */
export type Props = Readonly<Record<string, unknown>>;

export function num(props: Props, key: string, fallback: number, min: number, max: number): number {
  const raw = props[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
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

const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export function color(props: Props, key: string, fallback: string): string {
  const raw = props[key];
  return typeof raw === 'string' && COLOR_RE.test(raw.trim()) ? raw.trim() : fallback;
}

export function align(props: Props, key: string, fallback: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' {
  const raw = props[key];
  return raw === 'left' || raw === 'center' || raw === 'right' ? raw : fallback;
}
