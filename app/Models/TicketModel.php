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
    public function create(int $clienteId, string $titulo, string $descripcion, string $prioridad, ?int $categoriaId = null): int
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

    public function updateEstado(int $id, string $estado): void
    {
        $stmt = $this->db->prepare('UPDATE tickets SET estado = ? WHERE id = ?');
        $stmt->execute([$estado, $id]);
    }

    public function updatePrioridad(int $id, string $prioridad): void
    {
        $stmt = $this->db->prepare('UPDATE tickets SET prioridad = ? WHERE id = ?');
        $stmt->execute([$prioridad, $id]);
    }

    /**
     * Asignar un ticket a un agente. Si el ticket estaba NEW, pasa a
     * EN_PROCESO (si ya estaba en curso, no lo toca). `$foto`/`$titulo`
     * son un snapshot del perfil del agente al momento de tomar el
     * ticket (igual que `$nombre`) -- no es un JOIN en vivo, así que si
     * el agente cambia de foto después, tickets ya asignados conservan
     * la que tenía en ese momento.
     */
    public function asignar(int $id, int $adminId, string $nombre, ?string $foto = null, ?string $titulo = null): void
    {
        $stmt = $this->db->prepare(
            "UPDATE tickets
             SET asignado_a_id = ?, asignado_a_nombre = ?, asignado_a_foto = ?, asignado_a_titulo = ?,
                 estado = IF(estado = 'NEW', 'EN_PROCESO', estado)
             WHERE id = ?"
        );
        $stmt->execute([$adminId, $nombre, $foto, $titulo, $id]);
    }

    public function liberar(int $id): void
    {
        $stmt = $this->db->prepare(
            'UPDATE tickets SET asignado_a_id = NULL, asignado_a_nombre = NULL, asignado_a_foto = NULL, asignado_a_titulo = NULL WHERE id = ?'
        );
        $stmt->execute([$id]);
    }

    public function escalar(int $id): void
    {
        $stmt = $this->db->prepare('UPDATE tickets SET nivel = LEAST(nivel + 1, 3) WHERE id = ?');
        $stmt->execute([$id]);
    }

    public function resolver(int $id, string $solucion): void
    {
        $stmt = $this->db->prepare(
            "UPDATE tickets SET estado = 'RESUELTO', solucion = ?, resuelto_at = NOW() WHERE id = ?"
        );
        $stmt->execute([$solucion, $id]);
    }

    /** @return array{1: int, 2: int, 3: int} Cantidad de tickets NEW por nivel, para los badges de las pestañas. */
    public function contarNuevosPorNivel(): array
    {
        $conteo = [1 => 0, 2 => 0, 3 => 0];

        $stmt = $this->db->query("SELECT nivel, COUNT(*) AS cantidad FROM tickets WHERE estado = 'NEW' GROUP BY nivel");
        foreach ($stmt->fetchAll() as $fila) {
            $conteo[(int) $fila['nivel']] = (int) $fila['cantidad'];
        }

        return $conteo;
    }

    /**
     * Contadores para los tiles del dashboard (sección Inicio del panel
     * admin). Un solo SELECT agregado en vez de 6 queries separadas.
     * @return array{abiertos: int, enProgreso: int, escalados: int, criticos: int, resueltosHoy: int, misTickets: int}
     */
    public function contarDashboard(int $adminId): array
    {
        $stmt = $this->db->prepare(
            "SELECT
                SUM(CASE WHEN estado IN ('NEW','EN_PROCESO') THEN 1 ELSE 0 END) AS abiertos,
                SUM(CASE WHEN estado = 'EN_PROCESO' THEN 1 ELSE 0 END) AS en_progreso,
                SUM(CASE WHEN nivel > 1 AND estado != 'RESUELTO' THEN 1 ELSE 0 END) AS escalados,
                SUM(CASE WHEN prioridad = 'URGENTE' AND estado != 'RESUELTO' THEN 1 ELSE 0 END) AS criticos,
                SUM(CASE WHEN estado = 'RESUELTO' AND DATE(resuelto_at) = CURDATE() THEN 1 ELSE 0 END) AS resueltos_hoy,
                SUM(CASE WHEN asignado_a_id = ? AND estado != 'RESUELTO' THEN 1 ELSE 0 END) AS mis_tickets
             FROM tickets"
        );
        $stmt->execute([$adminId]);
        $row = $stmt->fetch();

        // SUM() sobre una tabla sin filas coincidentes da NULL vía PDO, no 0.
        return [
            'abiertos' => (int) ($row['abiertos'] ?? 0),
            'enProgreso' => (int) ($row['en_progreso'] ?? 0),
            'escalados' => (int) ($row['escalados'] ?? 0),
            'criticos' => (int) ($row['criticos'] ?? 0),
            'resueltosHoy' => (int) ($row['resueltos_hoy'] ?? 0),
            'misTickets' => (int) ($row['mis_tickets'] ?? 0),
        ];
    }

    /**
     * Prioridad y fecha de creación de todos los tickets no resueltos --
     * liviano a propósito (2 columnas) para que el controller calcule
     * cuántos están en riesgo/vencidos reusando `Sla::calcular()`, sin
     * duplicar el umbral de plazos acá en SQL.
     * @return array<int, array{prioridad: string, created_at: string}>
     */
    public function listNoResueltosParaSla(): array
    {
        return $this->db->query("SELECT prioridad, created_at FROM tickets WHERE estado != 'RESUELTO'")->fetchAll();
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
    public function listAtencionRequerida(int $limiteCandidatos = 50): array
    {
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
             WHERE t.estado != 'RESUELTO'
             ORDER BY t.created_at ASC
             LIMIT ?"
        );
        $stmt->bindValue(1, $limiteCandidatos, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /** @return array{NEW: int, EN_PROCESO: int, RESUELTO: int} */
    public function contarPorEstado(): array
    {
        $conteo = ['NEW' => 0, 'EN_PROCESO' => 0, 'RESUELTO' => 0];
        $stmt = $this->db->query('SELECT estado, COUNT(*) AS cantidad FROM tickets GROUP BY estado');
        foreach ($stmt->fetchAll() as $fila) {
            $conteo[$fila['estado']] = (int) $fila['cantidad'];
        }

        return $conteo;
    }

    /** @return array{BAJA: int, MEDIA: int, ALTA: int, URGENTE: int} */
    public function contarPorPrioridad(): array
    {
        $conteo = ['BAJA' => 0, 'MEDIA' => 0, 'ALTA' => 0, 'URGENTE' => 0];
        $stmt = $this->db->query('SELECT prioridad, COUNT(*) AS cantidad FROM tickets GROUP BY prioridad');
        foreach ($stmt->fetchAll() as $fila) {
            $conteo[$fila['prioridad']] = (int) $fila['cantidad'];
        }

        return $conteo;
    }

    /**
     * Creados vs. resueltos por día, últimos $dias días (incluye hoy). Un
     * solo query (UNION ALL + agregación) en vez de dos separadas; los días
     * sin actividad se completan en 0 acá mismo, no en el controller/frontend.
     * @return array<int, array{fecha: string, creados: int, resueltos: int}>
     */
    public function tendenciaUltimosDias(int $dias = 7): array
    {
        $desde = (new \DateTimeImmutable('today'))->modify('-' . ($dias - 1) . ' days');

        $stmt = $this->db->prepare(
            "SELECT dia,
                    SUM(CASE WHEN tipo = 'creado' THEN 1 ELSE 0 END) AS creados,
                    SUM(CASE WHEN tipo = 'resuelto' THEN 1 ELSE 0 END) AS resueltos
             FROM (
                 SELECT DATE(created_at) AS dia, 'creado' AS tipo FROM tickets WHERE created_at >= ?
                 UNION ALL
                 SELECT DATE(resuelto_at) AS dia, 'resuelto' AS tipo FROM tickets WHERE resuelto_at >= ?
             ) eventos
             GROUP BY dia"
        );
        $desdeStr = $desde->format('Y-m-d 00:00:00');
        $stmt->execute([$desdeStr, $desdeStr]);

        $porDia = [];
        foreach ($stmt->fetchAll() as $fila) {
            $porDia[$fila['dia']] = ['creados' => (int) $fila['creados'], 'resueltos' => (int) $fila['resueltos']];
        }

        $resultado = [];
        for ($i = 0; $i < $dias; $i++) {
            $fecha = $desde->modify("+{$i} days")->format('Y-m-d');
            $resultado[] = [
                'fecha' => $fecha,
                'creados' => $porDia[$fecha]['creados'] ?? 0,
                'resueltos' => $porDia[$fecha]['resueltos'] ?? 0,
            ];
        }

        return $resultado;
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
