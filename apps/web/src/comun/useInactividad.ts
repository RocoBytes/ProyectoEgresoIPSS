import { useEffect, useRef } from 'react';

/** Sin interacción durante este tiempo, la sesión se cierra (igual que el refresh de la API). */
export const INACTIVIDAD_MS = 15 * 60_000;
/** Con interacción, se renueva la sesión cuando pasó este tiempo desde la última renovación. */
export const RENOVACION_MS = 10 * 60_000;
export const REVISION_MS = 30_000;
// Un pointerdown o una tecla pueden dispararse decenas de veces por segundo; basta anotar uno por segundo.
const ESPACIO_ENTRE_ANOTACIONES_MS = 1_000;

const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

interface Acciones {
  alExpirar: () => void;
  /** Resuelve `true` si la renovación salió bien; si no, se reintenta en la próxima revisión. */
  alRenovar: () => Promise<boolean>;
}

/**
 * Cierra la sesión tras 15 minutos sin interacción y, mientras la persona sigue trabajando,
 * renueva la sesión cada 10 minutos para que escribir un formulario largo no la deje vencer.
 */
export function useInactividad({ alExpirar, alRenovar }: Acciones): void {
  const acciones = useRef({ alExpirar, alRenovar });
  useEffect(() => {
    acciones.current = { alExpirar, alRenovar };
  }, [alExpirar, alRenovar]);

  useEffect(() => {
    let ultimaActividad = Date.now();
    let ultimaRenovacion = ultimaActividad;
    let renovando = false;
    let expirada = false;

    const anotar = () => {
      const ahora = Date.now();
      if (ahora - ultimaActividad >= ESPACIO_ENTRE_ANOTACIONES_MS) ultimaActividad = ahora;
    };
    for (const evento of EVENTOS) window.addEventListener(evento, anotar, { passive: true });

    const intervalo = setInterval(() => {
      const ahora = Date.now();
      if (ahora - ultimaActividad >= INACTIVIDAD_MS) {
        if (!expirada) {
          expirada = true;
          acciones.current.alExpirar();
        }
        return;
      }
      if (!renovando && ultimaActividad > ultimaRenovacion && ahora - ultimaRenovacion >= RENOVACION_MS) {
        renovando = true;
        acciones.current
          .alRenovar()
          .then((renovada) => {
            if (renovada) ultimaRenovacion = Date.now();
          })
          .catch(() => {
            // Se reintenta en la próxima revisión; la sesión no se cierra por un fallo pasajero.
          })
          .finally(() => {
            renovando = false;
          });
      }
    }, REVISION_MS);

    return () => {
      clearInterval(intervalo);
      for (const evento of EVENTOS) window.removeEventListener(evento, anotar);
    };
  }, []);
}
