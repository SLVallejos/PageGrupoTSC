# Estrategia de integración con FreeScout (implementada)

**Estado: implementado y funcionando** — login de administradores real
contra FreeScout, login de clientes contra una tabla propia. Este documento
reemplaza la versión anterior (puramente especulativa, escrita antes de
tener FreeScout instalado); lo que sigue está verificado contra el código
fuente real de la distribución descargada (`freescout-dist`, ahora en
`D:\laragon\www\freescout`).

## Lo que se encontró al revisar el código real

- FreeScout core/gratuito **solo autentica staff interno** (tabla `users`:
  agentes/admins). La columna `password` usa el hash bcrypt por defecto de
  Laravel (`Hash::make()`), 100% compatible con `password_verify()` de PHP.
- La tabla `customers` (la gente que escribe tickets) **no tiene columna de
  contraseña** — loguearse como cliente es una función del módulo pago
  "Customer Portal", no instalado acá.
- No hay módulo de API/API-keys bundleado en este dist (no existe
  `routes/api.php` ni controllers `Api`), así que la "Opción B" (puente vía
  REST API) que había quedado como recomendación teórica **no es viable**
  con esta instalación.
- `php artisan freescout:create-user --role=admin --email=... --password=...`
  permite crear un usuario admin sin pasar por el wizard web — así se creó
  el admin de prueba.

## Estrategia implementada

**Dos fuentes de autenticación, sin overlap:**

1. **Admins** → lectura directa (solo `SELECT`) de `freescout.users` desde
   `App\Services\FreeScoutService::getAdminByEmail()`
   ([app/Services/FreeScoutService.php](../app/Services/FreeScoutService.php)).
   Solo devuelve resultado si `role = 2` (`User::ROLE_ADMIN` en FreeScout) —
   un agente FreeScout sin rol admin no tiene rol equivalente en Grupo TSC,
   así que se trata como no encontrado en vez de mapearlo a "cliente".
2. **Clientes** → tabla propia `usuarios_clientes` en la base `grupotsc`
   ([database/migrations/001_usuarios_clientes.sql](../database/migrations/001_usuarios_clientes.sql)),
   totalmente desacoplada de FreeScout, vía
   `App\Models\ClienteUsuarioModel::findByEmail()`.

`App\Controllers\AuthController::login()` prueba primero la fuente admin y
si no matchea prueba la de clientes; en ambos casos valida con
`password_verify()` y, si es válido, abre una **sesión PHP nativa** (cookie
`tsc_session`, httpOnly + SameSite=Lax, ver `public/index.php`) —
no hay JWT ni token guardado en el cliente.

**Privilegios MySQL:** el usuario `grupotsc_app` tiene `ALL PRIVILEGES`
sobre `grupotsc.*` pero **solo `SELECT` sobre `freescout.users`** — no puede
tocar el resto de la base de FreeScout (conversaciones, mailboxes, etc.).

## Qué se resolvió de cada punto pedido originalmente

| Necesidad | Cómo quedó resuelta |
|---|---|
| Compartir usuarios (admin) | Lectura directa de `freescout.users`, sin duplicar datos. |
| Compartir usuarios (cliente) | Tabla propia `usuarios_clientes` — FreeScout no tiene con qué. |
| Sesión / SSO | Sesión propia de Grupo TSC (cookie httpOnly), no se reutiliza nada de FreeScout. |
| Validar permisos | `role` de FreeScout (2=admin) se mapea a `'ADMIN'`; la tabla propia siempre es `'CLIENTE'`. |
| Recuperar info del usuario | `GET /api/auth/me`, lee `$_SESSION['usuario']`. |
| Cerrar sesión | `POST /api/auth/logout` — destruye solo la sesión propia, no toca nada de FreeScout. |

## Pendiente / fuera de alcance de esta fase

- No hay alta de clientes vía formulario todavía (el usuario de prueba se
  insertó a mano) — no se pidió esa parte.
- Si en el futuro se instala el módulo pago "Customer Portal" de FreeScout,
  se podría migrar el login de clientes a FreeScout también y retirar
  `usuarios_clientes` — evaluarlo si se compra el módulo.
- SSO real (que no haya que loguearse por separado en FreeScout y en Grupo
  TSC) seguiría requiriendo SAML/LDAP (módulo pago) o un proxy OAuth propio
  — no evaluado como necesario todavía con un solo sistema externo.
