import type { RespuestaSalud } from '@ipss/shared';
import { Logo } from '../comun/Logo';

interface Props {
  cargando: boolean;
  respuesta: RespuestaSalud | undefined;
  /** La API no contestó (red caída o respuesta inesperada). */
  sinRespuesta: boolean;
  alVolverAVerificar: () => void;
}

// La hora se muestra siempre en la zona de la institución, sin depender del equipo del usuario.
const formatoHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function Estado({ bueno, texto }: { bueno: boolean; texto: string }) {
  const colores = bueno
    ? 'bg-ok-fondo text-ok border-ok-borde'
    : 'bg-error-fondo text-error border-error-borde';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${colores}`}
    >
      <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {texto}
    </span>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-borde py-3 first:border-t-0">
      <dt className="font-semibold">{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function TarjetaSalud({ cargando, respuesta, sinRespuesta, alVolverAVerificar }: Props) {
  const apiEnLinea = respuesta !== undefined;
  const bdConectada = respuesta?.baseDeDatos === 'ok';
  const hora = respuesta === undefined ? null : formatoHora.format(new Date(respuesta.verificadoEn));

  return (
    <div className="min-h-screen">
      <header className="bg-navy px-6 py-4">
        <div className="flex items-center gap-3 leading-tight text-white">
          <Logo tamano={36} />
          <div>
            <b className="block text-[15px] font-bold">Perfil de Egreso</b>
            <span className="mt-0.5 block text-[11px] tracking-[.04em] text-sobre-navy-2">
              Plataforma de validación
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-8">
        <section
          aria-labelledby="titulo-estado"
          className="rounded-r border border-borde bg-superficie p-5 shadow-sombra-1"
        >
          <h1 id="titulo-estado" className="text-base font-bold text-navy">
            Estado del sistema
          </h1>

          {/* Región viva: los lectores de pantalla anuncian el resultado de cada verificación. */}
          <div aria-live="polite" className="mt-3">
            {cargando && respuesta === undefined && !sinRespuesta ? (
              <p className="py-3 text-texto-2">Verificando…</p>
            ) : (
              <dl>
                <Fila etiqueta="API">
                  <Estado bueno={apiEnLinea} texto={apiEnLinea ? 'En línea' : 'Sin respuesta'} />
                </Fila>
                <Fila etiqueta="Base de datos">
                  <Estado
                    bueno={bdConectada}
                    texto={bdConectada ? 'Conectada' : 'Sin conexión'}
                  />
                </Fila>
              </dl>
            )}
            {hora !== null && (
              <p className="mt-2 text-xs text-texto-2">Verificado a las {hora}</p>
            )}
          </div>

          <button
            type="button"
            onClick={alVolverAVerificar}
            disabled={cargando}
            className="mt-4 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-s border border-borde-fuerte bg-superficie px-4 text-[13.5px] font-semibold text-navy hover:border-navy hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul disabled:cursor-not-allowed disabled:opacity-55"
          >
            Volver a verificar
          </button>
        </section>
      </main>
    </div>
  );
}
