<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Core\Request;
use PDOException;

/**
 * Único endpoint funcional del esqueleto: confirma que la conexión PDO a
 * MySQL está bien configurada, antes de construir lógica de negocio real.
 */
final class HealthController extends BaseController
{
    public function index(Request $request): void
    {
        try {
            Database::getConnection()->query('SELECT 1');
        } catch (PDOException $e) {
            $this->fail('Sin conexión a la base de datos: ' . $e->getMessage(), 503);
        }

        $this->success(['status' => 'ok', 'db' => 'connected']);
    }
}
