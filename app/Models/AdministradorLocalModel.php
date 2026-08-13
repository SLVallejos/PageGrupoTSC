<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Administradores propios de Grupo TSC (tabla `usuarios_administradores`),
 * creados desde nuestro panel.
 *
 * Reshapeados en "Agentes de Soporte" (Nivel 1/2/3, con apellido/título/
 * foto) -- el único admin de arranque queda con esos campos en NULL, sigue
 * siendo un super-admin sin nivel asignado.
 */
final class AdministradorLocalModel extends UsuarioTablaModel
{
    protected function tabla(): string
    {
        return 'usuarios_administradores';
    }

    /**
     * Requerido por el contrato abstracto de `UsuarioTablaModel::findByEmail()`
     * -- esta clase overridea `findByEmail()` por completo y usa la
     * columna `rol` real de la fila (ADMIN o AGENTE), así que este valor
     * fijo no se usa en la práctica.
     */
    protected function rol(): string
    {
        return 'ADMIN';
    }

    /**
     * Override de `findByEmail()` -- acá sí conviene traer también el
     * perfil del agente (apellido/titulo/nivel/foto_url), para que
     * `AuthController::login()` los guarde en la sesión y
     * `TicketController::asignar()` pueda snapshotearlos en el ticket sin
     * una consulta aparte. Seguro overridear la forma del array porque
     * `AuthController` instancia esta clase de forma concreta, no a
     * través del tipo `UsuarioTablaModel`.
     * @return array{id:int, nombre:string, email:string, rol:string, passwordHash:string, apellido:?string, titulo:?string, nivel:?int, fotoUrl:?string}|null
     */
    public function findByEmail(string $email): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, nombre, apellido, titulo, nivel, rol, foto_url, email, password_hash
             FROM usuarios_administradores WHERE email = ? AND activo = 1 LIMIT 1'
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
            // Rol real de la fila (ADMIN o AGENTE), no `$this->rol()` --
            // ese método queda solo para satisfacer el contrato abstracto
            // de UsuarioTablaModel, sin uso real acá (ver comentario en
            // `rol()` más abajo).
            'rol' => $row['rol'],
            'passwordHash' => $row['password_hash'],
            'apellido' => $row['apellido'],
            'titulo' => $row['titulo'],
            'nivel' => $row['nivel'] !== null ? (int) $row['nivel'] : null,
            'fotoUrl' => $row['foto_url'] ? "/assets/uploads/avatars/{$row['foto_url']}" : null,
        ];
    }

    /**
     * Override de `listAll()` -- a diferencia del genérico de
     * `UsuarioTablaModel` (que trae toda la tabla), acá se filtra
     * `rol = 'AGENTE'` para que el roster de "Técnicos" no incluya la
     * fila del/los ADMIN (no hay pantalla de gestión de administradores,
     * esos se administran por SQL). Suma además `tickets_activos`/
     * `tickets_resueltos`/`ultima_actividad` vía LEFT JOIN + agregación
     * sobre `tickets` (ver `AdministradorController::camposExtra()`) --
     * `GREATEST` con `COALESCE` primero porque en MySQL `GREATEST` con
     * un solo argumento NULL devuelve NULL, no ignora el nulo.
     * @return array{data: array<int, array<string, mixed>>, total: int}
     */
    public function listAll(int $page, int $pageSize): array
    {
        $stmt = $this->db->prepare(
            "SELECT a.*,
                SUM(CASE WHEN t.id IS NOT NULL AND t.estado NOT IN ('RESUELTO','CERRADO','CANCELADO') THEN 1 ELSE 0 END) AS tickets_activos,
                SUM(CASE WHEN t.estado IN ('RESUELTO','CERRADO') THEN 1 ELSE 0 END) AS tickets_resueltos,
                MAX(GREATEST(t.created_at, COALESCE(t.resuelto_at, t.created_at), COALESCE(t.cerrado_at, t.created_at))) AS ultima_actividad
             FROM usuarios_administradores a
             LEFT JOIN tickets t ON t.asignado_a_id = a.id
             WHERE a.rol = 'AGENTE'
             GROUP BY a.id
             ORDER BY a.created_at DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->bindValue(1, $pageSize, \PDO::PARAM_INT);
        $stmt->bindValue(2, ($page - 1) * $pageSize, \PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll();

        $total = (int) $this->db->query("SELECT COUNT(*) FROM usuarios_administradores WHERE rol = 'AGENTE'")->fetchColumn();

        return ['data' => $data, 'total' => $total];
    }

    public function createAgente(string $nombre, string $apellido, string $titulo, int $nivel, string $email, string $passwordHash): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO usuarios_administradores (nombre, apellido, titulo, nivel, email, password_hash)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$nombre, $apellido, $titulo, $nivel, $email, $passwordHash]);

        return (int) $this->db->lastInsertId();
    }

    /** @return string|null Nombre de archivo (no la URL completa) de la foto anterior, para poder borrarla. */
    public function fotoActual(int $id): ?string
    {
        $stmt = $this->db->prepare('SELECT foto_url FROM usuarios_administradores WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);

        return $stmt->fetchColumn() ?: null;
    }

    public function updateFoto(int $id, string $fotoUrl): void
    {
        $stmt = $this->db->prepare('UPDATE usuarios_administradores SET foto_url = ? WHERE id = ?');
        $stmt->execute([$fotoUrl, $id]);
    }

    /** Autoedición de "Mi perfil" -- solo nombre/apellido (título/nivel/email los sigue manejando el admin desde el roster). */
    public function updatePerfil(int $id, string $nombre, string $apellido): void
    {
        $stmt = $this->db->prepare('UPDATE usuarios_administradores SET nombre = ?, apellido = ? WHERE id = ?');
        $stmt->execute([$nombre, $apellido, $id]);
    }
}
