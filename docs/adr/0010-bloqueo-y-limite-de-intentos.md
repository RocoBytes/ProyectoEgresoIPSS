# 0010. Bloqueo por correo y límite por IP en el ingreso

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

El prototipo bloquea la cuenta 15 minutos tras cinco intentos fallidos y usa el mismo mensaje exista o no el correo, para no revelar qué cuentas hay. `CLAUDE.md` agrega que `trust proxy` debe estar activo detrás de Caddy, o el limitador trataría a todos como una sola IP.

## Decisión

- **Bloqueo por correo normalizado** (minúsculas, sin espacios). Para un usuario existente se guarda en `usuario.intentos_fallidos`, `usuario.ultimo_fallo_en` y `usuario.bloqueado_hasta`. Con la cuenta bloqueada se responde 429 aunque la contraseña sea la correcta; un ingreso correcto reinicia el conteo.
- **Reserva antes de verificar.** El intento se reserva con un solo `UPDATE` atómico (la fila queda bloqueada por `FOR UPDATE`) *antes* de calcular el hash: aplica el vencimiento de la ventana, incrementa y, si el número reservado supera 5, bloquea 15 minutos y reinicia el contador. Solo se verifica la contraseña de los intentos 1 a 5; el sexto y los siguientes responden 429 sin verificar. Así una ráfaga paralela no puede probar más de cinco contraseñas. Si el intento correcto llega con la cuenta ya bloqueada, el reinicio condicional (`bloqueado_hasta` nulo o vencido) no actualiza nada y se responde 429. Un fallo con el número 5 bloquea. La hora la pone el `Reloj` como parámetro, nunca `now()`.
- **Ventana idéntica.** Un intento con más de 15 minutos de antigüedad ya no cuenta: el contador vuelve a 1. La regla es la misma en la base y en el mapa de correos inexistentes; sin ella, «2 fallos, esperar 16 minutos, 1 fallo» daba 2 intentos restantes en una cuenta real y 4 en una inexistente.
- **Respuestas idénticas.** Correo inexistente, contraseña incorrecta y usuario inactivo dan la misma secuencia: 401 con `intentosRestantes` 4, 3, 2, 1 y, al quinto, 429 con `bloqueadoHasta` y `Retry-After`. Cuando el correo no existe se verifica la contraseña contra un hash argon2id ficticio (calculado al arrancar con los mismos parámetros), para que el tiempo de respuesta no delate la diferencia.
- **Correos inexistentes en memoria.** No hay fila donde contar, así que un `Map` con tope de 10.000 entradas lleva el mismo conteo; su reserva es síncrona, sin ningún `await` entre leer y escribir. Se pierde al reiniciar y, al llenarse, descarta lo vencido y luego lo más antiguo. Sin esto, un correo falso nunca se bloquearía y esa diferencia revelaría que no existe.
- **Límite por IP** con `@nestjs/throttler`, solo en `POST /ingresar`: 20 por 15 minutos, usando la IP que resuelve `trust proxy`. Su 429 dice «Demasiados intentos desde esta conexión. Espera unos minutos.», distinto del bloqueo de cuenta.

## Consecuencias

- **Limitación conocida:** cualquiera que conozca un correo puede bloquear esa cuenta 15 minutos fallando a propósito. Se acepta en una aplicación interna de unas 10 personas; el costo de un bloqueo es esperar, y el administrador puede limpiar `bloqueado_hasta` en la base.
- El conteo de correos inexistentes es por proceso: con más de una instancia de la API cada una cuenta aparte. Hoy hay una sola; con más habría que moverlo a la base.
- **Diferencias que quedan:** el mapa de correos inexistentes se pierde al reiniciar la API y, si alguien lo llena con 10.000 correos falsos, pierde los contadores más antiguos; una cuenta real conserva su conteo en la base. Alguien que reinicie o sature la API podría distinguir así un correo falso de uno real. No afecta a las cuentas reales y se acepta para esta aplicación.
- El límite por IP depende de que Caddy sobrescriba `X-Forwarded-For` y de `TRUST_PROXY=1`; sin eso, o todos comparten un cupo o la IP se puede falsear.
