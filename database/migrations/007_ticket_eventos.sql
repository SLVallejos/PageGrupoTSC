-- Historial de eventos por ticket: creado, asignado, liberado, cambio de
-- estado, cambio de prioridad, escalado (con motivo y nivel
-- anterior/nuevo), comentado, resuelto. Sirve como timeline del ticket
-- ("Historial del ticket"), historial de escalamiento (filas ESCALADO) y
-- auditoría de quién hizo qué y cuándo -- una sola tabla para las tres
-- cosas, ver database/deploy/schema_produccion.sql para la versión
-- sincronizada de instalación nueva.
CREATE TABLE ticket_eventos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT UNSIGNED NOT NULL,
    tipo ENUM('CREADO','ASIGNADO','LIBERADO','ESTADO','PRIORIDAD','ESCALADO','COMENTARIO','RESUELTO') NOT NULL,
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
