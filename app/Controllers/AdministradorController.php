<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Helpers\Validator;
use App\Models\AdministradorLocalModel;
use App\Models\UsuarioTablaModel;
use finfo;
use PDOException;

/**
 * Gestión de "Agentes de Soporte" (Nivel 1/2/3) -- reshape de lo que antes
 * era "administradores" genéricos: un solo super-admin de arranque ya
 * alcanza para eso, lo que hace falta es dar de alta agentes por nivel,
 * con perfil (apellido, título, foto).
 */
final class AdministradorController extends GestionUsuariosController
{
    private const MAX_FOTO_BYTES = 2 * 1024 * 1024; // 2 MB
    private const MIME_PERMITIDOS = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    protected function modelo(): UsuarioTablaModel
    {
        return new AdministradorLocalModel();
    }

    protected function etiqueta(): string
    {
        return 'técnico';
    }

    protected function camposExtra(array $u): array
    {
        return [
            'apellido' => $u['apellido'],
            'titulo' => $u['titulo'],
            'nivel' => $u['nivel'] !== null ? (int) $u['nivel'] : null,
            'rol' => $u['rol'],
            'fotoUrl' => $u['foto_url'] ? "/assets/uploads/avatars/{$u['foto_url']}" : null,
        ];
    }

    /**
     * Reemplaza por completo el `store()` genérico -- un agente necesita
     * apellido/título/nivel además de nombre/email/password, así que ya
     * no comparte la validación/creación del padre.
     */
    public function store(Request $request): void
    {
        $this->requireAuth(['ADMIN']);
        $data = $request->all();
        // El <select> del form manda "2" (string); un caller JSON directo
        // podría mandar 2 (número) -- se normaliza para que
        // Validator::inArray() (comparación estricta) no dependa de eso.
        if (isset($data['nivel'])) {
            $data['nivel'] = (string) $data['nivel'];
        }

        $errores = array_filter([
            Validator::required($data, 'nombre'),
            Validator::maxLength($data, 'nombre', 150),
            Validator::required($data, 'apellido'),
            Validator::maxLength($data, 'apellido', 150),
            Validator::required($data, 'titulo'),
            Validator::maxLength($data, 'titulo', 150),
            Validator::required($data, 'nivel'),
            Validator::inArray($data, 'nivel', ['1', '2', '3']),
            Validator::required($data, 'email'),
            Validator::email($data, 'email'),
            Validator::required($data, 'password'),
            Validator::password($data, 'password'),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $hash = password_hash((string) $request->input('password'), PASSWORD_BCRYPT);

        try {
            $id = (new AdministradorLocalModel())->createAgente(
                (string) $request->input('nombre'),
                (string) $request->input('apellido'),
                (string) $request->input('titulo'),
                (int) $request->input('nivel'),
                (string) $request->input('email'),
                $hash
            );
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                $this->fail('Ya existe un agente con ese email.', 409);
            }
            throw $e;
        }

        $this->success(['id' => $id], 201);
    }

    /**
     * "Mi perfil" -- autoedición de nombre/apellido únicamente (título/
     * nivel/email siguen siendo del resorte del admin desde el roster de
     * Agentes de Soporte). Nunca toma el id de la URL/body -- siempre es
     * la propia sesión, así que no hay forma de editar el perfil de otro.
     */
    public function actualizarPerfil(Request $request): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $data = $request->all();

        $errores = array_filter([
            Validator::required($data, 'nombre'),
            Validator::maxLength($data, 'nombre', 150),
            Validator::required($data, 'apellido'),
            Validator::maxLength($data, 'apellido', 150),
        ]);
        if ($errores) {
            $this->fail(implode(' ', $errores), 422);
        }

        $nombre = (string) $request->input('nombre');
        $apellido = (string) $request->input('apellido');
        (new AdministradorLocalModel())->updatePerfil((int) $usuario['id'], $nombre, $apellido);

        // Refresca la sesión -- si no, el "Hola, {nombre}" del header
        // quedaría con el nombre viejo hasta el próximo login.
        $_SESSION['usuario']['nombre'] = $nombre;
        $_SESSION['usuario']['apellido'] = $apellido;

        $this->success(['nombre' => $nombre, 'apellido' => $apellido]);
    }

    /**
     * Foto de perfil del agente -- a diferencia de los adjuntos de ticket
     * (`TicketController::subirAdjunto()`, mismo patrón de validación de
     * MIME real), se guarda dentro de `public/` porque una foto de perfil
     * está pensada para mostrarse siempre (tarjetas de ticket, roster),
     * no para quedar detrás de un control de acceso por ticket. Un admin
     * puede subir la foto de cualquier agente desde el roster; un agente
     * (autoedición desde "Mi perfil") solo la suya.
     */
    public function subirFoto(Request $request, array $params): void
    {
        $usuario = $this->requireAuth(['ADMIN', 'AGENTE']);
        $model = new AdministradorLocalModel();
        $id = (int) $params['id'];

        if ($usuario['rol'] === 'AGENTE' && $id !== (int) $usuario['id']) {
            $this->fail('No podés cambiar la foto de otro agente.', 403);
        }

        $archivo = $request->file('foto');
        if (!$archivo || $archivo['error'] !== UPLOAD_ERR_OK) {
            $this->fail('No se pudo subir la foto.', 422);
        }

        if ($archivo['size'] > self::MAX_FOTO_BYTES) {
            $this->fail('La foto supera el tamaño máximo permitido (2 MB).', 422);
        }

        $mimeReal = (new finfo(FILEINFO_MIME_TYPE))->file($archivo['tmp_name']);
        if (!array_key_exists($mimeReal, self::MIME_PERMITIDOS)) {
            $this->fail('Formato de imagen no permitido. Se aceptan JPG, PNG o WEBP.', 422);
        }

        $nombreArchivo = bin2hex(random_bytes(16)) . '.' . self::MIME_PERMITIDOS[$mimeReal];
        $destino = self::avatarsPath() . '/' . $nombreArchivo;

        if (!move_uploaded_file($archivo['tmp_name'], $destino)) {
            $this->fail('No se pudo guardar la foto.', 500);
        }

        // Borra la foto anterior si había -- evita acumular archivos
        // huérfanos cada vez que un agente cambia de foto. Si el archivo ya
        // no está (borrado a mano, etc.) no debe tumbar la subida nueva.
        $fotoAnterior = $model->fotoActual($id);
        if ($fotoAnterior) {
            $rutaAnterior = self::avatarsPath() . '/' . $fotoAnterior;
            if (is_file($rutaAnterior)) {
                @unlink($rutaAnterior);
            }
        }

        $model->updateFoto($id, $nombreArchivo);
        $this->success(['fotoUrl' => "/assets/uploads/avatars/{$nombreArchivo}"]);
    }

    /**
     * `assets/` vive en `<raíz>/public/assets` en local, pero directo en
     * `<raíz>/assets` en la beta (ahí no hay carpeta `public/` aparte, ver
     * docs/DEPLOY_BETA.md) -- mismo criterio de detección que ya usa
     * `public/index.php` (`$baseDir`), pero comprobando `public/` en vez
     * de `vendor/` porque acá se arranca desde `app/Controllers/`, no
     * desde el docroot.
     */
    private static function docRoot(): string
    {
        $raiz = __DIR__ . '/../..';

        // Chequea el archivo `index.php` puntual, no solo el directorio
        // `public/` -- un intento de subida fallido antes de este fix dejó
        // una carpeta `public/assets/...` huérfana en la beta (mkdir
        // recursivo con la ruta vieja), que haría creer que hay layout
        // local si solo se mirara `is_dir()`.
        return is_file($raiz . '/public/index.php') ? $raiz . '/public' : $raiz;
    }

    private static function avatarsPath(): string
    {
        $path = self::docRoot() . '/assets/uploads/avatars';
        if (!is_dir($path)) {
            mkdir($path, 0777, true);
        }

        return $path;
    }
}
