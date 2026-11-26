/** "1,8 MB" desde 1 MB; "N KB" por debajo (mínimo 1 KB). */
export function tamanoTexto(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1000)))} KB`;
}
