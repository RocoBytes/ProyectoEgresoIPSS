# 0017. Panel de indicadores

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

El panel del prototipo v4 muestra indicadores, series por mes y por año, reparto por canal, nivel y sector o carrera, y las últimas sesiones, todo con filtros de año, sector y carrera. Hay que decidir dónde se calcula cada cifra y cómo se dibuja.

## Decisión

**API**
- Un solo endpoint, `GET /api/reportes/panel?anio&sectorId&carreraId`, devuelve todas las cifras. Se agregan en SQL con `Prisma.sql` y parámetros enlazados, nunca concatenando texto; los porcentajes los calcula la web.
- El año de un registro es el de la fecha de su sesión, no el de su correlativo. «Vencido» es estricto: `ABIERTO` con fecha comprometida anterior a hoy, con «hoy» tomado del reloj inyectable en Santiago.
- `totalAnioAnterior` es `null` cuando el año anterior no tiene ajustes en todo el sistema («Primer año con ajustes») y el total filtrado, que puede ser 0, en caso contrario.
- Canales, sectores y carreras salen en orden alfabético, igual que `GET /api/catalogos` (con «Otro» al final). Es una diferencia conocida con el orden fijo del prototipo.

**Web** (`apps/web/src/panel/`)
- Los filtros viven en la URL (`useSearchParams`). Los datos viajan con los filtros a los que pertenecen: con `keepPreviousData` la URL puede ir por delante, así que mientras llegan los nuevos se ven los anteriores atenuados y sin clics, para que ningún enlace mezcle filtros nuevos con cifras viejas.
- Recharts dibuja los gráficos de meses y de estados dentro de un contenedor `aria-hidden`, y cada uno trae su tabla o texto oculto (`sr-only`) para lectores de pantalla.
- Las barras por canal, nivel y sector o carrera no son Recharts sino botones HTML, para que el teclado y los lectores las traten como controles; un clic abre `/registros` con los filtros del panel más esa dimensión.
- Sin animación de cuenta: las cifras aparecen con su valor final y las series se dibujan con `isAnimationActive={false}`.

## Consecuencias

- Una sola consulta compuesta es simple de cachear y de probar, pero cada cambio de filtro recalcula todo; con unos 100 registros al año es irrelevante y con 1.000 responde bajo 1 s (prueba incluida).
- Cambiar una definición (vencido, año) es un cambio en el servicio de reportes y su prueba, no en la web.
