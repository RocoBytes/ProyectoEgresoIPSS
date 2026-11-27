import { useState, type FormEvent, type ReactNode } from 'react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Aviso, type TipoAviso } from '../comun/Aviso';
import { Icono } from '../comun/Icono';
import { Marca } from '../comun/Logo';
import type { ValoresIngreso } from './esquemaIngreso';

export interface AvisoIngreso {
  tipo: TipoAviso;
  titulo: string;
  rol: 'alert' | 'status';
  contenido?: ReactNode;
}

interface Props {
  registrar: UseFormRegister<ValoresIngreso>;
  errores: FieldErrors<ValoresIngreso>;
  alEnviar: (evento: FormEvent<HTMLFormElement>) => void;
  enviando: boolean;
  aviso: AvisoIngreso | null;
  olvidoAbierto: boolean;
  alAlternarOlvido: () => void;
}

const CLASE_INPUT =
  'w-full min-h-10 rounded-s border border-borde-fuerte bg-superficie px-3 py-2 transition-colors aria-invalid:border-error';
const CLASE_ERROR = 'text-[12.5px] font-semibold text-error';

function FichaDeMuestra() {
  return (
    <div
      aria-hidden="true"
      className="grid max-w-[400px] gap-3.5 rounded-r border border-linea-navy bg-navy-2 px-5 py-[18px] shadow-sombra-2 max-[900px]:hidden"
    >
      <div className="flex items-center justify-between gap-2.5">
        <span className="inline-block whitespace-nowrap rounded-xs border border-linea-navy bg-navy-3 px-[7px] py-0.5 font-mono text-[12.5px] leading-normal text-oro">
          R-2026-012
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-azul-borde bg-azul-claro px-2.5 py-[3px] text-xs font-bold text-azul-osc">
          <i className="size-1.5 rounded-full bg-current" />
          Abierto
        </span>
      </div>
      <div>
        <b className="block text-[14.5px]">Ingeniería en Informática</b>
        <span className="text-[12.5px] text-sobre-navy-2">Asignatura · Gestión de Proyectos</span>
      </div>
      <ol className="pista-ficha">
        <li className="hecho sig">
          <b>Sesión</b>
          <span className="det">22-10-2026 · Reunión con docentes</span>
        </li>
        <li className="hecho">
          <b>Registro</b>
          <span className="det">23-10-2026 · con el acta como origen</span>
        </li>
        <li>
          <b>Compromiso</b>
          <span className="det">Fecha acordada para el cambio</span>
        </li>
        <li>
          <b>Cierre</b>
          <span className="det">Fecha efectiva y evidencia</span>
        </li>
      </ol>
    </div>
  );
}

/** Presentacional: dibuja la pantalla de ingreso; el contenedor decide qué pasa al enviar. */
export function VistaIngreso({
  registrar,
  errores,
  alEnviar,
  enviando,
  aviso,
  olvidoAbierto,
  alAlternarOlvido,
}: Props) {
  const [verClave, setVerClave] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  const registroClave = registrar('contrasena');

  return (
    <div className="grid min-h-screen grid-cols-[minmax(0,11fr)_minmax(0,10fr)] max-[900px]:grid-cols-1 max-[900px]:grid-rows-[auto_1fr]">
      <section className="acceso-marca relative flex flex-col justify-between gap-8 overflow-hidden bg-navy py-10 pr-12 pb-8 pl-12 text-white max-[900px]:gap-[18px] max-[900px]:px-5 max-[900px]:py-6 *:relative *:z-[1]">
        <Marca tamano={40} />
        <div>
          <p className="max-w-[15ch] text-[32px] leading-[1.16] font-bold tracking-[-0.015em] text-balance max-[900px]:max-w-[24ch] max-[900px]:text-[22px]">
            Cada cambio curricular, trazado <em className="text-oro not-italic">del acta a la evidencia</em>
          </p>
          <p className="mt-3.5 max-w-[44ch] text-[14.5px] text-sobre-navy-2">
            Registra las sesiones con docentes, empresas y titulados, los cambios comprometidos en cada carrera y el
            cierre de cada uno con su respaldo.
          </p>
        </div>
        <FichaDeMuestra />
        <p className="text-xs text-sobre-navy-3 max-[900px]:hidden">Versión 1.0</p>
      </section>

      <section className="flex items-center justify-center bg-superficie px-6 py-10 max-[900px]:items-start max-[900px]:px-5 max-[900px]:pt-7 max-[900px]:pb-10">
        <div className="grid w-full max-w-[380px] gap-[22px]">
          <div>
            <h1 className="text-2xl leading-[1.2] font-bold tracking-[-0.01em] text-balance text-navy">Inicia sesión</h1>
            <p className="mt-1.5 text-texto-2">Ingresa con tu correo institucional.</p>
          </div>

          {aviso !== null && (
            <Aviso tipo={aviso.tipo} titulo={aviso.titulo} rol={aviso.rol}>
              {aviso.contenido}
            </Aviso>
          )}

          <form onSubmit={alEnviar} noValidate className="grid gap-4">
            <div className="grid min-w-0 content-start gap-1.5">
              <label htmlFor="ingreso-correo" className="text-[12.5px] font-semibold">
                Correo institucional
              </label>
              <input
                type="email"
                id="ingreso-correo"
                autoComplete="username"
                placeholder="nombre.apellido@instituto.example"
                aria-invalid={errores.correo ? true : undefined}
                aria-describedby={errores.correo ? 'ingreso-correo-error' : undefined}
                className={CLASE_INPUT}
                {...registrar('correo')}
              />
              {errores.correo?.message !== undefined && (
                <span id="ingreso-correo-error" className={CLASE_ERROR}>
                  {errores.correo.message}
                </span>
              )}
            </div>

            <div className="grid min-w-0 content-start gap-1.5">
              <label htmlFor="ingreso-contrasena" className="text-[12.5px] font-semibold">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={verClave ? 'text' : 'password'}
                  id="ingreso-contrasena"
                  autoComplete="current-password"
                  aria-invalid={errores.contrasena ? true : undefined}
                  aria-describedby={errores.contrasena ? 'ingreso-contrasena-error' : undefined}
                  className={`${CLASE_INPUT} pr-[46px]`}
                  {...registroClave}
                  onBlur={(evento) => {
                    setMayusculas(false);
                    void registroClave.onBlur(evento);
                  }}
                  onKeyDown={(evento) => {
                    setMayusculas(evento.getModifierState('CapsLock'));
                  }}
                  onKeyUp={(evento) => {
                    setMayusculas(evento.getModifierState('CapsLock'));
                  }}
                />
                <button
                  type="button"
                  aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={verClave}
                  onClick={() => {
                    setVerClave((actual) => !actual);
                  }}
                  className="absolute top-0.5 right-0.5 inline-flex size-9 cursor-pointer items-center justify-center rounded-s text-texto-2 hover:bg-neutro-fondo hover:text-navy"
                >
                  <Icono nombre={verClave ? 'ojoNo' : 'ojo'} />
                </button>
              </div>
              {mayusculas && <span className="text-xs text-texto-2">Bloq Mayús está activado.</span>}
              {errores.contrasena?.message !== undefined && (
                <span id="ingreso-contrasena-error" className={CLASE_ERROR}>
                  {errores.contrasena.message}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-s bg-azul px-4 text-[13.5px] font-semibold whitespace-nowrap text-white hover:bg-azul-osc disabled:cursor-not-allowed disabled:opacity-55"
            >
              {enviando ? (
                <>
                  <span className="giro" aria-hidden="true" />
                  Verificando
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>

            <div>
              <button
                type="button"
                aria-expanded={olvidoAbierto}
                onClick={alAlternarOlvido}
                className="cursor-pointer text-left text-[12.5px] font-semibold text-azul-osc hover:underline hover:underline-offset-[3px]"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            {olvidoAbierto && (
              <Aviso tipo="neutro">
                La contraseña la restablece el administrador del sistema. Escríbele desde tu correo institucional y te
                enviará una clave temporal.
              </Aviso>
            )}
          </form>

          <p className="flex items-start gap-2 border-t border-borde pt-4 text-xs text-texto-2">
            <Icono nombre="candado" />
            <span>Acceso para personal autorizado. Tras cinco intentos fallidos, la cuenta se bloquea por 15 minutos.</span>
          </p>
        </div>
      </section>
    </div>
  );
}
