<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Router: matchea método + path contra un handler [ControllerClass,
 * 'metodo']. Los paths pueden llevar segmentos dinámicos `{nombre}`
 * (ej. `/api/tickets/{id}/estado`), que se pasan al método del
 * controller como segundo argumento (`array $params`).
 */
final class Router
{
    /** @var array<string, array<string, array{0: class-string, 1: string}>> */
    private array $routes = [];

    /** @param array{0: class-string, 1: string} $handler */
    public function get(string $path, array $handler): void
    {
        $this->routes['GET'][$path] = $handler;
    }

    /** @param array{0: class-string, 1: string} $handler */
    public function post(string $path, array $handler): void
    {
        $this->routes['POST'][$path] = $handler;
    }

    /** @param array{0: class-string, 1: string} $handler */
    public function patch(string $path, array $handler): void
    {
        $this->routes['PATCH'][$path] = $handler;
    }

    public function dispatch(Request $request): void
    {
        $methodRoutes = $this->routes[$request->method()] ?? [];

        foreach ($methodRoutes as $pattern => $handler) {
            $params = $this->match($pattern, $request->path());
            if ($params === null) {
                continue;
            }

            [$controllerClass, $method] = $handler;
            (new $controllerClass())->$method($request, $params);
            return;
        }

        Response::error('Ruta no encontrada.', 404);
    }

    /** @return array<string, string>|null */
    private function match(string $pattern, string $path): ?array
    {
        preg_match_all('#\{([a-zA-Z_]+)\}#', $pattern, $names);
        $regex = '#^' . preg_replace('#\{[a-zA-Z_]+\}#', '([^/]+)', $pattern) . '$#';

        if (!preg_match($regex, $path, $matches)) {
            return null;
        }

        return array_combine($names[1], array_slice($matches, 1));
    }
}
