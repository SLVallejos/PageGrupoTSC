<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Validator;
use App\Models\CategoriaModel;
use PDOException;

/**
 * Categorías de ticket. Cualquier usuario autenticado puede listarlas
 * (el cliente las necesita para el selector de "Crear Ticket"); solo el
 * admin puede crearlas o desactivarlas. No hay borrado -- el prompt pide
 * explícitamente no eliminar categorías en uso, así que directamente no
 * existe esa opción.
 */
final class CategoriaController extends BaseController
{
    /** Con `?todas=1` (solo ADMIN) incluye las inactivas -- para el filtro y la gestión. */
    public function index(Request $request): void
    {
        $usuario = $this->requireAuth();
        $incluirInactivas = $usuario['rol'] === 'ADMIN' && (bool) $request->query('todas');

        $categorias = array_map(
            fn (array $c) => $this->formatCategoria($c),
            (new CategoriaModel())->listAll($incluirInactivas)
        );

        $this->success($categorias);
    }

    public function store(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $data = $request->all();

        $errores = array_filter([
            Validator::required($data, 'nombre'),
            Validator::maxLength($data, 'nombre', 100),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        try {
            $id = (new CategoriaModel())->create((string) $request->input('nombre'));
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                $this->fail('Ya existe una categoría con ese nombre.', 409);
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

        (new CategoriaModel())->setActivo((int) $params['id'], (bool) $request->input('activo'));
        $this->success(null);
    }

    private function formatCategoria(array $c): array
    {
        return [
            'id' => (int) $c['id'],
            'nombre' => $c['nombre'],
            'activo' => (bool) $c['activo'],
        ];
    }
}
