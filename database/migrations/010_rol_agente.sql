-- Separa el rol "Agente de Soporte" del rol "Administrador": hasta ahora
-- cualquier fila de usuarios_administradores actuaba como ADMIN completo
-- (podía gestionar usuarios/agentes/categorías/ver estadísticas globales).
-- A partir de acá los agentes (creados con nivel asignado) son un rol
-- propio, restringido, y el nivel deja de ser solo organizativo: el
-- backend ahora exige que un agente solo pueda ver/gestionar tickets de
-- su propio nivel.
ALTER TABLE usuarios_administradores
    ADD COLUMN rol ENUM('ADMIN','AGENTE') NOT NULL DEFAULT 'AGENTE' AFTER nivel;

-- El super-admin de arranque no tiene nivel asignado (columna NULL desde
-- 008_agentes_soporte.sql) -- se identifica así, sin depender de un id fijo.
UPDATE usuarios_administradores SET rol = 'ADMIN' WHERE nivel IS NULL;
UPDATE usuarios_administradores SET rol = 'AGENTE' WHERE nivel IS NOT NULL;
