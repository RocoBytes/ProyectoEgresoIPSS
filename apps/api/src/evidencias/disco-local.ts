import { chmod, mkdir, open, readdir, rename, rm, stat, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common';
import { RELOJ, RelojSistema, type Reloj } from '../comun/reloj';
import { CONFIGURACION, type Configuracion } from '../configuracion';
import type { AlmacenamientoEvidencias } from './almacenamiento';

const NOMBRE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA_MS = 60 * 60 * 1000;
export const SUBDIRECTORIO_ENTRANTES = '.entrantes';

@Injectable()
export class DiscoLocal implements AlmacenamientoEvidencias, OnModuleInit {
  private readonly raiz: string;
  private readonly entrantes: string;

  constructor(
    @Inject(CONFIGURACION) config: Configuracion,
    @Optional() @Inject(RELOJ) private readonly reloj: Reloj = new RelojSistema(),
  ) {
    this.raiz = resolve(config.directorioEvidencias);
    this.entrantes = join(this.raiz, SUBDIRECTORIO_ENTRANTES);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.entrantes, { recursive: true });
    await this.barrerEntrantes();
  }

  /** Una subida interrumpida por una caída deja su temporal en `.entrantes`; al arrancar se borran los de más de una hora. */
  private async barrerEntrantes(): Promise<void> {
    const limite = this.reloj.ahora().getTime() - HORA_MS;
    for (const nombre of await readdir(this.entrantes)) {
      const ruta = join(this.entrantes, nombre);
      const info = await stat(ruta).catch(() => undefined);
      if (info?.isFile() === true && info.mtimeMs < limite) await rm(ruta, { force: true });
    }
  }

  async incorporar(rutaTemporal: string): Promise<string> {
    const origen = resolve(rutaTemporal);
    const nombre = basename(origen);
    // Solo se mueve lo que Multer dejó en `.entrantes` con nombre UUID: nada que apunte fuera del directorio.
    if (dirname(origen) !== this.entrantes || !NOMBRE_UUID.test(nombre)) throw new Error('Ruta temporal fuera de .entrantes');
    // Mismo volumen: rename es atómico, así que nunca queda un archivo a medias en su lugar definitivo.
    const destino = join(this.raiz, nombre);
    await rename(origen, destino);
    // Lectura para el dueño y el grupo; nadie más.
    await chmod(destino, 0o640);
    return nombre;
  }

  abrir(rutaRelativa: string): Promise<FileHandle> {
    return open(this.resolverRuta(rutaRelativa), 'r');
  }

  async borrar(rutaRelativa: string): Promise<void> {
    await rm(this.resolverRuta(rutaRelativa), { force: true });
  }

  private resolverRuta(rutaRelativa: string): string {
    // Las rutas guardadas son siempre un UUID; cualquier otra cosa (../, separadores) se rechaza.
    if (!NOMBRE_UUID.test(rutaRelativa)) throw new Error('Ruta de evidencia inválida');
    return join(this.raiz, rutaRelativa);
  }
}
