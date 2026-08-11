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
            'SELECT id, nombre, apellido, titulo, nivel, foto_url, email, password_hash
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
            'rol' => $this->rol(),
            'passwordHash' => $row['password_hash'],
            'apellido' => $row['apellido'],
            'titulo' => $row['titulo'],
            'nivel' => $row['nivel'] !== null ? (int) $row['nivel'] : null,
            'fotoUrl' => $row['foto_url'] ? "/assets/uploads/avatars/{$row['foto_url']}" : null,
        ];
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
}
