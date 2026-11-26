import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import type { UsuarioActual } from '@ipss/shared';
import { renovar, useCerrarSesion } from '../acceso/sesion';
import { Icono, type NombreIcono } from './Icono';
import { Marca } from './Logo';
import { useInactividad } from './useInactividad';

interface Elemento {
  ruta: string;
  etiqueta: string;
  icono: NombreIcono;
}

function elementosDe(usuario: UsuarioActual): Elemento[] {
  return [
    { ruta: '/', etiqueta: 'Panel', icono: 'panel' },
    // Aseguramiento de la Calidad solo consulta: no ve el atajo para crear.
    ...(usuario.puedeCrear ? [{ ruta: '/sesiones/nueva', etiqueta: 'Nueva sesión', icono: 'nueva' } as const] : []),
    { ruta: '/registros', etiqueta: 'Registros', icono: 'registros' },
    { ruta: '/mallas', etiqueta: 'Mallas', icono: 'mallas' },
  ];
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter((parte) => parte !== '')
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toUpperCase();
}

function MenuUsuario({ usuario, alCerrarSesion }: { usuario: UsuarioActual; alCerrarSesion: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const botonSalir = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    // Al abrir, el foco pasa al menú para que el teclado pueda usarlo de inmediato.
    botonSalir.current?.focus();
    const cerrarSiEsFuera = (evento: Event) => {
      if (raiz.current !== null && evento.target instanceof Node && !raiz.current.contains(evento.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('pointerdown', cerrarSiEsFuera);
    document.addEventListener('focusin', cerrarSiEsFuera);
    return () => {
      document.removeEventListener('pointerdown', cerrarSiEsFuera);
      document.removeEventListener('focusin', cerrarSiEsFuera);
    };
  }, [abierto]);

  return (
    <div
      ref={raiz}
      className="relative flex-none"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && abierto) {
          setAbierto(false);
          boton.current?.focus();
        }
      }}
    >
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-haspopup="true"
        aria-controls="menu-usuario"
        aria-label={`Cuenta de ${usuario.nombre}`}
        onClick={() => {
          setAbierto((actual) => !actual);
        }}
        className={`flex cursor-pointer items-center gap-2.5 rounded-full border py-1 pr-2.5 pl-1 text-left hover:border-borde hover:bg-superficie max-[900px]:p-1 ${abierto ? 'border-borde bg-superficie' : 'border-transparent'}`}
      >
        <span
          aria-hidden="true"
          className="grid size-[34px] flex-none place-items-center rounded-full bg-navy text-xs font-bold tracking-[.04em] text-oro"
        >
          {iniciales(usuario.nombre)}
        </span>
        <span className="grid leading-tight max-[900px]:hidden">
          <b className="text-[13px] text-navy">{usuario.nombre}</b>
          <span className="text-[11.5px] text-texto-2">{usuario.etiquetaRol}</span>
        </span>
        <Icono nombre="abajo" className="max-[900px]:hidden" />
      </button>

      {abierto && (
        <div
          id="menu-usuario"
          role="group"
          aria-label="Datos de la cuenta"
          className="absolute top-[calc(100%+8px)] right-0 z-[25] grid w-[280px] gap-3.5 rounded-r border border-borde bg-superficie p-4 shadow-sombra-2"
        >
          <dl className="grid gap-px">
            <dt className="text-xs font-semibold text-texto-2">Cuenta</dt>
            <dd className="mb-2 [overflow-wrap:anywhere]">
              <b>{usuario.nombre}</b>
              <br />
              <span className="text-[12.5px] text-texto-2">{usuario.correo}</span>
            </dd>
            <dt className="text-xs font-semibold text-texto-2">Perfil</dt>
            <dd className="mb-2 [overflow-wrap:anywhere]">{usuario.etiquetaRol}</dd>
            <dt className="text-xs font-semibold text-texto-2">Alcance</dt>
            <dd className="[overflow-wrap:anywhere]">{usuario.alcance.descripcion}</dd>
          </dl>
          <button
            ref={botonSalir}
            type="button"
            onClick={alCerrarSesion}
            className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-s border border-borde-fuerte bg-superficie px-4 text-[13.5px] font-semibold text-navy hover:border-navy hover:bg-superficie-2"
          >
            <Icono nombre="salir" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

/** Buscador de la barra superior: lleva al listado con solo el texto buscado (los demás filtros se reinician). */
function Buscador() {
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  return (
    <form
      role="search"
      className="mr-auto w-full max-w-[460px]"
      onSubmit={(evento) => {
        evento.preventDefault();
        const q = texto.trim();
        void navegar(q === '' ? '/registros' : `/registros?${new URLSearchParams({ q }).toString()}`);
      }}
    >
      <label htmlFor="buscar-global" className="sr-only">
        Buscar registros
      </label>
      <input
        id="buscar-global"
        type="search"
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
        }}
        placeholder="Buscar por N° de registro, asignatura o texto"
        className="min-h-10 w-full rounded-full border border-borde-fuerte bg-superficie px-4 text-[13px] text-texto"
      />
    </form>
  );
}

/** Estructura con sesión: barra lateral, barra superior con la cuenta y el contenido de la ruta. */
export function EstructuraApp({ usuario, children }: { usuario: UsuarioActual; children: ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const cerrarSesion = useCerrarSesion();

  useInactividad({
    alExpirar: () => {
      void cerrarSesion('expirada');
    },
    alRenovar: renovar,
  });

  return (
    <div className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:grid-rows-[auto_1fr]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-s focus:bg-superficie focus:px-3 focus:py-2 focus:font-semibold focus:text-navy"
      >
        Saltar al contenido
      </a>
      <aside className="sticky top-0 flex h-screen max-h-dvh flex-col gap-7 self-start bg-navy py-[22px] pr-3.5 pb-[18px] pl-3.5 text-white max-[900px]:static max-[900px]:h-auto max-[900px]:max-h-none max-[900px]:gap-2.5 max-[900px]:px-4 max-[900px]:py-3">
        <div className="flex items-center justify-between px-1.5 max-[900px]:px-0">
          <Marca tamano={34} />
          <button
            type="button"
            aria-label="Menú"
            aria-expanded={menuAbierto}
            aria-controls="navegacion"
            onClick={() => {
              setMenuAbierto((actual) => !actual);
            }}
            className="hidden size-9 cursor-pointer items-center justify-center rounded-s text-white hover:bg-navy-2 max-[900px]:inline-flex"
          >
            <Icono nombre={menuAbierto ? 'x' : 'menu'} />
          </button>
        </div>
        <nav
          id="navegacion"
          aria-label="Secciones"
          className={`nav-lateral grid gap-[3px] ${menuAbierto ? '' : 'max-[900px]:hidden'}`}
        >
          <span className="px-3 pb-2 text-[10.5px] font-bold tracking-[.14em] text-sobre-navy-3 uppercase max-[900px]:hidden">
            Gestión curricular
          </span>
          {elementosDe(usuario).map((elemento) => (
            <NavLink
              key={elemento.ruta}
              to={elemento.ruta}
              end={elemento.ruta === '/'}
              onClick={() => {
                setMenuAbierto(false);
              }}
              className="flex items-center gap-[11px] rounded-s px-3 py-2.5 text-[13.5px] font-semibold text-sobre-navy-2 hover:bg-velo-navy hover:text-white"
            >
              <Icono nombre={elemento.icono} />
              {elemento.etiqueta}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto px-3 text-[11.5px] text-sobre-navy-3 max-[900px]:hidden">Versión 1.0</p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-end gap-4 border-b border-borde bg-fondo/90 px-8 py-2.5 backdrop-blur-[10px] max-[900px]:min-h-14 max-[900px]:px-4 max-[900px]:py-2">
          <Buscador />
          <MenuUsuario
            usuario={usuario}
            alCerrarSesion={() => {
              void cerrarSesion('salida');
            }}
          />
        </header>
        <main id="contenido" tabIndex={-1} className="px-8 py-7 max-[900px]:px-4 max-[900px]:pt-5 max-[900px]:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
