import type { Rol } from '../generated/prisma/enums';

// Los mismos datos de ejemplo del prototipo v4 (docs/prototipo/prototipo-v4.html). Son ficticios:
// no hay datos reales del IPSS ni personas reales.

export const CLAVE_EJEMPLO = 'Demo-2026';

export const SECTORES_EJEMPLO: readonly string[] = ['Tecnologías', 'Ingeniería', 'Administración y Comercio', 'Salud'];

export interface CarreraEjemplo {
  nombre: string;
  sector: string;
  asignaturas: readonly string[];
  modulos: readonly string[];
}

export const CARRERAS_EJEMPLO: readonly CarreraEjemplo[] = [
  { sector: 'Tecnologías', nombre: 'Ingeniería en Informática', asignaturas: ['Programación Orientada a Objetos', 'Bases de Datos', 'Big Data', 'Hacking Ético', 'Gestión de Proyectos'], modulos: ['Desarrollo de software', 'Infraestructura y seguridad'] },
  { sector: 'Tecnologías', nombre: 'Analista Programador', asignaturas: ['Fundamentos de Programación', 'Desarrollo Web', 'Bases de Datos'], modulos: ['Programación', 'Aplicaciones web'] },
  { sector: 'Tecnologías', nombre: 'Técnico en Ciberseguridad', asignaturas: ['Redes y Conectividad', 'Seguridad en Sistemas Operativos', 'Gestión de Incidentes'], modulos: ['Redes', 'Operaciones de seguridad'] },
  { sector: 'Ingeniería', nombre: 'Ingeniería Industrial', asignaturas: ['Gestión de Operaciones', 'Investigación de Operaciones', 'Control de Calidad'], modulos: ['Operaciones', 'Gestión'] },
  { sector: 'Ingeniería', nombre: 'Técnico en Electricidad Industrial', asignaturas: ['Instalaciones Eléctricas', 'Automatización y PLC', 'Máquinas Eléctricas'], modulos: ['Instalaciones', 'Automatización'] },
  { sector: 'Administración y Comercio', nombre: 'Ingeniería en Administración de Empresas', asignaturas: ['Contabilidad de Costos', 'Marketing Digital', 'Gestión de Personas'], modulos: ['Finanzas', 'Gestión comercial'] },
  { sector: 'Administración y Comercio', nombre: 'Contador Auditor', asignaturas: ['Auditoría Tributaria', 'Normas IFRS', 'Contabilidad Financiera'], modulos: ['Tributación', 'Auditoría'] },
  { sector: 'Administración y Comercio', nombre: 'Técnico en Logística', asignaturas: ['Gestión de Bodegas', 'Comercio Exterior', 'Planificación de la Demanda'], modulos: ['Almacenamiento', 'Distribución'] },
  { sector: 'Salud', nombre: 'Técnico en Enfermería', asignaturas: ['Enfermería Médico-Quirúrgica', 'Farmacología', 'Simulación Clínica'], modulos: ['Atención clínica', 'Urgencias'] },
  { sector: 'Salud', nombre: 'Técnico en Laboratorio Clínico', asignaturas: ['Hematología', 'Microbiología', 'Bioseguridad'], modulos: ['Análisis clínico', 'Gestión de muestras'] },
];

export const CANALES_EJEMPLO: readonly string[] = [
  'Reunión con docentes',
  'Comité sectorial',
  'Consejo empresarial',
  'Focus group de la Red de Titulados',
  'Correo electrónico',
  'Otro',
];

export interface UsuarioEjemplo {
  nombre: string;
  correo: string;
  rol: Rol;
  sectores: readonly string[];
  carreras: readonly string[];
}

export const USUARIOS_EJEMPLO: readonly UsuarioEjemplo[] = [
  { nombre: 'Carla Fuentes Rojas', correo: 'carla.fuentes@instituto.example', rol: 'DIRECTOR_SECTORIAL', sectores: ['Tecnologías', 'Ingeniería'], carreras: [] },
  { nombre: 'Matías Sepúlveda Lagos', correo: 'matias.sepulveda@instituto.example', rol: 'DIRECTOR_CARRERA', sectores: [], carreras: ['Ingeniería en Informática'] },
  { nombre: 'Paula Henríquez Soto', correo: 'paula.henriquez@instituto.example', rol: 'ASEGURAMIENTO_CALIDAD', sectores: [], carreras: [] },
];
