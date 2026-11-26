# 0009. Sesión con JWT de corta vida y refresh token rotatorio

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

El prototipo exige que la sesión caduque a los 15 minutos de inactividad, y `CLAUDE.md` pide JWT de 15 minutos en cookie `httpOnly`, `Secure` y `SameSite=Strict`, con un refresh token rotatorio, revocable y guardado como hash. Hay que fijar los detalles que faltan: tope absoluto, rotación, qué pasa si un token se reutiliza y cómo se firma.

## Decisión

- **Dos cookies.** `__Host-ipss_acceso` (JWT, `Path=/`, `Max-Age` 900) y `__Secure-ipss_renovacion` (refresh token, `Path=/api/acceso`, `Max-Age` hasta su vencimiento). Ambas `HttpOnly`, `Secure` y `SameSite=Strict`. El prefijo `__Host-` obliga al navegador a rechazarla si no cumple esas condiciones; la de renovación usa `__Secure-` porque necesita un `Path` más estrecho y así solo viaja a `/api/acceso`.
- **JWT.** HS256 con `jose`, emisor `ipss-api`, audiencia `ipss-web`, `sub` con el id del usuario, la claim `rol` y la claim `sid` (la familia de la sesión). Al verificar se fija `algorithms: ['HS256']`, emisor, audiencia y la hora del `Reloj` inyectable. Dura 15 minutos y nunca más allá del tope de la sesión.
- **Refresh token.** 32 bytes aleatorios en base64url; en la base solo se guarda su SHA-256. Cada ingreso crea una `familia` (UUID) y registra `sesion_iniciada_en`. Vence en `min(ahora + 15 min, sesion_iniciada_en + 8 h)`: 15 minutos de inactividad y 8 horas como tope absoluto.
- **Rotación.** `POST /api/acceso/renovar` corre en una transacción: revoca el token presentado con un `UPDATE ... WHERE revocado_en IS NULL` (si el conteo no es 1, otra petición ganó) y crea el siguiente en la misma familia. El rol del JWT nuevo se lee de la base.
- **Reutilización.** Un token ya revocado que reaparece revoca toda su familia y responde 401, salvo dentro de los 10 segundos posteriores a su rotación. Esa ventana cubre dos pestañas que renuevan a la vez con la misma cookie: la segunda recibe 401 sin revocar nada y reintenta con la cookie que dejó la primera.
- **El guard consulta la base en cada petición.** Tras verificar el JWT, `AutenticacionGuard` busca en una sola consulta un refresh token vivo (no revocado y no vencido) de la familia `sid` y lee de ahí `usuario.activo` y `usuario.rol`. Si no hay token vivo o el usuario está inactivo responde 401; el `RolesGuard` usa el rol de la base, no el del JWT. Con unas 10 personas, una consulta por petición es barata.
- **`renovar` y `salir` son `@Publica`** (no pasan por el guard de JWT) pero se autentican con la cookie de renovación. Se llaman justamente cuando el JWT venció; si exigieran uno válido, nunca podrían renovar. Al rechazar una renovación no se borran las cookies, para no destruir la que dejó la otra pestaña.
- **Por qué `jose`.** Sin dependencias, con *provenance*, sin avisos en OSV y con API de Web Crypto. Es solo ESM: Jest necesita `--experimental-vm-modules`, que ya trae el script `test` de la API.

## Consecuencias

- Desactivar a un usuario, cambiarle el rol o cerrar sesión rigen en la petición siguiente: ya no hay que esperar a que venza el JWT, y copiar la cookie de acceso antes de `salir` no sirve de nada. El costo es una consulta por petición.
- Un refresh token robado y usado primero por el atacante deja al usuario legítimo con un 401 al renovar; al reutilizar fuera de la ventana se cierra la sesión completa y se registra una advertencia con la familia. Dentro de la ventana de 10 s también se registra una advertencia, solo con la familia (sin correo ni token), porque es indistinguible de un robo.
- El secreto `JWT_SECRETO` (mínimo 32 caracteres) es obligatorio; rotarlo cierra todas las sesiones activas.
- `renovar` y `salir` tienen un límite de 60 peticiones por IP cada 15 minutos.
- **Pendiente:** la tabla `refresh_token` crece una fila por renovación y `ipss_api` no tiene DELETE, así que nadie las purga. Hace falta una tarea de mantenimiento que borre las filas vencidas y revocadas, ejecutada con el rol migrador.
