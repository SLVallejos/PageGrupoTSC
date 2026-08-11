# Checklist de seguridad — backend PHP

Login, tickets (con niveles/resolución/adjuntos) y gestión de clientes ya
están implementados — ver [BACKEND_RESET_REPORT.md](BACKEND_RESET_REPORT.md)
y `app/Controllers/TicketController.php`. Este checklist mezcla lo ya
cubierto por esos endpoints con lo que sigue pendiente.

| Riesgo | Estado actual | Qué falta cuando haya más endpoints |
|---|---|---|
| **SQL Injection** | `Database::getConnection()` fuerza `PDO::ATTR_EMULATE_PREPARES => false`; todos los `Model` ya usan `PDO::prepare()` con placeholders, no interpolación de strings. | Todo `Model`/`Service` nuevo debe seguir el mismo patrón — nunca concatenar input del usuario en SQL. |
| **XSS** | El frontend ya escapa manualmente los datos dinámicos que venían del backend viejo (`escapeHtml()` en los JS de paneles, sin uso hasta que haya endpoints de tickets/usuarios). | Cuando el backend devuelva datos para listas de tickets/usuarios, seguir escapando en el frontend al insertar en el DOM (la API solo devuelve JSON, no HTML). |
| **CSRF** | El login usa `fetch` con JSON (no un `<form>` con submit tradicional) y `SameSite=Lax` en la cookie de sesión, lo que ya mitiga el caso más común de CSRF (un `<form>` de otro origen no manda la cookie en un POST cross-site con Lax). | Si se agregan acciones que mutan estado desde otro flujo (no-JSON), sumar un token CSRF explícito. |
| **Session hijacking** | Implementado: cookie `tsc_session` con `httponly` + `samesite=Lax` (ver `public/index.php`), `session_regenerate_id(true)` en cada login exitoso (`AuthController::login()`), sesión destruida por completo en logout (`session_destroy()` + `$_SESSION = []`). | Falta `secure=true` en la cookie (no se puede en este entorno de dev porque es HTTP, no HTTPS) — activarlo en cuanto haya HTTPS real en producción. Falta expiración/inactividad configurada explícitamente (hoy usa el default de PHP). |
| **Path Traversal** | `public/` es el único document root servido; el `Router` solo despacha a controllers registrados explícitamente. Los adjuntos se guardan con nombre generado (`bin2hex(random_bytes(16))` + extensión derivada del MIME real, nunca el nombre que manda el cliente) — `TicketController::subirAdjunto()`. | — |
| **Uploads inseguros** | Implementado en `TicketController::subirAdjunto()`: MIME real detectado con `finfo` (no el `type` del navegador, spoofeable) contra una whitelist (jpg/png/webp/gif/pdf), tope de 5 MB, guardado en `storage/adjuntos/` (fuera de `public/`, nunca ejecutable como script), nombre original solo se usa para mostrar/descargar. | — |
| **Headers HTTP** | `Response::securityHeaders()` ya setea `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y un `Content-Security-Policy` restrictivo (`default-src 'none'`, correcto para una API JSON pura). | Ajustar el CSP si en algún momento la API sirve algo que no sea JSON. Sumar `Strict-Transport-Security` cuando se sirva por HTTPS en producción. |
| **Validación de entradas** | `App\Helpers\Validator` da los bloques básicos (`required`, `email`, `minLength`, `maxLength`) reutilizables desde cualquier controller. | Cada controller nuevo debe validar explícitamente cada campo de `Request::input()` antes de tocar la base de datos — el helper no se aplica solo. |
| **Sanitización de datos** | `Env::get()` y `Request::input()` no ejecutan ni interpretan nada del valor recibido (son lectura simple). | Definir una política clara de sanitización por campo (trim, longitud máxima, whitelist de valores en los `enum`-like como estado/prioridad/rol) al construir cada `Model`. |

## Ya resuelto por decisiones de infraestructura

- Las credenciales de MySQL viven en `.env`, que está en `.gitignore` desde
  antes de este cambio y nunca se commiteó.
- El backend viejo (Node/SQL Server) tenía una contraseña de prueba en texto
  plano dentro de `.claude/settings.local.json` (permisos de `curl` con
  credenciales hardcodeadas) — se podó al eliminar el backend, ver
  [BACKEND_RESET_REPORT.md](BACKEND_RESET_REPORT.md).
- El usuario MySQL `grupotsc_app` tiene `ALL PRIVILEGES` sobre `grupotsc.*`
  únicamente — mínimo privilegio aplicado desde el vamos.
- El root de MySQL de este entorno local (Laragon) quedó sin contraseña
  (`--initialize-insecure`) a propósito, por ser un entorno de desarrollo
  aislado en `localhost` — nunca usar ese modo en un servidor accesible por
  red.
