-- Esquema completo para una base NUEVA en producción (beta.grupotsc-ar.com).
-- No es una migración incremental como las de database/migrations/ (esas
-- existen para evolucionar una base local que ya tenía datos) -- esto crea
-- las tablas directo en su forma final. Pegar entero en la pestaña SQL de
-- phpMyAdmin, sobre la base que hayas creado en el panel de hosting.

CREATE TABLE IF NOT EXISTS usuarios_clientes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Agentes de Soporte" (Nivel 1/2/3, rol AGENTE) además del único
-- super-admin de arranque (rol ADMIN, sin apellido/titulo/nivel/foto_url
-- -- quedan NULL para él). El nivel de un agente es una restricción real:
-- el backend solo le deja ver/gestionar tickets de su propio nivel
-- (columna `tickets.nivel`, independiente de este `nivel`).
CREATE TABLE IF NOT EXISTS usuarios_administradores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    apellido VARCHAR(150) NULL,
    titulo VARCHAR(150) NULL,
    nivel TINYINT UNSIGNED NULL,
    rol ENUM('ADMIN','AGENTE') NOT NULL DEFAULT 'AGENTE',
    foto_url VARCHAR(255) NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Categorías de ticket. No se borran en uso (solo se desactivan desde el
-- panel) -- ON DELETE SET NULL en tickets.categoria_id es defensivo nomás.
CREATE TABLE IF NOT EXISTS categorias (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tickets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT UNSIGNED NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    estado ENUM('ABIERTO','PENDIENTE_ASIGNACION','EN_PROCESO','ESCALADO','EN_ESPERA','RESUELTO','CERRADO','CANCELADO') NOT NULL DEFAULT 'ABIERTO',
    prioridad ENUM('BAJA','MEDIA','ALTA','URGENTE') NOT NULL DEFAULT 'MEDIA',
    categoria_id INT UNSIGNED NULL,
    nivel TINYINT UNSIGNED NOT NULL DEFAULT 1,
    asignado_a_id INT UNSIGNED NULL,
    asignado_a_nombre VARCHAR(150) NULL,
    asignado_a_foto VARCHAR(255) NULL,
    asignado_a_titulo VARCHAR(150) NULL,
    agente_original_id INT UNSIGNED NULL,
    agente_original_nombre VARCHAR(150) NULL,
    agente_original_foto VARCHAR(255) NULL,
    agente_original_titulo VARCHAR(150) NULL,
    nivel_original TINYINT UNSIGNED NULL,
    solucion TEXT NULL,
    resuelto_at TIMESTAMP NULL,
    cerrado_at TIMESTAMP NULL,
    cancelado_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES usuarios_clientes(id),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
    INDEX idx_estado (estado),
    INDEX idx_prioridad (prioridad),
    INDEX idx_asignado (asignado_a_id),
    INDEX idx_nivel (nivel),
    INDEX idx_categoria (categoria_id)
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

CREATE TABLE IF NOT EXISTS ticket_adjuntos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT UNSIGNED NOT NULL,
    autor_tipo ENUM('CLIENTE','ADMIN') NOT NULL,
    autor_nombre VARCHAR(150) NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    nombre_almacenado VARCHAR(255) NOT NULL UNIQUE,
    mime_type VARCHAR(100) NOT NULL,
    tamano_bytes INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    INDEX idx_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de eventos por ticket -- timeline, historial de escalamiento
-- (filas ESCALADO) y auditoría, las tres cosas en una sola tabla.
CREATE TABLE IF NOT EXISTS ticket_eventos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT UNSIGNED NOT NULL,
    tipo ENUM('CREADO','ASIGNADO','LIBERADO','ESTADO','PRIORIDAD','ESCALADO','COMENTARIO','RESUELTO','PAUSADO','REANUDADO','DEVUELTO','CERRADO','CANCELADO') NOT NULL,
    autor_tipo ENUM('CLIENTE','ADMIN') NOT NULL,
    autor_nombre VARCHAR(150) NOT NULL,
    detalle TEXT NULL,
    nivel_anterior TINYINT UNSIGNED NULL,
    nivel_nuevo TINYINT UNSIGNED NULL,
    motivo TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    INDEX idx_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Plazos de SLA por prioridad, editables desde el panel (Configuración).
CREATE TABLE IF NOT EXISTS sla_config (
    prioridad ENUM('BAJA','MEDIA','ALTA','URGENTE') NOT NULL PRIMARY KEY,
    horas INT UNSIGNED NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Administrador local de arranque -- entrá con esto y cambiá la
-- contraseña desde "Resetear contraseña" en el panel apenas puedas
-- loguearte. Password en texto plano (una sola vez, no se repite en
-- ningún otro lado): ad89052b1d4d8ece14
INSERT INTO usuarios_administradores (nombre, email, password_hash, rol) VALUES (
    'Admin Beta',
    'admin@beta.grupotsc-ar.com',
    '$2y$10$RkRZFHeBz8evIIjm0EHYP.Z47nZNuhDZGZyNab23ynkhEiMPhmEwe',
    'ADMIN'
);

INSERT INTO categorias (nombre) VALUES
    ('Impresoras'), ('Wi-Fi'), ('Cámaras'), ('Computadoras'),
    ('Alarma'), ('Control de Acceso'), ('Otros');

INSERT INTO sla_config (prioridad, horas) VALUES
    ('URGENTE', 4), ('ALTA', 8), ('MEDIA', 24), ('BAJA', 72);
