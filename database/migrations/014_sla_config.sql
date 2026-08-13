-- Plazos de SLA por prioridad, editables desde el panel (Configuración).
-- Antes vivían hardcodeados en app/Helpers/Sla.php; esa clase sigue
-- siendo el único lugar que hace el cálculo, ahora recibe estos valores
-- como parámetro en vez de tener su propia constante fija. `prioridad`
-- como PK natural: siempre son exactamente estas 4 filas, no hace falta
-- un id propio.
CREATE TABLE IF NOT EXISTS sla_config (
    prioridad ENUM('BAJA','MEDIA','ALTA','URGENTE') NOT NULL PRIMARY KEY,
    horas INT UNSIGNED NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO sla_config (prioridad, horas) VALUES
    ('URGENTE', 4), ('ALTA', 8), ('MEDIA', 24), ('BAJA', 72);
