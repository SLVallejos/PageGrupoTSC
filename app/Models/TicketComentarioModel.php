<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Comentarios de un ticket. `autor_nombre` es un snapshot (el autor puede
 * ser un cliente propio o un admin de FreeScout — dos fuentes distintas,
 * sin FK común posible) tomado al momento de comentar.
 */
final class TicketComentarioModel extends BaseModel
{
    public function create(int $ticketId, string $autorTipo, string $autorNombre, string $comentario): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO ticket_comentarios (ticket_id, autor_tipo, autor_nombre, comentario) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$ticketId, $autorTipo, $autorNombre, $comentario]);

        return (int) $this->db->lastInsertId();
    }

    /** @return array<int, array<string, mixed>> */
    public function listByTicket(int $ticketId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM ticket_comentarios WHERE ticket_id = ? ORDER BY created_at ASC'
        );
        $stmt->execute([$ticketId]);

        return $stmt->fetchAll();
    }
}
