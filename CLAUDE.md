# Plataforma de validación del perfil de egreso

Aplicación web interna del IPSS para registrar sesiones de retroalimentación curricular y los ajustes que resultan en cada carrera, con trazabilidad y un panel de indicadores. Cerca de 10 usuarios y 100 registros al año. Equipo de tres personas. Avance 2 el 13-12-2026 y entrega final el 20-12-2026.

## Antes de tocar código, leer

- `docs/contexto-proyecto.md`: dominio, requerimientos, permisos, modelo de datos, reglas de negocio, decisiones tomadas y abiertas.
- `docs/prototipo/prototipo-v4.html`: prototipo validado por el cliente. Es la referencia de pantallas, textos, validaciones y cifras del panel. No es código para copiar.
- `docs/validacion-stack/`: punto de partida ya probado el 11-11-2026 (Compose, Caddyfile, roles, migración con reglas SQL, 26 pruebas de base y 12 de la API). `resultados.txt` muestra qué pasó y qué no se ejecutó.

## Stack y versiones

- Monorepo con npm workspaces: `apps/api`, `apps/web`, `packages/shared`, `infra/`, `docs/`.
- API: Node.js 26 LTS, NestJS 11, Prisma 7 con `@prisma/adapter-pg`, PostgreSQL 16.
- Web: React 19, React Router 7, Vite 8, Tailwind 4 con componentes shadcn/ui, TanStack Query 5, TanStack Table 8, react-hook-form, zod, Recharts 3.
- Las versiones exactas están en los `package.json` de `docs/validacion-stack/`. Se copian tal cual.
- No subir versiones mayores: quedan fuera NestJS 12, React Router 8, TypeScript 7, TanStack Table 9 y Prisma 8. `prisma` y `@prisma/client` van siempre en la misma versión exacta.
- `exceljs` exige `"overrides": { "uuid": "11.1.1" }`.
- No agregar dependencias sin preguntar. Sin Redis, sin colas, sin microservicios.

## Comandos

Requieren Node 26.13.1 con npm 11.20 (`.nvmrc`) y Docker en ejecución. Todos se corren desde la raíz.

- `npm ci`: instala según el lockfile. `.npmrc` aplica `min-release-age=7`, versiones exactas y `strict-allow-scripts` (ADR 0008).
- `npm run dev`:
  - levanta la base de desarrollo (`infra/compose.desarrollo.yaml`, 127.0.0.1:55432);
  - aplica las migraciones con el rol migrador;
  - siembra los datos de ejemplo del prototipo;
  - arranca la API en http://127.0.0.1:3000/api y la web en http://127.0.0.1:5173, ambas con recarga; la web llega a `/api` por el proxy de Vite.
- `npm run semilla`: siembra en la base de desarrollo los datos de ejemplo del prototipo.
  - Carga 4 sectores, 10 carreras con sus asignaturas y módulos, 6 canales y 3 usuarios: `carla.fuentes@`, `matias.sepulveda@` y `paula.henriquez@instituto.example`, con la clave `Demo-2026`.
  - Carga además 10 mallas, 11 sesiones y 19 registros, con archivos de relleno en `apps/api/.datos/evidencias`. Los folios salen R-2026-NNN porque el trigger usa el año actual.
  - Es idempotente y se niega a correr con `NODE_ENV=production`.
- `npm run lint`, `npm run typecheck`, `npm run build`: cubren todos los workspaces y generan antes el cliente de Prisma.
- `npm test`: recrea la base de pruebas, corre las 26 reglas y después Jest (API) y Vitest (web).
- `npm run test:bd`: solo las 26 pruebas de reglas de base, con el rol `ipss_api`. Corren sobre `bd-pruebas` (127.0.0.1:55433, en memoria), que se recrea en cada corrida.
- `npm run catalogos -- <planilla.xlsx | -> [--prueba]`: carga los catálogos desde una planilla en una sola transacción (ADR 0018). `-- --plantilla <salida.xlsx | ->` genera una de ejemplo.
- `npm run usuarios -- <crear|desactivar|activar|restablecer-clave|listar> ...`: administra cuentas por línea de comandos (ADR 0018).
- `npm run e2e`: levanta la pila completa en Compose (proyecto `ipss-e2e`), siembra y corre los tres flujos de Playwright; luego la baja con sus volúmenes. Instalar Chromium una vez con `npx playwright install chromium` (ADR 0020).
- `npm run test:respaldo`: respalda, destruye, restaura y compara en un proyecto Compose propio (ADR 0019).
- `docker compose -f infra/compose.yaml up -d`: los cinco servicios.
  - Si faltan las imágenes, las construye. Agregar `--build` para reconstruirlas después de un cambio.
  - Lee `infra/.env` (copia de `infra/.env.ejemplo`) y se detiene con un mensaje si falta una variable obligatoria.
  - `PUERTO_HTTP` y `PUERTO_HTTPS` cambian los puertos publicados.
  - `migrar` termina con código 0 y los otros cuatro servicios quedan *healthy*.
- Deriva entre esquema y migraciones, desde `apps/api` con `DATABASE_URL_MIGRADOR` y `DATABASE_URL_SOMBRA`: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`.
- Al subir de versión `argon2` o Prisma hay que volver a aprobar su script de instalación con `npm install-scripts approve <paquete>` (ADR 0008).

## Arquitectura de la API

- Monolito modular con siete módulos: `acceso`, `catalogos`, `sesiones`, `registros`, `evidencias`, `mallas`, `reportes`. Hoy existen todos menos `mallas`, que queda pendiente.
- Tres capas por módulo: controlador (HTTP, DTO, guard), servicio (caso de uso y transacción), Prisma (datos). Sin repositorio genérico por tabla.
- Interfaces solo donde hay dos implementaciones o una prueba que la pide: almacenamiento de evidencias (disco local hoy, S3 compatible después) y reloj inyectable.
- Entrada: DTO con class-validator. `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`.
- Errores: un filtro global traduce P2025 a 404, P2002 y P2003 a 409, y el SQLSTATE 23514 de los CHECK y triggers a 409 con el mensaje de la base. Lo demás es 500 con id de petición y sin detalle interno. Cómo entrega Prisma 7 el 23514 no está probado: verificarlo antes de escribir el filtro.
- Transacción explícita con `prisma.$transaction` en cuatro casos: crear sesión con su evidencia y sus registros, cerrar un registro, rotar el refresh token y cargar catálogos.
- Archivos: primero se guarda el archivo, luego se inserta la fila dentro de la transacción; si la transacción falla, se borra el archivo.
- Fechas sin hora: texto `AAAA-MM-DD` de punta a punta. Nunca un `Date` de JavaScript para una columna DATE, porque en Santiago muestra el día anterior. Las marcas de tiempo son `timestamptz` y se muestran en America/Santiago.
- Sin variantes `Sync` de `fs` ni de `crypto` dentro de una petición. El hash de un archivo se calcula por stream.
- La API se documenta con OpenAPI (RNF-12).

## Base de datos

- Las invariantes viven en la base: CHECK de cierre (fecha efectiva y evidencia) y de anulación (motivo); trigger que asigna el correlativo R-AAAA-NNN desde `contador_correlativo` con bloqueo de fila; trigger que rechaza cambios sobre registros cerrados o anulados; trigger que escribe `historial_estado` e `historial_cambio`.
- Dos roles: `ipss_migrador`, dueño del esquema y usado solo por las migraciones, e `ipss_api`, sin DELETE ni TRUNCATE y con solo lectura sobre los historiales y el contador. La API nunca se conecta como migrador.
- El SQL de reglas va escrito a mano dentro de la migración de Prisma. No se regenera ni se simplifica. Todo cambio a esas reglas exige que pasen las 26 pruebas.
- Nada se borra: un registro se anula y un usuario se desactiva.
- Tablas y columnas en español, `snake_case`, en singular (`registro`, `fecha_comprometida`). Identificadores UUID.

## Seguridad

- Contraseñas con argon2id. JWT de 15 minutos en cookie httpOnly, Secure y SameSite=Strict. Refresh token rotatorio y revocable, guardado como hash.
- Bloqueo de 15 minutos tras cinco intentos fallidos. `trust proxy` activo detrás de Caddy; sin eso el limitador bloquea a todos juntos.
- Guard de rol en cada ruta. Solo el inicio de sesión y `/api/salud` quedan sin guard.
- Evidencias: máximo 20 MB; PDF, JPG y PNG validados por contenido con `file-type`; SHA-256 al subir y verificado al descargar; nombre en disco con UUID; descarga solo por la API con sesión. Multer entrega el nombre original en latin1 y hay que convertirlo a UTF-8.
- Sin secretos en el repositorio: `.env` fuera de git y `.env.ejemplo` al día.
- Solo datos de ejemplo, los mismos del prototipo. Sin datos reales del IPSS y sin datos personales en los logs.

## Frontend

- React Router 7 para las rutas, con un límite de error por ruta. TanStack Query para los datos del servidor, sin reintentos en respuestas 4xx. Formularios con react-hook-form y zod.
- La API es la autoridad de validación: el formulario muestra por campo los errores 400 que devuelve.
- Pantallas, textos, validaciones y cifras siguen el prototipo v4. En el panel el término visible es «ajustes»; en el código y en la base la entidad se llama `registro`.
- Identidad visual del prototipo: Montserrat, azul marino `#102B42`, azul `#0077C2`, dorado `#CFB47C`, un solo tema claro.
- Funciona desde 768 px de ancho. Contraste mínimo 4,5:1, controles con etiqueta y navegación completa por teclado.

## Convenciones

- TypeScript con `strict` y `noUncheckedIndexedAccess`. Sin `any`. ESLint con `no-floating-promises` y `switch-exhaustiveness-check`.
- Nombres del dominio en español (`Sesion`, `Registro`, `cerrarRegistro`). Comentarios en español que explican el porqué, no el qué. Mensajes al usuario en español.
- SOLID con criterio: una responsabilidad por clase e inyección de dependencias siempre; una abstracción nueva solo cuando existe la segunda implementación o una prueba la necesita.
- Ramas cortas y solicitudes de cambio pequeñas, con revisión de un compañero. `main` siempre desplegable.
- Commits en español, en imperativo, un cambio por commit.

## Pruebas y definición de terminado

- Un cambio está terminado cuando tiene su prueba, pasan lint, tipos y pruebas, corre en Compose y coincide con el prototipo.
- API: Jest contra PostgreSQL real en Docker, sin simular la base. Web: Vitest con Testing Library. Punta a punta: tres flujos con Playwright.
- Las 26 pruebas de reglas de base corren en cada push.

## Forma de trabajo

- Antes de editar, presentar un plan con los archivos a tocar y el orden, y esperar aprobación.
- Trabajar por puntos de control. Al cerrar cada uno, mostrar los comandos ejecutados con su salida y detenerse.
- Cada decisión de arquitectura nueva se registra como ADR en `docs/adr/NNNN-titulo.md`, en media página: contexto, decisión y consecuencias.
- Si algo de este archivo contradice lo que se observa al ejecutar, detenerse y avisar. No resolverlo cambiando versiones ni desactivando una regla.
- No modificar sin pedido explícito: reglas SQL, roles de base, versiones fijadas ni configuración de seguridad.
