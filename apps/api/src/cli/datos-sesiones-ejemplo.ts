import type { NivelImpacto } from '@ipss/shared';

// Sesiones, registros y mallas del prototipo v4 (función `semilla()`). Son ficticios.
// Los correlativos saldrán R-AAAA-NNN con el año en curso: el trigger de la base usa el año actual
// y la semilla no puede (ni debe) falsear la numeración.

export interface FinRegistro {
  /** Cierre: fecha efectiva y evidencia. */
  efectiva?: string;
  archivo?: string;
  comentario?: string;
  /** Anulación. */
  motivo?: string;
  por: string;
}

export interface RegistroEjemplo {
  carrera: string;
  nivel: NivelImpacto;
  /** Nombre de la asignatura o módulo; para MALLA, el año como texto. */
  objeto?: string;
  recurso?: string;
  descripcion: string;
  comprometida: string;
  fin?: FinRegistro;
}

export interface SesionEjemplo {
  canal: string;
  fecha: string;
  instancia: string;
  participantes: string[];
  creadoPor: string;
  acta: string;
  fotos: string[];
  registros: RegistroEjemplo[];
}

export interface MallaEjemplo {
  carrera: string;
  anio: number;
  vigenteDesde: string;
  subidoPor: string;
}

const carla = 'Carla Fuentes Rojas';
const matias = 'Matías Sepúlveda Lagos';
const andrea = 'Andrea Molina Tapia';
const rodrigo = 'Rodrigo Vera Pinto';

const inf = 'Ingeniería en Informática';
const apr = 'Analista Programador';
const cib = 'Técnico en Ciberseguridad';
const ind = 'Ingeniería Industrial';
const ele = 'Técnico en Electricidad Industrial';
const iae = 'Ingeniería en Administración de Empresas';
const con = 'Contador Auditor';
const log = 'Técnico en Logística';
const enf = 'Técnico en Enfermería';
const lab = 'Técnico en Laboratorio Clínico';

/** Directores que el prototipo menciona y que no tienen cuenta de acceso: se crean inactivos. */
export const USUARIOS_INACTIVOS_EJEMPLO = [
  { nombre: andrea, correo: 'andrea.molina@instituto.example', rol: 'DIRECTOR_SECTORIAL' as const, sectores: ['Salud', 'Administración y Comercio'], carreras: [] as string[] },
  { nombre: rodrigo, correo: 'rodrigo.vera@instituto.example', rol: 'DIRECTOR_CARRERA' as const, sectores: [] as string[], carreras: [iae, con, log] },
];

export const SESIONES_EJEMPLO: readonly SesionEjemplo[] = [
  { canal: 'Comité sectorial', fecha: '2025-04-16', instancia: 'Comité sectorial de Tecnologías, primera sesión 2025', participantes: ['Carla Fuentes (Directora Sectorial)', 'Dos representantes de empresas de software'], creadoPor: carla, acta: 'Acta comité sectorial 16-04-2025.pdf', fotos: [], registros: [
    { carrera: inf, nivel: 'ASIGNATURA', objeto: 'Programación Orientada a Objetos', descripcion: 'Las empresas piden reforzar pruebas unitarias dentro de la asignatura y no solo en el último semestre.', comprometida: '2025-08-15', fin: { efectiva: '2025-08-04', por: matias, archivo: 'Programa POO 2025-2.pdf' } },
    { carrera: cib, nivel: 'ASIGNATURA', objeto: 'Redes y Conectividad', descripcion: 'Actualizar los laboratorios de enrutamiento a equipos virtualizados.', comprometida: '2025-08-01', fin: { efectiva: '2025-07-28', por: carla, archivo: 'Programa Redes y Conectividad 2025-2.pdf' } },
  ] },
  { canal: 'Focus group de la Red de Titulados', fecha: '2025-09-10', instancia: 'Focus group de titulados 2023 y 2024', participantes: ['Andrea Molina (Directora Sectorial)', 'Ocho titulados de Salud y Administración'], creadoPor: andrea, acta: 'Acta focus group titulados 10-09-2025.pdf', fotos: ['Foto focus group 10-09-2025.jpg'], registros: [
    { carrera: enf, nivel: 'MODULO', objeto: 'Urgencias', descripcion: 'Los titulados señalan poca práctica en triage antes de la pasantía.', comprometida: '2025-12-15', fin: { efectiva: '2025-12-01', por: andrea, archivo: 'Módulo Urgencias actualizado.pdf' } },
    { carrera: iae, nivel: 'ASIGNATURA', objeto: 'Contabilidad de Costos', descripcion: 'Se pide incorporar casos con planillas de costeo usadas en pymes.', comprometida: '2026-03-15', fin: { efectiva: '2026-03-02', por: rodrigo, archivo: 'Programa Contabilidad de Costos 2026-1.pdf' } },
  ] },
  { canal: 'Reunión con docentes', fecha: '2025-11-12', instancia: 'Reunión de docentes de Ingeniería Industrial', participantes: ['Carla Fuentes (Directora Sectorial)', 'Cinco docentes de la carrera'], creadoPor: carla, acta: 'Acta reunión docentes 12-11-2025.pdf', fotos: [], registros: [
    { carrera: ind, nivel: 'ASIGNATURA', objeto: 'Control de Calidad', descripcion: 'Los docentes proponen reemplazar el software de control estadístico por una alternativa de uso libre.', comprometida: '2026-01-31', fin: { efectiva: '2026-01-20', por: carla, archivo: 'Programa Control de Calidad 2026-1.pdf' } },
  ] },
  { canal: 'Comité sectorial', fecha: '2026-03-18', instancia: 'Comité sectorial de Tecnologías, primera sesión 2026', participantes: ['Carla Fuentes (Directora Sectorial)', 'Matías Sepúlveda (Director de Carrera)', 'Representante de una empresa de software', 'Representante de una empresa de telecomunicaciones'], creadoPor: carla, acta: 'Acta comité sectorial 18-03-2026.pdf', fotos: [], registros: [
    { carrera: inf, nivel: 'ASIGNATURA', objeto: 'Big Data', descripcion: 'Las empresas del comité piden incorporar procesamiento en la nube en reemplazo de parte del contenido de clúster local.', comprometida: '2026-07-31', fin: { efectiva: '2026-07-20', por: matias, archivo: 'Programa Big Data 2026-2.pdf', comentario: 'Vigente desde el segundo semestre.' } },
    { carrera: cib, nivel: 'MODULO', objeto: 'Operaciones de seguridad', descripcion: 'Se solicita agregar prácticas de respuesta a incidentes con herramientas de monitoreo.', comprometida: '2026-08-14', fin: { efectiva: '2026-08-25', por: carla, archivo: 'Módulo Operaciones de seguridad v2.pdf' } },
    { carrera: apr, nivel: 'RECURSO', objeto: 'Desarrollo Web', recurso: 'Laboratorio de computación', descripcion: 'Los equipos del laboratorio no soportan las versiones actuales de las herramientas de desarrollo.', comprometida: '2026-10-30' },
  ] },
  { canal: 'Reunión con docentes', fecha: '2026-04-09', instancia: 'Reunión de docentes de Ingeniería en Informática', participantes: ['Matías Sepúlveda (Director de Carrera)', 'Seis docentes de la carrera'], creadoPor: matias, acta: 'Acta reunión docentes 09-04-2026.pdf', fotos: [], registros: [
    { carrera: inf, nivel: 'ASIGNATURA', objeto: 'Hacking Ético', descripcion: 'Los docentes proponen separar la evaluación práctica en dos entregas para dar retroalimentación intermedia.', comprometida: '2026-06-30', fin: { efectiva: '2026-06-22', por: matias, archivo: 'Programa Hacking Ético 2026-2.pdf' } },
  ] },
  { canal: 'Consejo empresarial', fecha: '2026-05-14', instancia: 'Consejo empresarial de Ingeniería', participantes: ['Carla Fuentes (Directora Sectorial)', 'Tres gerentes de operaciones de empresas colaboradoras'], creadoPor: carla, acta: 'Acta consejo empresarial 14-05-2026.pdf', fotos: ['Foto consejo 14-05-2026.jpg'], registros: [
    { carrera: ind, nivel: 'PERFIL_EGRESO', descripcion: 'El consejo observa que el perfil no menciona analítica de datos aplicada a operaciones.', comprometida: '2026-12-18' },
    { carrera: ele, nivel: 'ASIGNATURA', objeto: 'Automatización y PLC', descripcion: 'Actualizar el equipamiento de referencia a controladores de la gama vigente en la industria.', comprometida: '2026-11-30' },
  ] },
  { canal: 'Focus group de la Red de Titulados', fecha: '2026-06-03', instancia: 'Focus group de titulados de Salud', participantes: ['Andrea Molina (Directora Sectorial)', 'Siete titulados de 2024 y 2025'], creadoPor: andrea, acta: 'Acta focus group Salud 03-06-2026.pdf', fotos: [], registros: [
    { carrera: enf, nivel: 'ASIGNATURA', objeto: 'Simulación Clínica', descripcion: 'Los titulados señalan que las horas de simulación fueron insuficientes antes de la práctica.', comprometida: '2026-09-30', fin: { efectiva: '2026-09-12', por: andrea, archivo: 'Programa Simulación Clínica 2026-2.pdf' } },
    { carrera: lab, nivel: 'RECURSO', objeto: 'Bioseguridad', recurso: 'Guías de laboratorio', descripcion: 'Las guías no reflejan la norma vigente de manejo de residuos.', comprometida: '2026-08-14', fin: { motivo: 'La observación ya estaba resuelta con la actualización de guías de marzo; se ingresó por error.', por: andrea } },
  ] },
  { canal: 'Correo electrónico', fecha: '2026-08-21', instancia: 'Correo de una empresa colaboradora de auditoría', participantes: ['Rodrigo Vera (Director de Carrera)', 'Socia de una firma de auditoría'], creadoPor: rodrigo, acta: 'Correo empresa auditoría 21-08-2026.pdf', fotos: [], registros: [
    { carrera: con, nivel: 'ASIGNATURA', objeto: 'Normas IFRS', descripcion: 'La empresa informa cambios normativos de este año que no están en el programa.', comprometida: '2026-12-11' },
  ] },
  { canal: 'Comité sectorial', fecha: '2026-09-24', instancia: 'Comité sectorial de Tecnologías, segunda sesión 2026', participantes: ['Carla Fuentes (Directora Sectorial)', 'Matías Sepúlveda (Director de Carrera)', 'Dos representantes de empresas de datos'], creadoPor: carla, acta: 'Acta comité sectorial 24-09-2026.pdf', fotos: ['Foto comité 24-09-2026.jpg'], registros: [
    { carrera: inf, nivel: 'MALLA', objeto: '2024', descripcion: 'Se acuerda adelantar Bases de Datos al segundo semestre para que anteceda a Big Data.', comprometida: '2027-03-01' },
    { carrera: apr, nivel: 'ASIGNATURA', objeto: 'Bases de Datos', descripcion: 'Incorporar bases de datos no relacionales en la última unidad.', comprometida: '2026-12-18' },
  ] },
  { canal: 'Reunión con docentes', fecha: '2026-10-22', instancia: 'Reunión de docentes de Ingeniería en Informática', participantes: ['Matías Sepúlveda (Director de Carrera)', 'Cinco docentes de la carrera'], creadoPor: matias, acta: 'Acta reunión docentes 22-10-2026.pdf', fotos: [], registros: [
    { carrera: inf, nivel: 'ASIGNATURA', objeto: 'Gestión de Proyectos', descripcion: 'Los docentes piden que la evaluación final use la misma metodología del proyecto de título.', comprometida: '2026-11-06' },
  ] },
  { canal: 'Consejo empresarial', fecha: '2026-11-05', instancia: 'Consejo empresarial de Administración y Comercio', participantes: ['Rodrigo Vera (Director de Carrera)', 'Cuatro representantes de empresas de retail y logística'], creadoPor: rodrigo, acta: 'Acta consejo empresarial 05-11-2026.pdf', fotos: [], registros: [
    { carrera: iae, nivel: 'ASIGNATURA', objeto: 'Marketing Digital', descripcion: 'Las empresas piden incluir medición de campañas con herramientas de analítica web.', comprometida: '2027-01-15' },
    { carrera: log, nivel: 'PERFIL_EGRESO', descripcion: 'El consejo solicita que el perfil declare manejo de sistemas de gestión de bodegas.', comprometida: '2027-03-31' },
  ] },
];

export const MALLAS_EJEMPLO: readonly MallaEjemplo[] = [
  { carrera: inf, anio: 2021, vigenteDesde: '2021-03-01', subidoPor: carla },
  { carrera: inf, anio: 2024, vigenteDesde: '2024-03-01', subidoPor: matias },
  { carrera: apr, anio: 2023, vigenteDesde: '2023-03-01', subidoPor: carla },
  { carrera: cib, anio: 2025, vigenteDesde: '2025-03-01', subidoPor: carla },
  { carrera: ind, anio: 2022, vigenteDesde: '2022-03-01', subidoPor: carla },
  { carrera: ele, anio: 2023, vigenteDesde: '2023-03-01', subidoPor: carla },
  { carrera: iae, anio: 2022, vigenteDesde: '2022-03-01', subidoPor: rodrigo },
  { carrera: con, anio: 2024, vigenteDesde: '2024-03-01', subidoPor: rodrigo },
  { carrera: enf, anio: 2024, vigenteDesde: '2024-03-01', subidoPor: andrea },
  { carrera: lab, anio: 2023, vigenteDesde: '2023-03-01', subidoPor: andrea },
];
