<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Middleware\AuthMiddleware;

abstract class BaseController
{
    /** @param array<string, mixed> $extra Campos adicionales a nivel raíz (ej. "pagination"). */
    protected function success(mixed $data = null, int $status = 200, array $extra = []): never
    {
        Response::json(['success' => true, 'data' => $data, ...$extra], $status);
    }

    protected function fail(string $message, int $status = 400): never
    {
        Response::error($message, $status);
    }

    /**
     * Exige sesión activa y, si se pasan roles, que el usuario tenga uno
     * de esos roles. Devuelve 401 si no hay sesión.
     * @param array<int, string> $rolesPermitidos
     */
    protected function requireAuth(array $rolesPermitidos = []): array
    {
        $usuario = (new AuthMiddleware())->handle($rolesPermitidos);
        if (!$usuario) {
            $this->fail('No autorizado.', 401);
        }

        return $usuario;
    }
}
