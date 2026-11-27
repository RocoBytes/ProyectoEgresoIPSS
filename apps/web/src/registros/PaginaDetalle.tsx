import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { DetalleRegistro } from '@ipss/shared';
import { ErrorApi } from '../api/cliente';
import { Aviso } from '../comun/Aviso';
import { FilaDescarga } from '../comun/FilaDescarga';
import { fechaTexto, hoyEnSantiago, marcaTexto } from '../comun/fecha-texto';
import { Icono } from '../comun/Icono';
import { etiquetaNivel } from '../comun/niveles';
import { Boton } from '../comun/ui/Boton';
import { cn } from '../comun/ui/cn';
import { Folio, Pill, Tarjeta } from '../comun/ui/Marcas';
import { obtenerDetalle } from './api';
import { DialogoAnular } from './DialogoAnular';
import { DialogoCerrar } from './DialogoCerrar';
import { DialogoEditar } from './DialogoEditar';
import { pasosTrazabilidad, textoHistorial, TITULO_HISTORIAL } from './trazabilidad';

function Dato({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-semibold text-texto-2">{t}</dt>
      <dd className="mb-3 [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

const CLASE_PASO: Record<string, string> = {
  hecho: 'border-azul',
  ok: 'border-ok',
  alerta: 'border-alerta',
  neutro: 'border-neutro',
  '': 'border-borde-fuerte',
};

function Contenido({ r }: { r: DetalleRegistro }) {
  const [dialogo, setDialogo] = useState<'editar' | 'cerrar' | 'anular' | null>(null);
  const cerrarDialogo = () => {
    setDialogo(null);
  };
  const abierto = r.estado === 'ABIERTO';
  const historial = [...r.historial].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const sello =
    r.estado === 'CERRADO' ? `Cerrado · ${r.fechaEfectiva !== null ? fechaTexto(r.fechaEfectiva) : ''}` : r.estado === 'ANULADO' ? 'Anulado' : 'Abierto';
  const { evidencias } = r.sesion;
  return (
    <section aria-labelledby="titulo-pagina" className="grid gap-4">
      <nav aria-label="Ruta de navegación" className="text-[13px] text-texto-2">
        <Link to="/registros" className="underline">
          Registros
        </Link>{' '}
        › <span>{r.correlativo}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <Folio className="text-base">{r.correlativo}</Folio>
        <h1 id="titulo-pagina" className="text-2xl font-bold text-navy">
          {r.carrera.nombre}
        </h1>
        <span className="rounded-xs border border-current px-3 py-1 text-[11.5px] font-bold tracking-widest text-azul-osc uppercase">{sello}</span>
        {r.vencido && <Pill tono="alerta">Vencido</Pill>}
        {abierto && r.permisos.puedeModificar && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Boton variante="fantasma" onClick={() => setDialogo('anular')}>
              <Icono nombre="anular" />
              Anular
            </Boton>
            <Boton variante="secundario" onClick={() => setDialogo('editar')}>
              Editar
            </Boton>
            <Boton onClick={() => setDialogo('cerrar')}>
              <Icono nombre="check" />
              Cerrar con evidencia
            </Boton>
          </div>
        )}
      </div>
      {abierto && !r.permisos.puedeModificar && (
        <Aviso tipo="neutro" titulo="Solo consulta">
          {r.permisos.motivoConsulta}
        </Aviso>
      )}

      <Tarjeta>
        <ol aria-label="Trazabilidad del registro" className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
          {pasosTrazabilidad(r, hoyEnSantiago()).map((p) => (
            <li key={p.nombre} className={cn('grid gap-0.5 border-t-4 pt-2 text-[13px]', CLASE_PASO[p.clase])}>
              <span className="text-xs font-semibold text-texto-2">{p.nombre}</span>
              <b className="text-navy">{p.valor}</b>
              <span className={p.clase === 'alerta' ? 'text-alerta' : 'text-texto-2'}>{p.detalle}</span>
            </li>
          ))}
        </ol>
      </Tarjeta>

      <div className="grid grid-cols-2 items-start gap-4 max-[900px]:grid-cols-1">
        <div className="grid gap-4">
          <Tarjeta>
            <h2 className="mb-3 text-base font-bold text-navy">Datos del registro</h2>
            <dl>
              <Dato t="Sector">{r.sector.nombre}</Dato>
              <Dato t="Carrera">{r.carrera.nombre}</Dato>
              <Dato t="Nivel de impacto">{etiquetaNivel(r.nivelImpacto)}</Dato>
              <Dato t="Objeto afectado">{r.recurso !== null ? `${r.objeto} · ${r.recurso}` : r.objeto}</Dato>
              <Dato t="Descripción">{r.descripcion}</Dato>
              {r.estado === 'CERRADO' && r.evidenciaCierre !== null && (
                <Dato t="Evidencia de cierre">
                  <ul>
                    <FilaDescarga e={r.evidenciaCierre} />
                  </ul>
                  <span className="font-mono text-xs text-texto-2">SHA-256 {r.evidenciaCierre.sha256.slice(0, 24)}…</span>
                </Dato>
              )}
              {r.comentarioCierre !== null && <Dato t="Comentario de cierre">{r.comentarioCierre}</Dato>}
              {r.estado === 'ANULADO' && <Dato t="Motivo de anulación">{r.motivoAnulacion}</Dato>}
            </dl>
          </Tarjeta>
          <Tarjeta>
            <h2 className="mb-3 text-base font-bold text-navy">Sesión de origen</h2>
            <dl>
              <Dato t="Instancia">{r.sesion.instancia}</Dato>
              <Dato t="Canal">{r.sesion.canal}</Dato>
              <Dato t="Fecha">{fechaTexto(r.sesion.fecha)}</Dato>
              <Dato t="Participantes">
                {r.sesion.participantes.map((p) => (
                  <span key={p} className="block">
                    {p}
                  </span>
                ))}
              </Dato>
              <Dato t="Evidencia de origen">
                <ul className="grid gap-1.5">
                  {evidencias.acta !== null && <FilaDescarga e={evidencias.acta} />}
                  {evidencias.fotos.map((f) => (
                    <FilaDescarga key={f.id} e={f} />
                  ))}
                </ul>
                {evidencias.acta !== null && (
                  <span className="font-mono text-xs text-texto-2">SHA-256 del acta {evidencias.acta.sha256.slice(0, 24)}…</span>
                )}
              </Dato>
            </dl>
          </Tarjeta>
        </div>
        <div className="grid gap-4">
          <Tarjeta>
            <h2 className="mb-3 text-base font-bold text-navy">Historial</h2>
            <ol className="grid gap-3">
              {historial.map((h, i) => (
                <li key={`${h.tipo}-${h.fecha}-${String(i)}`} className="grid gap-0.5 border-l-2 border-borde-fuerte pl-3 text-[13px]">
                  <b className="text-navy">{TITULO_HISTORIAL[h.tipo]}</b>
                  <span className="text-xs text-texto-2">
                    {marcaTexto(h.fecha)} · {h.usuario}
                  </span>
                  <p>{textoHistorial(h, r)}</p>
                </li>
              ))}
            </ol>
          </Tarjeta>
          <Tarjeta>
            <h2 className="mb-3 text-base font-bold text-navy">Otros registros de la sesión</h2>
            {r.otrosRegistros.length === 0 ? (
              <p className="text-texto-2">Esta sesión tiene un solo registro.</p>
            ) : (
              <ul className="grid gap-2">
                {r.otrosRegistros.map((o) => (
                  <li key={o.id}>
                    <Link to={`/registros/${o.id}`} className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-s border border-borde px-3 py-2 hover:bg-superficie-2">
                      <Folio>{o.correlativo}</Folio>
                      <span className="grid text-[13px]">
                        <b>{o.carrera}</b>
                        <span className="text-texto-2">
                          {etiquetaNivel(o.nivelImpacto)} · {o.objeto}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
      <DialogoEditar registro={r} abierto={dialogo === 'editar'} alCerrar={cerrarDialogo} />
      <DialogoCerrar registro={r} abierto={dialogo === 'cerrar'} alCerrar={cerrarDialogo} />
      <DialogoAnular registro={r} abierto={dialogo === 'anular'} alCerrar={cerrarDialogo} />
    </section>
  );
}

export function PaginaDetalle() {
  const { id = '' } = useParams();
  const consulta = useQuery({ queryKey: ['registros', 'detalle', id], queryFn: () => obtenerDetalle(id) });
  if (consulta.data !== undefined) return <Contenido r={consulta.data} />;
  if (consulta.error instanceof ErrorApi && (consulta.error.estado === 404 || consulta.error.estado === 400)) {
    return (
      <section aria-labelledby="titulo-pagina" className="grid justify-items-start gap-3">
        <h1 id="titulo-pagina" className="text-2xl font-bold text-navy">
          No encontramos ese registro
        </h1>
        <Link to="/registros" className="font-semibold text-azul-osc underline">
          Volver al listado
        </Link>
      </section>
    );
  }
  if (consulta.isError) {
    return (
      <Aviso tipo="error" rol="alert">
        No se pudo cargar el registro. Inténtalo de nuevo.
      </Aviso>
    );
  }
  return (
    <p role="status" className="text-texto-2">
      Cargando
    </p>
  );
}
