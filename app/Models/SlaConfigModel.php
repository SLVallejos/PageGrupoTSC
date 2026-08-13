<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Plazos de SLA por prioridad, editables desde el panel (Configuración).
 * Siempre exactamente 4 filas (una por prioridad) -- ver migración
 * 014_sla_config.sql. `horasPorPrioridad()` es el shape que consume
 * `Sla::calcular()`.
 */
final class SlaConfigModel extends BaseModel
{
    /** @return array<int, array<string, mixed>> */
    public function listAll(): array
    {
        return $this->db->query('SELECT prioridad, horas FROM sla_config')->fetchAll();
    }

    public function actualizar(string $prioridad, int $horas): void
    {
        $stmt = $this->db->prepare('UPDATE sla_config SET horas = ? WHERE prioridad = ?');
        $stmt->execute([$horas, $prioridad]);
    }

    /** @return array<string, int> */
    public function horasPorPrioridad(): array
    {
        $horas = [];
        foreach ($this->listAll() as $fila) {
            $horas[$fila['prioridad']] = (int) $fila['horas'];
        }

        return $horas;
    }
}
