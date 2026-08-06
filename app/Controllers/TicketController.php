<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Validator;
use App\Models\TicketComentarioModel;
use App\Models\TicketModel;

/**
 * Tickets de soporte: creación/seguimiento (cliente) y gestión
 * (admin — tomar/liberar, estado, prioridad, comentar). El cliente solo
 * puede ver/comentar sus propios tickets (`requireTicketAccess`); el admin
 * puede actuar sobre cualquiera.
 */
final class TicketController extends BaseController
{
    private const ESTADOS = ['ABIERTO', 'EN_CURSO', 'RESUELTO', 'CERRADO'];
    private const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];
    private const PAGE_SIZE = 10;

    public function index(Request $request): void
    {
        $usuario = $this->requireAuth();
        $page = max(1, (int) $request->query('page', 1));

        $model = new TicketModel();

        if ($usuario['rol'] === 'ADMIN') {
            $filtros = array_filter([
                'estado' => $request->query('estado'),
                'prioridad' => $request->query('prioridad'),
                'asignadoAId' => $request->query('asignadoAId') ? (int) $request->query('asignadoAId') : null,
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

        $id = (new TicketModel())->create(
            (int) $usuario['id'],
            (string) $request->input('titulo'),
            (string) $request->input('descripcion'),
            (string) $request->input('prioridad')
        );

        $this->success(['id' => $id], 201);
    }

    public function asignar(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $this->findTicketOrFail($model, (int) $params['id']);

        $model->asignar((int) $params['id'], (int) $usuario['id'], (string) $usuario['nombre']);
        $this->success(null);
    }

    public function liberar(Request $request, array $params): void
    {
        $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $this->findTicketOrFail($model, (int) $params['id']);

        $model->liberar((int) $params['id']);
        $this->success(null);
    }

    public function estado(Request $request, array $params): void
    {
        $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $this->findTicketOrFail($model, (int) $params['id']);

        $data = $request->all();
        $error = Validator::inArray($data, 'estado', self::ESTADOS);
        if ($error) {
            $this->fail($error, 422);
        }

        $model->updateEstado((int) $params['id'], (string) $request->input('estado'));
        $this->success(null);
    }

    public function prioridad(Request $request, array $params): void
    {
        $this->requireAuth(['ADMIN']);
        $model = new TicketModel();
        $this->findTicketOrFail($model, (int) $params['id']);

        $data = $request->all();
        $error = Validator::inArray($data, 'prioridad', self::PRIORIDADES);
        if ($error) {
            $this->fail($error, 422);
        }

        $model->updatePrioridad((int) $params['id'], (string) $request->input('prioridad'));
        $this->success(null);
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
        $this->requireTicketAccess($usuario, (int) $params['id']);

        $data = $request->all();
        $errores = array_filter([
            Validator::required($data, 'comentario'),
            Validator::maxLength($data, 'comentario', 4000),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $autorTipo = $usuario['rol'] === 'ADMIN' ? 'ADMIN' : 'CLIENTE';
        (new TicketComentarioModel())->create(
            (int) $params['id'],
            $autorTipo,
            (string) $usuario['nombre'],
            (string) $request->input('comentario')
        );

        $this->success(null, 201);
    }

    private function findTicketOrFail(TicketModel $model, int $id): array
    {
        $ticket = $model->findById($id);
        if (!$ticket) {
            $this->fail('Ticket no encontrado.', 404);
        }

        return $ticket;
    }

    /** Un cliente solo puede ver/comentar sus propios tickets; el admin, cualquiera. */
    private function requireTicketAccess(array $usuario, int $ticketId): array
    {
        $ticket = $this->findTicketOrFail(new TicketModel(), $ticketId);

        if ($usuario['rol'] === 'CLIENTE' && (int) $ticket['cliente_id'] !== (int) $usuario['id']) {
            $this->fail('No tenés acceso a este ticket.', 403);
        }

        return $ticket;
    }

    private function formatTicket(array $t, bool $incluirCliente): array
    {
        $formatted = [
            'id' => (int) $t['id'],
            'titulo' => $t['titulo'],
            'descripcion' => $t['descripcion'],
            'estado' => $t['estado'],
            'prioridad' => $t['prioridad'],
            'asignadoAId' => $t['asignado_a_freescout_id'] !== null ? (int) $t['asignado_a_freescout_id'] : null,
            'asignadoANombre' => $t['asignado_a_nombre'],
            'fechaCreacion' => $t['created_at'],
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
}
