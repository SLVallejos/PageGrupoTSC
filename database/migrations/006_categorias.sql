-- Categorías de ticket (Hardware, Software, Redes, etc.). `categoria_id`
-- nullable a propósito: tickets existentes quedan sin categoría ("Sin
-- categoría" en la UI), no rompe nada. No se borran categorías en uso
-- (solo se desactivan desde el panel) -- ON DELETE SET NULL es defensivo
-- por si alguna vez se borra una fila a mano en phpMyAdmin.
CREATE TABLE IF NOT EXISTS categorias (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tickets ADD COLUMN categoria_id INT UNSIGNED NULL AFTER prioridad;
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD INDEX idx_categoria (categoria_id);

INSERT INTO categorias (nombre) VALUES
    ('Hardware'), ('Software'), ('Redes'), ('Impresoras'),
    ('Sistemas'), ('Accesos'), ('SAP'), ('Correo'), ('Otros');
