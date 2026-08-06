-- Módulo de tickets. `cliente_id` referencia usuarios_clientes (misma base,
-- FK real). `asignado_a_freescout_id`/`asignado_a_nombre` y
-- `ticket_comentarios.autor_nombre` son snapshots (no hay FK real posible:
-- los admins viven en la base `freescout`, no en `grupotsc`).

CREATE TABLE IF NOT EXISTS tickets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT UNSIGNED NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    estado ENUM('ABIERTO','EN_CURSO','RESUELTO','CERRADO') NOT NULL DEFAULT 'ABIERTO',
    prioridad ENUM('BAJA','MEDIA','ALTA','URGENTE') NOT NULL DEFAULT 'MEDIA',
    asignado_a_freescout_id INT UNSIGNED NULL,
    asignado_a_nombre VARCHAR(150) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES usuarios_clientes(id),
    INDEX idx_estado (estado),
    INDEX idx_prioridad (prioridad),
    INDEX idx_asignado (asignado_a_freescout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_comentarios (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT UNSIGNED NOT NULL,
    autor_tipo ENUM('CLIENTE','ADMIN') NOT NULL,
    autor_nombre VARCHAR(150) NOT NULL,
    comentario TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    INDEX idx_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
