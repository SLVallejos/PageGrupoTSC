-- Tabla de clientes propia de Grupo TSC, separada de FreeScout: la versión
-- core/gratuita de FreeScout no guarda contraseña para la tabla `customers`
-- (loguearse como cliente es una función del módulo pago "Customer Portal",
-- no instalado). Ver docs/freescout-integration-strategy.md.

CREATE TABLE IF NOT EXISTS usuarios_clientes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
