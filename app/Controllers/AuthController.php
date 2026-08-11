<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Validator;
use App\Middleware\AuthMiddleware;
use App\Models\AdministradorLocalModel;
use App\Models\ClienteUsuarioModel;

/**
 * Login contra dos fuentes propias: administradores/agentes de soporte
 * (`usuarios_administradores`, creados desde nuestro panel) o clientes
 * (`usuarios_clientes`). La sesión es nativa de PHP (cookie httpOnly), no
 * hay JWT ni token en el cliente.
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

        $usuario = $this->buscarUsuario($email);

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
        // Perfil de agente (apellido/titulo/nivel/fotoUrl) -- solo lo
        // devuelve AdministradorLocalModel::findByEmail(); clientes no lo
        // tienen. Se guarda en sesión para que TicketController::asignar()
        // pueda snapshotearlo en el ticket sin una consulta aparte.
        foreach (['apellido', 'titulo', 'nivel', 'fotoUrl'] as $campo) {
            if (array_key_exists($campo, $usuario)) {
                $_SESSION['usuario'][$campo] = $usuario[$campo];
            }
        }

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

    /** @return array{id:int, nombre:string, email:string, rol:string, passwordHash:string}|null */
    private function buscarUsuario(string $email): ?array
    {
        $usuario = (new AdministradorLocalModel())->findByEmail($email);
        if ($usuario) {
            return $usuario;
        }

        return (new ClienteUsuarioModel())->findByEmail($email);
    }

    private function startSession(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }
}
