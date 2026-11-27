import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { type AppDePruebas, conMigrador, cookiesDe, crearCarrera, crearSector, crearUsuario, ingresar, sesionDe, type UsuarioPrueba } from './acceso';

// Archivos mínimos pero con firma real: la API decide el tipo por el contenido.
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHP9NuAAAAABJRU5ErkJggg==', 'base64');
export const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');
export const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]);

export interface Escenario {
  sectorA: string;
  sectorB: string;
  carreraA: string;
  carreraA2: string;
  carreraB: string;
  nombreCarreraB: string;
  asignaturaA: string;
  moduloA: string;
  asignaturaA2: string;
  asignaturaB: string;
  mallaA: string;
  mallaB: string;
  canal: string;
  canalInactivo: string;
  sectorial: UsuarioPrueba;
  directorCarrera: UsuarioPrueba;
  calidad: UsuarioPrueba;
}

async function uno(c: Client, sql: string, params: unknown[]): Promise<string> {
  const id = (await c.query<{ id: string }>(sql, params)).rows[0]?.id;
  if (id === undefined) throw new Error('El INSERT no devolvió fila');
  return id;
}

/** Datos únicos por llamada: ninguna prueba depende de lo que dejaron las anteriores. */
export async function crearEscenario(): Promise<Escenario> {
  const s = randomUUID().slice(0, 8);
  const sectorA = await crearSector(`Sector A ${s}`);
  const sectorB = await crearSector(`Sector B ${s}`);
  const carreraA = await crearCarrera(sectorA, `Carrera A ${s}`);
  const carreraA2 = await crearCarrera(sectorA, `Carrera A2 ${s}`);
  const nombreCarreraB = `Carrera B ${s}`;
  const carreraB = await crearCarrera(sectorB, nombreCarreraB);
  const sectorial = await crearUsuario('DIRECTOR_SECTORIAL', { sectores: [sectorA] });
  const directorCarrera = await crearUsuario('DIRECTOR_CARRERA', { carreras: [carreraA] });
  const calidad = await crearUsuario('ASEGURAMIENTO_CALIDAD');
  return conMigrador(async (c) => {
    const asig = (carrera: string, tipo: string, nombre: string) =>
      uno(c, 'INSERT INTO asignatura (carrera_id, tipo, nombre) VALUES ($1, $2, $3) RETURNING id', [carrera, tipo, `${nombre} ${s}`]);
    const malla = async (carrera: string, anio: number) => {
      const evidencia = await uno(
        c,
        "INSERT INTO evidencia (nombre_original, mime, tamano, sha256, ruta, subido_por) VALUES ('malla.pdf', 'application/pdf', 1, $1, $2, $3) RETURNING id",
        ['0'.repeat(64), randomUUID(), sectorial.id],
      );
      return uno(c, "INSERT INTO version_malla (carrera_id, anio, vigente_desde, archivo_id) VALUES ($1, $2, '2024-03-01', $3) RETURNING id", [carrera, anio, evidencia]);
    };
    return {
      sectorA, sectorB, carreraA, carreraA2, carreraB, nombreCarreraB,
      asignaturaA: await asig(carreraA, 'ASIGNATURA', 'Bases de Datos'),
      moduloA: await asig(carreraA, 'MODULO', 'Desarrollo'),
      asignaturaA2: await asig(carreraA, 'ASIGNATURA', 'Redes'),
      asignaturaB: await asig(carreraB, 'ASIGNATURA', 'Física'),
      mallaA: await malla(carreraA, 2024),
      mallaB: await malla(carreraB, 2024),
      canal: await uno(c, 'INSERT INTO canal (nombre) VALUES ($1) RETURNING id', [`Canal ${s}`]),
      canalInactivo: await uno(c, 'INSERT INTO canal (nombre, activo) VALUES ($1, false) RETURNING id', [`Canal inactivo ${s}`]),
      sectorial, directorCarrera, calidad,
    };
  });
}

export async function cookiesDeUsuario(app: AppDePruebas, usuario: UsuarioPrueba): Promise<Record<string, string>> {
  return cookiesDe(sesionDe(await ingresar(app.url, usuario)));
}

export interface ArchivoForm {
  nombre: string;
  contenido: Buffer;
  tipo?: string;
}

export interface OpcionesLlamada {
  cookies?: Record<string, string>;
  json?: unknown;
  datos?: unknown;
  acta?: ArchivoForm | null;
  fotos?: ArchivoForm[];
  /** Campo `evidencia` del cierre de un registro. */
  evidencia?: ArchivoForm | null;
}

export interface RespuestaHttp<T = unknown> {
  estado: number;
  cuerpo: T;
  cabeceras: Headers;
  bytes: Buffer;
}

let contadorIp = 5000;
/** Petición con JSON o multipart (`datos` + `acta` + `fotos`). */
export async function llamar<T = unknown>(url: string, metodo: 'GET' | 'POST' | 'PATCH', ruta: string, o: OpcionesLlamada = {}): Promise<RespuestaHttp<T>> {
  contadorIp += 1;
  const cabeceras: Record<string, string> = { 'X-Forwarded-For': `10.9.${(contadorIp >> 8) & 255}.${contadorIp & 255}` };
  if (o.cookies !== undefined) cabeceras['cookie'] = Object.entries(o.cookies).map(([n, v]) => `${n}=${v}`).join('; ');
  let cuerpo: BodyInit | undefined;
  if (o.datos !== undefined || o.acta !== undefined || o.fotos !== undefined || o.evidencia !== undefined) {
    const form = new FormData();
    if (o.datos !== undefined) form.append('datos', typeof o.datos === 'string' ? o.datos : JSON.stringify(o.datos));
    const agregar = (campo: string, a: ArchivoForm) => form.append(campo, new Blob([new Uint8Array(a.contenido)], { type: a.tipo ?? 'application/octet-stream' }), a.nombre);
    if (o.acta) agregar('acta', o.acta);
    for (const f of o.fotos ?? []) agregar('fotos', f);
    if (o.evidencia) agregar('evidencia', o.evidencia);
    cuerpo = form;
  } else if (o.json !== undefined) {
    cabeceras['content-type'] = 'application/json';
    cuerpo = JSON.stringify(o.json);
  }
  const r = await fetch(`${url}${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo });
  const bytes = Buffer.from(await r.arrayBuffer());
  const texto = bytes.toString('utf8');
  const esJson = (r.headers.get('content-type') ?? '').includes('json');
  return { estado: r.status, cuerpo: (esJson && texto !== '' ? JSON.parse(texto) : undefined) as T, cabeceras: r.headers, bytes };
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
