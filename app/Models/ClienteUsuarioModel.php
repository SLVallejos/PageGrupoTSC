<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Clientes propios de Grupo TSC (tabla `usuarios_clientes`).
 */
final class ClienteUsuarioModel extends UsuarioTablaModel
{
    protected function tabla(): string
    {
        return 'usuarios_clientes';
    }

    protected function rol(): string
    {
        return 'CLIENTE';
    }

    /**
     * Override de `listAll()` -- suma `tickets_creados`/
     * `ultima_actividad` vía LEFT JOIN + agregación (sección "Clientes"
     * del panel admin, ver `UsuarioController::camposExtra()`). Seguro
     * overridear acá: `AdministradorLocalModel` ya tiene el suyo
     * propio, nadie más comparte el `listAll()` genérico de
     * `UsuarioTablaModel`.
     * @return array{data: array<int, array<string, mixed>>, total: int}
     */
    public function listAll(int $page, int $pageSize): array
    {
        $stmt = $this->db->prepare(
            "SELECT uc.*, COUNT(t.id) AS tickets_creados, MAX(t.created_at) AS ultima_actividad
             FROM usuarios_clientes uc
             LEFT JOIN tickets t ON t.cliente_id = uc.id
             GROUP BY uc.id
             ORDER BY uc.created_at DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->bindValue(1, $pageSize, \PDO::PARAM_INT);
        $stmt->bindValue(2, ($page - 1) * $pageSize, \PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll();

        $total = (int) $this->db->query('SELECT COUNT(*) FROM usuarios_clientes')->fetchColumn();

        return ['data' => $data, 'total' => $total];
    }

    /** Autoedición de "Mi perfil" -- solo nombre (el cliente no tiene apellido propio, y el email queda de solo lectura en todo el sistema). */
    public function updatePerfil(int $id, string $nombre): void
    {
        $stmt = $this->db->prepare('UPDATE usuarios_clientes SET nombre = ? WHERE id = ?');
        $stmt->execute([$nombre, $id]);
    }
}
