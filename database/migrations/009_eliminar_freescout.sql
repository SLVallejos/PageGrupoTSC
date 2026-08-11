-- Eliminación completa de FreeScout: ya no hay dos fuentes posibles de
-- administradores (FreeScout + local), así que el discriminador
-- asignado_a_tipo -- que solo existía para desambiguar esa colisión de
-- ids -- deja de tener sentido. `asignado_a_id` ahora referencia siempre
-- a usuarios_administradores.id sin ambigüedad.
ALTER TABLE tickets
    DROP COLUMN asignado_a_tipo;
