import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useSesion } from '../acceso/sesion';
import { Aviso } from '../comun/Aviso';
import { fechaTexto, marcaTexto } from '../comun/fecha-texto';
import { FilaDescarga } from '../comun/FilaDescarga';
import { Icono } from '../comun/Icono';
import { Boton } from '../comun/ui/Boton';
import { Campo, Selector } from '../comun/ui/Campo';
import { Pill, Tarjeta } from '../comun/ui/Marcas';
import { obtenerCatalogos } from '../sesiones/api';
import { obtenerMallas } from './api';
import { DialogoMalla } from './DialogoMalla';

export function PaginaMallas() {
  const [parametros, setParametros] = useSearchParams();
  const [subiendo, setSubiendo] = useState(false);
  const { data: usuario } = useSesion();
  const catalogos = useQuery({ queryKey: ['catalogos'], queryFn: obtenerCatalogos });
  const sectores = catalogos.data?.sectores ?? [];
  const carreras = catalogos.data?.carreras ?? [];

  // Por defecto, la primera carrera del alcance de la persona (en el orden del catálogo); si no tiene ninguna, la primera de la lista.
  const propias = new Set(usuario?.alcance.carreras.map((c) => c.id));
  const porDefecto = (carreras.find((c) => propias.has(c.id)) ?? carreras[0])?.id ?? '';
  const pedida = parametros.get('carrera') ?? '';
  const carreraId = carreras.some((c) => c.id === pedida) ? pedida : porDefecto;
  const carrera = carreras.find((c) => c.id === carreraId);

  const mallas = useQuery({
    queryKey: ['mallas', carreraId],
    queryFn: () => obtenerMallas(carreraId),
    enabled: carreraId !== '',
  });
  const versiones = mallas.data?.versiones ?? [];
  const permisos = mallas.data?.permisos;

  return (
    <section aria-labelledby="titulo-pagina" className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="titulo-pagina" className="text-2xl font-bold text-navy">
            Mallas
          </h1>
          <p className="text-texto-2">Versiones de malla por carrera. Un registro de nivel malla apunta a una de estas versiones.</p>
        </div>
        {permisos?.puedeSubir === true && (
          <Boton
            onClick={() => {
              setSubiendo(true);
            }}
          >
            <Icono nombre="subir" />
            Subir versión
          </Boton>
        )}
      </div>

      <Tarjeta>
        <Campo id="m-carrera" etiqueta="Carrera" className="max-w-[440px]">
          <Selector
            id="m-carrera"
            value={carreraId}
            onChange={(e) => {
              setParametros({ carrera: e.target.value });
            }}
          >
            {sectores.map((s) => (
              <optgroup key={s.id} label={s.nombre}>
                {carreras
                  .filter((c) => c.sectorId === s.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Selector>
        </Campo>
      </Tarjeta>

      {permisos?.puedeSubir === false && (
        <Aviso tipo="neutro" titulo="Solo consulta">
          {permisos.motivoConsulta}
        </Aviso>
      )}

      {(catalogos.isError || mallas.isError) && (
        <div className="grid justify-items-start gap-2">
          <Aviso tipo="error" rol="alert">
            {catalogos.isError ? 'No se pudieron cargar las carreras. Inténtalo de nuevo.' : 'No se pudieron cargar las mallas. Inténtalo de nuevo.'}
          </Aviso>
          <Boton
            variante="secundario"
            onClick={() => {
              void (catalogos.isError ? catalogos.refetch() : mallas.refetch());
            }}
          >
            Reintentar
          </Boton>
        </div>
      )}
      {catalogos.isPending && (
        <p role="status" className="text-texto-2">
          Cargando
        </p>
      )}
      {catalogos.isSuccess && carreras.length === 0 && <Aviso tipo="info">Aún no hay carreras registradas.</Aviso>}
      {!catalogos.isPending && mallas.data === undefined && !mallas.isError && carreraId !== '' && (
        <p role="status" className="text-texto-2">
          Cargando
        </p>
      )}

      {mallas.data !== undefined && versiones.length === 0 && carrera !== undefined && (
        <Tarjeta className="grid justify-items-center gap-2 py-10 text-center">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-oro-claro text-oro-osc">
            <Icono nombre="mallas" />
          </span>
          <b className="text-navy">{carrera.nombre} aún no tiene versiones de malla</b>
          <span className="text-texto-2">Sin una versión cargada no se pueden crear registros de nivel malla para esta carrera.</span>
        </Tarjeta>
      )}

      {versiones.length > 0 && (
        <div className="overflow-x-auto rounded-r border border-borde bg-superficie">
          <table className="w-full min-w-[660px] text-left text-[13px]">
            <thead className="bg-superficie-2 text-xs text-texto-2">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Versión
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Vigente desde
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Archivo
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Subida por
                </th>
              </tr>
            </thead>
            <tbody>
              {versiones.map((m) => (
                <tr key={m.id} className="border-t border-borde">
                  <td className="px-3 py-2.5 align-top">
                    <b>Malla {m.anio}</b> {m.vigente && <Pill tono="azul">Vigente</Pill>}
                  </td>
                  <td className="px-3 py-2.5 align-top whitespace-nowrap">{fechaTexto(m.vigenteDesde)}</td>
                  <td className="min-w-[260px] px-3 py-2.5 align-top">
                    <ul>
                      <FilaDescarga e={m.archivo} />
                    </ul>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <span className="grid">
                      <span>{m.subidaPor}</span>
                      <span className="text-xs whitespace-nowrap text-texto-2">{marcaTexto(m.creadaEn)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {carrera !== undefined && (
        <DialogoMalla
          carreraId={carrera.id}
          carreraNombre={carrera.nombre}
          versiones={versiones}
          abierto={subiendo}
          alCerrar={() => {
            setSubiendo(false);
          }}
        />
      )}
    </section>
  );
}
