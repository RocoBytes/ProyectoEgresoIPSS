# Hito 3: cierre, anulación y panel

Ubicación: `odd/tasks/hito-3-cierre-anulacion-panel.md` · Espejo en Engram: `odd/hito-3-cierre-anulacion-panel/tasks`

## Objetivo

Cerrar un registro con fecha efectiva, evidencia y comentario opcional (RF-12), anularlo con motivo (RF-13) y mostrar el panel con filtros, indicadores y gráficos (RF-07, RF-08). Todo sigue el prototipo v4.

## Por qué

Es el tercer bloque del calendario (07-12 al 13-12-2026) y cierra el ciclo de vida del registro. Sin cierre ni anulación los indicadores del panel no tienen sentido.

## Alcance autorizado

Plan aprobado por el usuario el 26-11-2026, junto con los del hito 4 y los extras.

- `POST /api/registros/:id/cierre` (multipart: `datos` + `evidencia`) y `POST /api/registros/:id/anulacion` (JSON).
- Módulo `reportes` con `GET /api/reportes/panel?anio&sectorId&carreraId`, agregado en SQL.
- Web: botones y diálogos de cierre y anulación en el detalle; panel con filtros en la URL y clic hacia el listado.

Supuestos aprobados:
- Un HEIC en el cierre recibe el mensaje de convertir a JPG (regla general del contexto).
- Comentario de cierre y motivo de anulación con un máximo de 2.000 caracteres.
- La evidencia de cierre se guarda sin sesión (`sesion_id` nulo).
- Filtros del panel en la URL, como el listado (el prototipo los guardaba en el navegador).
- Recharts para columnas por mes, dona y líneas. Las barras clicables (canal, nivel, sector o carrera) son botones HTML para que funcionen con teclado.
- Sin la animación de cifras del prototipo.

Fuera de alcance: mallas (RF-06), exportación (RF-10), catálogos reales, usuarios, respaldo y Playwright (hito 4 y extras).

## Restricciones

- Las de `CLAUDE.md`. No se modifica ninguna regla SQL: las de cierre y anulación ya existen y las cubren las 26 pruebas.
- Sin dependencias nuevas en este hito.
- Si algo falla por una versión, detenerse.
- Se avanza sin parar entre tareas, salvo un fallo de versión o una decisión nueva.

## Configuración de pruebas

- TDD no configurado (desactivado), igual que el hito 2.
- Jest para la API, contra `bd-pruebas`. Vitest para la web. `npm run test:bd` para las 26 reglas.

## Tareas

- [ ] **P1 API de cierre y anulación.** Interceptor con campo `evidencia`, validador de evidencia de cierre (PDF, JPG o PNG por contenido, HEIC con mensaje propio), cierre transaccional con limpieza del archivo, anulación con motivo, 400/403/409 y textos del historial. Ruta: delegada (escritor de la API; más de 2 archivos no triviales).
- [ ] **P2 API del panel.** Módulo `reportes` con indicadores, dona, anillos, series por mes y por año, canal, nivel, sector o carrera y últimas 5 sesiones. Ruta: delegada (mismo escritor).
- [ ] **P3 Web: cerrar y anular.** Botones en el detalle, `DialogoCerrar` y `DialogoAnular` con textos y validaciones del prototipo; la zona de archivo pasa a `comun/`. Ruta: delegada (escritor de la web).
- [ ] **P4 Web: panel.** Filtros en la URL, indicadores, gráficos, estados vacíos, últimas sesiones y clic hacia el listado. Ruta: delegada (mismo escritor).
- [ ] **P5 Cierre del hito.** Revisión independiente de seguridad, prueba en Compose con la semilla contra las cifras del prototipo, ADR 0016 y 0017, `CLAUDE.md`. Ruta: inline o delegada.

## Criterios de aceptación

- **Cierre:**
  - La fecha efectiva no es posterior a hoy (Santiago) ni anterior a la sesión.
  - La evidencia es obligatoria y se valida por contenido.
  - Si la transacción falla, no queda el archivo.
  - Fuera de alcance o con perfil de Calidad responde 403. Un registro cerrado o anulado responde 409, también con dos cierres simultáneos.
- **Anulación:** el motivo tiene al menos 10 caracteres, y responde 403 y 409 igual que el cierre.
- **Historial:** muestra «Cerrado con fecha efectiva … y evidencia "…".» y «Anulado. Motivo: …».
- **Panel:** con la semilla y hoy = 26-11-2026 en 2026 muestra:
  - 14 ajustes (+9 respecto de 2025);
  - 9 abiertos con 2 vencidos;
  - 4 cerrados (31 % de los vigentes);
  - 10 carreras de 10;
  - 75 % de cierres en plazo y 78 % de abiertos al día.
- **Clic en gráficos:** un clic en canal, nivel, sector o carrera, o en un estado de la dona, abre `/registros` con los filtros del panel más esa dimensión.
- **Calidad:** lint, tipos y todas las pruebas en verde. Corre en Compose.

## Entrega

- Rama `hito-3`, encima de `hito-2`. Un commit por tarea como mínimo.
- Previsión: unas 2.500 líneas, en PR encadenados. La estrategia de cadena sigue pendiente del usuario y se decide antes del push. No se hace push.
- Último límite revisado por la revisión nativa: `e9cb0d2` (los commits de H8 y H9 siguen en el tramo pendiente).

## Progreso y evidencia

- 26-11-2026: planes del hito 3, el hito 4 y los extras aprobados; rama `hito-3` creada desde `c8f0cc1`.

## Próximo paso

P1 API de cierre y anulación.
