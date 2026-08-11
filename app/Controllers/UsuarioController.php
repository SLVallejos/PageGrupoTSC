<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\ClienteUsuarioModel;
use App\Models\UsuarioTablaModel;

/**
 * Gestión de clientes propios (`usuarios_clientes`) desde el panel admin.
 * Los administradores/agentes de soporte se gestionan aparte (ver
 * `AdministradorController`) — acá solo se administra el lado cliente.
 */
final class UsuarioController extends GestionUsuariosController
{
    protected function modelo(): UsuarioTablaModel
    {
        return new ClienteUsuarioModel();
    }

    protected function etiqueta(): string
    {
        return 'cliente';
    }
}
