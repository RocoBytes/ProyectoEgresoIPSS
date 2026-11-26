import { unirConConjuncion } from './conjuncion';

describe('unirConConjuncion', () => {
  it.each([
    [[], ''],
    [['Salud'], 'Salud'],
    [['Tecnologías', 'Ingeniería'], 'Tecnologías e Ingeniería'],
    [['Ingeniería', 'Tecnologías'], 'Ingeniería y Tecnologías'],
    [['Salud', 'Administración y Comercio'], 'Salud y Administración y Comercio'],
    [['Salud', 'Tecnologías', 'Ingeniería'], 'Salud, Tecnologías e Ingeniería'],
    [['Tecnologías', 'Hidráulica'], 'Tecnologías e Hidráulica'],
    [['Tecnologías', 'Hierro y Acero'], 'Tecnologías y Hierro y Acero'],
    [['Tecnologías', 'Ícaro'], 'Tecnologías e Ícaro'],
    [['Tecnologías', 'Hotelería'], 'Tecnologías y Hotelería'],
  ] as const)('%j -> "%s"', (nombres, esperado) => {
    expect(unirConConjuncion(nombres)).toBe(esperado);
  });
});
