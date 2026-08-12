<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Models\AdministradorLocalModel;
use App\Models\ClienteUsuarioModel;

/**
 * Guarda de sesión: exige sesión PHP activa y, si se pasan roles
 * permitidos, que el usuario tenga uno de esos roles. Se invoca directo
 * desde los controllers protegidos (el Router actual no encadena
 * middleware todavía).
 */
final class AuthMiddleware
{
    /**
     * @param array<int, string> $rolesPermitidos
     * @return array{id:int, nombre:string, email:string, rol:string}|null
     */
    public function handle(array $rolesPermitidos = []): ?array
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }

        $usuario = $_SESSION['usuario'] ?? null;
        if (!is_array($usuario)) {
            return null;
        }

        if ($rolesPermitidos && !in_array($usuario['rol'], $rolesPermitidos, true)) {
            return null;
        }

        // Dar de baja a alguien con una sesión ya abierta tiene que
        // cortarla ahí mismo, no recién en su próximo login -- si no,
        // seguiría pudiendo crear/gestionar tickets con una cuenta ya
        // desactivada mientras no cierre sesión.
        if (!$this->sigueActivo($usuario)) {
            $_SESSION = [];
            session_destroy();

            return null;
        }

        return $usuario;
    }

    /** @param array{id:int, rol:string} $usuario */
    private function sigueActivo(array $usuario): bool
    {
        $modelo = $usuario['rol'] === 'CLIENTE' ? new ClienteUsuarioModel() : new AdministradorLocalModel();

        return $modelo->isActivo((int) $usuario['id']);
    }
}
