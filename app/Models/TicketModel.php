<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Tickets de soporte. `cliente_id` tiene FK real a `usuarios_clientes`
 * (misma base `grupotsc`); `asignado_a_id`/`asignado_a_nombre` son un
 * snapshot del agente que lo tomó al momento de asignarse (no un JOIN en
 * vivo), igual que `asignado_a_foto`/`asignado_a_titulo`.
 */
final class TicketModel extends BaseModel
{
    public function create(int $clienteId, string $titulo, string $descripcion, string $prioridad, int $categoriaId): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO tickets (cliente_id, titulo, descripcion, prioridad, categoria_id) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$clienteId, $titulo, $descripcion, $prioridad, $categoriaId]);

        return (int) $this->db->lastInsertId();
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /** @return array{data: array<int, array<string, mixed>>, total: int} */
    public function listForCliente(int $clienteId, int $page, int $pageSize): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*, cat.nombre AS categoria_nombre
             FROM tickets t
             LEFT JOIN categorias cat ON cat.id = t.categoria_id
             WHERE t.cliente_id = ?
             ORDER BY t.created_at DESC LIMIT ? OFFSET ?'
        );
        $stmt->bindValue(1, $clienteId, \PDO::PARAM_INT);
        $stmt->bindValue(2, $pageSize, \PDO::PARAM_INT);
        $stmt->bindValue(3, ($page - 1) * $pageSize, \PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll();

        $count = $this->db->prepare('SELECT COUNT(*) FROM tickets WHERE cliente_id = ?');
        $count->execute([$clienteId]);

        return ['data' => $data, 'total' => (int) $count->fetchColumn()];
    }

    /**
     * @param array{estado?: string, prioridad?: string, asignadoAId?: int, nivel?: int} $filtros
     * @return array{data: array<int, array<string, mixed>>, total: int}
     */
    public function listForAdmin(array $filtros, int $page, int $pageSize): array
    {
        [$where, $params] = $this->buildAdminFiltros($filtros);
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $stmt = $this->db->prepare(
            "SELECT t.*, uc.nombre AS cliente_nombre, uc.email AS cliente_email, cat.nombre AS categoria_nombre
             FROM tickets t
             JOIN usuarios_clientes uc ON uc.id = t.cliente_id
             LEFT JOIN categorias cat ON cat.id = t.categoria_id
             {$whereSql}
             ORDER BY t.created_at DESC
             LIMIT ? OFFSET ?"
        );
        $i = 1;
        foreach ($params as $param) {
            $stmt->bindValue($i++, $param);
        }
        $stmt->bindValue($i++, $pageSize, \PDO::PARAM_INT);
        $stmt->bindValue($i, ($page - 1) * $pageSize, \PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll();

        $count = $this->db->prepare("SELECT COUNT(*) FROM tickets t {$whereSql}");
        $count->execute($params);

        return ['data' => $data, 'total' => (int) $count->fetchColumn()];
    }

    public function updatePrioridad(int $id, string $prioridad): void
    {
        $stmt = $this->db->prepare('UPDATE tickets SET prioridad = ? WHERE id = ?');
        $stmt->execute([$prioridad, $id]);
    }

    /**
     * Asignar un ticket a un agente. Pasa a EN_PROCESO si estaba
     * ABIERTO/PENDIENTE_ASIGNACION/ESCALADO (si ya estaba en curso, no
     * lo toca). `$foto`/`$titulo` son un snapshot del perfil del agente
     * al momento de tomar el ticket (igual que `$nombre`) -- no es un
     * JOIN en vivo. El `COALESCE` sobre `agente_original_*`/
     * `nivel_original` los setea solo la *primera* vez que se asigna
     * (si ya tenían valor, no se pisan) -- es el snapshot que
     * `resolver()` usa para la devolución tras un escalamiento.
     */
    public function asignar(int $id, int $adminId, string $nombre, ?string $foto = null, ?string $titulo = null): void
    {
        $stmt = $this->db->prepare(
            "UPDATE tickets
             SET asignado_a_id = ?, asignado_a_nombre = ?, asignado_a_foto = ?, asignado_a_titulo = ?,
                 agente_original_id = COALESCE(agente_original_id, ?),
                 agente_original_nombre = COALESCE(agente_original_nombre, ?),
                 agente_original_foto = COALESCE(agente_original_foto, ?),
                 agente_original_titulo = COALESCE(agente_original_titulo, ?),
                 nivel_original = COALESCE(nivel_original, nivel),
                 estado = IF(estado IN ('ABIERTO', 'PENDIENTE_ASIGNACION', 'ESCALADO'), 'EN_PROCESO', estado)
             WHERE id = ?"
        );
        $stmt->execute([$adminId, $nombre, $foto, $titulo, $adminId, $nombre, $foto, $titulo, $id]);
    }

    /** Vuelve a PENDIENTE_ASIGNACION -- ya tuvo actividad, no es lo mismo que recién creado (ABIERTO). */
    public function liberar(int $id): void
    {
        $stmt = $this->db->prepare(
            "UPDATE tickets
             SET asignado_a_id = NULL, asignado_a_nombre = NULL, asignado_a_foto = NULL, asignado_a_titulo = NULL,
                 estado = 'PENDIENTE_ASIGNACION'
             WHERE id = ?"
        );
        $stmt->execute([$id]);
    }

    /**
     * Sube de nivel y deja el ticket sin dueño (ESCALADO) -- el agente
     * que lo escaló ya no podrá verlo por la restricción de nivel, así
     * que no tiene sentido que siga figurando como asignado a él; queda
     * pendiente para que alguien del nivel nuevo lo tome.
     */
    public function escalar(int $id): void
    {
        $stmt = $this->db->prepare(
            "UPDATE tickets
             SET nivel = LEAST(nivel + 1, 3), estado = 'ESCALADO',
                 asignado_a_id = NULL, asignado_a_nombre = NULL, asignado_a_foto = NULL, asignado_a_titulo = NULL
             WHERE id = ?"
        );
        $stmt->execute([$id]);
    }

    public function pausar(int $id): void
    {
        $stmt = $this->db->prepare("UPDATE tickets SET estado = 'EN_ESPERA' WHERE id = ?");
        $stmt->execute([$id]);
    }

    public function reanudar(int $id): void
    {
        $stmt = $this->db->prepare("UPDATE tickets SET estado = 'EN_PROCESO' WHERE id = ?");
        $stmt->execute([$id]);
    }

    public function cerrar(int $id): void
    {
        $stmt = $this->db->prepare("UPDATE tickets SET estado = 'CERRADO', cerrado_at = NOW() WHERE id = ?");
        $stmt->execute([$id]);
    }

    public function cancelar(int $id): void
    {
        $stmt = $this->db->prepare("UPDATE tickets SET estado = 'CANCELADO', cancelado_at = NOW() WHERE id = ?");
        $stmt->execute([$id]);
    }

    /**
     * Borrado duro -- solo válido para tickets que nunca fueron
     * asignados (ver TicketController::eliminar()). `ticket_comentarios`/
     * `ticket_adjuntos`/`ticket_eventos` tienen ON DELETE CASCADE, se
     * van solos; los archivos físicos de los adjuntos los borra el
     * controller antes de llamar acá.
     */
    public function eliminar(int $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM tickets WHERE id = ?');
        $stmt->execute([$id]);
    }

    /**
     * Si el ticket fue escalado (el agente actual no es el original),
     * la devolución es automática acá: vuelve al agente original con su
     * nivel original, en el mismo UPDATE atómico (el `CASE` no cambia
     * nada si nunca se escaló, ya que ahí `agente_original_id` siempre
     * coincide con `asignado_a_id`). El controller decide si hubo
     * devolución comparando esos dos ids *antes* de llamar acá, para
     * registrar el evento DEVUELTO aparte.
     *
     * IMPORTANTE: en un UPDATE de una sola tabla, MySQL evalúa las
     * columnas del SET de izquierda a derecha y cada expresión ya ve el
     * valor *nuevo* de las columnas anteriores de esa misma sentencia
     * (no es como un SELECT, donde todo ve la fila vieja) -- por eso
     * `asignado_a_id` va al FINAL: si fuera antes, las condiciones de
     * nombre/foto/titulo/nivel comparían contra el id ya actualizado
     * (agente_original_id != agente_original_id -> false) y se
     * quedarían con los datos viejos del agente que resolvió.
     */
    public function resolver(int $id, string $solucion): void
    {
        $stmt = $this->db->prepare(
            "UPDATE tickets
             SET estado = 'RESUELTO', solucion = ?, resuelto_at = NOW(),
                 asignado_a_nombre = CASE WHEN agente_original_id IS NOT NULL AND agente_original_id != asignado_a_id THEN agente_original_nombre ELSE asignado_a_nombre END,
                 asignado_a_foto = CASE WHEN agente_original_id IS NOT NULL AND agente_original_id != asignado_a_id THEN agente_original_foto ELSE asignado_a_foto END,
                 asignado_a_titulo = CASE WHEN agente_original_id IS NOT NULL AND agente_original_id != asignado_a_id THEN agente_original_titulo ELSE asignado_a_titulo END,
                 nivel = CASE WHEN agente_original_id IS NOT NULL AND agente_original_id != asignado_a_id THEN nivel_original ELSE nivel END,
                 asignado_a_id = CASE WHEN agente_original_id IS NOT NULL AND agente_original_id != asignado_a_id THEN agente_original_id ELSE asignado_a_id END
             WHERE id = ?"
        );
        $stmt->execute([$solucion, $id]);
    }

    /**
     * @return array{1: int, 2: int, 3: int} Cantidad de tickets sin
     * asignar (no resueltos/cerrados) por nivel, para los badges de las
     * pestañas -- da igual si llegaron ABIERTOS, se liberaron
     * (PENDIENTE_ASIGNACION) o vinieron por escalamiento (ESCALADO): lo
     * que importa es que hay algo esperando que alguien lo tome.
     */
    public function contarNuevosPorNivel(): array
    {
        $conteo = [1 => 0, 2 => 0, 3 => 0];

        $stmt = $this->db->query(
            "SELECT nivel, COUNT(*) AS cantidad FROM tickets
             WHERE asignado_a_id IS NULL AND estado NOT IN ('RESUELTO', 'CERRADO', 'CANCELADO')
             GROUP BY nivel"
        );
        foreach ($stmt->fetchAll() as $fila) {
            $conteo[(int) $fila['nivel']] = (int) $fila['cantidad'];
        }

        return $conteo;
    }

    /**
     * Contadores para los tiles del dashboard (sección Inicio del panel
     * admin/agente). Un solo SELECT agregado en vez de 6 queries
     * separadas. Con `$nivel` (agente): "abiertos"/"enProgreso"/
     * "criticos"/"resueltosHoy" quedan acotados a ese nivel, y
     * "escalados" cambia de significado -- pasa de "nivel > 1" (no
     * aplica dentro de un solo nivel) a "llegaron a mi nivel por
     * escalamiento" (`EXISTS` contra `ticket_eventos`). Sin `$nivel`
     * (admin) el cálculo es el de siempre, global.
     * @return array{abiertos: int, enProgreso: int, escalados: int, criticos: int, resueltosHoy: int, misTickets: int, cancelados: int}
     */
    public function contarDashboard(int $adminId, ?int $nivel = null): array
    {
        $nivelSql = $nivel !== null ? 'AND nivel = ?' : '';
        $escaladosSql = $nivel !== null
            ? "SUM(CASE WHEN estado NOT IN ('RESUELTO','CERRADO','CANCELADO') AND EXISTS (
                    SELECT 1 FROM ticket_eventos te
                    WHERE te.ticket_id = tickets.id AND te.tipo = 'ESCALADO' AND te.nivel_nuevo = ?
                ) THEN 1 ELSE 0 END) AS escalados"
            : "SUM(CASE WHEN nivel > 1 AND estado NOT IN ('RESUELTO','CERRADO','CANCELADO') THEN 1 ELSE 0 END) AS escalados";

        $stmt = $this->db->prepare(
            "SELECT
                SUM(CASE WHEN estado NOT IN ('RESUELTO','CERRADO','CANCELADO') THEN 1 ELSE 0 END) AS abiertos,
                SUM(CASE WHEN estado = 'EN_PROCESO' THEN 1 ELSE 0 END) AS en_progreso,
                {$escaladosSql},
                SUM(CASE WHEN prioridad = 'URGENTE' AND estado NOT IN ('RESUELTO','CERRADO','CANCELADO') THEN 1 ELSE 0 END) AS criticos,
                SUM(CASE WHEN estado = 'RESUELTO' AND DATE(resuelto_at) = CURDATE() THEN 1 ELSE 0 END) AS resueltos_hoy,
                SUM(CASE WHEN asignado_a_id = ? AND estado NOT IN ('RESUELTO','CERRADO','CANCELADO') THEN 1 ELSE 0 END) AS mis_tickets,
                SUM(CASE WHEN estado = 'CANCELADO' THEN 1 ELSE 0 END) AS cancelados
             FROM tickets
             WHERE 1=1 {$nivelSql}"
        );
        $params = $nivel !== null ? [$nivel, $adminId, $nivel] : [$adminId];
        $stmt->execute($params);
        $row = $stmt->fetch();

        // SUM() sobre una tabla sin filas coincidentes da NULL vía PDO, no 0.
        return [
            'abiertos' => (int) ($row['abiertos'] ?? 0),
            'enProgreso' => (int) ($row['en_progreso'] ?? 0),
            'escalados' => (int) ($row['escalados'] ?? 0),
            'criticos' => (int) ($row['criticos'] ?? 0),
            'resueltosHoy' => (int) ($row['resueltos_hoy'] ?? 0),
            'misTickets' => (int) ($row['mis_tickets'] ?? 0),
            'cancelados' => (int) ($row['cancelados'] ?? 0),
        ];
    }

    /**
     * Prioridad y fecha de creación de todos los tickets no resueltos --
     * liviano a propósito (2 columnas) para que el controller calcule
     * cuántos están en riesgo/vencidos reusando `Sla::calcular()`, sin
     * duplicar el umbral de plazos acá en SQL.
     * @return array<int, array{prioridad: string, created_at: string}>
     */
    public function listNoResueltosParaSla(?int $nivel = null): array
    {
        if ($nivel !== null) {
            $stmt = $this->db->prepare("SELECT prioridad, created_at FROM tickets WHERE estado NOT IN ('RESUELTO','CERRADO','CANCELADO') AND nivel = ?");
            $stmt->execute([$nivel]);

            return $stmt->fetchAll();
        }

        return $this->db->query("SELECT prioridad, created_at FROM tickets WHERE estado NOT IN ('RESUELTO','CERRADO','CANCELADO')")->fetchAll();
    }

    /**
     * Candidatos para la sección "Atención requerida" del dashboard:
     * tickets no resueltos, más viejos primero, con el mismo shape que
     * `listForAdmin()` (compatible con `TicketController::formatTicket()`
     * sin cambios) más `ultimo_autor_tipo` -- quién escribió el último
     * evento del ticket, para detectar "pendiente de respuesta" (el
     * cliente escribió último, la pelota está de nuestro lado). El
     * controller decide con esos datos cuáles entran y en qué orden --
     * acá solo se trae un lote acotado de candidatos.
     * @return array<int, array<string, mixed>>
     */
    public function listAtencionRequerida(int $limiteCandidatos = 50, ?int $nivel = null): array
    {
        $nivelSql = $nivel !== null ? 'AND t.nivel = ?' : '';
        $stmt = $this->db->prepare(
            "SELECT t.*, uc.nombre AS cliente_nombre, uc.email AS cliente_email, cat.nombre AS categoria_nombre,
                    ultimo.autor_tipo AS ultimo_autor_tipo
             FROM tickets t
             JOIN usuarios_clientes uc ON uc.id = t.cliente_id
             LEFT JOIN categorias cat ON cat.id = t.categoria_id
             LEFT JOIN (
                 SELECT te1.ticket_id, te1.autor_tipo
                 FROM ticket_eventos te1
                 INNER JOIN (
                     SELECT ticket_id, MAX(id) AS max_id FROM ticket_eventos GROUP BY ticket_id
                 ) te2 ON te1.ticket_id = te2.ticket_id AND te1.id = te2.max_id
             ) ultimo ON ultimo.ticket_id = t.id
             WHERE t.estado NOT IN ('RESUELTO','CERRADO','CANCELADO') {$nivelSql}
             ORDER BY t.created_at ASC
             LIMIT ?"
        );
        $i = 1;
        if ($nivel !== null) {
            $stmt->bindValue($i++, $nivel, \PDO::PARAM_INT);
        }
        $stmt->bindValue($i, $limiteCandidatos, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * @param string $desde 'Y-m-d H:i:s'
     * @param string $hasta 'Y-m-d H:i:s'
     * @return array{ABIERTO: int, PENDIENTE_ASIGNACION: int, EN_PROCESO: int, ESCALADO: int, EN_ESPERA: int, RESUELTO: int, CERRADO: int, CANCELADO: int}
     */
    public function contarPorEstado(string $desde, string $hasta): array
    {
        $conteo = [
            'ABIERTO' => 0, 'PENDIENTE_ASIGNACION' => 0, 'EN_PROCESO' => 0,
            'ESCALADO' => 0, 'EN_ESPERA' => 0, 'RESUELTO' => 0, 'CERRADO' => 0, 'CANCELADO' => 0,
        ];
        $stmt = $this->db->prepare(
            'SELECT estado, COUNT(*) AS cantidad FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY estado'
        );
        $stmt->execute([$desde, $hasta]);
        foreach ($stmt->fetchAll() as $fila) {
            $conteo[$fila['estado']] = (int) $fila['cantidad'];
        }

        return $conteo;
    }

    /**
     * @param string $desde 'Y-m-d H:i:s'
     * @param string $hasta 'Y-m-d H:i:s'
     * @return array{BAJA: int, MEDIA: int, ALTA: int, URGENTE: int}
     */
    public function contarPorPrioridad(string $desde, string $hasta): array
    {
        $conteo = ['BAJA' => 0, 'MEDIA' => 0, 'ALTA' => 0, 'URGENTE' => 0];
        $stmt = $this->db->prepare(
            'SELECT prioridad, COUNT(*) AS cantidad FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY prioridad'
        );
        $stmt->execute([$desde, $hasta]);
        foreach ($stmt->fetchAll() as $fila) {
            $conteo[$fila['prioridad']] = (int) $fila['cantidad'];
        }

        return $conteo;
    }

    /**
     * Creados vs. resueltos por día, entre $desde y $hasta (mismo formato
     * 'Y-m-d H:i:s' que el resto de los métodos de este bloque, para que
     * el controller arme el rango una sola vez y lo pase igual a todos).
     * Un solo query (UNION ALL + agregación) en vez de dos separadas; los
     * días sin actividad se completan en 0 acá mismo, no en el
     * controller/frontend.
     * @param string $desde 'Y-m-d H:i:s'
     * @param string $hasta 'Y-m-d H:i:s'
     * @return array<int, array{fecha: string, creados: int, resueltos: int}>
     */
    public function tendenciaRango(string $desde, string $hasta): array
    {
        $stmt = $this->db->prepare(
            "SELECT dia,
                    SUM(CASE WHEN tipo = 'creado' THEN 1 ELSE 0 END) AS creados,
                    SUM(CASE WHEN tipo = 'resuelto' THEN 1 ELSE 0 END) AS resueltos
             FROM (
                 SELECT DATE(created_at) AS dia, 'creado' AS tipo FROM tickets WHERE created_at BETWEEN ? AND ?
                 UNION ALL
                 SELECT DATE(resuelto_at) AS dia, 'resuelto' AS tipo FROM tickets WHERE resuelto_at BETWEEN ? AND ?
             ) eventos
             GROUP BY dia"
        );
        $stmt->execute([$desde, $hasta, $desde, $hasta]);

        $porDia = [];
        foreach ($stmt->fetchAll() as $fila) {
            $porDia[$fila['dia']] = ['creados' => (int) $fila['creados'], 'resueltos' => (int) $fila['resueltos']];
        }

        $desdeDt = new \DateTimeImmutable(substr($desde, 0, 10));
        $hastaDt = new \DateTimeImmutable(substr($hasta, 0, 10));

        $resultado = [];
        $dias = $hastaDt->diff($desdeDt)->days + 1;
        for ($i = 0; $i < $dias; $i++) {
            $fecha = $desdeDt->modify("+{$i} days")->format('Y-m-d');
            $resultado[] = [
                'fecha' => $fecha,
                'creados' => $porDia[$fecha]['creados'] ?? 0,
                'resueltos' => $porDia[$fecha]['resueltos'] ?? 0,
            ];
        }

        return $resultado;
    }

    /**
     * Resumen de un período: total de tickets creados, cuántos se
     * resolvieron, tasa de resolución, y los dos tiempos promedio que
     * pide "Estadísticas" -- de primera respuesta (hasta el primer evento
     * de un ADMIN en `ticket_eventos`, tickets sin respuesta todavía
     * quedan afuera del promedio a propósito) y de resolución (hasta
     * `resuelto_at`).
     * @param string $desde 'Y-m-d H:i:s'
     * @param string $hasta 'Y-m-d H:i:s'
     * @return array{total: int, resueltos: int, tasaResolucion: float, tiempoRespuestaMinProm: ?float, tiempoResolucionMinProm: ?float}
     */
    public function resumenPeriodo(string $desde, string $hasta): array
    {
        $stmt = $this->db->prepare(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN estado = 'RESUELTO' THEN 1 ELSE 0 END) AS resueltos,
                AVG(CASE WHEN estado = 'RESUELTO' THEN TIMESTAMPDIFF(MINUTE, created_at, resuelto_at) ELSE NULL END) AS resolucion_prom_min
             FROM tickets
             WHERE created_at BETWEEN ? AND ?"
        );
        $stmt->execute([$desde, $hasta]);
        $row = $stmt->fetch();

        $stmtResp = $this->db->prepare(
            "SELECT AVG(TIMESTAMPDIFF(MINUTE, t.created_at, primera.primera_respuesta)) AS respuesta_prom_min
             FROM tickets t
             JOIN (
                 SELECT ticket_id, MIN(created_at) AS primera_respuesta
                 FROM ticket_eventos
                 WHERE autor_tipo = 'ADMIN'
                 GROUP BY ticket_id
             ) primera ON primera.ticket_id = t.id
             WHERE t.created_at BETWEEN ? AND ?"
        );
        $stmtResp->execute([$desde, $hasta]);
        $rowResp = $stmtResp->fetch();

        $total = (int) ($row['total'] ?? 0);
        $resueltos = (int) ($row['resueltos'] ?? 0);

        return [
            'total' => $total,
            'resueltos' => $resueltos,
            'tasaResolucion' => $total > 0 ? round($resueltos / $total * 100, 1) : 0.0,
            'tiempoRespuestaMinProm' => $rowResp['respuesta_prom_min'] !== null ? (float) $rowResp['respuesta_prom_min'] : null,
            'tiempoResolucionMinProm' => $row['resolucion_prom_min'] !== null ? (float) $row['resolucion_prom_min'] : null,
        ];
    }

    /**
     * Ranking de agentes por actividad en el período: cuántos tickets se
     * les asignaron (creados dentro del rango) y cuántos resolvieron,
     * más su tiempo promedio de resolución. Agentes sin tickets en el
     * rango no aparecen (INNER JOIN a propósito); agentes dados de baja
     * con tickets viejos en el rango sí siguen apareciendo -- el
     * rendimiento histórico no debería desaparecer.
     * @param string $desde 'Y-m-d H:i:s'
     * @param string $hasta 'Y-m-d H:i:s'
     * @return array<int, array{id: int, nombre: string, apellido: ?string, fotoUrl: ?string, asignados: int, resueltos: int, resolucionMinProm: ?float}>
     */
    public function rendimientoPorAgente(string $desde, string $hasta): array
    {
        $stmt = $this->db->prepare(
            "SELECT
                a.id, a.nombre, a.apellido, a.foto_url,
                COUNT(t.id) AS asignados,
                SUM(CASE WHEN t.estado = 'RESUELTO' THEN 1 ELSE 0 END) AS resueltos,
                AVG(CASE WHEN t.estado = 'RESUELTO' THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.resuelto_at) ELSE NULL END) AS resolucion_prom_min
             FROM usuarios_administradores a
             JOIN tickets t ON t.asignado_a_id = a.id AND t.created_at BETWEEN ? AND ?
             GROUP BY a.id
             ORDER BY asignados DESC"
        );
        $stmt->execute([$desde, $hasta]);

        return array_map(
            fn (array $r) => [
                'id' => (int) $r['id'],
                'nombre' => $r['nombre'],
                'apellido' => $r['apellido'],
                'fotoUrl' => $r['foto_url'] ? "/assets/uploads/avatars/{$r['foto_url']}" : null,
                'asignados' => (int) $r['asignados'],
                'resueltos' => (int) $r['resueltos'],
                'resolucionMinProm' => $r['resolucion_prom_min'] !== null ? (float) $r['resolucion_prom_min'] : null,
            ],
            $stmt->fetchAll()
        );
    }

    /**
     * @param array{estado?: string, prioridad?: string, asignadoAId?: int, nivel?: int, q?: string, sinAsignar?: bool, categoriaId?: int} $filtros
     * @return array{0: array<int, string>, 1: array<int, mixed>}
     */
    private function buildAdminFiltros(array $filtros): array
    {
        $where = [];
        $params = [];

        if (!empty($filtros['estado'])) {
            $where[] = 't.estado = ?';
            $params[] = $filtros['estado'];
        }
        if (!empty($filtros['prioridad'])) {
            $where[] = 't.prioridad = ?';
            $params[] = $filtros['prioridad'];
        }
        if (!empty($filtros['asignadoAId'])) {
            $where[] = 't.asignado_a_id = ?';
            $params[] = $filtros['asignadoAId'];
        }
        if (!empty($filtros['nivel'])) {
            $where[] = 't.nivel = ?';
            $params[] = $filtros['nivel'];
        }
        if (!empty($filtros['q'])) {
            $q = (string) $filtros['q'];
            if (ctype_digit($q)) {
                $where[] = '(t.titulo LIKE ? OR t.id = ?)';
                $params[] = '%' . $q . '%';
                $params[] = (int) $q;
            } else {
                $where[] = 't.titulo LIKE ?';
                $params[] = '%' . $q . '%';
            }
        }
        if (!empty($filtros['sinAsignar'])) {
            $where[] = 't.asignado_a_id IS NULL';
        }
        if (!empty($filtros['categoriaId'])) {
            $where[] = 't.categoria_id = ?';
            $params[] = $filtros['categoriaId'];
        }

        return [$where, $params];
    }
}
