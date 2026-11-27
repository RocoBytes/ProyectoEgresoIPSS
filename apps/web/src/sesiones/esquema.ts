import { z } from 'zod';
import type { NivelImpacto } from '@ipss/shared';

export interface RegistroForm {
  sectorId: string;
  carreraId: string;
  nivelImpacto: NivelImpacto | '';
  objetoId: string;
  recurso: string;
  descripcion: string;
  fechaComprometida: string;
}

export interface SesionForm {
  canalId: string;
  fecha: string;
  instancia: string;
  participantes: string;
  registros: RegistroForm[];
}

export const esPerfil = (nivel: string) => nivel === 'PERFIL_INGRESO' || nivel === 'PERFIL_EGRESO';

const MENSAJE_OBJETO: Record<string, string> = {
  MALLA: 'selecciona la versión de malla.',
  MODULO: 'selecciona el módulo.',
};

const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);

/**
 * Mismas reglas y mensajes que la API (la API sigue siendo la autoridad). `hoy` entra como
 * parámetro para que la regla de la fecha futura sea comprobable sin tocar el reloj.
 */
export function crearEsquemaSesion(hoy: string) {
  return z
    .object({
      canalId: z.string(),
      fecha: z.string(),
      instancia: z.string(),
      participantes: z.string(),
      registros: z.array(
        z.object({
          sectorId: z.string(),
          carreraId: z.string(),
          nivelImpacto: z.custom<RegistroForm['nivelImpacto']>(),
          objetoId: z.string(),
          recurso: z.string(),
          descripcion: z.string(),
          fechaComprometida: z.string(),
        }),
      ),
    })
    .superRefine((v, ctx) => {
      const falla = (path: Array<string | number>, message: string) => {
        ctx.addIssue({ code: 'custom', path, message });
      };
      if (v.canalId === '') falla(['canalId'], 'Selecciona el canal por el que llegó la retroalimentación.');
      if (v.fecha === '') falla(['fecha'], 'Indica la fecha de la sesión.');
      else if (v.fecha > hoy) falla(['fecha'], 'La fecha de la sesión no puede ser posterior a hoy.');
      if (v.instancia.trim().length < 5) falla(['instancia'], 'Escribe el nombre de la instancia.');
      if (v.participantes.trim() === '') falla(['participantes'], 'Anota al menos un participante.');
      const vistos = new Set<string>();
      v.registros.forEach((r, i) => {
        const n = `Registro ${String(i + 1)}: `;
        const regla = (campo: keyof RegistroForm, mensaje: string) => {
          falla(['registros', i, campo], n + mensaje);
        };
        if (r.sectorId === '') regla('sectorId', 'selecciona el sector.');
        if (r.carreraId === '') regla('carreraId', 'selecciona la carrera.');
        if (r.nivelImpacto === '') regla('nivelImpacto', 'selecciona el nivel de impacto.');
        let objetoFalta = false;
        if (r.carreraId !== '' && r.nivelImpacto !== '' && !esPerfil(r.nivelImpacto)) {
          if (r.objetoId === '') {
            objetoFalta = true;
            regla('objetoId', MENSAJE_OBJETO[r.nivelImpacto] ?? 'selecciona la asignatura.');
          }
          if (r.nivelImpacto === 'RECURSO' && r.recurso.trim().length < 3) regla('recurso', 'indica qué recurso se ve afectado.');
        }
        if (r.descripcion.trim().length < 20) regla('descripcion', 'describe lo observado con al menos 20 caracteres.');
        if (r.fechaComprometida === '') regla('fechaComprometida', 'indica la fecha comprometida.');
        else if (v.fecha !== '' && r.fechaComprometida < v.fecha)
          regla('fechaComprometida', 'la fecha comprometida no puede ser anterior a la sesión.');
        if (r.carreraId !== '' && r.nivelImpacto !== '' && (r.objetoId !== '' || esPerfil(r.nivelImpacto))) {
          const clave = [r.carreraId, r.nivelImpacto, r.objetoId, r.recurso.trim().toLowerCase()].join('|');
          if (vistos.has(clave) && !objetoFalta) regla('nivelImpacto', 'ya hay otro registro igual en esta sesión.');
          vistos.add(clave);
        }
      });
    });
}

/** Prefija "Registro N: " en un mensaje del servidor que no lo trae (la API envía el texto sin prefijo). */
export function conPrefijoRegistro(indice: number, mensaje: string): string {
  const prefijo = `Registro ${String(indice + 1)}: `;
  return mensaje.startsWith('Registro ') ? mensaje : prefijo + minuscula(mensaje);
}
