# 0018. Catálogos y usuarios por línea de comandos

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Producción la instala y opera TI del IPSS, que recibe imágenes y una guía. Hacen falta los catálogos reales (sectores, carreras, asignaturas y módulos, canales) y las cuentas, sin tocar código ni la base a mano. La API no tiene pantallas de administración, el sistema de archivos de su contenedor es de solo lectura y el rol `ipss_api` solo tiene INSERT y UPDATE sobre estas tablas (sin DELETE).

## Decisión

- Dos comandos compilados con la API (`dist/cli/catalogos.js` y `dist/cli/usuarios.js`), con scripts `npm run catalogos` y `npm run usuarios` en desarrollo. Corren con el rol `ipss_api` y, a diferencia de la semilla, se permiten con `NODE_ENV=production`.
- **Catálogos** (`catalogos <archivo.xlsx | -> [--prueba]`, `catalogos --plantilla <salida | ->`):
  - La planilla Excel tiene las hojas Sectores, Carreras, Asignaturas y Canales; la plantilla la genera el propio comando con los datos de ejemplo, así que no hay binarios ni datos reales en el repositorio.
  - Lee desde un archivo o desde stdin (`docker compose exec -T api node dist/cli/catalogos.js - < catalogos.xlsx`); solo `.xlsx`, hasta 5 MB y 20.000 filas por hoja.
  - Valida todo antes de escribir (celdas vacías, duplicados sin distinguir mayúsculas ni tildes, referencias desconocidas, valores inválidos) y, si hay un error, lo informa con hoja y fila y no escribe nada.
  - Escribe en una sola transacción; inserta lo nuevo y actualiza lo que cambió (sector de una carrera, código de una asignatura, `activo` de un canal), nunca borra y lista lo «no incluido». Repetir la carga no cambia nada y `--prueba` solo informa.
- **Usuarios** (`crear`, `desactivar`, `activar`, `restablecer-clave`, `listar`):
  - El alcance sigue el rol: un director sectorial lleva al menos un sector, uno de carrera al menos una carrera y Calidad ninguno. El correo se normaliza como exige el CHECK de la base.
  - La clave temporal es aleatoria (24 caracteres, `crypto`) y se guarda con argon2id mediante `ContrasenasService`. Se muestra una sola vez por stdout, nunca por un logger, junto con el aviso de entregarla por un canal seguro.
  - `desactivar` y `restablecer-clave` revocan todos los refresh tokens; como el guard consulta la base en cada petición, la sesión cae de inmediato. `restablecer-clave` también limpia los intentos fallidos y el bloqueo. `listar` nunca selecciona el hash.
- Códigos de salida: 0 bien, 1 error de datos o de ejecución, 2 argumentos incorrectos.

## Consecuencias

- No hay forma de quitar un sector o una carrera del alcance de una cuenta, porque el rol no tiene DELETE sobre `usuario_sector` ni `usuario_carrera`. Crear otra cuenta tampoco sirve, porque el correo es único. Corregir un alcance mal cargado exige una decisión del dueño del proyecto: dar ese permiso a `ipss_api` o hacerlo con el rol migrador. Hasta entonces, el alcance se revisa antes de crear la cuenta.
- La aplicación no tiene una pantalla de «cambiar mi clave»: la clave temporal sigue vigente hasta el siguiente `restablecer-clave`. Queda como brecha por decidir.
- Quien ejecuta el comando ve la clave en su terminal; el historial del shell no la guarda porque no es un argumento. El operador es quien debe cuidar el canal de entrega.
- Los comandos se prueban llamando a sus funciones (`cargarCatalogos`, `principal`) contra la base de pruebas, sin lanzar procesos.
