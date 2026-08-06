<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Tickets de soporte. `cliente_id` tiene FK real a `usuarios_clientes`
 * (misma base `grupotsc`); `asignado_a_freescout_id`/`asignado_a_nombre`
 * son un snapshot del admin de FreeScout que lo tomó (no hay FK real
 * posible, esa tabla vive en la base `freescout`).
 */
final class TicketModel extends BaseModel
{
    public function create(int $clienteId, string $titulo, string $descripcion, string $prioridad): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO tickets (cliente_id, titulo, descripcion, prioridad) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$clienteId, $titulo, $descripcion, $prioridad]);

        return (int) $this->db->lastInsertId();
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /** @return array{data: array<int, array<string, mixed>>, total: int} */
    public function listForCliente(int $clienteId, int $page, int $pageSize): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM tickets WHERE cliente_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        );
        $stmt->bindValue(1, $clienteId, \PDO::PARAM_INT);
        $stmt->bindValue(2, $pageSize, \PDO::PARAM_INT);
        $stmt->bindValue(3, ($page - 1) * $pageSize, \PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll();

        $count = $this->db->prepare('SELECT COUNT(*) FROM tickets WHERE cliente_id = ?');
        $count->execute([$clienteId]);

        return ['data' => $data, 'total' => (int) $count->fetchColumn()];
    }

    /**
     * @param array{estado?: string, prioridad?: string, asignadoAId?: int} $filtros
     * @return array{data: array<int, array<string, mixed>>, total: int}
     */
    public function listForAdmin(array $filtros, int $page, int $pageSize): array
    {
        [$where, $params] = $this->buildAdminFiltros($filtros);
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $stmt = $this->db->prepare(
            "SELECT t.*, uc.nombre AS cliente_nombre, uc.email AS cliente_email
             FROM tickets t
             JOIN usuarios_clientes uc ON uc.id = t.cliente_id
             {$whereSql}
             ORDER BY t.created_at DESC
             LIMIT ? OFFSET ?"
        );
        $i = 1;
        foreach ($params as $param) {
            $stmt->bindValue($i++, $param);
        }
        $stmt->bindValue($i++, $pageSize, \PDO::PARAM_INT);
        $stmt->bindValue($i, ($page - 1) * $pageSize, \PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll();

        $count = $this->db->prepare("SELECT COUNT(*) FROM tickets t {$whereSql}");
        $count->execute($params);

        return ['data' => $data, 'total' => (int) $count->fetchColumn()];
    }

    public function updateEstado(int $id, string $estado): void
    {
        $stmt = $this->db->prepare('UPDATE tickets SET estado = ? WHERE id = ?');
        $stmt->execute([$estado, $id]);
    }

    public function updatePrioridad(int $id, string $prioridad): void
    {
        $stmt = $this->db->prepare('UPDATE tickets SET prioridad = ? WHERE id = ?');
        $stmt->execute([$prioridad, $id]);
    }

    public function asignar(int $id, int $freescoutId, string $nombre): void
    {
        $stmt = $this->db->prepare(
            'UPDATE tickets SET asignado_a_freescout_id = ?, asignado_a_nombre = ? WHERE id = ?'
        );
        $stmt->execute([$freescoutId, $nombre, $id]);
    }

    public function liberar(int $id): void
    {
        $stmt = $this->db->prepare(
            'UPDATE tickets SET asignado_a_freescout_id = NULL, asignado_a_nombre = NULL WHERE id = ?'
        );
        $stmt->execute([$id]);
    }

    /**
     * @param array{estado?: string, prioridad?: string, asignadoAId?: int} $filtros
     * @return array{0: array<int, string>, 1: array<int, mixed>}
     */
    private function buildAdminFiltros(array $filtros): array
    {
        $where = [];
        $params = [];

        if (!empty($filtros['estado'])) {
            $where[] = 't.estado = ?';
            $params[] = $filtros['estado'];
        }
        if (!empty($filtros['prioridad'])) {
            $where[] = 't.prioridad = ?';
            $params[] = $filtros['prioridad'];
        }
        if (!empty($filtros['asignadoAId'])) {
            $where[] = 't.asignado_a_freescout_id = ?';
            $params[] = $filtros['asignadoAId'];
        }

        return [$where, $params];
    }
}
