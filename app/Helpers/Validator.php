<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Validación genérica de entradas, reutilizable desde cualquier
 * controller. Cada método devuelve el mensaje de error o null si el
 * campo es válido, para que el controller arme la lista de errores.
 */
final class Validator
{
    /** @param array<string, mixed> $data */
    public static function required(array $data, string $field): ?string
    {
        $value = $data[$field] ?? null;
        return ($value === null || $value === '') ? "El campo \"{$field}\" es obligatorio." : null;
    }

    /** @param array<string, mixed> $data */
    public static function email(array $data, string $field): ?string
    {
        $value = $data[$field] ?? '';
        return filter_var($value, FILTER_VALIDATE_EMAIL) ? null : "El campo \"{$field}\" debe ser un email válido.";
    }

    /** @param array<string, mixed> $data */
    public static function maxLength(array $data, string $field, int $max): ?string
    {
        $value = (string) ($data[$field] ?? '');
        return mb_strlen($value) > $max ? "El campo \"{$field}\" no puede superar los {$max} caracteres." : null;
    }

    /** @param array<string, mixed> $data */
    public static function minLength(array $data, string $field, int $min): ?string
    {
        $value = (string) ($data[$field] ?? '');
        return mb_strlen($value) < $min ? "El campo \"{$field}\" debe tener al menos {$min} caracteres." : null;
    }

    /**
     * @param array<string, mixed> $data
     * @param array<int, string> $permitidos
     */
    public static function inArray(array $data, string $field, array $permitidos): ?string
    {
        $value = $data[$field] ?? null;
        return in_array($value, $permitidos, true) ? null : "El campo \"{$field}\" tiene un valor inválido.";
    }
}
