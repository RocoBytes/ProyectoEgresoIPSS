import { PrismaPg } from '@prisma/adapter-pg';
import { ContrasenasService } from '../acceso/contrasenas.service';
import { PrismaClient } from '../generated/prisma/client';
import { describirError } from './errores-cli';
import { activarUsuario, crearUsuario, desactivarUsuario, listarUsuarios, restablecerClave, type ResumenUsuario } from './administrar-usuarios';

const USO = `Uso:
  usuarios crear --correo <c> --nombre "<n>" --rol DIRECTOR_SECTORIAL|DIRECTOR_CARRERA|ASEGURAMIENTO_CALIDAD [--sector "<nombre>"]... [--carrera "<nombre>"]...
  usuarios desactivar --correo <c>
  usuarios activar --correo <c>
  usuarios restablecer-clave --correo <c>
  usuarios listar`;

export interface Dependencias {
  /** Conexión a la base (por defecto DATABASE_URL). */
  url?: string;
  /** Salida normal; la clave temporal sale solo por aquí. Por defecto, stdout. */
  salida?: (linea: string) => void;
  /** Avisos y errores. Por defecto, stderr. */
  error?: (linea: string) => void;
  generarClave?: () => string;
}

interface Opciones {
  correo?: string;
  nombre?: string;
  rol?: string;
  sectores: string[];
  carreras: string[];
}

const BANDERAS = ['--correo', '--nombre', '--rol', '--sector', '--carrera'] as const;

/** `undefined` si hay una bandera desconocida, sin valor o repetida donde no se permite. */
function leerOpciones(args: string[]): Opciones | undefined {
  const opciones: Opciones = { sectores: [], carreras: [] };
  for (let i = 0; i < args.length; i += 2) {
    const bandera = args[i];
    const valor = args[i + 1];
    // Un valor que empieza por `--` es otra bandera a la que le faltó su valor, no un dato.
    if (bandera === undefined || valor === undefined || valor.startsWith('--') || !(BANDERAS as readonly string[]).includes(bandera)) return undefined;
    if (bandera === '--sector') opciones.sectores.push(valor);
    else if (bandera === '--carrera') opciones.carreras.push(valor);
    else {
      const campo = bandera === '--correo' ? 'correo' : bandera === '--nombre' ? 'nombre' : 'rol';
      if (opciones[campo] !== undefined) return undefined;
      opciones[campo] = valor;
    }
  }
  return opciones;
}

export function formatearListado(usuarios: readonly ResumenUsuario[]): string[] {
  if (usuarios.length === 0) return ['No hay cuentas.'];
  const filas = usuarios.map((u) => [u.correo, u.nombre, u.rol, u.activo ? 'activa' : 'inactiva', u.alcance.join('; ') || '—']);
  const encabezado = ['CORREO', 'NOMBRE', 'ROL', 'ESTADO', 'ALCANCE'];
  const anchos = encabezado.map((h, i) => Math.max(h.length, ...filas.map((f) => (f[i] ?? '').length)));
  const linea = (f: string[]): string => f.map((c, i) => c.padEnd(anchos[i] ?? 0)).join('  ').trimEnd();
  return [linea(encabezado), ...filas.map(linea)];
}

/** Código de salida: 0 bien, 1 error de datos o de ejecución, 2 argumentos incorrectos. */
export async function principal(args: string[], dependencias: Dependencias = {}): Promise<number> {
  const salida = dependencias.salida ?? ((l: string) => console.log(l));
  const error = dependencias.error ?? ((l: string) => console.error(l));
  const [comando, ...resto] = args;
  const opciones = leerOpciones(resto);
  const valido =
    opciones !== undefined &&
    ((comando === 'listar' && resto.length === 0) ||
      (comando === 'crear' && opciones.correo !== undefined && opciones.nombre !== undefined && opciones.rol !== undefined) ||
      (['desactivar', 'activar', 'restablecer-clave'].includes(comando ?? '') && opciones.correo !== undefined && resto.length === 2));
  if (!valido) {
    error(USO);
    return 2;
  }
  const url = dependencias.url ?? process.env['DATABASE_URL'];
  if (url === undefined || url.trim() === '') {
    error('Falta la variable de entorno DATABASE_URL (conexión a la base con el rol ipss_api).');
    return 1;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const contrasenas = new ContrasenasService();
    const correo = opciones.correo ?? '';
    switch (comando ?? '') {
      case 'crear': {
        const { usuario, claveTemporal } = await crearUsuario(prisma, contrasenas, { correo, nombre: opciones.nombre ?? '', rol: opciones.rol ?? '', sectores: opciones.sectores, carreras: opciones.carreras }, dependencias.generarClave);
        salida(`Cuenta creada: ${usuario.correo} (${usuario.rol}).`);
        mostrarClave(salida, error, usuario.correo, claveTemporal);
        break;
      }
      case 'desactivar': {
        const { sesionesRevocadas } = await desactivarUsuario(prisma, correo);
        salida(`Cuenta desactivada. Sesiones cerradas: ${String(sesionesRevocadas)}.`);
        break;
      }
      case 'activar':
        await activarUsuario(prisma, correo);
        salida('Cuenta activada.');
        break;
      case 'restablecer-clave': {
        const { claveTemporal, sesionesRevocadas } = await restablecerClave(prisma, contrasenas, correo, dependencias.generarClave);
        salida(`Clave restablecida y bloqueo limpiado. Sesiones cerradas: ${String(sesionesRevocadas)}.`);
        mostrarClave(salida, error, correo.trim().toLowerCase(), claveTemporal);
        break;
      }
      default:
        for (const linea of formatearListado(await listarUsuarios(prisma))) salida(linea);
    }
    return 0;
  } catch (e) {
    // Mensaje propio según la causa; nunca el texto original del error ni su pila (pueden traer datos de la fila).
    error(describirError(e));
    return 1;
  } finally {
    // Un fallo al cerrar la conexión no debe escapar de `principal` ni tapar el resultado.
    await prisma.$disconnect().catch(() => undefined);
  }
}

/** La clave se muestra una sola vez, por la salida normal y nunca por un logger. */
function mostrarClave(salida: (l: string) => void, error: (l: string) => void, correo: string, clave: string): void {
  salida(`Clave temporal de ${correo}: ${clave}`);
  error('Entrégala por un canal seguro: no se vuelve a mostrar y sigue vigente hasta el próximo restablecimiento.');
}

// Solo corre al ejecutar el archivo, no al importarlo desde una prueba. Permitido con NODE_ENV=production: es la vía de TI.
if (require.main === module) {
  principal(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    () => process.exit(1),
  );
}
