-- Reemplaza la lista de categorías por la pedida en el prompt (más
-- específica al rubro real de los tickets: cámaras, alarmas, control de
-- acceso, etc.). No se borran las viejas -- algunos tickets ya las
-- tienen asignadas (categorías en uso nunca se eliminan, solo se
-- desactivan, ver CategoriaController) -- se desactivan las que no
-- están en la lista nueva. "Impresoras" y "Otros" quedan tal cual, ya
-- estaban en ambas listas.
UPDATE categorias SET activo = 0
WHERE nombre IN ('Hardware', 'Software', 'Redes', 'Sistemas', 'Accesos', 'SAP', 'Correo');

INSERT INTO categorias (nombre) VALUES
    ('Wi-Fi'), ('Cámaras'), ('Computadoras'), ('Alarma'), ('Control de Acceso');
