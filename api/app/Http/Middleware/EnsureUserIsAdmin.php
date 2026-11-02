<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restringe el acceso a usuarios con rol admin.
 *
 * Debe ejecutarse después de auth:sanctum para que un invitado reciba 401
 * antes de comprobar el rol.
 */
class EnsureUserIsAdmin
{
    /**
     * Continúa la petición solo si el usuario autenticado es administrador.
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->isAdmin()) {
            return response()->json([
                'message' => 'Solo administradores.',
            ], 403);
        }

        return $next($request);
    }
}
