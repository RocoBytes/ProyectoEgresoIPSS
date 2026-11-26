# 0002. Alcance de cada usuario por perfil

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

La decisión abierta 2 de `docs/contexto-proyecto.md` preguntaba cómo se limita lo que ve cada rol. El Director Sectorial trabaja sobre uno o más sectores, el Director de Carrera sobre una o más carreras, y Aseguramiento de la Calidad ve todo.

## Decisión

- Dos tablas de asociación, cada una con clave primaria compuesta: `usuario_sector` (Director Sectorial) y `usuario_carrera` (Director de Carrera).
- Aseguramiento de la Calidad no tiene filas en ninguna: su alcance es la institución completa y se deduce del rol.
- La coherencia entre rol y tabla (un Director Sectorial solo con sectores, un Director de Carrera solo con carreras) la valida la API al asignar el alcance. La base no la expresa con un CHECK, porque cruzaría tablas.
- La API recibe hoy solo `INSERT` sobre estas dos tablas. Quitar un alcance exigiría `DELETE` o una columna de vigencia, y el cliente aún no confirma si ese caso existe.

## Consecuencias

- Asignar alcance es sencillo y auditable; revocarlo no se puede hacer desde la API hasta que se decida.
- Cuando el cliente confirme el caso, habrá que elegir entre conceder `DELETE` sobre estas tablas (rompe "nada se borra") o agregar una columna de vigencia, y registrarlo en un ADR nuevo.
- Cada consulta de la API debe filtrar por el alcance del usuario; no hay seguridad a nivel de fila en la base.
