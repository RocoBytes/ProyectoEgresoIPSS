import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../configuracion';
import type { AlmacenamientoEvidencias } from './almacenamiento';

const NOMBRE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SUBDIRECTORIO_ENTRANTES = '.entrantes';

@Injectable()
export class DiscoLocal implements AlmacenamientoEvidencias, OnModuleInit {
  private readonly raiz: string;
  private readonly entrantes: string;

  constructor(@Inject(CONFIGURACION) config: Configuracion) {
    this.raiz = resolve(config.directorioEvidencias);
    this.entrantes = join(this.raiz, SUBDIRECTORIO_ENTRANTES);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.entrantes, { recursive: true });
  }

  async incorporar(rutaTemporal: string): Promise<string> {
    const origen = resolve(rutaTemporal);
    const nombre = basename(origen);
    // Solo se mueve lo que Multer dejó en `.entrantes` con nombre UUID: nada que apunte fuera del directorio.
    if (dirname(origen) !== this.entrantes || !NOMBRE_UUID.test(nombre)) throw new Error('Ruta temporal fuera de .entrantes');
    // Mismo volumen: rename es atómico, así que nunca queda un archivo a medias en su lugar definitivo.
    await rename(origen, join(this.raiz, nombre));
    return nombre;
  }

  abrir(rutaRelativa: string): ReadStream {
    return createReadStream(this.resolverRuta(rutaRelativa));
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
