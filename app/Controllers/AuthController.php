<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Validator;
use App\Middleware\AuthMiddleware;
use App\Models\ClienteUsuarioModel;
use App\Services\FreeScoutService;

/**
 * Login contra dos fuentes distintas (ver docs/freescout-integration-strategy.md):
 * admins reales de FreeScout (`FreeScoutService`) o clientes propios de
 * Grupo TSC (`ClienteUsuarioModel`). La sesión es nativa de PHP (cookie
 * httpOnly), no hay JWT ni token en el cliente.
 */
final class AuthController extends BaseController
{
    public function login(Request $request): void
    {
        $data = $request->all();

        $errores = array_filter([
            Validator::required($data, 'email'),
            Validator::email($data, 'email'),
            Validator::required($data, 'password'),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $email = (string) $request->input('email');
        $password = (string) $request->input('password');

        $usuario = (new FreeScoutService())->getAdminByEmail($email)
            ?? (new ClienteUsuarioModel())->findByEmail($email);

        if (!$usuario || !password_verify($password, $usuario['passwordHash'])) {
            $this->fail('Email o contraseña incorrectos.', 401);
        }

        $this->startSession();
        session_regenerate_id(true);
        $_SESSION['usuario'] = [
            'id' => $usuario['id'],
            'nombre' => $usuario['nombre'],
            'email' => $usuario['email'],
            'rol' => $usuario['rol'],
        ];

        $this->success(['usuario' => $_SESSION['usuario']]);
    }

    public function me(Request $request): void
    {
        $usuario = (new AuthMiddleware())->handle();
        if (!$usuario) {
            $this->fail('No hay sesión activa.', 401);
        }

        $this->success(['usuario' => $usuario]);
    }

    public function logout(Request $request): void
    {
        $this->startSession();
        $_SESSION = [];
        session_destroy();

        $this->success(null);
    }

    private function startSession(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }
}
