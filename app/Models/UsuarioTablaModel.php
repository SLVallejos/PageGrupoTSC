<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Alta/listado/activación/reseteo de contraseña, sobre una tabla propia
 * con el esquema de `usuarios_clientes`/
 * `usuarios_administradores` (id, nombre, email único, password_hash,
 * activo, created_at). `tabla()`/`rol()` nunca vienen de input del
 * usuario — son valores fijos definidos por la subclase, así que
 * interpolarlos en el SQL es seguro.
 */
abstract class UsuarioTablaModel extends BaseModel
{
    abstract protected function tabla(): string;

    abstract protected function rol(): string;

    /** @return array{id:int, nombre:string, email:string, rol:string, passwordHash:string}|null */
    public function findByEmail(string $email): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT id, nombre, email, password_hash FROM {$this->tabla()} WHERE email = ? AND activo = 1 LIMIT 1"
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
            'rol' => $this->rol(),
            'passwordHash' => $row['password_hash'],
        ];
    }

    public function create(string $nombre, string $email, string $passwordHash): int
    {
        $stmt = $this->db->prepare(
            "INSERT INTO {$this->tabla()} (nombre, email, password_hash) VALUES (?, ?, ?)"
        );
        $stmt->execute([$nombre, $email, $passwordHash]);

        return (int) $this->db->lastInsertId();
    }

    /**
     * `SELECT *` (no solo id/nombre/email/activo) para que columnas extra
     * de una subclase (ej. apellido/titulo/nivel/foto_url en
     * `AdministradorLocalModel`) viajen sin tener que overridear esta
     * query -- `GestionUsuariosController::formatUsuario()` arma el array
     * de salida explícitamente, así que un campo de más acá (como
     * `password_hash`) no se filtra a la API.
     * @return array{data: array<int, array<string, mixed>>, total: int}
     */
    public function listAll(int $page, int $pageSize): array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM {$this->tabla()} ORDER BY created_at DESC LIMIT ? OFFSET ?"
        );
        $stmt->bindValue(1, $pageSize, \PDO::PARAM_INT);
        $stmt->bindValue(2, ($page - 1) * $pageSize, \PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll();

        $total = (int) $this->db->query("SELECT COUNT(*) FROM {$this->tabla()}")->fetchColumn();

        return ['data' => $data, 'total' => $total];
    }

    public function setActivo(int $id, bool $activo): void
    {
        $stmt = $this->db->prepare("UPDATE {$this->tabla()} SET activo = ? WHERE id = ?");
        $stmt->execute([$activo ? 1 : 0, $id]);
    }

    /**
     * Revalida contra la DB si la cuenta sigue activa -- a diferencia de
     * `findByEmail()` (que ya filtra `activo = 1` pero solo corre en el
     * login), esto lo usa `AuthMiddleware` en cada request para que dar
     * de baja a alguien con una sesión ya abierta la corte de inmediato,
     * no recién en el próximo login.
     */
    public function isActivo(int $id): bool
    {
        $stmt = $this->db->prepare("SELECT activo FROM {$this->tabla()} WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $valor = $stmt->fetchColumn();

        return $valor !== false && (bool) $valor;
    }

    public function updatePassword(int $id, string $passwordHash): void
    {
        $stmt = $this->db->prepare("UPDATE {$this->tabla()} SET password_hash = ? WHERE id = ?");
        $stmt->execute([$passwordHash, $id]);
    }
}
