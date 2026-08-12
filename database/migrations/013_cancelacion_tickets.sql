-- Octavo estado del ciclo de vida: CANCELADO (terminal, igual que
-- CERRADO). El borrado duro (DELETE real, ver TicketController::eliminar())
-- no necesita columnas nuevas -- solo aplica a tickets nunca asignados,
-- que se borran de verdad.
ALTER TABLE tickets
    MODIFY COLUMN estado
        ENUM('ABIERTO','PENDIENTE_ASIGNACION','EN_PROCESO','ESCALADO','EN_ESPERA','RESUELTO','CERRADO','CANCELADO')
        NOT NULL DEFAULT 'ABIERTO',
    ADD COLUMN cancelado_at TIMESTAMP NULL AFTER cerrado_at;

ALTER TABLE ticket_eventos
    MODIFY COLUMN tipo
        ENUM('CREADO','ASIGNADO','LIBERADO','ESTADO','PRIORIDAD','ESCALADO','COMENTARIO','RESUELTO','PAUSADO','REANUDADO','DEVUELTO','CERRADO','CANCELADO')
        NOT NULL;
