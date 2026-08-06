# Entorno de desarrollo local (Laragon)

Laragon está instalado en `D:\laragon`, con PHP 8.3.30, MySQL 8.4.3 y
Composer bajo `D:\laragon\bin\`. Ninguno de esos binarios está en el `PATH`
del sistema, así que hay que usar la ruta completa (o abrirlos desde la app
de Laragon, que sí los agrega a su propio entorno).

**MySQL de este entorno corre sin contraseña de root** (`--initialize-insecure`,
ver [SECURITY_NOTES.md](SECURITY_NOTES.md)) — es intencional para desarrollo
local aislado, nunca replicar eso en un servidor con acceso de red.

## Arrancar todo desde cero (ej. después de reiniciar la PC)

### 1. MySQL

```bash
"D:/laragon/bin/mysql/mysql-8.4.3-winx64/bin/mysqld.exe" \
  --datadir="D:/laragon/data/mysql" \
  --basedir="D:/laragon/bin/mysql/mysql-8.4.3-winx64" \
  --port=3306
```

Dejalo corriendo en una terminal aparte (o usá la app de Laragon, que hace
lo mismo con un click una vez que reconozca el datadir ya inicializado).

Bases y usuarios ya creados (no hace falta recrearlos): `grupotsc` y
`freescout`, con los usuarios `grupotsc_app` y `freescout_app`. Las
contraseñas están en `.env` (raíz del proyecto, no versionado) y en
`D:\laragon\www\freescout\.env` — no se repiten acá.

### 2. Backend + frontend de Grupo TSC

Es el mismo comando que ya corre `.claude/launch.json` (`grupotsc-dev`):

```bash
"D:/laragon/bin/php/php-8.3.30-Win32-vs16-x64/php.exe" \
  -S localhost:4321 -t public public/index.php
```

Sirve `public/` (frontend estático) y enruta `/api/*` a través de
`public/index.php`. Todo en el mismo origen, sin CORS.

### 3. FreeScout

```bash
cd "D:/laragon/www/freescout"
"D:/laragon/bin/php/php-8.3.30-Win32-vs16-x64/php.exe" artisan serve --port=8001
```

FreeScout queda en `http://localhost:8001` — usuario admin de prueba:
`admin@grupotsc.com.ar` (contraseña generada en su momento, guardala si la
necesitás de nuevo; se puede resetear con
`php artisan freescout:create-user` o desde la propia UI de FreeScout).

## Si hay que recrear las bases desde cero

```bash
MYSQL="D:/laragon/bin/mysql/mysql-8.4.3-winx64/bin/mysql.exe"
"$MYSQL" -u root -h 127.0.0.1 -P 3306 -e "
  CREATE DATABASE IF NOT EXISTS freescout CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE DATABASE IF NOT EXISTS grupotsc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'freescout_app'@'localhost' IDENTIFIED BY '<password>';
  GRANT ALL PRIVILEGES ON freescout.* TO 'freescout_app'@'localhost';
  CREATE USER IF NOT EXISTS 'grupotsc_app'@'localhost' IDENTIFIED BY '<password>';
  GRANT ALL PRIVILEGES ON grupotsc.* TO 'grupotsc_app'@'localhost';
  GRANT SELECT ON freescout.users TO 'grupotsc_app'@'localhost';
  FLUSH PRIVILEGES;
"
```

(El `GRANT SELECT ON freescout.users` solo funciona **después** de correr
las migraciones de FreeScout, que son las que crean esa tabla.)

Después: `composer install` en la raíz del proyecto, `php artisan migrate --force`
en `D:\laragon\www\freescout`, y correr contra `grupotsc`, en orden:
[database/migrations/001_usuarios_clientes.sql](../database/migrations/001_usuarios_clientes.sql)
y [database/migrations/002_tickets.sql](../database/migrations/002_tickets.sql).
