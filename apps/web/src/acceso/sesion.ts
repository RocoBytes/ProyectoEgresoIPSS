import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import type { UsuarioActual } from '@ipss/shared';
import { alExpirarSesion, renovarSesion, solicitarJson, solicitarSinContenido } from '../api/cliente';

export const CLAVE_SESION = ['yo'] as const;

export interface Credenciales {
  correo: string;
  contrasena: string;
}

export type MotivoSalida = 'salida' | 'expirada';

/**
 * /yo también intenta renovar ante un 401 (el JWT dura 15 min y el refresh sigue vivo),
 * pero su 401 final no es "sesión expirada": solo significa que nadie ha iniciado sesión.
 */
export function obtenerYo(): Promise<UsuarioActual> {
  return solicitarJson<UsuarioActual>('/api/acceso/yo', { renovarAlExpirar: true, avisarExpiracion: false });
}

export function ingresar(credenciales: Credenciales): Promise<UsuarioActual> {
  return solicitarJson<UsuarioActual>('/api/acceso/ingresar', { metodo: 'POST', cuerpo: credenciales });
}

export function salir(): Promise<void> {
  return solicitarSinContenido('/api/acceso/salir', { metodo: 'POST' });
}

/** Comparte la llamada con la renovación automática de las peticiones; `true` si se renovó. */
export function renovar(): Promise<boolean> {
  return renovarSesion();
}

export function useSesion() {
  return useQuery({
    queryKey: CLAVE_SESION,
    queryFn: obtenerYo,
    retry: false,
    // Evita volver a pedir /yo justo después de iniciar sesión o al cambiar de ruta.
    staleTime: 30_000,
  });
}

/** Ruta actual con su query, para volver a ella después de iniciar sesión de nuevo. */
function rutaActual(ubicacion: { pathname: string; search: string }): string {
  return `${ubicacion.pathname}${ubicacion.search}`;
}

export function rutaDeIngreso(motivo: MotivoSalida | null, volver: string | null): string {
  const parametros = new URLSearchParams();
  if (motivo !== null) parametros.set('motivo', motivo);
  if (volver !== null) parametros.set('volver', volver);
  const texto = parametros.toString();
  return texto === '' ? '/ingresar' : `/ingresar?${texto}`;
}

/** Cierra la sesión en la API, limpia lo que hay en memoria y lleva a la pantalla de ingreso. */
export function useCerrarSesion(): (motivo: MotivoSalida) => Promise<void> {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const ubicacion = useLocation();
  const ruta = useRef(rutaActual(ubicacion));
  useEffect(() => {
    ruta.current = rutaActual(ubicacion);
  }, [ubicacion]);

  return useCallback(
    async (motivo) => {
      try {
        await salir();
      } catch {
        // Aunque la API no responda, el usuario pidió salir: se limpia el lado del navegador.
      }
      const volver = motivo === 'expirada' ? ruta.current : null;
      cliente.clear();
      void navegar(rutaDeIngreso(motivo, volver), { replace: true });
    },
    [cliente, navegar],
  );
}

/** Cuando el cliente HTTP no logra recuperar la sesión, vuelve al ingreso recordando la ruta. */
export function useExpiracionDeSesion(): void {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const ubicacion = useLocation();
  const ruta = useRef(rutaActual(ubicacion));
  useEffect(() => {
    ruta.current = rutaActual(ubicacion);
  }, [ubicacion]);

  useEffect(
    () =>
      alExpirarSesion(() => {
        void navegar(rutaDeIngreso('expirada', ruta.current), { replace: true });
        cliente.clear();
      }),
    [cliente, navegar],
  );
}
