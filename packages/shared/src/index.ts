// Este paquete solo exporta tipos: no tiene paso de build y desaparece en la
// compilación tanto de la API como de la web, así ninguna de las dos depende de
// código ejecutable compartido. El lint (`no-restricted-imports`) obliga a
// importarlo con `import type`.
export type EstadoRegistro = 'ABIERTO' | 'CERRADO' | 'ANULADO';
// La extensión .js es obligatoria: este paquete es ESM y la API lo lee bajo `nodenext`.
export type { RespuestaSalud } from './salud.js';
export type {
  Alcance,
  ErrorValidacion,
  ReferenciaNombrada,
  RespuestaErrorValidacion,
  RespuestaCredencialesIncorrectas,
  RespuestaCuentaBloqueada,
  Rol,
  UsuarioActual,
} from './acceso.js';
export type { RespuestaCatalogos, RespuestaObjetosCarrera } from './catalogos.js';
export type { DatosSesionNueva, EvidenciaResumen, NivelImpacto, RegistroCreado, RegistroNuevo, RespuestaSesionCreada } from './sesiones.js';
export type {
  DetalleRegistro,
  EdicionRegistro,
  EntradaHistorial,
  FilaRegistro,
  FiltroEstado,
  OtroRegistroDeSesion,
  RespuestaAnios,
  RespuestaCambioEstado,
  RespuestaEdicion,
  RespuestaListadoRegistros,
} from './registros.js';
export type { ConteoPorEstado, IndicadoresPanel, PanelAnio, PanelCanal, PanelGrupo, PanelMes, PanelNivel, PanelSesion, RespuestaPanel } from './reportes.js';
