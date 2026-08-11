-- Reshape de usuarios_administradores en "Agentes de Soporte": ya no se
-- gestionan administradores genéricos (un solo admin alcanza), pero sí
-- hace falta poder crear agentes de Nivel 1/2/3 con perfil (apellido,
-- título, foto). El nivel acá es solo organizativo -- no fuerza el nivel
-- de escalamiento del ticket, que sigue siendo independiente.
ALTER TABLE usuarios_administradores
    ADD COLUMN apellido VARCHAR(150) NULL AFTER nombre,
    ADD COLUMN titulo VARCHAR(150) NULL AFTER apellido,
    ADD COLUMN nivel TINYINT UNSIGNED NULL AFTER titulo,
    ADD COLUMN foto_url VARCHAR(255) NULL AFTER nivel;

-- Snapshot de foto/título del agente al momento de asignarse un ticket --
-- mismo criterio que asignado_a_nombre (no es un JOIN en vivo: un ticket
-- viejo conserva la foto/título que tenía el agente en ese momento).
ALTER TABLE tickets
    ADD COLUMN asignado_a_foto VARCHAR(255) NULL AFTER asignado_a_nombre,
    ADD COLUMN asignado_a_titulo VARCHAR(150) NULL AFTER asignado_a_foto;
