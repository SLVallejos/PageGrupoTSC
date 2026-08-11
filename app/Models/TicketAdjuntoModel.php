<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Adjuntos de un ticket. El archivo real vive en `storage/adjuntos/`
 * (fuera de `public/`); acá solo se guarda la metadata. Ver
 * `TicketController::subirAdjunto()`/`descargarAdjunto()` para la
 * validación de MIME real y el streaming del archivo.
 */
final class TicketAdjuntoModel extends BaseModel
{
    public function create(
        int $ticketId,
        string $autorTipo,
        string $autorNombre,
        string $nombreOriginal,
        string $nombreAlmacenado,
        string $mimeType,
        int $tamanoBytes
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO ticket_adjuntos
                (ticket_id, autor_tipo, autor_nombre, nombre_original, nombre_almacenado, mime_type, tamano_bytes)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$ticketId, $autorTipo, $autorNombre, $nombreOriginal, $nombreAlmacenado, $mimeType, $tamanoBytes]);

        return (int) $this->db->lastInsertId();
    }

    /** @return array<int, array<string, mixed>> */
    public function listByTicket(int $ticketId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM ticket_adjuntos WHERE ticket_id = ? ORDER BY created_at ASC'
        );
        $stmt->execute([$ticketId]);

        return $stmt->fetchAll();
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM ticket_adjuntos WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }
}
