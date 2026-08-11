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
 * Tickets de soporte: creación/seguimiento (cliente) y gestión (admin —
 * adjudicar/liberar, estado, prioridad, escalar nivel, resolver,
 * comentar, adjuntar archivos). El cliente solo puede ver/comentar/
 * adjuntar en sus propios tickets (`requireTicketAccess`); el admin puede
 * actuar sobre cualquiera, salvo que ya esté RESUELTO (`assertNotResuelto`
 * — bloqueado por completo, ver docs/BACKEND_RESET_REPORT.md).
 */
final class TicketController extends BaseController
{
    private const ESTADOS_EDITABLES = ['NEW', 'EN_PROCESO'];
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

        if ($usuario['rol'] === 'ADMIN') {
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

    /** Categoría opcional al crear un ticket -- si viene, tiene que existir y estar activa. */
    private function resolveCategoriaId(mixed $categoriaId): ?int
    {
        if ($categoriaId === null || $categoriaId === '') {
            return null;
        }

        $categoria = (new CategoriaModel())->findById((int) $categoriaId);
        if (!$categoria || !$categoria['activo']) {
            $this->fail('Categoría inválida.', 422);
        }

        return (int) $categoriaId;
    }

    public function asignar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNotResuelto($ticket);

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
        $usuario = $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNotResuelto($ticket);

        $model->liberar((int) $params['id']);
        (new TicketEventoModel())->registrar((int) $params['id'], 'LIBERADO', 'ADMIN', (string) $usuario['nombre'], 'Se liberó el ticket.');
        $this->success(null);
    }

    public function estado(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNotResuelto($ticket);

        $data = $request->all();
        // RESUELTO no se setea acá -- eso pasa por resolver(), que exige una solución.
        $error = Validator::inArray($data, 'estado', self::ESTADOS_EDITABLES);
        if ($error) {
            $this->fail($error, 422);
        }

        $nuevoEstado = (string) $request->input('estado');
        $model->updateEstado((int) $params['id'], $nuevoEstado);
        // `detalle` guarda el código crudo (ej. "EN_PROCESO") -- el frontend
        // ya tiene el mapa ESTADOS para traducirlo, no duplicarlo acá.
        (new TicketEventoModel())->registrar((int) $params['id'], 'ESTADO', 'ADMIN', (string) $usuario['nombre'], $nuevoEstado);
        $this->success(null);
    }

    public function prioridad(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNotResuelto($ticket);

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
        $usuario = $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNotResuelto($ticket);

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
        $usuario = $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $ticket = $this->findTicketOrFail($model, (int) $params['id']);
        $this->assertNotResuelto($ticket);

        $data = $request->all();
        $error = Validator::required($data, 'solucion');
        if ($error) {
            $this->fail($error, 422);
        }

        $model->resolver((int) $params['id'], (string) $request->input('solucion'));
        (new TicketEventoModel())->registrar((int) $params['id'], 'RESUELTO', 'ADMIN', (string) $usuario['nombre'], 'Ticket resuelto.');
        $this->success(null);
    }

    /** Cantidad de tickets NEW por nivel, para el badge de cada pestaña. */
    public function resumenNuevos(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $this->success((new TicketModel())->contarNuevosPorNivel());
    }

    /** Contadores + "Atención requerida" + "Actividad reciente" para el dashboard (sección "Inicio" del panel admin). */
    public function dashboard(Request $request): void
    {
        $usuario = $this->requireAuth(['ADMIN']);
        $model = new TicketModel();

        $counts = $model->contarDashboard((int) $usuario['id']);

        // SLA en riesgo/vencido -- reusa Sla::calcular(), no duplica el
        // cálculo de plazos acá.
        $slaEnRiesgo = 0;
        $slaVencido = 0;
        foreach ($model->listNoResueltosParaSla() as $t) {
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
        foreach ($model->listAtencionRequerida(50) as $row) {
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
            (new TicketEventoModel())->listRecientes(15)
        );

        $counts['porEstado'] = $model->contarPorEstado();
        $counts['porPrioridad'] = $model->contarPorPrioridad();
        $counts['tendencia'] = $model->tendenciaUltimosDias(7);

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
        $this->assertNotResuelto($ticket);

        $data = $request->all();
        $errores = array_filter([
            Validator::required($data, 'comentario'),
            Validator::maxLength($data, 'comentario', 4000),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $autorTipo = $usuario['rol'] === 'ADMIN' ? 'ADMIN' : 'CLIENTE';
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
        $this->assertNotResuelto($ticket);

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

        $autorTipo = $usuario['rol'] === 'ADMIN' ? 'ADMIN' : 'CLIENTE';
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

    /** Un cliente solo puede ver/comentar/adjuntar en sus propios tickets; el admin, en cualquiera. */
    private function requireTicketAccess(array $usuario, int $ticketId): array
    {
        $ticket = $this->findTicketOrFail(new TicketModel(), $ticketId);

        if ($usuario['rol'] === 'CLIENTE' && (int) $ticket['cliente_id'] !== (int) $usuario['id']) {
            $this->fail('No tenés acceso a este ticket.', 403);
        }

        return $ticket;
    }

    /** Un ticket RESUELTO queda bloqueado por completo -- ni comentarios, ni adjuntos, ni reasignar/reabrir. */
    private function assertNotResuelto(array $ticket): void
    {
        if ($ticket['estado'] === 'RESUELTO') {
            $this->fail('Este ticket está resuelto y bloqueado.', 409);
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
            'solucion' => $t['solucion'],
            'fechaCreacion' => $t['created_at'],
            'fechaResuelto' => $t['resuelto_at'],
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
