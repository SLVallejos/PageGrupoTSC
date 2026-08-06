<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;

/**
 * Lee usuarios de staff (agentes/admins) directamente de la base de
 * FreeScout, de solo lectura. Ver docs/freescout-integration-strategy.md:
 * la versión core de FreeScout no expone API/API-keys ni SSO, así que la
 * integración es una lectura acotada de `freescout.users` (el usuario MySQL
 * `grupotsc_app` solo tiene SELECT sobre esa tabla puntual).
 *
 * FreeScout guarda `password` con el hash bcrypt por defecto de Laravel
 * (`Hash::make()`), 100% compatible con `password_verify()` de PHP.
 */
final class FreeScoutService
{
    private const ROLE_ADMIN = 2;

    /**
     * Solo devuelve staff con rol admin: un agente FreeScout sin rol admin
     * no tiene un rol equivalente definido en Grupo TSC (no es "cliente" ni
     * "admin" acá), así que se trata como no encontrado.
     *
     * @return array{id:int, nombre:string, email:string, rol:string, passwordHash:string}|null
     */
    public function getAdminByEmail(string $email): ?array
    {
        $stmt = Database::getConnection('freescout')->prepare(
            'SELECT id, first_name, last_name, email, password, role, locked FROM users WHERE email = ? LIMIT 1'
        );
        $stmt->execute([$email]);
        $row = $stmt->fetch();

        if (!$row || (int) $row['locked'] === 1 || (int) $row['role'] !== self::ROLE_ADMIN) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'nombre' => trim("{$row['first_name']} {$row['last_name']}"),
            'email' => $row['email'],
            'rol' => 'ADMIN',
            'passwordHash' => $row['password'],
        ];
    }
}
