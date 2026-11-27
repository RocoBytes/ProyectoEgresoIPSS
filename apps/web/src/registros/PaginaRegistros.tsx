import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { FilaRegistro } from '@ipss/shared';
import { useSesion } from '../acceso/sesion';
import { ErrorApi } from '../api/cliente';
import { guardarArchivo } from '../comun/descargar';
import { useToast } from '../comun/Toasts';
import { Aviso } from '../comun/Aviso';
import { fechaTexto } from '../comun/fecha-texto';
import { Icono } from '../comun/Icono';
import { NIVELES, etiquetaNivel } from '../comun/niveles';
import { plural } from '../comun/plural';
import { Boton, clasesBoton } from '../comun/ui/Boton';
import { Campo, Selector } from '../comun/ui/Campo';
import { Folio, Pill, Tarjeta } from '../comun/ui/Marcas';
import { obtenerCatalogos, obtenerObjetos } from '../sesiones/api';
import { exportarRegistros, listarRegistros, obtenerAnios } from './api';

export const ESTADOS = [
  { valor: 'ABIERTO', etiqueta: 'Abierto' },
  { valor: 'VENCIDO', etiqueta: 'Abierto y vencido' },
  { valor: 'CERRADO', etiqueta: 'Cerrado' },
  { valor: 'ANULADO', etiqueta: 'Anulado' },
];

const NOMBRE_ESTADO = { ABIERTO: 'Abierto', CERRADO: 'Cerrado', ANULADO: 'Anulado' } as const;
const TONO_ESTADO = { ABIERTO: 'azul', CERRADO: 'ok', ANULADO: 'neutro' } as const;

export function PillEstado({ estado, vencido }: { estado: FilaRegistro['estado']; vencido: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <Pill tono={TONO_ESTADO[estado]}>{NOMBRE_ESTADO[estado]}</Pill>
      {vencido && <Pill tono="alerta">Vencido</Pill>}
    </span>
  );
}

const col = createColumnHelper<FilaRegistro>();
const columnas = [
  col.accessor('correlativo', {
    header: 'N°',
    cell: (c) => (
      <Link to={`/registros/${c.row.original.id}`} className="underline-offset-2 hover:underline">
        <Folio>{c.getValue()}</Folio>
      </Link>
    ),
  }),
  col.accessor((f) => f.sesion.fecha, { id: 'sesion', header: 'Sesión', cell: (c) => <span className="whitespace-nowrap">{fechaTexto(c.getValue())}</span> }),
  col.accessor((f) => f.carrera.nombre, { id: 'carrera', header: 'Carrera' }),
  col.display({
    id: 'nivel',
    header: 'Nivel y objeto',
    cell: (c) => (
      <>
        <b className="block">{etiquetaNivel(c.row.original.nivelImpacto)}</b>
        <span className="text-texto-2">{c.row.original.objeto}</span>
      </>
    ),
  }),
  col.accessor('canal', { header: 'Canal' }),
  col.accessor('fechaComprometida', { header: 'Comprometido', cell: (c) => <span className="whitespace-nowrap">{fechaTexto(c.getValue())}</span> }),
  col.display({
    id: 'estado',
    header: 'Estado',
    cell: (c) => <PillEstado estado={c.row.original.estado} vencido={c.row.original.vencido} />,
  }),
];

const PARAMETROS_FILTRO = ['anio', 'sector', 'carrera', 'asignatura', 'canal', 'nivel', 'estado', 'q'] as const;

function numerosDePagina(actual: number, total: number): Array<number | null> {
  const paginas = new Set([1, total, actual - 1, actual, actual + 1].filter((p) => p >= 1 && p <= total));
  const orden = [...paginas].sort((a, b) => a - b);
  const salida: Array<number | null> = [];
  orden.forEach((p, i) => {
    const previa = orden[i - 1];
    if (previa !== undefined && p - previa > 1) salida.push(null);
    salida.push(p);
  });
  return salida;
}

export function PaginaRegistros() {
  const [parametros, setParametros] = useSearchParams();
  const navegar = useNavigate();
  const catalogos = useQuery({ queryKey: ['catalogos'], queryFn: obtenerCatalogos });
  const anios = useQuery({ queryKey: ['registros', 'anios'], queryFn: obtenerAnios });
  const carrera = parametros.get('carrera') ?? '';
  const objetos = useQuery({
    queryKey: ['objetos', carrera],
    queryFn: () => obtenerObjetos(carrera),
    enabled: carrera !== '',
  });
  const clave = parametros.toString();
  const lista = useQuery({ queryKey: ['registros', 'lista', clave], queryFn: () => listarRegistros(parametros) });

  const cambiar = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(parametros);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === '') nuevos.delete(k);
      else nuevos.set(k, v);
    }
    // Cualquier cambio de filtro vuelve a la primera página; solo el cambio de página la conserva.
    if (!('pagina' in cambios)) nuevos.delete('pagina');
    setParametros(nuevos);
  };

  const v = (k: string) => parametros.get(k) ?? '';
  const sectorNombre = (id: string) => catalogos.data?.sectores.find((s) => s.id === id)?.nombre ?? id;
  const carrerasVisibles = (catalogos.data?.carreras ?? []).filter((c) => v('sector') === '' || c.sectorId === v('sector'));

  const chips = useMemo(() => {
    const salida: Array<{ param: string; texto: string }> = [];
    if (v('anio') !== '') salida.push({ param: 'anio', texto: `Año ${v('anio')}` });
    if (v('sector') !== '') salida.push({ param: 'sector', texto: sectorNombre(v('sector')) });
    if (v('carrera') !== '')
      salida.push({ param: 'carrera', texto: catalogos.data?.carreras.find((c) => c.id === v('carrera'))?.nombre ?? v('carrera') });
    if (v('asignatura') !== '')
      salida.push({
        param: 'asignatura',
        texto: objetos.data?.asignaturas.find((a) => a.id === v('asignatura'))?.nombre ?? 'Asignatura',
      });
    if (v('canal') !== '')
      salida.push({ param: 'canal', texto: catalogos.data?.canales.find((c) => c.id === v('canal'))?.nombre ?? v('canal') });
    if (v('nivel') !== '') salida.push({ param: 'nivel', texto: NIVELES.find((n) => n.valor === v('nivel'))?.etiqueta ?? v('nivel') });
    if (v('estado') !== '') salida.push({ param: 'estado', texto: ESTADOS.find((e) => e.valor === v('estado'))?.etiqueta ?? v('estado') });
    if (v('q') !== '') salida.push({ param: 'q', texto: `Búsqueda: “${v('q')}”` });
    return salida;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, catalogos.data, objetos.data]);

  // TanStack Table devuelve funciones no memoizables; el componente no las pasa a hijos memoizados.
  // eslint-disable-next-line react-hooks/incompatible-library
  const tabla = useReactTable({
    data: lista.data?.filas ?? [],
    columns: columnas,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: lista.data?.total ?? 0,
  });

  const quitarTodos = () => {
    setParametros(new URLSearchParams());
  };
  const total = lista.data?.total ?? 0;
  const toast = useToast();
  // Igual que el menú lateral: Aseguramiento de la Calidad solo consulta y no ve el atajo para crear.
  const puedeCrear = useSesion().data?.puedeCrear === true;
  // Se exporta lo que muestra el listado: mismos filtros y, por eso, mismo total. Solo se quita la paginación.
  const exportar = useMutation({
    mutationFn: async () => {
      const { blob, nombre } = await exportarRegistros(parametros);
      const nombreFinal = nombre ?? `registros-${parametros.get('anio') ?? 'todos'}.xlsx`;
      guardarArchivo(blob, nombreFinal);
      return nombreFinal;
    },
    onSuccess: (nombre) => {
      toast(`Se generó ${nombre} con ${plural(total, 'fila', 'filas')}, las mismas del listado.`);
    },
  });
  const errorExportar = exportar.error === null ? null : exportar.error instanceof ErrorApi ? exportar.error.message : 'No se pudo generar el archivo. Inténtalo de nuevo.';
  const pagina = lista.data?.pagina ?? 1;
  const porPagina = lista.data?.porPagina ?? 10;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <section aria-labelledby="titulo-pagina" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="titulo-pagina" className="text-2xl font-bold text-navy">
          Registros
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Boton
            variante="secundario"
            disabled={total === 0 || exportar.isPending}
            aria-busy={exportar.isPending}
            onClick={() => {
              exportar.mutate();
            }}
          >
            <Icono nombre="tabla" />
            Exportar a Excel
          </Boton>
          {puedeCrear && (
            <Link to="/sesiones/nueva" className={clasesBoton({ variante: 'primario' })}>
              <Icono nombre="mas" />
              Nueva sesión
            </Link>
          )}
        </div>
      </div>
      {errorExportar !== null && (
        <Aviso tipo="error" rol="alert">
          {errorExportar}
        </Aviso>
      )}

      <Tarjeta className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[900px]:grid-cols-1" role="group" aria-label="Filtros">
        <Campo id="f-anio" etiqueta="Año de la sesión">
          <Selector id="f-anio" value={v('anio')} onChange={(e) => cambiar({ anio: e.target.value })}>
            <option value="">Todos</option>
            {(anios.data ?? []).map((a) => (
              <option key={a} value={String(a)}>
                {a}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo id="f-sector" etiqueta="Sector">
          <Selector id="f-sector" value={v('sector')} onChange={(e) => cambiar({ sector: e.target.value, carrera: '', asignatura: '' })}>
            <option value="">Todos</option>
            {(catalogos.data?.sectores ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo id="f-carrera" etiqueta="Carrera">
          <Selector id="f-carrera" value={v('carrera')} onChange={(e) => cambiar({ carrera: e.target.value, asignatura: '' })}>
            <option value="">Todas</option>
            {carrerasVisibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        {carrera !== '' && (
          <Campo id="f-asignatura" etiqueta="Asignatura">
            <Selector id="f-asignatura" value={v('asignatura')} onChange={(e) => cambiar({ asignatura: e.target.value })}>
              <option value="">Todas</option>
              {(objetos.data?.asignaturas ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
        )}
        <Campo id="f-canal" etiqueta="Canal">
          <Selector id="f-canal" value={v('canal')} onChange={(e) => cambiar({ canal: e.target.value })}>
            <option value="">Todos</option>
            {(catalogos.data?.canales ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo id="f-nivel" etiqueta="Nivel de impacto">
          <Selector id="f-nivel" value={v('nivel')} onChange={(e) => cambiar({ nivel: e.target.value })}>
            <option value="">Todos</option>
            {NIVELES.map((n) => (
              <option key={n.valor} value={n.valor}>
                {n.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo id="f-estado" etiqueta="Estado">
          <Selector id="f-estado" value={v('estado')} onChange={(e) => cambiar({ estado: e.target.value })}>
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>
      </Tarjeta>

      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Filtros aplicados">
          {chips.map((chip) => (
            <li
              key={chip.param}
              className="inline-flex items-center gap-1 rounded-full border border-azul-borde bg-azul-claro py-0.5 pr-1 pl-3 text-[12.5px] font-semibold text-azul-osc"
            >
              {chip.texto}
              <button
                type="button"
                aria-label={`Quitar el filtro ${chip.texto}`}
                className="grid size-6 cursor-pointer place-items-center rounded-full hover:bg-white"
                onClick={() => cambiar({ [chip.param]: '', ...(chip.param === 'carrera' ? { asignatura: '' } : {}) })}
              >
                <Icono nombre="x" className="size-3.5" />
              </button>
            </li>
          ))}
          <li>
            <Boton variante="enlace" onClick={quitarTodos}>
              Quitar todos
            </Boton>
          </li>
        </ul>
      )}

      {lista.isError && (
        <Aviso tipo="error" rol="alert">
          No se pudo cargar el listado. Inténtalo de nuevo.
        </Aviso>
      )}

      {lista.data !== undefined && (
        <h2 className="text-base font-bold text-navy" aria-live="polite">
          {plural(total, 'registro', 'registros')} {chips.length > 0 ? 'con los filtros aplicados' : 'en total'}
        </h2>
      )}

      {lista.data !== undefined && total === 0 && (
        <Tarjeta className="grid justify-items-center gap-2 py-10 text-center">
          <b className="text-navy">Ningún registro coincide</b>
          <span className="text-texto-2">Prueba con otro año o quita algún filtro.</span>
          <Boton variante="secundario" onClick={quitarTodos}>
            Quitar todos los filtros
          </Boton>
        </Tarjeta>
      )}

      {lista.data !== undefined && total > 0 && (
        <div className="overflow-x-auto rounded-r border border-borde bg-superficie">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="bg-superficie-2 text-xs text-texto-2">
              {tabla.getHeaderGroups().map((g) => (
                <tr key={g.id}>
                  {g.headers.map((h) => (
                    <th key={h.id} scope="col" className="px-3 py-2.5 font-semibold">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {tabla.getRowModel().rows.map((fila) => (
                <tr
                  key={fila.id}
                  className="cursor-pointer border-t border-borde hover:bg-superficie-2"
                  onClick={() => {
                    void navegar(`/registros/${fila.original.id}`);
                  }}
                >
                  {fila.getVisibleCells().map((c) => (
                    <td key={c.id} className="px-3 py-2.5 align-top">
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <span>
            Mostrando {(pagina - 1) * porPagina + 1} a {Math.min(pagina * porPagina, total)} de {total}
          </span>
          <div className="flex items-center gap-1.5">
            <Boton variante="icono" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => cambiar({ pagina: String(pagina - 1) })}>
              <Icono nombre="abajo" className="rotate-90" />
            </Boton>
            {numerosDePagina(pagina, paginas).map((p, i) =>
              p === null ? (
                <span key={`e${String(i)}`} aria-hidden="true">
                  …
                </span>
              ) : (
                <Boton
                  key={p}
                  variante={p === pagina ? 'primario' : 'secundario'}
                  className="size-9 min-h-0 px-0"
                  aria-label={`Página ${String(p)}`}
                  aria-current={p === pagina ? 'page' : undefined}
                  onClick={() => cambiar({ pagina: String(p) })}
                >
                  {p}
                </Boton>
              ),
            )}
            <Boton variante="icono" aria-label="Página siguiente" disabled={pagina >= paginas} onClick={() => cambiar({ pagina: String(pagina + 1) })}>
              <Icono nombre="abajo" className="-rotate-90" />
            </Boton>
          </div>
        </nav>
      )}
    </section>
  );
}

export { PARAMETROS_FILTRO };
