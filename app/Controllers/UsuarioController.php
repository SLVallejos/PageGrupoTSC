<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Validator;
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

    /**
     * "Mi perfil" del cliente -- solo nombre (no tiene apellido propio;
     * el email queda de solo lectura en todo el sistema, igual que
     * título/nivel para un técnico). Nunca toma el id de la URL/body --
     * siempre es la propia sesión, mismo criterio anti-IDOR que
     * `AdministradorController::actualizarPerfil()`.
     */
    public function actualizarPerfil(Request $request): void
    {
        $usuario = $this->requireAuth(['CLIENTE']);
        $data = $request->all();

        $errores = array_filter([
            Validator::required($data, 'nombre'),
            Validator::maxLength($data, 'nombre', 150),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $nombre = (string) $request->input('nombre');
        (new ClienteUsuarioModel())->updatePerfil((int) $usuario['id'], $nombre);

        // Refresca la sesión -- si no, el "Hola, {nombre}" del header
        // quedaría con el nombre viejo hasta el próximo login.
        $_SESSION['usuario']['nombre'] = $nombre;

        $this->success(['nombre' => $nombre]);
    }

    /**
     * Señales de actividad para el listado de "Clientes" -- vienen ya
     * calculadas en la fila por `ClienteUsuarioModel::listAll()` (LEFT
     * JOIN + agregación, no hay N+1 acá).
     */
    protected function camposExtra(array $u): array
    {
        return [
            'fechaAlta' => $u['created_at'],
            'ticketsCreados' => (int) ($u['tickets_creados'] ?? 0),
            'ultimaActividad' => $u['ultima_actividad'] ?? null,
        ];
    }
}
