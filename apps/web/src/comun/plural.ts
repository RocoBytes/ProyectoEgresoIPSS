/** `plural(2, 'día', 'días')` → "2 días". */
export function plural(n: number, singular: string, plural: string): string {
  return `${String(n)} ${n === 1 ? singular : plural}`;
}
