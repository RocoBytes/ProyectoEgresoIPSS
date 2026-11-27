# 0022. Versiones de malla y exportación a Excel

- Estado: Aceptada
- Fecha: 2026-11-27

## Contexto

Sin una pantalla de mallas, en producción no se pueden crear registros de nivel Malla, porque solo la semilla creaba versiones (RF-06). Además hace falta sacar a Excel las filas del listado filtrado (RF-10). El rol `ipss_api` ya tiene INSERT sobre `version_malla` y `evidencia`, así que no cambia ninguna regla de base ni ningún permiso.

## Decisión

**Mallas** (`apps/api/src/mallas/`)
- `GET /api/mallas?carreraId` lo ve cualquier perfil: versiones de año más reciente a más antiguo, con `vigente` solo en la primera, el archivo, quién lo subió y los `permisos` (con el mismo texto de «solo consulta» del detalle del registro, ahora parametrizado por lo que se consulta: «sus mallas»).
- `POST /api/mallas` (directores, dentro de su alcance): multipart con `datos` (`carreraId`, `anio`, `vigenteDesde`) y el PDF en `archivo`. Orden: 404, 403 y 400 por campo, todos juntos. El PDF se valida por contenido, y la evidencia (con `sesion_id` NULL, ADR 0005) y la versión se crean en una sola transacción; si algo falla se borra el archivo.
- Un año repetido es un 400 sobre el campo `anio` («Ya existe la malla AAAA de esta carrera.»), tanto en la comprobación previa como cuando dos subidas chocan y la base responde con la violación de unicidad. Un `carreraId` ausente o mal formado es un 404, como un id de registro mal formado.
- No se reemplaza ni se borra una versión (ADR 0005): se crea otra. La lista de objetos de «Nueva sesión» ya lee `version_malla`, así que la nueva versión aparece sin cambios.

**Exportación** (`GET /api/registros/exportar`)
- Acepta los mismos parámetros que el listado, ignora `pagina` y usa un único constructor de filtros y de orden (`filtros-registros.ts`) que comparten ambos. Así lo exportado es exactamente lo que el listado muestra, incluido «Abierto y vencido» y la búsqueda.
- Se escribe con `exceljs` en modo streaming, directo a la respuesta, leyendo la base por lotes de 1.000 filas. Una hoja «Registros» con encabezado en negrita y paneles congelados; fechas como texto `dd-mm-aaaa` (no se convierten columnas DATE a `Date`) y marcas de tiempo en America/Santiago. Nombre `registros-<año|todos>.xlsx`.
- Toda celda es texto o número, nunca fórmula: una descripción que empiece por `=`, `+`, `-` o `@` queda como texto. Está cubierto por una prueba.
- Si el resultado supera 20.000 filas se responde un 400 en español pidiendo acotar los filtros, antes de enviar cabeceras o escribir nada. Una vez iniciado el archivo, un error corta la conexión sin detalle en el log.
- Pueden exportar los tres perfiles, incluido Aseguramiento de la Calidad (decisión abierta 9).

## Consecuencias

- La columna «Registrado por» es quien creó la sesión; el registro no guarda un creador propio (solo el último que lo actualizó).
- Con el tope de 20.000 filas el archivo se arma en menos de unos segundos y el uso de memoria es el de un lote; el tope se puede subir sin cambiar el diseño.
- Cambiar un filtro del listado cambia la exportación, porque comparten el constructor; no hay que mantener dos copias.
- La prueba del tope baja el límite del servicio en memoria, en vez de crear más de 20.000 filas en la base compartida.
