<?php

declare(strict_types=1);

use App\Config\Env;
use App\Controllers\AuthController;
use App\Controllers\HealthController;
use App\Controllers\TicketController;
use App\Controllers\UsuarioController;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;

// El servidor embebido de PHP (`php -S`) manda TODAS las requests al script
// de router indicado en el comando; a diferencia de Apache/Nginx, no sirve
// solo los archivos estáticos existentes. Si el archivo pedido existe de
// verdad (assets, index.html, etc.), lo dejamos servir tal cual devolviendo
// false. No afecta a un deploy real detrás de Apache/Nginx (PHP_SAPI ahí
// nunca es 'cli-server').
if (PHP_SAPI === 'cli-server') {
    $requestedPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $requestedFile = __DIR__ . $requestedPath;

    if (is_dir($requestedFile)) {
        // `return false` le pasa el control al servidor embebido, que
        // vuelve a resolver el archivo a partir de REQUEST_URI original (no
        // a partir de esta variable) y no sabe hacer directory-index — para
        // "/" serviría un body vacío. Se sirve index.html directo acá.
        $indexFile = rtrim($requestedFile, '/') . '/index.html';
        if (is_file($indexFile)) {
            header('Content-Type: text/html; charset=UTF-8');
            readfile($indexFile);
            exit;
        }
    } elseif ($requestedFile !== __FILE__ && is_file($requestedFile)) {
        return false;
    } elseif (!str_starts_with($requestedPath, '/api/') && is_file($requestedFile . '.html')) {
        // URL "limpia" (ej. /login en vez de /login.html).
        header('Content-Type: text/html; charset=UTF-8');
        readfile($requestedFile . '.html');
        exit;
    }
}

require __DIR__ . '/../vendor/autoload.php';

Env::load(__DIR__ . '/../.env');

$sessionsPath = __DIR__ . '/../storage/sessions';
if (!is_dir($sessionsPath)) {
    mkdir($sessionsPath, 0777, true);
}
session_save_path($sessionsPath);
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
session_name('tsc_session');

Response::securityHeaders();

$router = new Router();
$router->get('/api/health', [HealthController::class, 'index']);
$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->get('/api/auth/me', [AuthController::class, 'me']);
$router->post('/api/auth/logout', [AuthController::class, 'logout']);

$router->get('/api/tickets', [TicketController::class, 'index']);
$router->post('/api/tickets', [TicketController::class, 'store']);
$router->patch('/api/tickets/{id}/asignar', [TicketController::class, 'asignar']);
$router->patch('/api/tickets/{id}/liberar', [TicketController::class, 'liberar']);
$router->patch('/api/tickets/{id}/estado', [TicketController::class, 'estado']);
$router->patch('/api/tickets/{id}/prioridad', [TicketController::class, 'prioridad']);
$router->get('/api/tickets/{id}/comentarios', [TicketController::class, 'comentarios']);
$router->post('/api/tickets/{id}/comentarios', [TicketController::class, 'comentar']);

$router->get('/api/usuarios', [UsuarioController::class, 'index']);
$router->post('/api/usuarios', [UsuarioController::class, 'store']);
$router->patch('/api/usuarios/{id}/estado', [UsuarioController::class, 'estado']);
$router->patch('/api/usuarios/{id}/reset-password', [UsuarioController::class, 'resetPassword']);

$router->dispatch(Request::fromGlobals());
