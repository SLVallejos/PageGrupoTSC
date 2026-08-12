<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Sla;
use App\Helpers\Validator;
use App\Models\AdministradorLocalModel;
use App\Models\CategoriaModel;
use App\Models\TicketAdjuntoModel;
use App\Models\TicketComentarioModel;
use App\Models\TicketEventoModel;
use App\Models\TicketModel;
use finfo;

/**
 * Tickets de soporte: creación/seguimiento (cliente) y gestión (admin/
 * agente — adjudicar/liberar, pausar/reanudar, prioridad, escalar
 * nivel, resolver, cerrar, comentar, adjuntar archivos). El cliente solo
 * puede ver/comentar/adjuntar en sus propios tickets
 * (`requireTicketAccess`); el admin/agente puede actuar sobre cualquiera
 * de su alcance (ver `assertNivelPermitido`), salvo que ya esté
 * RESUELTO o CERRADO (`assertEditable` — bloqueado por completo, con la
 * excepción de `cerrar()`, la única transición válida desde RESUELTO).
 */
final class TicketController extends BaseController
{
    private const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];
    private const PAGE_SIZE = 10;
    private const MAX_ADJUNTO_BYTES = 5 * 1024 * 1024;

    /** mime real (detectado con finfo) => extensión con la que se guarda. */
    private const MIME_PERMITIDOS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'application/pdf' => 'pdf',
    ];

    public function index(Request $request): void
    {
        $usuario = $this->requireAuth();
        $page = max(1, (int) $request->query('page', 1));

        $model = new TicketModel();

        if (in_array($usuario['rol'], ['ADMIN', 'AGENTE'], true)) {
            $filtros = array_filter([
                'estado' => $request->query('estado'),
                'prioridad' => $request->query('prioridad'),
                // "Solo mis tickets tomados" -- se arma desde la sesión
                // actual, nunca de un valor que mande el cliente, así no
                // hay forma de pedir el filtro con el id de otro admin.
                'asignadoAId' => $request->query('soloMios') ? (int) $usuario['id'] : null,
                'nivel' => $request->query('nivel') ? (int) $request->query('nivel') : null,
                'q' => $request->query('q'),
                'sinAsignar' => $request->query('sinAsignar') ? true : null,
                'categoriaId' => $request->query('categoriaId') ? (int) $request->query('categoriaId') : null,
            ]);
            // Un agente solo puede ver tickets de su propio nivel -- se
            // fuerza acá, pisando cualquier valor de "nivel" que haya
            // mandado el cliente, para que no lo pueda cambiar por query
            // string (ver AGENTE en `assertNivelPermitido()`).
            if ($usuario['rol'] === 'AGENTE') {
                $filtros['nivel'] = (int) $usuario['nivel'];
            }
            $resultado = $model->listForAdmin($filtros, $page, self::PAGE_SIZE);
            $tickets = array_map(fn (array $t) => $this->formatTicket($t, true), $resultado['data']);
        } else {
            $resultado = $model->listForCliente((int) $usuario['id'], $page, self::PAGE_SIZE);
            $tickets = array_map(fn (array $t) => $this->formatTicket($t, false), $resultado['data']);
        }

        $totalPages = max(1, (int) ceil($resultado['total'] / self::PAGE_SIZE));
        $this->success($tickets, 200, ['pagination' => ['totalPages' => $totalPages]]);
    }

    public function store(Request $request): void
    {
        $usuario = $this->requireAuth(['CLIENTE']);
        $data = $request->all();

        $errores = array_filter([
            Validator::required($data, 'titulo'),
            Validator::maxLength($data, 'titulo', 200),
            Validator::required($data, 'descripcion'),
            Validator::inArray($data, 'prioridad', self::PRIORIDADES),
            Validator::required($data, 'categoriaId'),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $categoriaId = $this->resolveCategoriaId($request->input('categoriaId'));

        $id = (new TicketModel())->create(
            (int) $usuario['id'],
            (string) $request->input('titulo'),
            (string) $request->input('descripcion'),
            (string) $request->input('prioridad'),
            $categoriaId
        );

        (new TicketEventoModel())->registrar($id, 'CREADO', 'CLIENTE', (string) $usuario['nombre'], 'Ticket creado.');

        $this->success(['id' => $id], 201);
    }

    /** Categoría obligatoria al crear un ticket -- tiene que existir y estar activa (ya se validó que no venga vacía). */
    private function resolveCategoriaId(mixed $categoriaId): int
    {
        $categoria = (new CategoriaModel())->findById((int) $categoriaId);
        if (!$categoria || !$categoria['activo']) {
            $this->fail('Categoría inválida.', 422);
        }

        return (int) $categoriaId;
    }

    public function asignar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNivelPermitido($usuario, $ticket);
        $this->assertEditable($ticket);

        [$foto, $titulo] = $this->perfilAgenteActual($usuario);
        $model->asignar(
            (int) $params['id'],
            (int) $usuario['id'],
            (string) $usuario['nombre'],
            $foto,
            $titulo
        );
        (new TicketEventoModel())->registrar((int) $params['id'], 'ASIGNADO', 'ADMIN', (string) $usuario['nombre'], 'Se tomó el ticket.');
        $this->success(null);
    }

    public function liberar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNivelPermitido($usuario, $ticket);
        $this->assertEditable($ticket);

        if ($ticket['estado'] !== 'EN_PROCESO' && $ticket['estado'] !== 'EN_ESPERA') {
            $this->fail('Solo se puede liberar un ticket en proceso o en espera.', 409);
        }

        $model->liberar((int) $params['id']);
        (new TicketEventoModel())->registrar((int) $params['id'], 'LIBERADO', 'ADMIN', (string) $usuario['nombre'], 'Se liberó el ticket.');
        $this->success(null);
    }

    public function pausar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNivelPermitido($usuario, $ticket);
        $this->assertEditable($ticket);

        if ($ticket['estado'] !== 'EN_PROCESO') {
            $this->fail('Solo se puede marcar en espera un ticket en proceso.', 409);
        }

        $model->pausar((int) $params['id']);
        (new TicketEventoModel())->registrar((int) $params['id'], 'PAUSADO', 'ADMIN', (string) $usuario['nombre'], 'Ticket puesto en espera.');
        $this->success(null);
    }

    public function reanudar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNivelPermitido($usuario, $ticket);
        $this->assertEditable($ticket);

        if ($ticket['estado'] !== 'EN_ESPERA') {
            $this->fail('Solo se puede reanudar un ticket en espera.', 409);
        }

        $model->reanudar((int) $params['id']);
        (new TicketEventoModel())->registrar((int) $params['id'], 'REANUDADO', 'ADMIN', (string) $usuario['nombre'], 'Ticket reanudado.');
        $this->success(null);
    }

    /** Única transición válida desde RESUELTO -- por eso no pasa por `assertEditable()`, que justamente bloquea ese estado. */
    public function cerrar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNivelPermitido($usuario, $ticket);

        if ($ticket['estado'] !== 'RESUELTO') {
            $this->fail('Solo se puede cerrar un ticket resuelto.', 409);
        }

        $model->cerrar((int) $params['id']);
        (new TicketEventoModel())->registrar((int) $params['id'], 'CERRADO', 'ADMIN', (string) $usuario['nombre'], 'Ticket cerrado.');
        $this->success(null);
    }

    /**
     * Cancelar (soft) -- el cliente su propio ticket, o el staff dentro
     * de su nivel (`requireTicketAccess` ya cubre los dos casos).
     * Requiere motivo y queda auditado en el historial, a diferencia de
     * `eliminar()` (borrado duro, sin rastro).
     */
    public function cancelar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth();
        $ticket = $this->requireTicketAccess($usuario, (int) $params['id']);
        $this->assertEditable($ticket);

        $data = $request->all();
        $error = Validator::required($data, 'motivo');
        if ($error) {
            $this->fail($error, 422);
        }

        (new TicketModel())->cancelar((int) $params['id']);

        $autorTipo = $usuario['rol'] === 'CLIENTE' ? 'CLIENTE' : 'ADMIN';
        (new TicketEventoModel())->registrar(
            (int) $params['id'],
            'CANCELADO',
            $autorTipo,
            (string) $usuario['nombre'],
            null,
            null,
            null,
            (string) $request->input('motivo')
        );
        $this->success(null);
    }

    /**
     * Borrado duro -- solo el cliente dueño del ticket, y solo si nunca
     * fue tocado por soporte (`agente_original_id` sigue en null). Si
     * ya lo asignaron, corresponde `cancelar()` en su lugar: acá no
     * queda ningún rastro, no hay nada que auditar porque no pasó nada.
     */
    public function eliminar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['CLIENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);

        if ((int) $ticket['cliente_id'] !== (int) $usuario['id']) {
            $this->fail('No tenés acceso a este ticket.', 403);
        }
        if ($ticket['agente_original_id'] !== null) {
            $this->fail('Este ticket ya fue tomado por soporte, no se puede eliminar -- podés cancelarlo.', 409);
        }
        if ($ticket['estado'] === 'CANCELADO') {
            $this->fail('Este ticket ya está cancelado.', 409);
        }

        foreach ((new TicketAdjuntoModel())->listByTicket((int) $params['id']) as $adjunto) {
            $ruta = self::adjuntosPath() . '/' . $adjunto['nombre_almacenado'];
            if (is_file($ruta)) {
                @unlink($ruta);
            }
        }

        $model->eliminar((int) $params['id']);
        $this->success(null);
    }

    public function prioridad(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNivelPermitido($usuario, $ticket);
        $this->assertEditable($ticket);

        $data = $request->all();
        $error = Validator::inArray($data, 'prioridad', self::PRIORIDADES);
        if ($error) {
            $this->fail($error, 422);
        }

        $nuevaPrioridad = (string) $request->input('prioridad');
        $model->updatePrioridad((int) $params['id'], $nuevaPrioridad);
        (new TicketEventoModel())->registrar((int) $params['id'], 'PRIORIDAD', 'ADMIN', (string) $usuario['nombre'], $nuevaPrioridad);
        $this->success(null);
    }

    public function escalar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNivelPermitido($usuario, $ticket);
        $this->assertEditable($ticket);

        if ($ticket['estado'] !== 'EN_PROCESO' && $ticket['estado'] !== 'EN_ESPERA') {
            $this->fail('Solo se puede escalar un ticket en proceso o en espera.', 409);
        }

        $data = $request->all();
        $error = Validator::required($data, 'motivo');
        if ($error) {
            $this->fail($error, 422);
        }

        $nivelAnterior = (int) $ticket['nivel'];
        if ($nivelAnterior >= 3) {
            $this->fail('El ticket ya está en el nivel máximo.', 409);
        }
        $nivelNuevo = min($nivelAnterior + 1, 3);

        $model->escalar((int) $params['id']);
        (new TicketEventoModel())->registrar(
            (int) $params['id'],
            'ESCALADO',
            'ADMIN',
            (string) $usuario['nombre'],
            null,
            $nivelAnterior,
            $nivelNuevo,
            (string) $request->input('motivo')
        );
        $this->success(null);
    }

    public function resolver(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNivelPermitido($usuario, $ticket);
        $this->assertEditable($ticket);

        if ($ticket['estado'] !== 'EN_PROCESO' && $ticket['estado'] !== 'EN_ESPERA') {
            $this->fail('Solo se puede resolver un ticket en proceso o en espera.', 409);
        }

        $data = $request->all();
        $error = Validator::required($data, 'solucion');
        if ($error) {
            $this->fail($error, 422);
        }

        // Si el agente original difiere del actual, el ticket fue
        // escalado en algún momento -- TicketModel::resolver() lo
        // devuelve solo (mismo UPDATE), acá solo hace falta decidir si
        // corresponde registrar el evento DEVUELTO además del RESUELTO.
        $huboDevolucion = $ticket['agente_original_id'] !== null
            && (int) $ticket['agente_original_id'] !== (int) $ticket['asignado_a_id'];

        $model->resolver((int) $params['id'], (string) $request->input('solucion'));
        (new TicketEventoModel())->registrar((int) $params['id'], 'RESUELTO', 'ADMIN', (string) $usuario['nombre'], 'Ticket resuelto.');

        if ($huboDevolucion) {
            (new TicketEventoModel())->registrar(
                (int) $params['id'],
                'DEVUELTO',
                'ADMIN',
                (string) $usuario['nombre'],
                "Devuelto a {$ticket['agente_original_nombre']}.",
                (int) $ticket['nivel'],
                (int) $ticket['nivel_original']
            );
        }

        $this->success(null);
    }

    /**
     * Cantidad de tickets NEW por nivel, para el badge de cada pestaña y
     * la campana del header. Un agente solo ve el conteo de su propio
     * nivel -- los demás quedan en 0 (no tiene sentido que se entere de
     * cuántos tickets nuevos hay en un nivel al que no tiene acceso).
     */
    public function resumenNuevos(Request $request): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $conteo = (new TicketModel())->contarNuevosPorNivel();

        if ($usuario['rol'] === 'AGENTE') {
            foreach ($conteo as $nivel => $cantidad) {
                if ($nivel !== (int) $usuario['nivel']) {
                    $conteo[$nivel] = 0;
                }
            }
        }

        $this->success($conteo);
    }

    /**
     * Contadores + "Atención requerida" + "Actividad reciente" para el
     * dashboard (sección "Inicio"). Un agente ve el mismo shape de
     * respuesta que un admin, pero acotado a su propio nivel (`$nivel`
     * se pasa a cada método del modelo); un admin sigue viendo todo,
     * global (`$nivel = null`).
     */
    public function dashboard(Request $request): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $nivel = $usuario['rol'] === 'AGENTE' ? (int) $usuario['nivel'] : null;
        $model = new TicketModel();

        $counts = $model->contarDashboard((int) $usuario['id'], $nivel);

        // SLA en riesgo/vencido -- reusa Sla::calcular(), no duplica el
        // cálculo de plazos acá.
        $slaEnRiesgo = 0;
        $slaVencido = 0;
        foreach ($model->listNoResueltosParaSla($nivel) as $t) {
            $estado = Sla::calcular($t['prioridad'], $t['created_at'], null)['estado'];
            if ($estado === 'PROXIMO') {
                $slaEnRiesgo++;
            } elseif ($estado === 'VENCIDO') {
                $slaVencido++;
            }
        }
        $counts['slaEnRiesgo'] = $slaEnRiesgo;
        $counts['slaVencido'] = $slaVencido;

        // Atención requerida: mismos candidatos que listForAdmin, filtrados a
        // los que tienen al menos un motivo, reusando formatTicket() entero.
        $atencionRequerida = [];
        foreach ($model->listAtencionRequerida(50, $nivel) as $row) {
            $ticket = $this->formatTicket($row, true);
            $motivos = [];
            if ($ticket['slaEstado'] === 'VENCIDO') {
                $motivos[] = 'SLA vencido';
            }
            if ($ticket['slaEstado'] === 'PROXIMO') {
                $motivos[] = 'SLA en riesgo';
            }
            if ($ticket['prioridad'] === 'URGENTE') {
                $motivos[] = 'Crítico';
            }
            if ($ticket['asignadoAId'] === null) {
                $motivos[] = 'Sin asignar';
            }
            if (($row['ultimo_autor_tipo'] ?? null) === 'CLIENTE') {
                $motivos[] = 'Pendiente de respuesta';
            }
            if ($motivos) {
                $ticket['motivos'] = $motivos;
                $atencionRequerida[] = $ticket;
            }
        }
        usort($atencionRequerida, fn (array $a, array $b) => self::pesoAtencion($a) <=> self::pesoAtencion($b));
        $counts['atencionRequerida'] = array_slice($atencionRequerida, 0, 10);

        $counts['actividadReciente'] = array_map(
            function (array $e): array {
                $formatted = $this->formatEvento($e);
                $formatted['ticketId'] = (int) $e['ticket_id'];
                $formatted['ticketTitulo'] = $e['ticket_titulo'];

                return $formatted;
            },
            (new TicketEventoModel())->listRecientes(15, $nivel)
        );

        $this->success($counts);
    }

    /** Orden de urgencia para "Atención requerida": SLA vencido primero, después en riesgo, después el resto. */
    private static function pesoAtencion(array $ticket): int
    {
        if ($ticket['slaEstado'] === 'VENCIDO') {
            return 0;
        }
        if ($ticket['slaEstado'] === 'PROXIMO') {
            return 1;
        }
        if ($ticket['prioridad'] === 'URGENTE') {
            return 2;
        }
        if ($ticket['asignadoAId'] === null) {
            return 3;
        }

        return 4;
    }

    /**
     * Sección "Estadísticas" del panel admin: distribución, tendencia,
     * resumen con comparación contra el período anterior y rendimiento
     * por agente, todo acotado por `desde`/`hasta` (query string, 'Y-m-d'
     * -- default: últimos 30 días). A diferencia de `dashboard()` (foto
     * del momento), acá todo es sobre un rango elegible.
     */
    public function estadisticas(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $model = new TicketModel();

        $hoy = new \DateTimeImmutable('today');
        $hasta = $this->parsearFecha($request->query('hasta')) ?? $hoy;
        $desde = $this->parsearFecha($request->query('desde')) ?? $hasta->modify('-29 days');

        if ($desde > $hasta) {
            $this->fail('"desde" no puede ser posterior a "hasta".', 422);
        }

        $desdeStr = $desde->format('Y-m-d 00:00:00');
        $hastaStr = $hasta->format('Y-m-d 23:59:59');

        // Período anterior de igual longitud, inmediatamente antes de $desde.
        $dias = $hasta->diff($desde)->days + 1;
        $desdeAnteriorStr = $desde->modify("-{$dias} days")->format('Y-m-d 00:00:00');
        $hastaAnteriorStr = $desde->modify('-1 day')->format('Y-m-d 23:59:59');

        $this->success([
            'desde' => $desde->format('Y-m-d'),
            'hasta' => $hasta->format('Y-m-d'),
            'resumen' => $model->resumenPeriodo($desdeStr, $hastaStr),
            'resumenAnterior' => $model->resumenPeriodo($desdeAnteriorStr, $hastaAnteriorStr),
            'porEstado' => $model->contarPorEstado($desdeStr, $hastaStr),
            'porPrioridad' => $model->contarPorPrioridad($desdeStr, $hastaStr),
            'tendencia' => $model->tendenciaRango($desdeStr, $hastaStr),
            'rendimientoAgentes' => $model->rendimientoPorAgente($desdeStr, $hastaStr),
        ]);
    }

    /** 'Y-m-d' -> DateTimeImmutable, o null si viene vacío/inválido (para poder usar un default). */
    private function parsearFecha(mixed $valor): ?\DateTimeImmutable
    {
        if (!is_string($valor) || $valor === '') {
            return null;
        }

        $fecha = \DateTimeImmutable::createFromFormat('!Y-m-d', $valor);

        return $fecha !== false ? $fecha : null;
    }

    public function comentarios(Request $request, array $params): void
    {
        $usuario = $this->requireAuth();
        $this->requireTicketAccess($usuario, (int) $params['id']);

        $comentarios = array_map(
            fn (array $c) => $this->formatComentario($c),
            (new TicketComentarioModel())->listByTicket((int) $params['id'])
        );

        $this->success($comentarios);
    }

    public function comentar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth();
        $ticket = $this->requireTicketAccess($usuario, (int) $params['id']);
        $this->assertEditable($ticket);

        $data = $request->all();
        $errores = array_filter([
            Validator::required($data, 'comentario'),
            Validator::maxLength($data, 'comentario', 4000),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        // 'CLIENTE' solo si de verdad lo es -- ADMIN y AGENTE quedan
        // como 'ADMIN' en autor_tipo (columna sin valor propio para
        // AGENTE, ver ticket_eventos/ticket_comentarios -- el nombre ya
        // identifica a la persona, y `assertNivelPermitido` es lo que
        // controla el acceso, no esta etiqueta).
        $autorTipo = $usuario['rol'] === 'CLIENTE' ? 'CLIENTE' : 'ADMIN';
        $comentario = (string) $request->input('comentario');
        (new TicketComentarioModel())->create(
            (int) $params['id'],
            $autorTipo,
            (string) $usuario['nombre'],
            $comentario
        );

        (new TicketEventoModel())->registrar(
            (int) $params['id'],
            'COMENTARIO',
            $autorTipo,
            (string) $usuario['nombre'],
            mb_substr($comentario, 0, 200)
        );

        $this->success(null, 201);
    }

    /** Historial del ticket -- timeline de todo lo que le pasó, incluido el escalamiento con motivo. */
    public function eventos(Request $request, array $params): void
    {
        $usuario = $this->requireAuth();
        $this->requireTicketAccess($usuario, (int) $params['id']);

        $eventos = array_map(
            fn (array $e) => $this->formatEvento($e),
            (new TicketEventoModel())->listByTicket((int) $params['id'])
        );

        $this->success($eventos);
    }

    public function adjuntos(Request $request, array $params): void
    {
        $usuario = $this->requireAuth();
        $this->requireTicketAccess($usuario, (int) $params['id']);

        $adjuntos = array_map(
            fn (array $a) => $this->formatAdjunto($a),
            (new TicketAdjuntoModel())->listByTicket((int) $params['id'])
        );

        $this->success($adjuntos);
    }

    public function subirAdjunto(Request $request, array $params): void
    {
        $usuario = $this->requireAuth();
        $ticket = $this->requireTicketAccess($usuario, (int) $params['id']);
        $this->assertEditable($ticket);

        $archivo = $request->file('archivo');
        if (!$archivo || $archivo['error'] !== UPLOAD_ERR_OK) {
            $this->fail('No se pudo subir el archivo.', 422);
        }

        if ($archivo['size'] > self::MAX_ADJUNTO_BYTES) {
            $this->fail('El archivo supera el tamaño máximo permitido (5 MB).', 422);
        }

        // Se valida el contenido real del archivo, no el "type" que manda el
        // navegador (spoofeable) ni la extensión del nombre original.
        $mimeReal = (new finfo(FILEINFO_MIME_TYPE))->file($archivo['tmp_name']);
        if (!array_key_exists($mimeReal, self::MIME_PERMITIDOS)) {
            $this->fail('Tipo de archivo no permitido. Se aceptan imágenes (jpg, png, webp, gif) y PDF.', 422);
        }

        $nombreAlmacenado = bin2hex(random_bytes(16)) . '.' . self::MIME_PERMITIDOS[$mimeReal];
        $destino = self::adjuntosPath() . '/' . $nombreAlmacenado;

        if (!move_uploaded_file($archivo['tmp_name'], $destino)) {
            $this->fail('No se pudo guardar el archivo.', 500);
        }

        $autorTipo = $usuario['rol'] === 'CLIENTE' ? 'CLIENTE' : 'ADMIN';
        $id = (new TicketAdjuntoModel())->create(
            (int) $params['id'],
            $autorTipo,
            (string) $usuario['nombre'],
            basename((string) $archivo['name']),
            $nombreAlmacenado,
            $mimeReal,
            (int) $archivo['size']
        );

        $this->success(['id' => $id], 201);
    }

    public function descargarAdjunto(Request $request, array $params): void
    {
        $usuario = $this->requireAuth();
        $this->requireTicketAccess($usuario, (int) $params['id']);

        $adjunto = (new TicketAdjuntoModel())->findById((int) $params['adjuntoId']);
        if (!$adjunto || (int) $adjunto['ticket_id'] !== (int) $params['id']) {
            $this->fail('Adjunto no encontrado.', 404);
        }

        $ruta = self::adjuntosPath() . '/' . $adjunto['nombre_almacenado'];
        if (!is_file($ruta)) {
            $this->fail('El archivo ya no está disponible.', 404);
        }

        header('Content-Type: ' . $adjunto['mime_type']);
        header('Content-Disposition: attachment; filename="' . basename((string) $adjunto['nombre_original']) . '"');
        header('Content-Length: ' . filesize($ruta));
        readfile($ruta);
        exit;
    }

    /**
     * Foto/título actuales del agente que se está asignando un ticket --
     * se consulta fresco en vez de confiar en `$_SESSION` (que puede
     * quedar vieja si el agente sube/cambia su foto después de loguearse,
     * y así el snapshot que queda en el ticket sería incorrecto).
     * @param array<string, mixed> $usuario
     * @return array{0: ?string, 1: ?string}
     */
    private function perfilAgenteActual(array $usuario): array
    {
        $perfil = (new AdministradorLocalModel())->findByEmail((string) $usuario['email']);

        // findByEmail() devuelve la URL completa (pensada para la sesión y
        // la API) -- acá se necesita solo el nombre de archivo, igual que
        // se guarda en usuarios_administradores.foto_url; formatTicket()
        // vuelve a anteponer el prefijo al leer el ticket.
        $foto = $perfil['fotoUrl'] ?? null;

        return [$foto ? basename($foto) : null, $perfil['titulo'] ?? null];
    }

    private function findTicketOrFail(TicketModel $model, int $id): array
    {
        $ticket = $model->findById($id);
        if (!$ticket) {
            $this->fail('Ticket no encontrado.', 404);
        }

        return $ticket;
    }

    /** Un cliente solo puede ver/comentar/adjuntar en sus propios tickets; el admin, en cualquiera; el agente, solo en los de su nivel. */
    private function requireTicketAccess(array $usuario, int $ticketId): array
    {
        $ticket = $this->findTicketOrFail(new TicketModel(), $ticketId);

        if ($usuario['rol'] === 'CLIENTE' && (int) $ticket['cliente_id'] !== (int) $usuario['id']) {
            $this->fail('No tenés acceso a este ticket.', 403);
        }
        $this->assertNivelPermitido($usuario, $ticket);

        return $ticket;
    }

    /**
     * Un agente solo puede ver/gestionar tickets de su propio nivel --
     * pedir uno de otro nivel (aunque el link nunca se muestre en la UI,
     * ej. por URL/API directa) corta acá con 403. No aplica a ADMIN
     * (ve todo) ni a CLIENTE (ya filtrado en `requireTicketAccess`).
     */
    private function assertNivelPermitido(array $usuario, array $ticket): void
    {
        if ($usuario['rol'] === 'AGENTE' && (int) $ticket['nivel'] !== (int) $usuario['nivel']) {
            $this->fail('No tenés acceso a tickets de otro nivel.', 403);
        }
    }

    /**
     * Un ticket RESUELTO o CERRADO queda bloqueado -- ni comentarios, ni
     * adjuntos, ni reasignar/escalar/pausar. La única acción válida
     * sobre un RESUELTO es `cerrar()`, que no pasa por acá (tiene su
     * propia validación de estado, es la excepción a esta regla).
     */
    private function assertEditable(array $ticket): void
    {
        if (in_array($ticket['estado'], ['RESUELTO', 'CERRADO', 'CANCELADO'], true)) {
            $this->fail('Este ticket está resuelto, cerrado o cancelado y bloqueado.', 409);
        }
    }

    private static function adjuntosPath(): string
    {
        $path = __DIR__ . '/../../storage/adjuntos';
        if (!is_dir($path)) {
            mkdir($path, 0777, true);
        }

        return $path;
    }

    private function formatTicket(array $t, bool $incluirCliente): array
    {
        $sla = Sla::calcular($t['prioridad'], $t['created_at'], $t['resuelto_at']);

        $formatted = [
            'id' => (int) $t['id'],
            'titulo' => $t['titulo'],
            'descripcion' => $t['descripcion'],
            'estado' => $t['estado'],
            'prioridad' => $t['prioridad'],
            'categoriaId' => $t['categoria_id'] !== null ? (int) $t['categoria_id'] : null,
            'categoriaNombre' => $t['categoria_nombre'] ?? null,
            'nivel' => (int) $t['nivel'],
            'asignadoAId' => $t['asignado_a_id'] !== null ? (int) $t['asignado_a_id'] : null,
            'asignadoANombre' => $t['asignado_a_nombre'],
            'asignadoAFotoUrl' => $t['asignado_a_foto'] ? "/assets/uploads/avatars/{$t['asignado_a_foto']}" : null,
            'asignadoATitulo' => $t['asignado_a_titulo'],
            'agenteOriginalId' => $t['agente_original_id'] !== null ? (int) $t['agente_original_id'] : null,
            'agenteOriginalNombre' => $t['agente_original_nombre'],
            'solucion' => $t['solucion'],
            'fechaCreacion' => $t['created_at'],
            'fechaResuelto' => $t['resuelto_at'],
            'fechaCerrado' => $t['cerrado_at'],
            'slaVencimiento' => $sla['vencimiento'],
            'slaEstado' => $sla['estado'],
        ];

        if ($incluirCliente) {
            $formatted['usuarioNombre'] = $t['cliente_nombre'];
            $formatted['usuarioEmail'] = $t['cliente_email'];
        }

        return $formatted;
    }

    private function formatComentario(array $c): array
    {
        return [
            'usuarioNombre' => $c['autor_nombre'],
            'fechaCreacion' => $c['created_at'],
            'comentario' => $c['comentario'],
        ];
    }

    private function formatAdjunto(array $a): array
    {
        return [
            'id' => (int) $a['id'],
            'nombreOriginal' => $a['nombre_original'],
            'autorNombre' => $a['autor_nombre'],
            'fechaCreacion' => $a['created_at'],
            'urlDescarga' => "/api/tickets/{$a['ticket_id']}/adjuntos/{$a['id']}/descargar",
        ];
    }

    private function formatEvento(array $e): array
    {
        return [
            'tipo' => $e['tipo'],
            'autorTipo' => $e['autor_tipo'],
            'autorNombre' => $e['autor_nombre'],
            'detalle' => $e['detalle'],
            'nivelAnterior' => $e['nivel_anterior'] !== null ? (int) $e['nivel_anterior'] : null,
            'nivelNuevo' => $e['nivel_nuevo'] !== null ? (int) $e['nivel_nuevo'] : null,
            'motivo' => $e['motivo'],
            'fecha' => $e['created_at'],
        ];
    }
}
