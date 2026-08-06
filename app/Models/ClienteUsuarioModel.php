<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Clientes propios de Grupo TSC (tabla `usuarios_clientes`), separados de
 * FreeScout — ver docs/freescout-integration-strategy.md.
 */
final class ClienteUsuarioModel extends BaseModel
{
    /** @return array{id:int, nombre:string, email:string, rol:string, passwordHash:string}|null */
    public function findByEmail(string $email): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, nombre, email, password_hash FROM usuarios_clientes WHERE email = ? AND activo = 1 LIMIT 1'
        );
        $stmt->execute([$email]);
        $row = $stmt->fetch();

        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'nombre' => $row['nombre'],
            'email' => $row['email'],
            'rol' => 'CLIENTE',
            'passwordHash' => $row['password_hash'],
        ];
    }

    public function create(string $nombre, string $email, string $passwordHash): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO usuarios_clientes (nombre, email, password_hash) VALUES (?, ?, ?)'
        );
        $stmt->execute([$nombre, $email, $passwordHash]);

        return (int) $this->db->lastInsertId();
    }

    /** @return array{data: array<int, array<string, mixed>>, total: int} */
    public function listAll(int $page, int $pageSize): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, nombre, email, activo FROM usuarios_clientes ORDER BY created_at DESC LIMIT ? OFFSET ?'
        );
        $stmt->bindValue(1, $pageSize, \PDO::PARAM_INT);
        $stmt->bindValue(2, ($page - 1) * $pageSize, \PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll();

        $total = (int) $this->db->query('SELECT COUNT(*) FROM usuarios_clientes')->fetchColumn();

        return ['data' => $data, 'total' => $total];
    }

    public function setActivo(int $id, bool $activo): void
    {
        $stmt = $this->db->prepare('UPDATE usuarios_clientes SET activo = ? WHERE id = ?');
        $stmt->execute([$activo ? 1 : 0, $id]);
    }

    public function updatePassword(int $id, string $passwordHash): void
    {
        $stmt = $this->db->prepare('UPDATE usuarios_clientes SET password_hash = ? WHERE id = ?');
        $stmt->execute([$passwordHash, $id]);
    }
}
