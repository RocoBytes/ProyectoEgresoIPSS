// "y" se vuelve "e" ante una palabra que empieza con el sonido /i/ ("Ingeniería", "Hidráulica").
// "hie-" y "hia-" suenan como consonante ("hielo", "hierro"), así que conservan la "y".
function empiezaConSonidoI(palabra: string): boolean {
  const normalizada = palabra
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  return /^i/.test(normalizada) || /^hi(?![aeo])/.test(normalizada);
}

/** "A", "A y B", "A, B y C"; con "e" cuando el último nombre empieza con /i/. */
export function unirConConjuncion(nombres: readonly string[]): string {
  const ultimo = nombres.at(-1);
  if (ultimo === undefined) return '';
  if (nombres.length === 1) return ultimo;
  const conjuncion = empiezaConSonidoI(ultimo) ? 'e' : 'y';
  return `${nombres.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`;
}
