<?php

declare(strict_types=1);

namespace App\Config;

use PDO;
use PDOException;
use RuntimeException;

/**
 * Fábrica de conexiones PDO a MySQL, cacheadas por nombre — una conexión
 * reutilizable por request y por base. `'app'` (la de Grupo TSC) lee
 * `DB_*`; cualquier otro nombre lee `<NOMBRE>_DB_*` (ej. `'freescout'` lee
 * `FREESCOUT_DB_*`), para conectar de forma aislada a la base de FreeScout.
 */
final class Database
{
    /** @var array<string, PDO> */
    private static array $connections = [];

    public static function getConnection(string $name = 'app'): PDO
    {
        if (isset(self::$connections[$name])) {
            return self::$connections[$name];
        }

        $prefix = $name === 'app' ? 'DB' : strtoupper($name) . '_DB';

        $host = Env::get("{$prefix}_HOST", '127.0.0.1');
        $port = Env::get("{$prefix}_PORT", '3306');
        $database = Env::get("{$prefix}_DATABASE", '');
        $charset = Env::get("{$prefix}_CHARSET", 'utf8mb4');
        $username = Env::get("{$prefix}_USERNAME", '');
        $password = Env::get("{$prefix}_PASSWORD", '');

        $dsn = "mysql:host={$host};port={$port};dbname={$database};charset={$charset}";

        try {
            self::$connections[$name] = new PDO($dsn, $username, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            throw new RuntimeException("No se pudo conectar a la base de datos \"{$name}\": " . $e->getMessage(), previous: $e);
        }

        return self::$connections[$name];
    }
}
