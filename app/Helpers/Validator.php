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
     * Política de contraseñas (para cualquier cuenta -- cliente, agente o
     * admin): mínimo 8 caracteres, al menos una mayúscula y al menos un
     * carácter especial. Se usa siempre que se fija una contraseña a
     * mano (alta de cuenta o reseteo) -- no hay generación aleatoria en
     * ningún lado, así que esta es la única puerta de entrada.
     * @param array<string, mixed> $data
     */
    public static function password(array $data, string $field): ?string
    {
        $value = (string) ($data[$field] ?? '');
        if (mb_strlen($value) < 8) {
            return "El campo \"{$field}\" debe tener al menos 8 caracteres.";
        }
        if (!preg_match('/[A-Z]/', $value)) {
            return "El campo \"{$field}\" debe tener al menos una letra mayúscula.";
        }
        if (!preg_match('/[^A-Za-z0-9]/', $value)) {
            return "El campo \"{$field}\" debe tener al menos un carácter especial.";
        }
        return null;
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
