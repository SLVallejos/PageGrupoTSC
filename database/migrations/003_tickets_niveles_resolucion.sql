-- Nuevo ciclo de vida del ticket: NEW -> EN_PROCESO -> RESUELTO (bloqueado,
-- sin CERRADO). Se amplía el enum para poder remapear los valores viejos
-- sin perder datos, y recién después se lo deja en su forma final. Suma
-- el nivel de escalado (1/2/3) y el campo de solución que se escribe una
-- sola vez al resolver.

ALTER TABLE tickets
    MODIFY estado ENUM('ABIERTO','EN_CURSO','RESUELTO','CERRADO','NEW','EN_PROCESO')
    NOT NULL DEFAULT 'ABIERTO';

UPDATE tickets SET estado = 'NEW' WHERE estado = 'ABIERTO';
UPDATE tickets SET estado = 'EN_PROCESO' WHERE estado = 'EN_CURSO';
UPDATE tickets SET estado = 'RESUELTO' WHERE estado = 'CERRADO';

ALTER TABLE tickets
    MODIFY estado ENUM('NEW','EN_PROCESO','RESUELTO') NOT NULL DEFAULT 'NEW';

ALTER TABLE tickets
    ADD COLUMN nivel TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER prioridad,
    ADD COLUMN solucion TEXT NULL AFTER asignado_a_nombre,
    ADD COLUMN resuelto_at TIMESTAMP NULL AFTER solucion,
    ADD INDEX idx_nivel (nivel);
