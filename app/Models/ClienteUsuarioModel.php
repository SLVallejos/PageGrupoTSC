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
}
