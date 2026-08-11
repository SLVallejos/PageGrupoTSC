-- Adjuntos de archivos por ticket (cliente o admin). El archivo real se
-- guarda en storage/adjuntos/ (fuera de public/, mismo criterio que
-- storage/sessions/) con nombre_almacenado aleatorio; nombre_original solo
-- se usa para mostrar/descargar. autor_nombre es snapshot, mismo criterio
-- que ticket_comentarios.autor_nombre (ver docs/freescout-integration-strategy.md).

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
