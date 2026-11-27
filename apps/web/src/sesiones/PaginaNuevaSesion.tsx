import { useState } from 'react';
import { useForm, useFieldArray, useWatch, type Control, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { DatosSesionNueva, RespuestaCatalogos, RespuestaSesionCreada, UsuarioActual } from '@ipss/shared';
import { useSesion } from '../acceso/sesion';
import { ErrorApi } from '../api/cliente';
import { Aviso } from '../comun/Aviso';
import { EnConstruccion } from '../comun/EnConstruccion';
import { fechaTexto, hoyEnSantiago } from '../comun/fecha-texto';
import { Icono } from '../comun/Icono';
import { etiquetaNivel, NIVELES } from '../comun/niveles';
import { plural } from '../comun/plural';
import { Boton } from '../comun/ui/Boton';
import { AreaTexto, Campo, Entrada, Selector } from '../comun/ui/Campo';
import { Dialogo } from '../comun/ui/Dialogo';
import { Folio, Tarjeta } from '../comun/ui/Marcas';
import { crearSesion, obtenerCatalogos, obtenerObjetos } from './api';
import { validarArchivo, type DestinoArchivo } from '../comun/archivos';
import { FilaArchivo } from '../comun/FilaArchivo';
import { ZonaArchivo } from '../comun/ZonaArchivo';
import { envioExcedeElTope, MENSAJE_ENVIO_GRANDE } from './archivos';
import { conPrefijoRegistro, crearEsquemaSesion, esPerfil, type RegistroForm, type SesionForm } from './esquema';

const registroVacio = (sectorId = '', carreraId = ''): RegistroForm => ({
  sectorId,
  carreraId,
  nivelImpacto: '',
  objetoId: '',
  recurso: '',
  descripcion: '',
  fechaComprometida: '',
});

/** Entradas del resumen de errores: ruta del campo y mensaje. */
function aplanar(errores: FieldErrors, ruta = ''): Array<[string, string]> {
  const salida: Array<[string, string]> = [];
  for (const [clave, valor] of Object.entries(errores)) {
    if (typeof valor !== 'object' || valor === null) continue;
    const camino = ruta === '' ? clave : `${ruta}.${clave}`;
    if ('message' in valor && typeof valor.message === 'string') salida.push([camino, valor.message]);
    else salida.push(...aplanar(valor as FieldErrors, camino));
  }
  return salida;
}

const mensajeDe = (e: { message?: string } | undefined) => e?.message;

function mapearCampoServidor(campo: string): string {
  return campo
    .replace(/^(registros\.\d+)\.(asignaturaId|versionMallaId)$/, '$1.objetoId')
    .replace(/^participantes\.\d+$/, 'participantes');
}

interface PropsRegistro {
  indice: number;
  formulario: UseFormReturn<SesionForm>;
  catalogos: RespuestaCatalogos;
  permitidas: RespuestaCatalogos['carreras'];
  unaSola: boolean;
  puedeQuitar: boolean;
  alQuitar: () => void;
}

function BloqueRegistro({ indice, formulario, catalogos, permitidas, unaSola, puedeQuitar, alQuitar }: PropsRegistro) {
  const { register, setValue, control, formState } = formulario;
  const prefijo = `registros.${indice}` as const;
  const todos = useWatch({ control, name: 'registros' });
  const r = todos[indice] ?? registroVacio();
  const fechaSesion = useWatch({ control, name: 'fecha' });
  const errores = formState.errors.registros?.[indice];
  const sectores = catalogos.sectores.filter((s) => permitidas.some((c) => c.sectorId === s.id));
  const carreras = permitidas.filter((c) => c.sectorId === r.sectorId);
  const carrera = permitidas.find((c) => c.id === r.carreraId);
  const objetos = useQuery({
    queryKey: ['objetos', r.carreraId],
    queryFn: () => obtenerObjetos(r.carreraId),
    enabled: r.carreraId !== '',
  });
  const nivel = r.nivelImpacto;
  const conObjeto = r.carreraId !== '' && nivel !== '' && !esPerfil(nivel);

  let objeto: React.ReactNode;
  if (r.carreraId === '' || nivel === '') {
    objeto = (
      <div className="grid content-start gap-1.5">
        <span className="text-[13px] font-semibold text-navy">Objeto afectado</span>
        <p className="pt-2.5 text-xs text-texto-2">Elige primero la carrera y el nivel de impacto.</p>
      </div>
    );
  } else if (esPerfil(nivel)) {
    objeto = (
      <div className="grid content-start gap-1.5">
        <span className="text-[13px] font-semibold text-navy">Objeto afectado</span>
        <p className="pt-2">
          {etiquetaNivel(nivel)} de {carrera?.nombre}
        </p>
      </div>
    );
  } else {
    const esMalla = nivel === 'MALLA';
    const lista = esMalla
      ? (objetos.data?.versionesMalla ?? []).map((m) => ({ id: m.id, nombre: `Malla ${String(m.anio)}` }))
      : nivel === 'MODULO'
        ? (objetos.data?.modulos ?? [])
        : (objetos.data?.asignaturas ?? []);
    const etiqueta = esMalla ? 'Versión de malla' : nivel === 'MODULO' ? 'Módulo' : 'Asignatura';
    const id = `${prefijo}.objetoId`;
    if (objetos.isSuccess && esMalla && lista.length === 0) {
      objeto = (
        <div className="grid content-start gap-1.5">
          <span className="text-[13px] font-semibold text-navy">{etiqueta}</span>
          <p id={id} tabIndex={-1} className="text-[12.5px] font-medium text-error">
            Esta carrera no tiene versiones de malla. Cárgala primero en Mallas.
          </p>
          {errores?.objetoId !== undefined && (
            <p className="text-[12.5px] font-medium text-error">{mensajeDe(errores.objetoId)}</p>
          )}
        </div>
      );
    } else {
      objeto = (
        <Campo id={id} etiqueta={etiqueta} error={mensajeDe(errores?.objetoId)}>
          <Selector id={id} error={mensajeDe(errores?.objetoId)} {...register(`${prefijo}.objetoId`)}>
            <option value="">Selecciona</option>
            {lista.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
      );
    }
  }

  const idDesc = `${prefijo}.descripcion`;
  return (
    <div className="grid gap-3.5 rounded-s border border-borde bg-superficie-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-navy">
          Registro {indice + 1}
          {carrera !== undefined ? ` · ${carrera.nombre}` : ''}
        </h3>
        {puedeQuitar && (
          <Boton variante="icono" aria-label={`Quitar el registro ${String(indice + 1)}`} onClick={alQuitar}>
            <Icono nombre="x" />
          </Boton>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3.5 max-[900px]:grid-cols-1">
        <Campo id={`${prefijo}.sectorId`} etiqueta="Sector" error={mensajeDe(errores?.sectorId)}>
          <Selector
            id={`${prefijo}.sectorId`}
            disabled={unaSola}
            error={mensajeDe(errores?.sectorId)}
            {...register(`${prefijo}.sectorId`, {
              onChange: () => {
                // Cambiar el sector invalida la carrera y, con ella, el objeto.
                setValue(`${prefijo}.carreraId`, '');
                setValue(`${prefijo}.objetoId`, '');
              },
            })}
          >
            <option value="">Selecciona</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo id={`${prefijo}.carreraId`} etiqueta="Carrera" error={mensajeDe(errores?.carreraId)}>
          <Selector
            id={`${prefijo}.carreraId`}
            disabled={unaSola || r.sectorId === ''}
            error={mensajeDe(errores?.carreraId)}
            {...register(`${prefijo}.carreraId`, {
              onChange: () => {
                setValue(`${prefijo}.objetoId`, '');
              },
            })}
          >
            <option value="">Selecciona</option>
            {carreras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo id={`${prefijo}.nivelImpacto`} etiqueta="Nivel de impacto" error={mensajeDe(errores?.nivelImpacto)}>
          <Selector
            id={`${prefijo}.nivelImpacto`}
            error={mensajeDe(errores?.nivelImpacto)}
            {...register(`${prefijo}.nivelImpacto`, {
              onChange: () => {
                setValue(`${prefijo}.objetoId`, '');
                setValue(`${prefijo}.recurso`, '');
              },
            })}
          >
            <option value="">Selecciona</option>
            {NIVELES.map((n) => (
              <option key={n.valor} value={n.valor}>
                {n.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>
        {objeto}
      </div>
      {conObjeto && nivel === 'RECURSO' && (
        <Campo id={`${prefijo}.recurso`} etiqueta="Recurso afectado" error={mensajeDe(errores?.recurso)}>
          <Entrada
            id={`${prefijo}.recurso`}
            placeholder="Laboratorio, guía, software"
            error={mensajeDe(errores?.recurso)}
            {...register(`${prefijo}.recurso`)}
          />
        </Campo>
      )}
      <Campo
        id={idDesc}
        etiqueta="Descripción de lo observado"
        ayuda={`${String(r.descripcion.trim().length)} caracteres. Mínimo 20.`}
        error={mensajeDe(errores?.descripcion)}
      >
        <AreaTexto
          id={idDesc}
          conAyuda
          placeholder="Qué se pidió cambiar y por qué, tal como quedó en el acta"
          error={mensajeDe(errores?.descripcion)}
          {...register(idDesc as `registros.${number}.descripcion`)}
        />
      </Campo>
      <Campo
        id={`${prefijo}.fechaComprometida`}
        etiqueta="Fecha comprometida"
        className="max-w-60"
        error={mensajeDe(errores?.fechaComprometida)}
      >
        <Entrada
          id={`${prefijo}.fechaComprometida`}
          type="date"
          min={fechaSesion === '' ? undefined : fechaSesion}
          error={mensajeDe(errores?.fechaComprometida)}
          {...register(`${prefijo}.fechaComprometida`)}
        />
      </Campo>
    </div>
  );
}

function ItemResumen({ listo, titulo, detalle }: { listo: boolean; titulo: string; detalle: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px]">
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-5 flex-none place-items-center rounded-full border ${listo ? 'border-ok bg-ok-fondo text-ok' : 'border-borde-fuerte text-transparent'}`}
      >
        <Icono nombre="check" className="size-3" />
      </span>
      <span className="grid">
        <b className="text-navy">
          {titulo}
          <span className="sr-only">{listo ? ': completo' : ': pendiente'}</span>
        </b>
        <span className="text-texto-2">{detalle}</span>
      </span>
    </li>
  );
}

function Resumen({
  control,
  acta,
  fotos,
  guardando,
  catalogos,
}: {
  control: Control<SesionForm>;
  acta: File | null;
  fotos: File[];
  guardando: boolean;
  catalogos: RespuestaCatalogos;
}) {
  const v = useWatch({ control });
  const registros = v.registros ?? [];
  const canal = catalogos.canales.find((c) => c.id === v.canalId)?.nombre;
  const okDatos = (v.canalId ?? '') !== '' && (v.fecha ?? '') !== '' && (v.instancia ?? '').trim().length >= 5 && (v.participantes ?? '').trim() !== '';
  const okRegistros = registros.every(
    (r) =>
      (r?.carreraId ?? '') !== '' &&
      (r?.nivelImpacto ?? '') !== '' &&
      (esPerfil(r?.nivelImpacto ?? '') || (r?.objetoId ?? '') !== '') &&
      (r?.descripcion ?? '').trim().length >= 20 &&
      (r?.fechaComprometida ?? '') !== '',
  );
  return (
    <Tarjeta aria-label="Resumen de la sesión" className="sticky top-20 grid content-start gap-4 max-[900px]:static">
      <h2 className="text-base font-bold text-navy">Resumen</h2>
      <ul className="grid gap-3">
        <ItemResumen
          listo={okDatos}
          titulo="Datos de la sesión"
          detalle={
            (v.canalId ?? '') !== '' || (v.fecha ?? '') !== ''
              ? `${canal ?? 'Sin canal'} · ${(v.fecha ?? '') !== '' ? fechaTexto(v.fecha ?? '') : 'sin fecha'}`
              : 'Por completar'
          }
        />
        <ItemResumen
          listo={acta !== null}
          titulo="Acta"
          detalle={
            acta !== null
              ? `${acta.name}${fotos.length > 0 ? ` y ${plural(fotos.length, 'fotografía', 'fotografías')}` : ''}`
              : 'Falta adjuntar el PDF'
          }
        />
        <ItemResumen listo={okRegistros} titulo={plural(registros.length, 'registro', 'registros')} detalle="Carrera, nivel, descripción y fecha" />
      </ul>
      <Boton type="submit" ancho="si" disabled={guardando}>
        {guardando ? 'Guardando' : 'Guardar sesión'}
      </Boton>
    </Tarjeta>
  );
}

function FormularioSesion({ usuario, catalogos }: { usuario: UsuarioActual; catalogos: RespuestaCatalogos }) {
  const clienteConsultas = useQueryClient();
  const idsPermitidos = new Set(usuario.alcance.carreras.map((c) => c.id));
  const permitidas = catalogos.carreras.filter((c) => idsPermitidos.has(c.id));
  const unaSola = permitidas.length === 1;
  const hoy = hoyEnSantiago();
  const formulario = useForm<SesionForm>({
    resolver: zodResolver(crearEsquemaSesion(hoy)),
    defaultValues: {
      canalId: '',
      fecha: '',
      instancia: '',
      participantes: '',
      registros: [unaSola && permitidas[0] ? registroVacio(permitidas[0].sectorId, permitidas[0].id) : registroVacio()],
    },
  });
  const { register, control, handleSubmit, setError, reset, formState } = formulario;
  const { fields, append, remove } = useFieldArray({ control, name: 'registros' });

  const [acta, setActa] = useState<File | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [errorActa, setErrorActa] = useState<string | null>(null);
  const [errorsFotos, setErrorsFotos] = useState<Record<string, string>>({});
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [pendiente, setPendiente] = useState<DatosSesionNueva | null>(null);
  const [avisoServidor, setAvisoServidor] = useState<string | null>(null);
  const [creada, setCreada] = useState<RespuestaSesionCreada | null>(null);

  const recibir = (destino: DestinoArchivo, archivos: File[]) => {
    for (const archivo of archivos) {
      const mensaje = validarArchivo(archivo.name, archivo.size, destino);
      setRechazo(mensaje);
      if (mensaje !== null) return;
      // El aviso del tope de 100 MB describe el conjunto anterior: cualquier cambio de archivos lo deja obsoleto.
      setErrorEnvio(null);
      if (destino === 'acta') {
        setActa(archivo);
        setErrorActa(null);
      } else setFotos((actuales) => [...actuales, archivo]);
    }
  };

  const guardar = useMutation({
    mutationFn: (datos: DatosSesionNueva) => {
      if (acta === null) throw new Error('Falta el acta');
      return crearSesion(datos, acta, fotos);
    },
    onSuccess: (respuesta) => {
      setPendiente(null);
      setCreada(respuesta);
      void clienteConsultas.invalidateQueries({ queryKey: ['registros'] });
    },
    onError: (error) => {
      setPendiente(null);
      if (!(error instanceof ErrorApi)) {
        setAvisoServidor('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
        return;
      }
      const cuerpo = error.cuerpo as { errores?: Array<{ campo: string; mensaje: string }> } | undefined;
      if (error.estado === 400 && Array.isArray(cuerpo?.errores)) {
        const nuevosFotos: Record<string, string> = {};
        for (const { campo, mensaje } of cuerpo.errores) {
          if (campo === 'acta') setErrorActa(mensaje);
          else if (campo.startsWith('fotos')) nuevosFotos[campo] = mensaje;
          else {
            const nombre = mapearCampoServidor(campo);
            const registro = /^registros\.(\d+)\./.exec(nombre);
            setError(nombre as 'canalId', {
              type: 'servidor',
              message: registro?.[1] !== undefined ? conPrefijoRegistro(Number(registro[1]), mensaje) : mensaje,
            });
          }
        }
        setErrorsFotos(nuevosFotos);
        setAvisoServidor(null);
      } else if (error.estado === 413 && cuerpo === undefined) {
        // Un proxy (Caddy, Cloudflare) cortó por tamaño total y no dejó mensaje: se explica igual que la API.
        setAvisoServidor(MENSAJE_ENVIO_GRANDE);
      } else setAvisoServidor(error.message);
    },
  });

  if (creada !== null) {
    return (
      <section aria-labelledby="titulo-pagina" className="grid gap-4">
        <div>
          <h1 id="titulo-pagina" className="text-2xl font-bold text-navy">
            Sesión registrada
          </h1>
          <p className="text-texto-2">
            {creada.instancia} · {fechaTexto(creada.fecha)}
          </p>
        </div>
        <Aviso tipo="ok" rol="status" titulo={`Se guardó la sesión con ${plural(creada.registros.length, 'registro', 'registros')}`}>
          Cada registro quedó abierto con su número. El acta respalda a todos como evidencia de origen.
        </Aviso>
        <div className="overflow-x-auto rounded-r border border-borde bg-superficie">
          <table className="w-full min-w-[600px] text-left text-[13px]">
            <thead className="bg-superficie-2 text-xs text-texto-2">
              <tr>
                <th className="px-3 py-2">N°</th>
                <th className="px-3 py-2">Carrera</th>
                <th className="px-3 py-2">Nivel y objeto</th>
                <th className="px-3 py-2">Comprometido</th>
              </tr>
            </thead>
            <tbody>
              {creada.registros.map((r) => (
                <tr key={r.id} className="border-t border-borde">
                  <td className="px-3 py-2">
                    <Link to={`/registros/${r.id}`}>
                      <Folio>{r.correlativo}</Folio>
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.carrera.nombre}</td>
                  <td className="px-3 py-2">
                    <b className="block">{etiquetaNivel(r.nivelImpacto)}</b>
                    <span className="text-texto-2">{r.objeto}</span>
                  </td>
                  <td className="px-3 py-2">{fechaTexto(r.fechaComprometida)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3">
          <Boton
            onClick={() => {
              setCreada(null);
              setActa(null);
              setFotos([]);
              setErrorsFotos({});
              setIntentado(false);
              reset();
            }}
          >
            <Icono nombre="nueva" />
            Registrar otra sesión
          </Boton>
          <Link
            to="/registros"
            className="inline-flex min-h-10 items-center rounded-s border border-borde-fuerte bg-superficie px-4 text-[13.5px] font-semibold text-navy hover:border-navy"
          >
            Ir al listado
          </Link>
        </div>
      </section>
    );
  }

  const aDatos = (v: SesionForm): DatosSesionNueva => ({
    canalId: v.canalId,
    fecha: v.fecha,
    instancia: v.instancia.trim(),
    participantes: v.participantes
      .split('\n')
      .map((x) => x.trim())
      .filter((x) => x !== ''),
    registros: v.registros.map((r) => ({
      carreraId: r.carreraId,
      nivelImpacto: r.nivelImpacto as Exclude<RegistroForm['nivelImpacto'], ''>,
      ...(r.nivelImpacto === 'MALLA' ? { versionMallaId: r.objetoId } : {}),
      ...(r.nivelImpacto === 'ASIGNATURA' || r.nivelImpacto === 'MODULO' || r.nivelImpacto === 'RECURSO'
        ? { asignaturaId: r.objetoId }
        : {}),
      ...(r.nivelImpacto === 'RECURSO' ? { recurso: r.recurso.trim() } : {}),
      descripcion: r.descripcion.trim(),
      fechaComprometida: r.fechaComprometida,
    })),
  });

  const alEnviar = (evento: React.FormEvent<HTMLFormElement>) => {
    setIntentado(true);
    setAvisoServidor(null);
    setErrorEnvio(null);
    setErrorActa(acta === null ? 'Adjunta el acta en PDF: es la evidencia de origen de la sesión.' : null);
    void handleSubmit((valores) => {
      if (acta === null) return;
      const datos = aDatos(valores);
      if (envioExcedeElTope(acta, fotos, JSON.stringify(datos))) setErrorEnvio(MENSAJE_ENVIO_GRANDE);
      else setPendiente(datos);
    })(evento);
  };

  const lista: Array<[string, string]> = [
    ...aplanar(formState.errors),
    ...(errorActa !== null ? ([['acta', errorActa]] as Array<[string, string]>) : []),
    ...(errorEnvio !== null ? ([[fotos.length > 0 ? 'fotos' : 'acta', errorEnvio]] as Array<[string, string]>) : []),
    ...Object.entries(errorsFotos),
  ];
  const nombreCarrera = (id: string) => catalogos.carreras.find((c) => c.id === id)?.nombre ?? '';
  const nombreObjeto = (carreraId: string, d: DatosSesionNueva['registros'][number]) => {
    const objetos = clienteConsultas.getQueryData<Awaited<ReturnType<typeof obtenerObjetos>>>(['objetos', carreraId]);
    if (d.versionMallaId !== undefined) {
      const m = objetos?.versionesMalla.find((x) => x.id === d.versionMallaId);
      return m !== undefined ? `Malla ${String(m.anio)}` : '';
    }
    if (d.asignaturaId !== undefined) {
      const o = [...(objetos?.asignaturas ?? []), ...(objetos?.modulos ?? [])].find((x) => x.id === d.asignaturaId);
      return `${o?.nombre ?? ''}${d.recurso !== undefined ? ` · ${d.recurso}` : ''}`;
    }
    return etiquetaNivel(d.nivelImpacto);
  };

  return (
    <section aria-labelledby="titulo-pagina" className="grid gap-4">
      <div>
        <h1 id="titulo-pagina" className="text-2xl font-bold text-navy">
          Nueva sesión
        </h1>
        <p className="text-texto-2">
          Una sesión es la reunión o el correo de donde salen los cambios. Cada cambio es un registro con su carrera y su
          fecha comprometida.
        </p>
      </div>

      {intentado && lista.length > 0 && (
        <div className="rounded-s border border-error-borde bg-error-fondo p-3.5 text-[13px] text-error" role="alert" tabIndex={-1}>
          <b>No se pudo guardar. Revisa {plural(lista.length, 'campo', 'campos')}:</b>
          <ul className="mt-1 grid gap-1">
            {lista.map(([ruta, mensaje]) => (
              <li key={ruta}>
                <button
                  type="button"
                  className="cursor-pointer text-left underline"
                  onClick={() => document.getElementById(ruta)?.focus()}
                >
                  {mensaje}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {avisoServidor !== null && (
        <Aviso tipo="error" rol="alert">
          {avisoServidor}
        </Aviso>
      )}

      <form noValidate onSubmit={alEnviar} className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5 max-[900px]:grid-cols-1">
        <div className="grid gap-5">
          <Tarjeta className="grid gap-4">
            <h2 className="flex items-center gap-2.5 text-base font-bold text-navy">
              <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-navy text-xs text-white">1</span>
              Datos de la sesión
            </h2>
            <div className="grid grid-cols-2 gap-3.5 max-[900px]:grid-cols-1">
              <Campo id="canalId" etiqueta="Canal" error={mensajeDe(formState.errors.canalId)}>
                <Selector id="canalId" error={mensajeDe(formState.errors.canalId)} {...register('canalId')}>
                  <option value="">Selecciona</option>
                  {catalogos.canales.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo id="fecha" etiqueta="Fecha de la sesión" error={mensajeDe(formState.errors.fecha)}>
                <Entrada id="fecha" type="date" max={hoy} error={mensajeDe(formState.errors.fecha)} {...register('fecha')} />
              </Campo>
            </div>
            <Campo id="instancia" etiqueta="Nombre de la instancia" error={mensajeDe(formState.errors.instancia)}>
              <Entrada
                id="instancia"
                placeholder="Comité sectorial de Tecnologías, tercera sesión 2026"
                error={mensajeDe(formState.errors.instancia)}
                {...register('instancia')}
              />
            </Campo>
            <Campo id="participantes" etiqueta="Participantes" error={mensajeDe(formState.errors.participantes)}>
              <AreaTexto
                id="participantes"
                placeholder="Uno por línea, con su cargo o la empresa que representa"
                error={mensajeDe(formState.errors.participantes)}
                {...register('participantes')}
              />
            </Campo>
          </Tarjeta>

          <Tarjeta className="grid gap-4">
            <h2 className="flex items-center gap-2.5 text-base font-bold text-navy">
              <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-navy text-xs text-white">2</span>
              Evidencia de origen
            </h2>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-navy">Acta de la sesión</span>
              {acta !== null ? (
                <ul className="grid gap-1.5">
                  <FilaArchivo
                    archivo={acta}
                    alQuitar={() => {
                      setActa(null);
                      setErrorEnvio(null);
                    }}
                  />
                </ul>
              ) : (
                <ZonaArchivo
                  id="acta"
                  etiqueta="Acta de la sesión"
                  texto="Arrastra el acta aquí o"
                  ayuda="PDF de hasta 20 MB. Respalda todos los registros de la sesión."
                  accept=".pdf,application/pdf"
                  alRecibir={(a) => recibir('acta', a)}
                />
              )}
              {errorActa !== null && <p className="text-[12.5px] font-medium text-error">{errorActa}</p>}
              {errorEnvio !== null && fotos.length === 0 && <p className="text-[12.5px] font-medium text-error">{errorEnvio}</p>}
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-navy">
                Fotografías <span className="font-normal text-texto-2">(opcional)</span>
              </span>
              {fotos.length > 0 && (
                <ul className="grid gap-1.5">
                  {fotos.map((f, i) => (
                    <FilaArchivo
                      key={`${f.name}-${String(i)}`}
                      archivo={f}
                      error={errorsFotos[`fotos.${String(i)}`]}
                      alQuitar={() => {
                        setFotos((a) => a.filter((_, j) => j !== i));
                        setErrorEnvio(null);
                      }}
                    />
                  ))}
                </ul>
              )}
              <ZonaArchivo
                id="fotos"
                etiqueta="Fotografías de la sesión"
                texto="Arrastra una fotografía o"
                ayuda="JPG o PNG de hasta 20 MB cada una."
                multiple
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                alRecibir={(a) => recibir('foto', a)}
              />
              {errorEnvio !== null && fotos.length > 0 && <p className="text-[12.5px] font-medium text-error">{errorEnvio}</p>}
            </div>
            {rechazo !== null && (
              <Aviso tipo="error" rol="alert" titulo="No se adjuntó el archivo">
                {rechazo}
              </Aviso>
            )}
          </Tarjeta>

          <Tarjeta className="grid gap-4">
            <h2 className="flex items-center gap-2.5 text-base font-bold text-navy">
              <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-navy text-xs text-white">3</span>
              Registros
            </h2>
            {fields.map((campo, i) => (
              <BloqueRegistro
                key={campo.id}
                indice={i}
                formulario={formulario}
                catalogos={catalogos}
                permitidas={permitidas}
                unaSola={unaSola}
                puedeQuitar={fields.length > 1}
                alQuitar={() => remove(i)}
              />
            ))}
            <div>
              <Boton
                variante="secundario"
                onClick={() => append(unaSola && permitidas[0] ? registroVacio(permitidas[0].sectorId, permitidas[0].id) : registroVacio())}
              >
                <Icono nombre="nueva" />
                Agregar otro registro
              </Boton>
            </div>
          </Tarjeta>
        </div>
        <Resumen control={control} acta={acta} fotos={fotos} guardando={guardar.isPending} catalogos={catalogos} />
      </form>

      <Dialogo
        abierto={pendiente !== null}
        titulo="Guardar la sesión"
        alCerrar={() => {
          if (!guardar.isPending) setPendiente(null);
        }}
      >
        {pendiente !== null && (
          <>
            <p>
              Se registrará la sesión del <b>{fechaTexto(pendiente.fecha)}</b> (
              {catalogos.canales.find((c) => c.id === pendiente.canalId)?.nombre}) con{' '}
              {plural(pendiente.registros.length, 'registro', 'registros')}:
            </p>
            <ul className="grid list-disc gap-1.5 pl-5 text-[13px]">
              {pendiente.registros.map((r, i) => (
                <li key={i}>
                  <b>{nombreCarrera(r.carreraId)}</b>: {etiquetaNivel(r.nivelImpacto)} · {nombreObjeto(r.carreraId, r)},
                  comprometido para el {fechaTexto(r.fechaComprometida)}
                </li>
              ))}
            </ul>
            <Aviso tipo="info">
              Al guardar se asigna un número a cada registro. Los registros no se eliminan: un error se corrige editando o
              anulando.
            </Aviso>
            <div className="flex justify-end gap-3">
              <Boton variante="secundario" onClick={() => setPendiente(null)} disabled={guardar.isPending}>
                Cancelar
              </Boton>
              <Boton onClick={() => guardar.mutate(pendiente)} disabled={guardar.isPending}>
                {guardar.isPending ? 'Guardando' : 'Confirmar y guardar'}
              </Boton>
            </div>
          </>
        )}
      </Dialogo>
    </section>
  );
}

export function PaginaNuevaSesion() {
  const { data: usuario } = useSesion();
  const catalogos = useQuery({ queryKey: ['catalogos'], queryFn: obtenerCatalogos, enabled: usuario?.puedeCrear === true });
  // Se respeta el permiso aunque alguien escriba la URL a mano; la API es la que lo hace cumplir de verdad.
  if (usuario?.puedeCrear === false) {
    return (
      <EnConstruccion titulo="Nueva sesión">
        <Aviso tipo="neutro" titulo="Solo consulta">
          Tu perfil es de consulta: puedes revisar y descargar las sesiones, pero no modificar.
        </Aviso>
      </EnConstruccion>
    );
  }
  if (usuario === undefined || catalogos.data === undefined) {
    return (
      <EnConstruccion titulo="Nueva sesión">
        {catalogos.isError ? (
          <Aviso tipo="error" rol="alert">
            No se pudieron cargar los catálogos. Recarga la página.
          </Aviso>
        ) : (
          <p className="text-texto-2" role="status">
            Cargando
          </p>
        )}
      </EnConstruccion>
    );
  }
  return <FormularioSesion usuario={usuario} catalogos={catalogos.data} />;
}
