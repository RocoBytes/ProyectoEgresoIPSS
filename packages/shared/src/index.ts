// Este paquete solo exporta tipos: no tiene paso de build y desaparece en la
// compilación tanto de la API como de la web, así ninguna de las dos depende de
// código ejecutable compartido. El lint (`no-restricted-imports`) obliga a
// importarlo con `import type`.
export type EstadoRegistro = 'ABIERTO' | 'CERRADO' | 'ANULADO';
