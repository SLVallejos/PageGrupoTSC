<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Validator;
use App\Models\UsuarioTablaModel;
use PDOException;

/**
 * Alta/listado/activación/reseteo de contraseña sobre una tabla propia —
 * usado tanto para clientes (`UsuarioController`) como para
 * administradores/agentes de soporte (`AdministradorController`). Ver
 * `App\Models\UsuarioTablaModel`.
 */
abstract class GestionUsuariosController extends BaseController
{
    private const PAGE_SIZE = 50;

    abstract protected function modelo(): UsuarioTablaModel;

    /** Para mensajes de error ("cliente" / "administrador"). */
    abstract protected function etiqueta(): string;

    public function index(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $page = max(1, (int) $request->query('page', 1));

        $resultado = $this->modelo()->listAll($page, self::PAGE_SIZE);
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
            Validator::password($data, 'password'),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $hash = password_hash((string) $request->input('password'), PASSWORD_BCRYPT);

        try {
            $id = $this->modelo()->create((string) $request->input('nombre'), (string) $request->input('email'), $hash);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                $this->fail("Ya existe un {$this->etiqueta()} con ese email.", 409);
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

        $this->modelo()->setActivo((int) $params['id'], (bool) $request->input('activo'));
        $this->success(null);
    }

    /**
     * Siempre manual -- no existe generación aleatoria de contraseñas en
     * ningún lado del panel. El admin escribe la contraseña nueva a
     * mano, con la misma política que al crear una cuenta.
     */
    public function resetPassword(Request $request, array $params): void
    {
        $this->requireAuth(['ADMIN']);
        $data = $request->all();

        $errores = array_filter([
            Validator::required($data, 'password'),
            Validator::password($data, 'password'),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $this->modelo()->updatePassword((int) $params['id'], password_hash((string) $request->input('password'), PASSWORD_BCRYPT));
        $this->success(null);
    }

    private function formatUsuario(array $u): array
    {
        return array_merge([
            'id' => (int) $u['id'],
            'nombre' => $u['nombre'],
            'email' => $u['email'],
            'activo' => (bool) $u['activo'],
        ], $this->camposExtra($u));
    }

    /**
     * Hook para que una subclase agregue campos propios al listado (ej.
     * `AdministradorController` agrega apellido/titulo/nivel/fotoUrl) sin
     * que `UsuarioController` -- que no los necesita -- tenga que saber
     * nada de esto.
     * @param array<string, mixed> $u
     * @return array<string, mixed>
     */
    protected function camposExtra(array $u): array
    {
        return [];
    }
}
