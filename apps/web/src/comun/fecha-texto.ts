// Las fechas sin hora viajan como texto AAAA-MM-DD. Nunca se convierten en Date: en Santiago
// mostrarían el día anterior. Aquí solo se reordena el texto o se hace aritmética en UTC.

/** AAAA-MM-DD → DD-MM-AAAA. */
export function fechaTexto(fecha: string): string {
  const [anio = '', mes = '', dia = ''] = fecha.split('-');
  return `${dia}-${mes}-${anio}`;
}

/** Fecha de hoy en Santiago como AAAA-MM-DD. */
export function hoyEnSantiago(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function diasUtc(fecha: string): number {
  const [anio = 0, mes = 1, dia = 1] = fecha.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia) / 86_400_000;
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diferenciaDias(desde: string, hasta: string): number {
  return Math.round(diasUtc(hasta) - diasUtc(desde));
}

/** Marca de tiempo ISO → "DD-MM-AAAA HH:MM" en America/Santiago. */
export function marcaTexto(iso: string): string {
  const partes = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${v('day')}-${v('month')}-${v('year')} ${v('hour')}:${v('minute')}`;
}

/** Fecha de una marca ISO en Santiago, como AAAA-MM-DD. */
export function fechaDeMarca(iso: string): string {
  const [dia = '', mes = '', anio = ''] = marcaTexto(iso).slice(0, 10).split('-');
  return `${anio}-${mes}-${dia}`;
}
