<?php

declare(strict_types=1);

namespace App\Middleware;

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

        return $usuario;
    }
}
