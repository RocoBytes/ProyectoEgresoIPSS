# Contexto del proyecto

Documento de referencia para quien desarrolle, persona o agente. Reúne lo acordado en el informe de planificación, la validación técnica del 11-11-2026, el prototipo validado por el cliente y las decisiones tomadas hasta el 26-11-2026.

## Qué resuelve

En el IPSS la retroalimentación sobre las carreras llega por varios canales (reuniones con docentes, comités sectoriales, consejos empresariales, titulados, correo) y hoy queda repartida en actas y planillas. La plataforma la reúne en un solo lugar.

La unidad de ingreso es la sesión: una instancia de retroalimentación con su acta. De una sesión salen uno o más registros, uno por carrera afectada. Cada registro dice qué hay que ajustar, a qué nivel, y para cuándo se comprometió. El registro se cierra con evidencia del cambio hecho o se anula con un motivo. Un panel muestra los indicadores por año, sector y carrera.

Queda fuera el seguimiento de tareas asignadas a personas y toda integración con otros sistemas del instituto (RNF-11).

## Personas, ambientes y fechas

- Equipo de desarrollo: tres estudiantes de la Clínica Tecnológica.
- Cliente: el socio formador, Director Sectorial de Tecnologías e Ingeniería.
- Tres ambientes con el mismo Compose: local, pruebas en un VPS del equipo detrás de Cloudflare, y producción. Producción la instala y opera TI del IPSS; el equipo entrega imágenes y una guía de instalación de una página.
- Avance 2: 13-12-2026. Entrega final: 20-12-2026.

Orden de construcción acordado:

1. Hasta el 29-11: esqueleto de punta a punta, base de datos con sus reglas, inicio de sesión y roles.
2. Del 30-11 al 06-12: sesión con acta y registros, listado con filtros, detalle con historial.
3. Del 07-12 al 13-12: cierre con evidencia, anulación y panel con filtros.
4. Del 14-12 al 20-12: carga de catálogos reales, respaldo con restauración probada, guía de instalación y pruebas de punta a punta.

Las versiones de malla (RF-06) y la exportación a Excel (RF-10) van al final, solo si lo anterior está cerrado.

## Perfiles y permisos

Así se comporta el prototipo. El alcance por perfil sigue pendiente de confirmación del cliente.

| Acción | Director Sectorial | Director de Carrera | Aseguramiento de la Calidad |
|---|---|---|---|
| Consultar panel, listado y detalle | Todo | Todo | Todo |
| Descargar evidencia | Sí | Sí | Sí |
| Crear sesión y registros | Carreras de sus sectores | Sus carreras | No |
| Editar, cerrar y anular un registro | Carreras de sus sectores | Sus carreras | No |
| Subir versión de malla | Carreras de sus sectores | Sus carreras | No |

Fuera de su alcance, un director ve el registro en modo consulta con el motivo a la vista.

## Requerimientos funcionales

- RF-01 Inicio de sesión con correo institucional y contraseña.
- RF-02 Sesión activa y funciones restringidas según el rol.
- RF-03 Registro de la sesión: canal, fecha, nombre de la instancia y participantes.
- RF-04 Evidencia de origen: acta en PDF y fotografías en JPG o PNG. Respalda todos los registros de la sesión.
- RF-05 Uno o más registros por sesión, uno por carrera afectada: sector, carrera, nivel de impacto, objeto afectado, descripción y fecha comprometida.
- RF-06 Versiones de malla por carrera, con año y fecha de vigencia.
- RF-07 Indicadores del año: total, abiertos, cerrados y carreras con ajustes.
- RF-08 Distribuciones por canal, sector, nivel de impacto y mes, y últimas sesiones.
- RF-09 Listado con filtros combinables por año, sector, carrera, asignatura, canal, nivel de impacto y estado.
- RF-10 Exportación a Excel de exactamente las filas del listado filtrado.
- RF-11 Ficha del registro con sus datos, la evidencia de origen, el historial y los demás registros de la sesión.
- RF-12 Cierre con fecha efectiva, evidencia y comentario opcional.
- RF-13 Anulación con motivo. No existe borrado físico.
- RF-14 Tres estados con el mismo nombre en toda la aplicación: abierto, cerrado y anulado.

No funcionales que condicionan el código: menos de 2 segundos de carga y menos de 1 segundo al filtrar con 1.000 registros (RNF-01 y 02); seguridad de acceso y de archivos (RNF-03 a 05); historial de solo inserción (RNF-06); todo levanta con un comando (RNF-10); OpenAPI, ADR y comentarios en español (RNF-12); respaldo diario con restauración probada (RNF-13).

## Reglas de negocio, como las aplica el prototipo

Sesión:
- La fecha no puede ser posterior a hoy. La instancia tiene al menos 5 caracteres y hay al menos un participante.
- El acta en PDF es obligatoria. Las fotografías son opcionales.
- Tiene al menos un registro. No se admiten dos registros iguales en la misma sesión (misma carrera, nivel, objeto y recurso).

Registro:
- El objeto afectado depende del nivel: asignatura, módulo o versión de malla. En Recurso se elige la asignatura y se escribe el recurso, con al menos 3 caracteres. En Perfil de ingreso y Perfil de egreso no hay objeto.
- La descripción tiene al menos 20 caracteres. La fecha comprometida no puede ser anterior a la sesión.
- Nace abierto y con correlativo. Solo un registro abierto se edita, y solo en descripción y fecha comprometida; cada edición queda en el historial.
- Cierre: fecha efectiva obligatoria, ni posterior a hoy ni anterior a la sesión; evidencia obligatoria en PDF, JPG o PNG; comentario opcional.
- Anulación: motivo de al menos 10 caracteres.
- Cerrado y anulado son finales. No hay reapertura.
- Vencido es un registro abierto cuya fecha comprometida ya pasó. No es un estado.

Archivos: 20 MB como máximo. HEIC se rechaza con un mensaje que pide convertir a JPG. La malla se sube en PDF, una por carrera y año.

Acceso: el error de credenciales es genérico. Al tercer fallo se avisa que quedan dos intentos y al quinto la cuenta se bloquea 15 minutos con cuenta regresiva.

Panel:
- Filtros de año, sector y carrera. El año de un registro es el de la fecha de su sesión.
- Total del año incluye anulados; «vigentes» los excluye.
- Cierre con evidencia: cerrados sobre vigentes. Cierres en plazo: cerrados con fecha efectiva igual o anterior a la comprometida, sobre cerrados. Abiertos al día: abiertos sin vencer sobre abiertos.
- Con un sector elegido, el desglose por sector pasa a ser por carrera.
- Un clic en un gráfico abre el listado con los filtros del panel más la dimensión elegida.

Listado: 10 filas por página, búsqueda por número, asignatura o texto, y el estado admite el valor «Abierto y vencido».

## Modelo de datos

Trece tablas previstas. La validación ya probó seis con sus reglas: `sesion`, `evidencia`, `registro`, `historial_estado`, `historial_cambio` y `contador_correlativo`. El esquema del producto las amplía sin debilitar ninguna regla.

- `sector`: nombre. Son 4.
- `carrera`: sector y nombre. Son 48.
- `asignatura`: carrera, código y nombre.
- `canal`: nombre y activo. Son 6.
- `version_malla`: carrera, año, vigente desde, archivo y quién la subió. Única por carrera y año.
- `usuario`: correo único, nombre, hash de la contraseña, rol, activo, proveedor de identidad, intentos fallidos y bloqueado hasta.
- `refresh_token`: usuario, hash, expira en y revocado en.
- `sesion`: canal, fecha, instancia, participantes, creada por y creada en.
- `evidencia`: sesión (solo en evidencia de origen), nombre original, tipo, tamaño, SHA-256, ruta, subida por y creada en.
- `registro`: sesión, carrera, nivel de impacto, asignatura o versión de malla según el nivel, recurso, descripción, fecha comprometida, estado, fecha efectiva, evidencia de cierre, comentario de cierre, motivo de anulación, año, número, correlativo único y actualizado por.
- `historial_estado`: registro, estado anterior, estado nuevo, usuario y fecha. Lo escribe un trigger.
- `historial_cambio`: registro, usuario, cambios en JSONB y fecha. Lo escribe un trigger.
- `contador_correlativo`: año y último número. Lo usa el trigger del correlativo.

Enumeraciones: `EstadoRegistro` (ABIERTO, CERRADO, ANULADO), `NivelImpacto` (RECURSO, ASIGNATURA, MODULO, MALLA, PERFIL_INGRESO, PERFIL_EGRESO) y `Rol` (DIRECTOR_SECTORIAL, DIRECTOR_CARRERA, ASEGURAMIENTO_CALIDAD). El nivel de impacto es enumeración y no tabla porque de su valor depende qué objeto referencia el registro.

Reglas que hace cumplir la base:
- El correlativo R-AAAA-NNN lo asigna un trigger. Toma el año de ingreso en hora de Santiago y bloquea la fila contadora hasta el commit. Con 200 inserciones concurrentes no hubo duplicados ni saltos.
- La API no puede fijar correlativo, estado inicial ni fecha de creación.
- Cerrado exige fecha efectiva y evidencia. Anulado exige motivo.
- Un registro cerrado o anulado no admite cambios. El correlativo, la sesión y la fecha de creación no cambian nunca.
- Cada cambio de estado y cada edición quedan en los historiales, que la API solo puede leer.

## Infraestructura

Docker Compose con cinco servicios: `proxy` (Caddy, el único que publica 80 y 443), `web` (archivos estáticos), `api` (usuario `node`, sistema de archivos de solo lectura), `migrar` (corre `prisma migrate deploy` una vez con el rol migrador y termina) y `bd` (PostgreSQL 16 en una red interna). Volúmenes para la base y para las evidencias.

Variables: `DOMINIO`, `GHCR_ORG`, `VERSION`, `CLAVE_BD_SUPERUSUARIO`, `CLAVE_BD_MIGRADOR`, `CLAVE_BD_API` y `JWT_SECRETO`. La API recibe además `DATABASE_URL` con el rol `ipss_api`, `TRUST_PROXY=1`, `TZ=America/Santiago` y `DIRECTORIO_EVIDENCIAS=/datos/evidencias`. El healthcheck llama a `/api/salud`.

Integración continua en GitHub Actions: lint, tipos, pruebas y construcción de imágenes hacia GHCR.

## Lo que dejó la validación del 11-11-2026

Probado: 26 de 26 reglas de base con el rol `ipss_api`; 11 de 12 pruebas HTTP de la API; exportación a Excel; `npm audit` sin hallazgos.

Hallazgos que el código debe respetar:
- Multer entrega los nombres con tilde en latin1. Se corrige con `Buffer.from(nombre, 'latin1').toString('utf8')`.
- Sin `trust proxy`, cinco fallos de un usuario bloquean a todos. Además Caddy debe sobrescribir `X-Forwarded-For`, y declarar `trusted_proxies` si hay Cloudflare delante.
- `file-type` mira solo los primeros bytes: un archivo que empieza con `%PDF` pasa aunque contenga otra cosa. Las evidencias se sirven siempre como descarga, nunca en línea.
- Una columna DATE leída como `Date` muestra el día anterior en Santiago.
- Para quitar a PUBLIC la ejecución de funciones se usa `ALTER DEFAULT PRIVILEGES FOR ROLE ipss_migrador REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`, sin `IN SCHEMA`.
- El CLI de Prisma descarga `schema-engine` al ejecutarse: debe quedar dentro de la imagen.
- Los puertos que publica Docker no pasan por ufw.

No ejecutado en la validación, por límites de red del entorno: levantar los contenedores, el Caddyfile, `prisma generate` y `prisma migrate deploy`. Tampoco se probó que el Dockerfile cree `/datos/evidencias` con dueño `node`, ni cómo entrega Prisma el error 23514.

## Decisiones tomadas

- Monolito modular. Sin microservicios, por tamaño del equipo y volumen.
- Sin Redis ni colas: nada se procesa en segundo plano y la sesión cabe en un JWT.
- Invariantes en la base, con triggers y CHECK, para que valgan aunque la API falle.
- Correlativo con fila contadora y no con secuencia, porque una secuencia pierde números al revertir.
- Las migraciones corren en un servicio aparte con otro rol. Reemplaza lo que dice RNF-10 sobre aplicarlas al arrancar la API.
- El registro apunta a su evidencia de cierre, de modo que el CHECK la exija en la misma fila.
- Autenticación propia (RNF-11). El campo de proveedor de identidad queda reservado.
- Versiones fijadas al 11-11-2026.

## Decisiones abiertas

Mientras no se resuelvan, se construye con el supuesto indicado y se deja un ADR.

1. Validación: class-validator en la API y zod en la web, con reglas duplicadas. Supuesto: se mantiene así y la API es la autoridad.
2. Alcance por perfil y su modelo. Supuesto: el de la tabla de permisos, con tablas `usuario_sector` y `usuario_carrera`.
3. Registro fuera de alcance: 403 o 404. Supuesto: la lectura está permitida a todos; modificar devuelve 403.
4. `usuario` en los historiales, como texto o como llave foránea. Supuesto: llave foránea, y los usuarios se desactivan en vez de borrarse.
5. Módulos en el catálogo: el prototipo distingue asignaturas y módulos por carrera, y el modelo solo tiene `asignatura`. Supuesto: una columna `tipo` en `asignatura` con los valores ASIGNATURA y MODULO.
6. Año del correlativo frente al año del panel: el correlativo usa el año de ingreso y el panel el de la sesión. Supuesto: se mantiene así.
7. Término visible: «ajuste» en el panel y «registro» en el resto. Pendiente de que el cliente diga si cambia en toda la aplicación.
8. Filtro por asignatura en el listado: RF-09 lo pide y el prototipo lo resuelve con la búsqueda de texto. Supuesto: agregar el filtro.
9. Quién sube las versiones de malla y si Aseguramiento de la Calidad exporta a Excel. Supuesto: los de la tabla de permisos, y sí exporta.
