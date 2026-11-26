# 0010. Bloqueo por correo y límite por IP en el ingreso

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

El prototipo bloquea la cuenta 15 minutos tras cinco intentos fallidos y usa el mismo mensaje exista o no el correo, para no revelar qué cuentas hay. `CLAUDE.md` agrega que `trust proxy` debe estar activo detrás de Caddy, o el limitador trataría a todos como una sola IP.

## Decisión

- **Bloqueo por correo normalizado** (minúsculas, sin espacios). Para un usuario existente se guarda en `usuario.intentos_fallidos` y `usuario.bloqueado_hasta`, con un solo `UPDATE` atómico que incrementa y, al quinto fallo, bloquea 15 minutos y reinicia el contador. Con la cuenta bloqueada se responde 429 aunque la contraseña sea la correcta; un ingreso correcto reinicia el conteo.
- **Respuestas idénticas.** Correo inexistente, contraseña incorrecta y usuario inactivo dan la misma secuencia: 401 con `intentosRestantes` 4, 3, 2, 1 y, al quinto, 429 con `bloqueadoHasta` y `Retry-After`. Cuando el correo no existe se verifica la contraseña contra un hash argon2id ficticio (calculado al arrancar con los mismos parámetros), para que el tiempo de respuesta no delate la diferencia.
- **Correos inexistentes en memoria.** No hay fila donde contar, así que un `Map` con vencimiento a 15 minutos y tope de 10.000 entradas lleva el mismo conteo. Se pierde al reiniciar y, al llenarse, descarta lo vencido y luego lo más antiguo. Sin esto, un correo falso nunca se bloquearía y esa diferencia revelaría que no existe.
- **Límite por IP** con `@nestjs/throttler`, solo en `POST /ingresar`: 20 por 15 minutos, usando la IP que resuelve `trust proxy`. Su 429 dice «Demasiados intentos desde esta conexión. Espera unos minutos.», distinto del bloqueo de cuenta.

## Consecuencias

- **Limitación conocida:** cualquiera que conozca un correo puede bloquear esa cuenta 15 minutos fallando a propósito. Se acepta en una aplicación interna de unas 10 personas; el costo de un bloqueo es esperar, y el administrador puede limpiar `bloqueado_hasta` en la base.
- El conteo de correos inexistentes es por proceso: con más de una instancia de la API cada una cuenta aparte. Hoy hay una sola; con más habría que moverlo a la base.
- Si alguien llena las 10.000 entradas con correos falsos, puede borrar el contador de otro correo falso; no afecta a cuentas reales, que cuentan en la base.
- El límite por IP depende de que Caddy sobrescriba `X-Forwarded-For` y de `TRUST_PROXY=1`; sin eso, o todos comparten un cupo o la IP se puede falsear.
