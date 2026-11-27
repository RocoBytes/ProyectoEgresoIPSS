# 0021. Errores del proxy en JSON y publicación de imágenes

- Estado: Aceptada
- Fecha: 2026-11-27

## Contexto

`header -Server` del `Caddyfile` solo alcanza las respuestas que pasan por las rutas normales. Las que Caddy genera por su cuenta (el 413 del tope de 100 MB, un 502 si la API no responde) salían vacías y con `Server: Caddy`. La web, además, espera un cuerpo JSON con `message` para mostrar el error. Por otro lado, `compose.yaml` descarga las imágenes de GHCR y nada las publicaba.

## Decisión

- **`handle_errors` en el `Caddyfile`** (configuración de seguridad aprobada por el usuario). Quita `Server` y responde JSON `{"statusCode","message"}` con el estado original. El 413 lleva exactamente el cuerpo que devuelve la API para el envío demasiado grande; los 5xx dicen que el servicio no está disponible; cualquier otro, un mensaje genérico. Lo que responden la API y la web no pasa por este bloque.
- **Web:** al cerrar o anular, todo 413 se explica con el tope de 20 MB por archivo, venga o no con cuerpo, porque el mensaje del proxy habla del envío completo de una sesión. En «Nueva sesión» el mensaje del cuerpo ya es el correcto.
- **Job `publicar` en CI**, solo para etiquetas `v*` y después de `verificar`, `imagenes` y `e2e`. Es el único con `packages: write`. Construye y sube `ipss-api` y `ipss-web` con `docker/build-push-action`, con los nombres que espera `compose.yaml` (`ghcr.io/<organización en minúsculas>/ipss-*:<etiqueta>`), con procedencia y SBOM de BuildKit. Todas las acciones van fijadas por SHA.

## Consecuencias

- Los errores del proxy ya no filtran el servidor y la web los muestra igual que los de la API.
- El mensaje de la API y el del `Caddyfile` para el 413 están duplicados: si uno cambia, hay que cambiar el otro.
- Publicar una versión es crear y subir una etiqueta; la primera vez conviene hacerla pública o dar acceso al paquete en GHCR para que el servidor pueda hacer `pull`.
