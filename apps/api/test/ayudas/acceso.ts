import { randomUUID } from 'node:crypto';
import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app';
import { ContrasenasService } from '../../src/acceso/contrasenas.service';
import type { Reloj } from '../../src/comun/reloj';
import { RELOJ } from '../../src/comun/reloj';
import { CONFIGURACION, type Configuracion } from '../../src/configuracion';

// Base de pruebas que levanta `npm run test:bd` (puerto 55433). Las fixtures se crean como
// migrador porque la API no tiene INSERT sobre sector ni carrera.
export const URL_API = 'postgresql://ipss_api:api_dev@127.0.0.1:55433/ipss';
export const URL_MIGRADOR = 'postgresql://ipss_migrador:migrador_dev@127.0.0.1:55433/ipss';
export const CLAVE_PRUEBAS = 'Clave-de-pruebas-1';
export const JWT_SECRETO_PRUEBAS = 'secreto-de-pruebas-de-al-menos-32-caracteres';

export class RelojControlable implements Reloj {
  constructor(private actual = new Date()) {}
  ahora(): Date {
    return new Date(this.actual);
  }
  avanzar(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
}

export const MINUTO = 60_000;
export const HORA = 60 * MINUTO;

export interface AppDePruebas {
  app: NestExpressApplication;
  url: string;
  reloj: RelojControlable;
}

/** Levanta la app real con `trust proxy` en 1 (como detrás de Caddy) y el reloj controlable. */
export async function levantarApp(controladores: Type[] = []): Promise<AppDePruebas> {
  const reloj = new RelojControlable();
  const config: Configuracion = { urlBaseDeDatos: URL_API, puerto: 0, host: '127.0.0.1', saltosProxy: 1, jwtSecreto: JWT_SECRETO_PRUEBAS };
  const modulo = await Test.createTestingModule({ imports: [AppModule], controllers: controladores })
    .overrideProvider(CONFIGURACION)
    .useValue(config)
    .overrideProvider(RELOJ)
    .useValue(reloj)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app, config);
  await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl(), reloj };
}

export async function conMigrador<T>(accion: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: URL_MIGRADOR });
  await cliente.connect();
  try {
    return await accion(cliente);
  } finally {
    await cliente.end();
  }
}

let hashDePruebas: Promise<string> | undefined;
// Un solo hash para todas las fixtures: argon2 es lento a propósito.
function hashCompartido(): Promise<string> {
  hashDePruebas ??= new ContrasenasService().hashear(CLAVE_PRUEBAS);
  return hashDePruebas;
}

export type RolPrueba = 'DIRECTOR_SECTORIAL' | 'DIRECTOR_CARRERA' | 'ASEGURAMIENTO_CALIDAD';

export interface UsuarioPrueba {
  id: string;
  correo: string;
  nombre: string;
}

export async function crearUsuario(rol: RolPrueba, opciones: { activo?: boolean; sectores?: string[]; carreras?: string[] } = {}): Promise<UsuarioPrueba> {
  const correo = `${randomUUID()}@ejemplo.cl`;
  const nombre = `Usuario ${rol}`;
  const hash = await hashCompartido();
  return conMigrador(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      'INSERT INTO usuario (correo, nombre, hash_contrasena, rol, activo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [correo, nombre, hash, rol, opciones.activo ?? true],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('El INSERT del usuario no devolvió fila');
    for (const sectorId of opciones.sectores ?? []) await c.query('INSERT INTO usuario_sector (usuario_id, sector_id) VALUES ($1, $2)', [id, sectorId]);
    for (const carreraId of opciones.carreras ?? []) await c.query('INSERT INTO usuario_carrera (usuario_id, carrera_id) VALUES ($1, $2)', [id, carreraId]);
    return { id, correo, nombre };
  });
}

export async function crearSector(nombre: string): Promise<string> {
  return conMigrador(async (c) => (await c.query<{ id: string }>('INSERT INTO sector (nombre) VALUES ($1) RETURNING id', [nombre])).rows[0]?.id ?? '');
}

export async function crearCarrera(sectorId: string, nombre: string): Promise<string> {
  return conMigrador(async (c) => (await c.query<{ id: string }>('INSERT INTO carrera (sector_id, nombre) VALUES ($1, $2) RETURNING id', [sectorId, nombre])).rows[0]?.id ?? '');
}

// IP distinta por llamada: el límite por IP (20 por 15 min) es de /ingresar y las pruebas
// hacen muchos ingresos; así ninguna depende de cuántas hicieron las anteriores.
let contadorIp = 0;
export function ipNueva(): string {
  contadorIp += 1;
  return `10.${(contadorIp >> 16) & 255}.${(contadorIp >> 8) & 255}.${contadorIp & 255}`;
}

export interface Respuesta<T = unknown> {
  estado: number;
  cuerpo: T;
  cabeceras: Headers;
  /** Cabeceras Set-Cookie sin procesar. */
  setCookie: string[];
}

export interface OpcionesPeticion {
  ip?: string;
  cookies?: Record<string, string>;
  cuerpo?: unknown;
}

export async function pedir<T = unknown>(url: string, metodo: 'GET' | 'POST', ruta: string, opciones: OpcionesPeticion = {}): Promise<Respuesta<T>> {
  const cabeceras: Record<string, string> = { 'X-Forwarded-For': opciones.ip ?? ipNueva() };
  if (opciones.cuerpo !== undefined) cabeceras['content-type'] = 'application/json';
  if (opciones.cookies !== undefined) cabeceras['cookie'] = Object.entries(opciones.cookies).map(([n, v]) => `${n}=${v}`).join('; ');
  const respuesta = await fetch(`${url}${ruta}`, { method: metodo, headers: cabeceras, body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo) });
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: (texto === '' ? undefined : JSON.parse(texto)) as T, cabeceras: respuesta.headers, setCookie: respuesta.headers.getSetCookie() };
}

/** Valor de una cookie recibida en Set-Cookie. */
export function valorDeCookie(respuesta: Respuesta, nombre: string): string {
  const linea = respuesta.setCookie.find((c) => c.startsWith(`${nombre}=`));
  if (linea === undefined) throw new Error(`La respuesta no trae la cookie ${nombre}`);
  return linea.slice(nombre.length + 1).split(';')[0] ?? '';
}

export function lineaDeCookie(respuesta: Respuesta, nombre: string): string {
  const linea = respuesta.setCookie.find((c) => c.startsWith(`${nombre}=`));
  if (linea === undefined) throw new Error(`La respuesta no trae la cookie ${nombre}`);
  return linea;
}

export interface Sesion {
  acceso: string;
  renovacion: string;
}

export const COOKIE_ACCESO = '__Host-ipss_acceso';
export const COOKIE_RENOVACION = '__Secure-ipss_renovacion';

export function cookiesDe(sesion: Sesion): Record<string, string> {
  return { [COOKIE_ACCESO]: sesion.acceso, [COOKIE_RENOVACION]: sesion.renovacion };
}

export function sesionDe(respuesta: Respuesta): Sesion {
  return { acceso: valorDeCookie(respuesta, COOKIE_ACCESO), renovacion: valorDeCookie(respuesta, COOKIE_RENOVACION) };
}

export async function ingresar(url: string, usuario: UsuarioPrueba, contrasena = CLAVE_PRUEBAS): Promise<Respuesta> {
  return pedir(url, 'POST', '/api/acceso/ingresar', { cuerpo: { correo: usuario.correo, contrasena } });
}
