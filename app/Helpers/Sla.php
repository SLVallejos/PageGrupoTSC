<?php

declare(strict_types=1);

namespace App\Helpers;

use DateTimeImmutable;

/**
 * Cálculo de SLA (tiempo de respuesta esperado según prioridad). Los
 * plazos son editables desde el panel (Configuración -> SLA, ver
 * `SlaConfigModel`); la constante de acá abajo queda solo como default
 * si no se pasa `$horasPorPrioridad` (o si la tabla estuviera vacía).
 * Cálculo puro (sin DB): recibe los datos que
 * `TicketController::formatTicket()` ya tiene a mano.
 */
final class Sla
{
    /** Horas de plazo objetivo por prioridad (default/fallback). */
    private const HORAS_POR_PRIORIDAD = [
        'URGENTE' => 4,
        'ALTA' => 8,
        'MEDIA' => 24,
        'BAJA' => 72,
    ];

    /**
     * @param array<string, int> $horasPorPrioridad
     * @return array{vencimiento: string, estado: 'OK'|'PROXIMO'|'VENCIDO'|'CUMPLIDO'|'FUERA_PLAZO'}
     */
    public static function calcular(
        string $prioridad,
        string $creadoEn,
        ?string $resueltoEn,
        array $horasPorPrioridad = self::HORAS_POR_PRIORIDAD
    ): array {
        $horas = $horasPorPrioridad[$prioridad] ?? 24;
        $creado = new DateTimeImmutable($creadoEn);
        $vencimiento = $creado->modify("+{$horas} hours");

        if ($resueltoEn !== null) {
            $resuelto = new DateTimeImmutable($resueltoEn);
            $estado = $resuelto <= $vencimiento ? 'CUMPLIDO' : 'FUERA_PLAZO';
        } else {
            $estado = self::estadoVigente($creado, $vencimiento);
        }

        return [
            'vencimiento' => $vencimiento->format('Y-m-d H:i:s'),
            'estado' => $estado,
        ];
    }

    /** Un ticket todavía sin resolver: OK, próximo a vencer (últimos 20% del plazo) o vencido. */
    private static function estadoVigente(DateTimeImmutable $creado, DateTimeImmutable $vencimiento): string
    {
        $ahora = new DateTimeImmutable();
        $totalSegundos = $vencimiento->getTimestamp() - $creado->getTimestamp();
        $restantes = $vencimiento->getTimestamp() - $ahora->getTimestamp();

        if ($restantes <= 0) {
            return 'VENCIDO';
        }
        if ($totalSegundos > 0 && $restantes <= $totalSegundos * 0.2) {
            return 'PROXIMO';
        }

        return 'OK';
    }
}
