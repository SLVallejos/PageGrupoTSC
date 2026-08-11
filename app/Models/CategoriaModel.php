<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Categorías de ticket (Hardware, Software, Redes, etc.). Nunca se borran
 * -- solo se desactivan (`activo=0`) para no dejar tickets viejos con una
 * categoría inexistente; ver `CategoriaController`.
 */
final class CategoriaModel extends BaseModel
{
    /** @return array<int, array<string, mixed>> */
    public function listAll(bool $incluirInactivas): array
    {
        $sql = 'SELECT * FROM categorias' . ($incluirInactivas ? '' : ' WHERE activo = 1') . ' ORDER BY nombre';

        return $this->db->query($sql)->fetchAll();
    }

    public function create(string $nombre): int
    {
        $stmt = $this->db->prepare('INSERT INTO categorias (nombre) VALUES (?)');
        $stmt->execute([$nombre]);

        return (int) $this->db->lastInsertId();
    }

    public function setActivo(int $id, bool $activo): void
    {
        $stmt = $this->db->prepare('UPDATE categorias SET activo = ? WHERE id = ?');
        $stmt->execute([$activo ? 1 : 0, $id]);
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM categorias WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }
}
