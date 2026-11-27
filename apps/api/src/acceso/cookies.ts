import type { CookieOptions, Response } from 'express';

// El prefijo __Host- obliga al navegador a aceptar la cookie solo con Secure, Path=/ y sin Domain.
// __Secure- exige Secure, pero admite un Path más estrecho: la de renovación solo viaja a /api/acceso.
export const COOKIE_ACCESO = '__Host-ipss_acceso';
export const COOKIE_RENOVACION = '__Secure-ipss_renovacion';
export const RUTA_COOKIE_RENOVACION = '/api/acceso';

const base: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' };

export function fijarCookieAcceso(respuesta: Response, jwt: string, segundos: number): void {
  respuesta.cookie(COOKIE_ACCESO, jwt, { ...base, path: '/', maxAge: segundos * 1000 });
}

export function fijarCookieRenovacion(respuesta: Response, token: string, segundos: number): void {
  respuesta.cookie(COOKIE_RENOVACION, token, { ...base, path: RUTA_COOKIE_RENOVACION, maxAge: segundos * 1000 });
}

export function borrarCookies(respuesta: Response): void {
  respuesta.clearCookie(COOKIE_ACCESO, { ...base, path: '/' });
  respuesta.clearCookie(COOKIE_RENOVACION, { ...base, path: RUTA_COOKIE_RENOVACION });
}
