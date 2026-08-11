<?php

declare(strict_types=1);

use App\Config\Env;
use App\Controllers\AdministradorController;
use App\Controllers\AuthController;
use App\Controllers\CategoriaController;
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

// En local, vendor/.env/storage viven un nivel arriba de public/ (ver
// .claude/launch.json, sirve con `-t public`). En el hosting de beta el
// usuario FTP no puede escribir fuera del docroot, así que ahí conviven
// acá adentro, protegidos por su propio .htaccess (ver public/.htaccess y
// docs/DEPLOY_BETA.md). Se detecta el layout por presencia de vendor/ para
// no depender de una variable de entorno que todavía no cargamos.
$baseDir = is_dir(__DIR__ . '/vendor') ? __DIR__ : dirname(__DIR__);

require $baseDir . '/vendor/autoload.php';

Env::load($baseDir . '/.env');

// En producción (APP_DEBUG != true) no mostrar errores de PHP a un
// visitante -- pueden filtrar rutas del servidor o detalles internos.
ini_set('display_errors', Env::get('APP_DEBUG') === 'true' ? '1' : '0');

$sessionsPath = $baseDir . '/storage/sessions';
if (!is_dir($sessionsPath)) {
    mkdir($sessionsPath, 0777, true);
}
session_save_path($sessionsPath);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    // HTTP local (dev) no tiene HTTPS; producción sí -- se detecta solo,
    // no hace falta un flag de entorno aparte para esto.
    'secure' => !empty($_SERVER['HTTPS']),
]);
session_name('tsc_session');

Response::securityHeaders();

$router = new Router();
$router->get('/api/health', [HealthController::class, 'index']);
$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->get('/api/auth/me', [AuthController::class, 'me']);
$router->post('/api/auth/logout', [AuthController::class, 'logout']);

$router->get('/api/tickets', [TicketController::class, 'index']);
$router->post('/api/tickets', [TicketController::class, 'store']);
$router->get('/api/tickets/resumen-nuevos', [TicketController::class, 'resumenNuevos']);
$router->get('/api/tickets/dashboard', [TicketController::class, 'dashboard']);
$router->patch('/api/tickets/{id}/asignar', [TicketController::class, 'asignar']);
$router->patch('/api/tickets/{id}/liberar', [TicketController::class, 'liberar']);
$router->patch('/api/tickets/{id}/estado', [TicketController::class, 'estado']);
$router->patch('/api/tickets/{id}/prioridad', [TicketController::class, 'prioridad']);
$router->patch('/api/tickets/{id}/escalar', [TicketController::class, 'escalar']);
$router->patch('/api/tickets/{id}/resolver', [TicketController::class, 'resolver']);
$router->get('/api/tickets/{id}/comentarios', [TicketController::class, 'comentarios']);
$router->post('/api/tickets/{id}/comentarios', [TicketController::class, 'comentar']);
$router->get('/api/tickets/{id}/adjuntos', [TicketController::class, 'adjuntos']);
$router->post('/api/tickets/{id}/adjuntos', [TicketController::class, 'subirAdjunto']);
$router->get('/api/tickets/{id}/adjuntos/{adjuntoId}/descargar', [TicketController::class, 'descargarAdjunto']);
$router->get('/api/tickets/{id}/eventos', [TicketController::class, 'eventos']);

$router->get('/api/usuarios', [UsuarioController::class, 'index']);
$router->post('/api/usuarios', [UsuarioController::class, 'store']);
$router->patch('/api/usuarios/{id}/estado', [UsuarioController::class, 'estado']);
$router->patch('/api/usuarios/{id}/reset-password', [UsuarioController::class, 'resetPassword']);

$router->get('/api/administradores', [AdministradorController::class, 'index']);
$router->post('/api/administradores', [AdministradorController::class, 'store']);
$router->patch('/api/administradores/{id}/estado', [AdministradorController::class, 'estado']);
$router->patch('/api/administradores/{id}/reset-password', [AdministradorController::class, 'resetPassword']);
$router->post('/api/administradores/{id}/foto', [AdministradorController::class, 'subirFoto']);

$router->get('/api/categorias', [CategoriaController::class, 'index']);
$router->post('/api/categorias', [CategoriaController::class, 'store']);
$router->patch('/api/categorias/{id}/estado', [CategoriaController::class, 'estado']);

$router->dispatch(Request::fromGlobals());
