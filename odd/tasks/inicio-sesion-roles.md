# Inicio de sesión y roles

Ubicación: `odd/tasks/inicio-sesion-roles.md` · Espejo en Engram: `odd/inicio-sesion-roles/tasks`

## Objetivo

Que un usuario inicie sesión con correo y contraseña (RF-01), mantenga una sesión segura y vea solo lo que su rol permite (RF-02), tal como lo hace el prototipo v4.

## Por qué

Cierra el primer hito (hasta el 29-11-2026). Todo módulo posterior necesita usuario, rol y alcance.

## Alcance autorizado

Plan aprobado el 26-11-2026, con cinco decisiones:

1. **Sesión.** JWT de 15 min. Refresh que vence tras 15 min sin actividad, con un tope absoluto de 8 h.
2. **Librería de JWT.** `jose` 6.2.18 (sin dependencias, con *provenance*, sin avisos en OSV).
3. **Usuarios.** Semilla de desarrollo con los datos del prototipo (clave `Demo-2026`), que se niega a correr en producción. La herramienta para producción queda para el hito 4.
4. **shadcn/ui.** Pospuesto al hito 2; el inicio de sesión se hace con Tailwind y los colores y medidas del prototipo.
5. **Migración nueva.** `refresh_token` suma `familia` y `sesion_iniciada_en`. Dos CHECK nuevos en `usuario`: correo en minúsculas y hash con formato argon2id.

Fuera de alcance: recuperar o cambiar la contraseña, la herramienta de producción para crear usuarios y Playwright.

## Restricciones

- Las mismas de `CLAUDE.md`. No se tocan las reglas SQL existentes y las 26 pruebas siguen pasando.
- Si algo falla por una versión, detenerse.
- El usuario pidió avanzar sin detenerse entre partes; solo se para ante un fallo de versión o una decisión nueva.

## Configuración de pruebas

- TDD: no configurado, así que queda desactivado. Cada cambio lleva su prueba.
- Ejecutores:
  - Jest para la API, contra `bd-pruebas`.
  - Vitest para la web.
  - `npm run test:bd` para las 26 reglas.

## Tareas

- [ ] **S1 Base y semilla.** Migración `…_acceso`, `schema.prisma`, `src/cli/semilla.ts` con los datos del prototipo, pruebas de los CHECK nuevos y las 26 reglas en verde.
  - Ruta: delegada (escritor de la API).
- [ ] **S2 API de acceso.** Reloj inyectable y, en el módulo `acceso`:
  - `ingresar`, `renovar`, `salir` y `yo`;
  - intentos y bloqueo con respuestas que no revelan qué correos existen;
  - límite por IP;
  - guards globales de autenticación y de rol, y `AlcanceService`.
  - Además, ADR 0009 y 0010.
  - Ruta: delegada (escritor de la API).
- [ ] **S3 Web.**
  - Pantalla de inicio de sesión idéntica al prototipo y rutas protegidas.
  - Renovación automática tras un 401 e inactividad.
  - Estructura de la aplicación con barra lateral y menú de usuario.
  - «Nueva sesión» oculta para Aseguramiento de la Calidad.
  - Ruta: delegada (escritor de la web).
- [ ] **S4 Documentación y verificación.** Comando de la semilla en `CLAUDE.md`, `dev.mjs` con la semilla y verificación de punta a punta.
  - Ruta: inline.

## Criterios de aceptación

- **Ingreso:** los tres usuarios del prototipo entran con `Demo-2026` y quedan con cookies HttpOnly, Secure y SameSite=Strict.
- **Fallos:**
  - La respuesta es la misma exista o no el correo.
  - Al tercer fallo se avisa cuántos intentos quedan y al quinto la cuenta se bloquea 15 min con cuenta regresiva.
- **Sesión:**
  - La sesión vence tras 15 min sin actividad o a las 8 h.
  - El refresh token rota en cada renovación y su reutilización revoca la familia.
- **Rutas:**
  - Toda ruta declara `@Roles` o `@Publica`.
  - Aseguramiento de la Calidad no ve «Nueva sesión».
- **Calidad:** lint, tipos y todas las pruebas en verde.

## Entrega

- Rama `inicio-sesion`, encima de `esqueleto`.
- Un commit por tarea como mínimo.
- Previsión: unas 2.500 líneas, así que supera las 400 por PR. La estrategia de PR sigue pendiente del usuario y no se hace push.

## Progreso y evidencia

- 26-11-2026: plan aprobado, rama `inicio-sesion` creada.

## Próximo paso

S1 y S2.
