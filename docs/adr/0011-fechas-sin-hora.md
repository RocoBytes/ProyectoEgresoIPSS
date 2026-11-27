# 0011. Fechas sin hora como texto AAAA-MM-DD

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Las columnas `DATE` (fecha de la sesión, fecha comprometida, fecha efectiva, vigencia de una malla) no tienen hora ni zona. Un `Date` de JavaScript con una fecha así se interpreta en la zona del servidor y, en Santiago, se muestra como el día anterior (la prueba T10 de las reglas de base lo reproduce). Además, «hoy» para el negocio es el día calendario de Santiago, que a las 23:30 ya es mañana en UTC.

## Decisión

- La API recibe y entrega estas fechas siempre como texto `AAAA-MM-DD`; nunca un `Date` de JavaScript. Las marcas de tiempo (`timestamptz`) salen como texto ISO 8601.
- Un único módulo, `apps/api/src/comun/fecha-texto.ts`, convierte en ambos sentidos con componentes UTC (`aFechaBd`, `deFechaBd`), valida el calendario real (`esFechaTexto`, que rechaza `2026-02-30`) y calcula «hoy» en `America/Santiago` (`hoyEnSantiago`) a partir del reloj inyectable.
- Comparar dos fechas es comparar texto: el formato ordena igual que el calendario.

## Consecuencias

- Ninguna pantalla ni regla depende de la zona horaria del servidor o del navegador.
- Todo código nuevo que toque una columna `DATE` debe pasar por ese módulo; una revisión puede buscar `new Date(` en los servicios.
- Los vencimientos se prueban moviendo el reloj, sin esperar ni falsear globales.
