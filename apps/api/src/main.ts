import type { EstadoRegistro } from '@ipss/shared';

// El arranque de NestJS llega en el punto de control 3. Este archivo existe
// para que el build y el lint ya recorran la API y para comprobar que el
// import de tipos del paquete compartido resuelve bajo `nodenext`.
const estadoInicial: EstadoRegistro = 'ABIERTO';

console.log(`API en construcción (estado de ejemplo: ${estadoInicial})`);
