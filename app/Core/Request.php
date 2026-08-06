<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Envoltorio de la petición HTTP entrante: método, path y body JSON.
 */
final class Request
{
    /** @var array<string, mixed> */
    private array $body;

    public function __construct(
        private readonly string $method,
        private readonly string $path,
    ) {
        $this->body = $this->parseBody();
    }

    public static function fromGlobals(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

        return new self($method, rtrim($path, '/') ?: '/');
    }

    public function method(): string
    {
        return $this->method;
    }

    public function path(): string
    {
        return $this->path;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    /** Lee un parámetro de query string (`$_GET`) — paginación, filtros. */
    public function query(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        return $this->body;
    }

    /** @return array<string, mixed> */
    private function parseBody(): array
    {
        $raw = file_get_contents('php://input');
        if (!$raw) {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}
