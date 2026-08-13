<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Models\SlaConfigModel;

/**
 * Plazos de SLA por prioridad (Configuración -> SLA). ADMIN-only en los
 * dos sentidos: el cálculo en sí (`Sla::calcular()`) es server-side vía
 * `TicketController`, así que AGENTE/CLIENTE no necesitan pegarle a
 * este endpoint para nada.
 */
final class SlaConfigController extends BaseController
{
    private const PRIORIDADES_VALIDAS = ['URGENTE', 'ALTA', 'MEDIA', 'BAJA'];

    public function index(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $this->success((new SlaConfigModel())->listAll());
    }

    public function actualizar(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $data = $request->all();

        foreach (self::PRIORIDADES_VALIDAS as $prioridad) {
            $horas = $data[$prioridad] ?? null;
            if (!is_int($horas) || $horas < 1 || $horas > 720) {
                $this->fail("El campo \"{$prioridad}\" debe ser un número entero de horas entre 1 y 720.", 422);
            }
        }

        $modelo = new SlaConfigModel();
        foreach (self::PRIORIDADES_VALIDAS as $prioridad) {
            $modelo->actualizar($prioridad, (int) $data[$prioridad]);
        }

        $this->success(null);
    }
}
