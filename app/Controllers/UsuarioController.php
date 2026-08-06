<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Validator;
use App\Models\ClienteUsuarioModel;
use PDOException;

/**
 * Gestión de clientes propios (`usuarios_clientes`) desde el panel admin.
 * Los ADMIN son usuarios reales de FreeScout y se gestionan desde su
 * propia UI — acá solo se administra el lado cliente. Ver
 * docs/freescout-integration-strategy.md.
 */
final class UsuarioController extends BaseController
{
    private const PAGE_SIZE = 50;

    public function index(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $page = max(1, (int) $request->query('page', 1));

        $resultado = (new ClienteUsuarioModel())->listAll($page, self::PAGE_SIZE);
        $usuarios = array_map(fn (array $u) => $this->formatUsuario($u), $resultado['data']);

        $totalPages = max(1, (int) ceil($resultado['total'] / self::PAGE_SIZE));
        $this->success($usuarios, 200, ['pagination' => ['totalPages' => $totalPages]]);
    }

    public function store(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $data = $request->all();

        $errores = array_filter([
            Validator::required($data, 'nombre'),
            Validator::maxLength($data, 'nombre', 150),
            Validator::required($data, 'email'),
            Validator::email($data, 'email'),
            Validator::required($data, 'password'),
            Validator::minLength($data, 'password', 6),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $model = new ClienteUsuarioModel();
        $hash = password_hash((string) $request->input('password'), PASSWORD_BCRYPT);

        try {
            $id = $model->create((string) $request->input('nombre'), (string) $request->input('email'), $hash);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                $this->fail('Ya existe un cliente con ese email.', 409);
            }
            throw $e;
        }

        $this->success(['id' => $id], 201);
    }

    public function estado(Request $request, array $params): void
    {
        $this->requireAuth(['ADMIN']);
        $data = $request->all();

        if (!is_bool($data['activo'] ?? null)) {
            $this->fail('El campo "activo" debe ser true o false.', 422);
        }

        (new ClienteUsuarioModel())->setActivo((int) $params['id'], (bool) $request->input('activo'));
        $this->success(null);
    }

    public function resetPassword(Request $request, array $params): void
    {
        $this->requireAuth(['ADMIN']);

        $passwordTemporal = bin2hex(random_bytes(6));
        (new ClienteUsuarioModel())->updatePassword((int) $params['id'], password_hash($passwordTemporal, PASSWORD_BCRYPT));

        $this->success(['passwordTemporal' => $passwordTemporal]);
    }

    private function formatUsuario(array $u): array
    {
        return [
            'id' => (int) $u['id'],
            'nombre' => $u['nombre'],
            'email' => $u['email'],
            'activo' => (bool) $u['activo'],
        ];
    }
}
