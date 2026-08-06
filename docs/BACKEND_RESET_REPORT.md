# Informe: reset del backend (Node/SQL Server → PHP/MySQL)

Registro de qué se borró, qué se modificó y qué se creó al descartar el
backend Node/Express + SQL Server y reemplazarlo por el esqueleto PHP + MySQL.

**Importante:** nada de `backend/` estaba comiteado — los 30 archivos
figuraban en `git status` como "new file" (staged) sobre un working tree que
nunca llegó a un commit. Borrarlo no revierte ningún commit ni pierde
historia; simplemente descarta trabajo en curso no confirmado, tal como pidió
el usuario.

## Qué se borró

### `backend/` completo (30 archivos trackeados + 2 no trackeados)

| Ítem | Función que cumplía | Riesgo de haberlo borrado |
|---|---|---|
| `backend/src/app.js`, `server.js` | Bootstrap de la app Express y arranque del servidor HTTP en el puerto 4000. | Ninguno — nunca se comiteó, no hay otro código que dependa de esto fuera de `backend/`. |
| `backend/src/controllers/*.js` (auth, tickets, usuarios) | Lógica de negocio de login, CRUD de tickets y usuarios contra SQL Server. | Ninguno — se va a reescribir desde cero en `app/Controllers/` con PDO/MySQL. |
| `backend/src/routes/*.js` | Definición de endpoints REST (`/api/auth`, `/api/tickets`, `/api/usuarios`). | Ninguno — el nuevo `Router` en `app/Core/Router.php` define rutas equivalentes a medida que se implementen. |
| `backend/src/middleware/auth.js`, `errorHandler.js` | Verificación de JWT y manejo centralizado de errores HTTP. | Ninguno — el rol de `auth.js` lo va a cumplir `app/Middleware/AuthMiddleware.php` (stub) una vez definida la integración con FreeScout. |
| `backend/src/utils/*.js` (jwt, password, response, AppError, asyncHandler) | Firma/verificación de JWT, hash de contraseñas con bcrypt, formato de respuesta uniforme. | Ninguno — el nuevo backend no usa JWT propio (la sesión saldrá de la integración con FreeScout, ver `docs/freescout-integration-strategy.md`) ni bcrypt (las contraseñas las gestiona FreeScout). |
| `backend/src/validators/*.js` | Validación de payloads de entrada por endpoint. | Ninguno — equivalente nuevo es `app/Helpers/Validator.php`, reescrito desde cero para PHP. |
| `backend/src/config/db.js`, `env.js` | Conexión a SQL Server (`mssql`) y carga de variables de entorno. | Ninguno — reemplazado por `app/Config/Database.php` (PDO/MySQL) y `app/Config/Env.php`. |
| `backend/database/01_schema.sql` … `04_add_asignado_column.sql` | Esquema de SQL Server: tablas `Usuarios`, `Tickets`, comentarios, columna `asignado`. | Se descartó sin conservar copia, por decisión explícita del usuario — el esquema MySQL se diseña desde cero en `database/migrations/`. |
| `backend/postman/*.json` | Colección Postman para probar la API vieja manualmente. | Ninguno — apuntaba a endpoints que ya no existen. |
| `backend/package.json`, `package-lock.json` | Manifiesto de dependencias npm del backend Node. | Ninguno — el nuevo backend usa Composer (`composer.json` en la raíz), no npm. |
| `backend/README.md`, `.env.example` | Documentación y plantilla de variables de entorno del backend viejo. | Ninguno — reemplazados por el README raíz actualizado y el nuevo `.env.example` (PHP/MySQL). |
| `backend/.env` *(no trackeado)* | Credenciales reales: contraseña de SQL Server y secreto JWT. | Ninguno — nunca se commiteó (cubierto por la regla `.env` del `.gitignore`); no hay exposición en el historial de git. |
| `backend/node_modules/` *(no trackeado)* | Dependencias npm instaladas (Express, mssql, jsonwebtoken, bcryptjs, cors, dotenv y transitivas). | Ninguno — se regeneran con `npm install` si algún día hiciera falta, pero ya no aplica al proyecto. |

### Frontend: código de API/auth eliminado

- `assets/js/modules/api-client.js` — borrado completo (era 100% wrapper del backend viejo: `API_BASE_URL`, `apiFetch`, manejo de sesión en `localStorage`, `requireAuth`).

## Qué se modificó

| Archivo | Cambio |
|---|---|
| `assets/js/modules/login-form.js` (ahora `public/assets/js/modules/login-form.js`) | Se quitó el `apiFetch('/auth/login', ...)` y el manejo de sesión. Mantiene la validación de campos del lado cliente; en submit muestra "backend en construcción" en vez de autenticar. |
| `assets/js/pages/panel-admin.js` (ahora `public/assets/js/pages/panel-admin.js`) | Se quitaron `requireAuth` y los ~10 `apiFetch` de tickets/usuarios/comentarios. Los formularios y filtros quedan visibles pero inertes, con aviso explícito de "backend en construcción" en vez de quedar en "Cargando…" para siempre. |
| `assets/js/pages/panel-cliente.js` (ídem) | Mismo tratamiento: sin `requireAuth` ni `apiFetch`, formulario de creación de ticket deshabilitado con aviso. |
| `.claude/settings.local.json` | Se podaron ~45 entradas de permisos específicas del backend viejo (comandos `SQLCMD`, `curl` a `localhost:4000` — algunos con contraseñas de prueba en texto plano —, `npm start/run` dentro de `backend/`, kill de procesos en el puerto 4000, etc.). Quedaron solo las entradas genéricas no relacionadas al backend. |
| `.claude/launch.json` | El servidor de preview estático ahora sirve `public/` en vez de la raíz del repo (`"serve", "-l", "4321", "public"`), ya que el frontend se movió ahí. |
| `.gitignore` | Se agregaron `vendor/`, `storage/*`, `logs/*`, `cache/*` (con excepción de los `.gitkeep`), para el nuevo backend PHP. |
| `README.md` (raíz) | Reescrito: refleja la nueva estructura `public/` + `app/`, cómo levantar el frontend estático y los pasos pendientes del backend PHP. |

## Qué se creó

- **Reorganización de todo el frontend a `public/`** (`git mv`, historia preservada): `index.html`, `login.html`, `panel-admin.html`, `panel-cliente.html`, `assets/`, `robots.txt`, `sitemap.xml`, `site.webmanifest`.
- **Esqueleto PHP MVC**: `composer.json`, `.env.example`, `public/index.php` (front controller), `app/Config/{Env,Database}.php`, `app/Core/{Router,Request,Response}.php`, `app/Controllers/{BaseController,HealthController}.php`, `app/Models/BaseModel.php`, `app/Services/FreeScoutService.php` (stub), `app/Middleware/AuthMiddleware.php` (stub), `app/Helpers/Validator.php`.
- **Carpetas de runtime**: `database/migrations/`, `database/seeds/`, `storage/`, `logs/`, `cache/` (vacías, con `.gitkeep`).
- **Documentación**: `docs/freescout-integration-strategy.md`, `docs/SECURITY_NOTES.md`, este mismo informe (`docs/BACKEND_RESET_REPORT.md`).

## Dependencias que se van

Todo `package.json` de `backend/`: `express`, `mssql`, `jsonwebtoken`, `bcryptjs`, `cors`, `dotenv`.

## Dependencias que van a hacer falta

No instaladas en este entorno de desarrollo (verificado: `php`, `composer` y
`mysql` no están disponibles ni en bash ni en PowerShell):

- **PHP 8.3** con las extensiones `pdo`, `pdo_mysql`, `json`.
- **Composer** (para `composer install`, resuelve el autoload PSR-4 — no hay
  librerías de terceros todavía en `composer.json`, solo el propio código).
- **MySQL 8** (o compatible) para crear la base y correr las migraciones que
  se agreguen en `database/migrations/`.

El código PHP quedó escrito y revisado a ojo (sin linter/ejecución posibles
en este entorno), pero **no se pudo correr ni probar** — es el primer paso a
validar apenas se disponga de ese entorno.
