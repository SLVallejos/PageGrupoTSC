-- Ciclo de vida de 7 estados (reemplaza NEW/EN_PROCESO/RESUELTO) +
-- devolución automática al agente original tras un escalamiento.
-- `agente_original_*`/`nivel_original` son un snapshot de quién tomó el
-- ticket la PRIMERA vez (nunca se pisa, ver TicketModel::asignar()) --
-- al resolver, si el agente actual no es el original, el ticket vuelve
-- a él junto con su nivel (ver TicketModel::resolver()).
ALTER TABLE tickets
    MODIFY COLUMN estado
        ENUM('ABIERTO','PENDIENTE_ASIGNACION','EN_PROCESO','ESCALADO','EN_ESPERA','RESUELTO','CERRADO')
        NOT NULL DEFAULT 'ABIERTO',
    ADD COLUMN agente_original_id INT UNSIGNED NULL AFTER asignado_a_titulo,
    ADD COLUMN agente_original_nombre VARCHAR(150) NULL AFTER agente_original_id,
    ADD COLUMN agente_original_foto VARCHAR(255) NULL AFTER agente_original_nombre,
    ADD COLUMN agente_original_titulo VARCHAR(150) NULL AFTER agente_original_foto,
    ADD COLUMN nivel_original TINYINT UNSIGNED NULL AFTER agente_original_titulo,
    ADD COLUMN cerrado_at TIMESTAMP NULL AFTER resuelto_at;

-- Backfill: NEW -> ABIERTO (create() nunca deja un NEW con dueño --
-- asignar() lo pasa a EN_PROCESO en el mismo UPDATE).
UPDATE tickets SET estado = 'ABIERTO' WHERE estado = 'NEW';

-- Para tickets ya asignados, el agente actual pasa a ser también el
-- "original" -- no se puede reconstruir con certeza quién lo tomó
-- primero sin parsear texto libre de ticket_eventos, así que se asume
-- el actual (correcto para el caso común: tickets que nunca fueron
-- escalados).
UPDATE tickets
SET agente_original_id = asignado_a_id,
    agente_original_nombre = asignado_a_nombre,
    agente_original_foto = asignado_a_foto,
    agente_original_titulo = asignado_a_titulo,
    nivel_original = nivel
WHERE asignado_a_id IS NOT NULL;

ALTER TABLE ticket_eventos
    MODIFY COLUMN tipo
        ENUM('CREADO','ASIGNADO','LIBERADO','ESTADO','PRIORIDAD','ESCALADO','COMENTARIO','RESUELTO','PAUSADO','REANUDADO','DEVUELTO','CERRADO')
        NOT NULL;
