<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Historial de eventos por ticket -- timeline, historial de escalamiento
 * (filas `tipo='ESCALADO'`, con `nivel_anterior`/`nivel_nuevo`/`motivo`) y
 * auditoría de quién hizo qué y cuándo, todo en una sola tabla. Se agrega
 * una fila desde cada acción que muta un ticket en `TicketController`
 * (crear, asignar, liberar, cambiar estado/prioridad, escalar, comentar,
 * resolver) -- nunca se edita ni se borra una fila ya creada.
 */
final class TicketEventoModel extends BaseModel
{
    public function registrar(
        int $ticketId,
        string $tipo,
        string $autorTipo,
        string $autorNombre,
        ?string $detalle = null,
        ?int $nivelAnterior = null,
        ?int $nivelNuevo = null,
        ?string $motivo = null
    ): void {
        $stmt = $this->db->prepare(
            'INSERT INTO ticket_eventos
                (ticket_id, tipo, autor_tipo, autor_nombre, detalle, nivel_anterior, nivel_nuevo, motivo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$ticketId, $tipo, $autorTipo, $autorNombre, $detalle, $nivelAnterior, $nivelNuevo, $motivo]);
    }

    /** @return array<int, array<string, mixed>> */
    public function listByTicket(int $ticketId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM ticket_eventos WHERE ticket_id = ? ORDER BY created_at ASC, id ASC');
        $stmt->execute([$ticketId]);

        return $stmt->fetchAll();
    }

    /** Últimos eventos de TODA la mesa de ayuda (no de un ticket puntual) -- para "Actividad reciente" del dashboard. */
    public function listRecientes(int $limit = 15): array
    {
        $stmt = $this->db->prepare(
            'SELECT te.*, t.titulo AS ticket_titulo
             FROM ticket_eventos te
             JOIN tickets t ON t.id = te.ticket_id
             ORDER BY te.created_at DESC, te.id DESC
             LIMIT ?'
        );
        $stmt->bindValue(1, $limit, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
