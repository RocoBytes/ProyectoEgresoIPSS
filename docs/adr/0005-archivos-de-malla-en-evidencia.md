# 0005. Archivos de malla como evidencia

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Cada versión de malla curricular tiene un PDF asociado. Hay que decidir si ese archivo vive en una tabla propia o reutiliza la de evidencias, que ya resuelve almacenamiento, hash y descarga.

## Decisión

- El PDF de la malla es una fila de `evidencia`, referenciada por `version_malla.archivo_id` (único, un archivo por versión).
- Hereda lo que ya tiene la evidencia: SHA-256 al subir y verificado al descargar, nombre en disco con UUID e inmutabilidad para la API (sin `UPDATE` ni `DELETE`).
- La descarga pasa siempre por la API, con sesión. Nunca hay una ruta pública al archivo.
- Quién subió el archivo es `evidencia.subido_por`; `version_malla` no repite ese dato.
- Por eso `evidencia.sesion_id` es opcional: un archivo de malla no pertenece a una sesión.

## Consecuencias

- Un solo camino de carga y descarga, con una sola superficie de seguridad que revisar.
- Subir una malla exige crear primero la evidencia y luego la versión, dentro de una transacción.
- El archivo de una versión de malla no se reemplaza: se crea otra versión.
