-- Administradores propios (no vienen de FreeScout, se gestionan desde
-- nuestro panel). Mismo esquema que usuarios_clientes.
CREATE TABLE IF NOT EXISTS usuarios_administradores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `usuarios_administradores.id` reinicia en 1, igual que `freescout.users.id`
-- -- ambas tablas pueden tener un id=1 al mismo tiempo. Sin un discriminador
-- de origen, un ticket "asignado a id=1" sería ambiguo (¿el admin real de
-- FreeScout o el admin local?). Se renombra la columna para reflejar que ya
-- no es necesariamente un id de FreeScout, y se agrega el discriminador.
ALTER TABLE tickets
    CHANGE COLUMN asignado_a_freescout_id asignado_a_id INT UNSIGNED NULL,
    ADD COLUMN asignado_a_tipo ENUM('FREESCOUT','LOCAL') NULL AFTER asignado_a_id;

-- Todo lo ya asignado hasta ahora vino de FreeScout (única fuente de admins
-- que existía antes de esta migración).
UPDATE tickets SET asignado_a_tipo = 'FREESCOUT' WHERE asignado_a_id IS NOT NULL;
