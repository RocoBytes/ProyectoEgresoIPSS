import { type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { RespuestaPanel } from '@ipss/shared';
import { Aviso } from '../comun/Aviso';
import { Icono, type NombreIcono } from '../comun/Icono';
import { etiquetaNivel } from '../comun/niveles';
import { plural } from '../comun/plural';
import { Boton } from '../comun/ui/Boton';
import { Campo, Selector } from '../comun/ui/Campo';
import { cn } from '../comun/ui/cn';
import { Tarjeta } from '../comun/ui/Marcas';
import { obtenerCatalogos } from '../sesiones/api';
import { obtenerPanel } from './api';
import { Anillo } from './Anillo';
import { BarrasClicables, type FilaBarra } from './BarrasClicables';
import { COLORES, ESTADOS_PANEL, MESES, partesTexto, porcentaje, textoAjustes, ultimoMes } from './calculos';
import { Chispa } from './Chispa';
import { GraficoEstados } from './GraficoEstados';
import { GraficoMeses } from './GraficoMeses';

function Leyenda() {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-texto-2">
      {ESTADOS_PANEL.map((e) => (
        <li key={e.clave} className="flex items-center gap-1.5">
          <i aria-hidden="true" className="size-2.5 rounded-xs" style={{ background: COLORES[e.clave] }} />
          {e.etiqueta}
        </li>
      ))}
    </ul>
  );
}

interface PropsTile {
  etiqueta: string;
  icono: NombreIcono;
  valor: number;
  sub: string;
  subAtencion?: boolean;
  pie: ReactNode;
  oscuro?: boolean;
  tonoIcono?: 'azul' | 'verde' | 'dorado';
  alClic?: () => void;
}

const CLASE_ICONO = { azul: 'bg-azul-claro text-azul-osc', verde: 'bg-ok-fondo text-ok', dorado: 'bg-oro-claro text-oro-osc' };

function Tile({ etiqueta, icono, valor, sub, subAtencion = false, pie, oscuro = false, tonoIcono = 'azul', alClic }: PropsTile) {
  const clase = cn(
    'grid content-between gap-3 rounded-r border p-4 pb-[18px] text-left shadow-sombra-1',
    oscuro ? 'border-navy bg-navy text-white' : 'border-borde bg-superficie text-texto',
    alClic !== undefined && 'cursor-pointer transition hover:-translate-y-px hover:border-borde-fuerte',
    alClic !== undefined && oscuro && 'hover:border-navy-2',
  );
  const cuerpo = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className={cn('text-[12.5px] font-semibold', oscuro ? 'text-sobre-navy-2' : 'text-texto-2')}>{etiqueta}</span>
        <span aria-hidden="true" className={cn('grid size-8 flex-none place-items-center rounded-s', oscuro ? 'bg-navy-2 text-oro' : CLASE_ICONO[tonoIcono])}>
          <Icono nombre={icono} />
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2.5">
        <span className={cn('text-4xl leading-none font-bold tracking-tight', oscuro ? 'text-white' : 'text-navy')}>{valor}</span>
        <span className={cn('text-[12.5px]', subAtencion ? 'font-semibold text-alerta' : oscuro ? 'text-sobre-navy-2' : 'text-texto-2')}>{sub}</span>
      </span>
      {pie}
    </>
  );
  return alClic !== undefined ? (
    <button type="button" onClick={alClic} className={clase}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

function Medidor({ porcentajeLleno, fondo, relleno }: { porcentajeLleno: number; fondo: string; relleno: string }) {
  return (
    <span aria-hidden="true" className="block h-2 overflow-hidden rounded-xs" style={{ background: fondo }}>
      <span className="block h-full rounded-xs" style={{ width: `${String(porcentajeLleno)}%`, background: relleno }} />
    </span>
  );
}

function Indicador({ titulo, detalle, children }: { titulo: string; detalle: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      {children}
      <div className="grid gap-0.5 text-[13px]">
        <b className="text-navy">{titulo}</b>
        <span className="text-texto-2">{detalle}</span>
      </div>
    </div>
  );
}

interface PropsContenido {
  datos: RespuestaPanel;
  sector: string;
  carrera: string;
  nombreSector: string;
  nombreCarrera: string;
  alCambiarAnio: (anio: number) => void;
}

function Contenido({ datos, sector, carrera, nombreSector, nombreCarrera, alCambiarAnio }: PropsContenido) {
  const navegar = useNavigate();
  const { indicadores: ind, anio, hoy } = datos;
  const total = ind.total;
  const donde = carrera !== '' ? nombreCarrera : sector !== '' ? `el sector ${nombreSector}` : 'todos los sectores';
  const sinDatos = `Sin ajustes en ${String(anio)} para ${donde}.`;
  const hasta = ultimoMes(anio, hoy);

  // Del panel al listado viajan el año y los filtros del panel, más la dimensión en la que se hizo clic (que manda sobre la misma clave).
  const alListado = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ anio: String(anio) });
    if (sector !== '') p.set('sector', sector);
    if (carrera !== '') p.set('carrera', carrera);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    void navegar(`/registros?${p.toString()}`);
  };

  const serieAnio = (a: number) => {
    const meses = datos.porAnio.find((x) => x.anio === a)?.meses ?? [];
    return Array.from({ length: ultimoMes(a, hoy) }, (_, i) => meses[i] ?? 0);
  };
  const diferencia = ind.totalAnioAnterior === null ? 0 : total - ind.totalAnioAnterior;
  const alDia = ind.abiertos - ind.vencidos;

  const filasCanal: FilaBarra[] = datos.porCanal.map((c) => ({
    clave: c.id,
    nombre: c.nombre,
    total: c.total,
    detalle: `${c.nombre}: ${textoAjustes(c.total)}, ${String(porcentaje(c.total, total))} % de ${String(anio)}. Clic para verlos en el listado.`,
  }));
  const filasNivel: FilaBarra[] = datos.porNivel.map((n) => ({
    clave: n.nivel,
    nombre: etiquetaNivel(n.nivel),
    total: n.total,
    detalle: `${etiquetaNivel(n.nivel)}: ${textoAjustes(n.total)}, ${String(porcentaje(n.total, total))} % de ${String(anio)}. Clic para verlos en el listado.`,
  }));
  const filasGrupo: FilaBarra[] = datos.porGrupo.map((g) => ({
    clave: g.id,
    nombre: g.nombre,
    total: g.total,
    detalle: `${g.nombre}: ${textoAjustes(g.total)} (${partesTexto(g)}). Clic para verlos en el listado.`,
    segmentos: ESTADOS_PANEL.map((e) => ({ color: COLORES[e.clave], valor: g[e.clave] })),
  }));
  const claveGrupo = sector !== '' ? 'carrera' : 'sector';

  return (
    <>
      {total === 0 && (
        <Aviso tipo="info" titulo={`Sin ajustes en ${String(anio)} para ${donde}`}>
          {sector !== '' || carrera !== '' ? 'Los gráficos quedan en cero. Cambia el año o quita un filtro.' : 'Los gráficos quedan en cero. Elige otro año.'}
        </Aviso>
      )}

      <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2">
        <Tile
          oscuro
          icono="registros"
          etiqueta={`Ajustes registrados en ${String(anio)}`}
          valor={total}
          sub={ind.totalAnioAnterior === null ? 'Primer año con ajustes' : `${diferencia >= 0 ? '+' : '−'}${String(Math.abs(diferencia))} respecto de ${String(anio - 1)}`}
          pie={<Chispa valores={serieAnio(anio)} tono="oro" />}
          alClic={() => {
            alListado();
          }}
        />
        <Tile
          icono="reloj"
          etiqueta="Ajustes abiertos"
          valor={ind.abiertos}
          sub={ind.vencidos > 0 ? plural(ind.vencidos, 'vencido', 'vencidos') : 'Ninguno vencido'}
          subAtencion={ind.vencidos > 0}
          pie={
            <span aria-hidden="true" className="flex h-2 gap-0.5">
              {ind.abiertos === 0 ? (
                <span className="block flex-1 rounded-xs bg-neutro-fondo" />
              ) : (
                <>
                  {alDia > 0 && <span className="block min-w-1 rounded-xs" style={{ flex: alDia, background: COLORES.abiertos }} />}
                  {ind.vencidos > 0 && <span className="block min-w-1 rounded-xs" style={{ flex: ind.vencidos, background: COLORES.vencidos }} />}
                </>
              )}
            </span>
          }
          alClic={() => {
            alListado({ estado: 'ABIERTO' });
          }}
        />
        <Tile
          icono="check"
          tonoIcono="verde"
          etiqueta="Ajustes cerrados con evidencia"
          valor={ind.cerrados}
          sub={`${String(porcentaje(ind.cerrados, ind.vigentes))} % de los vigentes`}
          pie={<Medidor porcentajeLleno={porcentaje(ind.cerrados, ind.vigentes)} fondo="#e4f3ea" relleno={COLORES.cerrados} />}
          alClic={() => {
            alListado({ estado: 'CERRADO' });
          }}
        />
        <Tile
          icono="mallas"
          tonoIcono="dorado"
          etiqueta="Carreras con ajustes"
          valor={ind.carrerasConAjustes}
          sub={`de ${plural(ind.carrerasEnAlcance, 'carrera', 'carreras')}`}
          pie={<Medidor porcentajeLleno={porcentaje(ind.carrerasConAjustes, ind.carrerasEnAlcance)} fondo="#f7f0e0" relleno="#cfb47c" />}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-4 max-[1100px]:grid-cols-1">
        <Tarjeta>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-navy">Ajustes por mes</h2>
            <Leyenda />
          </div>
          <GraficoMeses anio={anio} porMes={datos.porMes} ultimoMes={hasta} donde={donde} />
        </Tarjeta>
        <Tarjeta>
          <h2 className="mb-3 text-base font-bold text-navy">Estados de ajustes</h2>
          <GraficoEstados
            indicadores={ind}
            alElegir={(estado) => {
              alListado({ estado });
            }}
          />
        </Tarjeta>
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-4 max-[1100px]:grid-cols-1">
        <Tarjeta>
          <h2 className="mb-3 text-base font-bold text-navy">Cumplimiento de cierres y plazos</h2>
          <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-1">
            <Indicador
              titulo="Cierre con evidencia"
              detalle={ind.vigentes > 0 ? `${String(ind.cerrados)} de ${plural(ind.vigentes, 'ajuste vigente', 'ajustes vigentes')}` : 'Sin ajustes vigentes'}
            >
              <Anillo parte={ind.cerrados} todo={ind.vigentes} color={COLORES.cerrados} pista="#e4f3ea" />
            </Indicador>
            <Indicador
              titulo="Cierres en plazo"
              detalle={ind.cerrados > 0 ? `${String(ind.enPlazo)} de ${plural(ind.cerrados, 'cierre', 'cierres')} en la fecha comprometida o antes` : 'Aún no hay cierres'}
            >
              <Anillo parte={ind.enPlazo} todo={ind.cerrados} color={COLORES.abiertos} pista="#e6f1fa" />
            </Indicador>
            <Indicador
              titulo="Ajustes abiertos al día"
              detalle={ind.abiertos > 0 ? `${String(alDia)} de ${plural(ind.abiertos, 'abierto', 'abiertos')} sin vencer` : 'No quedan ajustes abiertos'}
            >
              <Anillo parte={alDia} todo={ind.abiertos} color="#102b42" pista="#dce4eb" />
            </Indicador>
          </div>
        </Tarjeta>
        <Tarjeta>
          <h2 className="mb-3 text-base font-bold text-navy">Ajustes por año</h2>
          <ul className="grid gap-2.5">
            {datos.aniosDisponibles.map((a) => {
              const serie = serieAnio(a);
              const t = datos.porAnio.find((x) => x.anio === a)?.total ?? 0;
              return (
                <li key={a}>
                  <button
                    type="button"
                    aria-pressed={a === anio}
                    title={`${String(a)}: ${textoAjustes(t)} para ${donde}. La línea muestra los ajustes por mes de la sesión.`}
                    onClick={() => {
                      alCambiarAnio(a);
                    }}
                    className={cn(
                      'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[18px] rounded-s border bg-superficie-2 px-3.5 py-3 text-left hover:border-borde-fuerte',
                      a === anio ? 'border-azul bg-superficie ring-[3px] ring-azul/20' : 'border-borde',
                    )}
                  >
                    <span>
                      <span className="block text-[11px] font-bold tracking-widest text-texto-2">{a}</span>
                      <span className="block text-2xl leading-tight font-bold text-navy">
                        {t} <small className="text-xs font-medium text-texto-2">{t === 1 ? 'ajuste' : 'ajustes'}</small>
                      </span>
                    </span>
                    <Chispa valores={serie} tono={a === anio ? 'acento' : 'neutro'} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-3 items-start gap-4 max-[1100px]:grid-cols-1">
        <Tarjeta>
          <h2 className="mb-3 text-base font-bold text-navy">Ajustes por canal de origen</h2>
          <BarrasClicables
            filas={filasCanal}
            vacio={sinDatos}
            alElegir={(id) => {
              alListado({ canal: id });
            }}
          />
        </Tarjeta>
        <Tarjeta>
          <h2 className="mb-3 text-base font-bold text-navy">Ajustes por nivel de impacto</h2>
          <BarrasClicables
            filas={filasNivel}
            vacio={sinDatos}
            alElegir={(nivel) => {
              alListado({ nivel });
            }}
          />
        </Tarjeta>
        <Tarjeta>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-navy">{sector !== '' ? 'Ajustes por carrera' : 'Ajustes por sector'}</h2>
            <Leyenda />
          </div>
          <BarrasClicables
            filas={filasGrupo}
            vacio={sinDatos}
            alElegir={(id) => {
              alListado({ [claveGrupo]: id });
            }}
          />
        </Tarjeta>
      </div>

      <Tarjeta>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-navy">Últimas sesiones de retroalimentación</h2>
          <Boton
            variante="enlace"
            onClick={() => {
              alListado();
            }}
          >
            Ver estos ajustes en el listado
          </Boton>
        </div>
        {datos.ultimasSesiones.length === 0 ? (
          <p className="text-texto-2">{`Sin sesiones en ${String(anio)} para ${donde}.`}</p>
        ) : (
          <ul className="grid gap-2">
            {datos.ultimasSesiones.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    void navegar(`/registros/${s.primerRegistroId}`);
                  }}
                  className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-s border border-borde px-3 py-2 text-left hover:bg-superficie-2"
                >
                  <span className="grid w-10 justify-items-center text-xs text-texto-2">
                    <b className="text-lg leading-tight text-navy">{s.fecha.slice(8, 10)}</b>
                    <span>{MESES[Number(s.fecha.slice(5, 7)) - 1]}</span>
                  </span>
                  <span className="grid text-[13px]">
                    <b>{s.instancia}</b>
                    <span className="text-texto-2">{`${s.canal} · registrada por ${s.creadoPor}`}</span>
                  </span>
                  <span className="text-xs text-texto-2">{textoAjustes(s.ajustes)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

export function PaginaPanel() {
  const [parametros, setParametros] = useSearchParams();
  const catalogos = useQuery({ queryKey: ['catalogos'], queryFn: obtenerCatalogos });
  const anioUrl = parametros.get('anio') ?? '';
  const carrera = parametros.get('carrera') ?? '';
  // Una carrera fija su sector: si la URL trae solo la carrera, el sector sale del catálogo.
  const sector = parametros.get('sector') ?? catalogos.data?.carreras.find((c) => c.id === carrera)?.sectorId ?? '';
  const consulta = useQuery({
    queryKey: ['reportes', 'panel', anioUrl, sector, carrera],
    queryFn: () => obtenerPanel({ anio: anioUrl, sectorId: sector, carreraId: carrera }),
    placeholderData: keepPreviousData,
  });

  const cambiar = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(parametros);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === '') nuevos.delete(k);
      else nuevos.set(k, v);
    }
    setParametros(nuevos);
  };

  const sectores = catalogos.data?.sectores ?? [];
  const carreras = catalogos.data?.carreras ?? [];
  const nombreSector = sectores.find((s) => s.id === sector)?.nombre ?? '';
  const nombreCarrera = carreras.find((c) => c.id === carrera)?.nombre ?? '';
  const datos = consulta.data;
  const anioActivo = anioUrl !== '' ? Number(anioUrl) : datos?.anio;
  const chips: Array<{ clave: string; texto: string; quitar: Record<string, string> }> = [
    ...(sector !== '' ? [{ clave: 'sector', texto: nombreSector, quitar: { sector: '', carrera: '' } }] : []),
    ...(carrera !== '' ? [{ clave: 'carrera', texto: nombreCarrera, quitar: { carrera: '' } }] : []),
  ];

  return (
    <section aria-labelledby="titulo-pagina" className="grid gap-4">
      <div>
        <h1 id="titulo-pagina" className="text-2xl font-bold text-navy">
          Panel
        </h1>
        <p className="text-texto-2">Ajustes curriculares registrados a partir de la retroalimentación, según la fecha de cada sesión.</p>
      </div>
      {datos === undefined ? (
        consulta.isError ? (
          <Aviso tipo="error" rol="alert">
            No se pudo cargar el panel. Inténtalo de nuevo.
          </Aviso>
        ) : (
          <p role="status" className="text-texto-2">
            Cargando
          </p>
        )
      ) : (
        <>
          <Tarjeta aria-label="Filtros del panel">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-end gap-x-4 gap-y-3 max-[1100px]:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <span id="p-anio-etq" className="text-[13px] font-semibold text-navy">
                  Año
                </span>
                <div role="group" aria-labelledby="p-anio-etq" className="inline-flex min-h-10 gap-0.5 rounded-s bg-neutro-fondo p-[3px]">
                  {datos.aniosDisponibles.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={a === anioActivo}
                      onClick={() => {
                        cambiar({ anio: String(a) });
                      }}
                      className={cn(
                        'cursor-pointer rounded-xs px-4 py-1.5 text-[13px] font-semibold',
                        a === anioActivo ? 'bg-superficie text-navy shadow-sombra-1' : 'text-texto-2 hover:text-navy',
                      )}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <Campo id="p-sector" etiqueta="Sector">
                <Selector
                  id="p-sector"
                  value={sector}
                  onChange={(e) => {
                    cambiar({ sector: e.target.value, carrera: '' });
                  }}
                >
                  <option value="">Todos los sectores</option>
                  {sectores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo id="p-carrera" etiqueta="Carrera">
                <Selector
                  id="p-carrera"
                  value={carrera}
                  onChange={(e) => {
                    const id = e.target.value;
                    cambiar({ carrera: id, sector: id === '' ? sector : (carreras.find((c) => c.id === id)?.sectorId ?? sector) });
                  }}
                >
                  <option value="">{sector !== '' ? 'Todas las del sector' : 'Todas las carreras'}</option>
                  {carreras
                    .filter((c) => sector === '' || c.sectorId === sector)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                </Selector>
              </Campo>
              <p aria-live="polite" className="pb-2.5 text-[13px] whitespace-nowrap text-texto-2">
                <b className="text-navy">{datos.indicadores.total}</b> {datos.indicadores.total === 1 ? 'ajuste' : 'ajustes'} en {datos.anio}
              </p>
            </div>
            {chips.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {chips.map((c) => (
                  <span key={c.clave} className="inline-flex items-center gap-1 rounded-full border border-azul-borde bg-azul-claro py-0.5 pr-1 pl-3 text-[13px] font-semibold text-azul-osc">
                    {c.texto}
                    <button
                      type="button"
                      aria-label={`Quitar el filtro ${c.texto}`}
                      onClick={() => {
                        cambiar(c.quitar);
                      }}
                      className="grid size-6 cursor-pointer place-items-center rounded-full hover:bg-azul-borde"
                    >
                      <Icono nombre="x" className="size-3.5" />
                    </button>
                  </span>
                ))}
                <Boton
                  variante="enlace"
                  onClick={() => {
                    cambiar({ sector: '', carrera: '' });
                  }}
                >
                  Quitar filtros
                </Boton>
              </div>
            )}
          </Tarjeta>
          <Contenido
            datos={datos}
            sector={sector}
            carrera={carrera}
            nombreSector={nombreSector}
            nombreCarrera={nombreCarrera}
            alCambiarAnio={(a) => {
              cambiar({ anio: String(a) });
            }}
          />
        </>
      )}
    </section>
  );
}
