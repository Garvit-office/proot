/** Collects positional parameters while building a query: `p.add(value)` returns "$n". */
export class Params {
  readonly values: unknown[] = [];
  add(value: unknown) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export const clampLimit = (value: unknown, fallback = 24, max = 100) => Math.min(Math.max(Number(value) || fallback, 1), max);
export const clampOffset = (value: unknown) => Math.max(Number(value) || 0, 0);

/** Escape LIKE wildcards in user search text. */
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
