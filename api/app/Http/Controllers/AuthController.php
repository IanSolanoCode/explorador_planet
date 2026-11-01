<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Gestiona el ciclo de vida de la autenticación por tokens Bearer.
 *
 * Registro y login emiten un token nuevo; logout revoca solo el token
 * de la petición actual y /me devuelve el usuario autenticado.
 */
class AuthController extends Controller
{
    /**
     * Crea un usuario estándar y devuelve su primer token de API.
     *
     * El rol no se acepta desde la petición: la base de datos lo asigna
     * como "user" y queda fuera de los campos fillable.
     */
    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
        ]);

        // Recupera el rol por defecto que asigna la base de datos.
        $user->refresh();

        // Expiración explícita de 30 días, además de la configuración global de Sanctum.
        $token = $user->createToken('api', ['*'], now()->addDays(30))->plainTextToken;

        return response()->json([
            'data' => [
                'user' => UserResource::make($user),
                'token' => $token,
            ],
        ], 201);
    }

    /**
     * Valida las credenciales y emite un token nuevo.
     *
     * El error es genérico para no revelar si el email está registrado.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            // Mismo mensaje para email inexistente y contraseña incorrecta.
            throw ValidationException::withMessages([
                'email' => ['Credenciales incorrectas.'],
            ]);
        }

        // La expiración explícita evita depender solo de la configuración global.
        $token = $user->createToken('api', ['*'], now()->addDays(30))->plainTextToken;

        return response()->json([
            'data' => [
                'user' => UserResource::make($user),
                'token' => $token,
            ],
        ]);
    }

    /**
     * Revoca únicamente el token Bearer usado en esta petición.
     */
    public function logout(Request $request): Response
    {
        // No se eliminan otros tokens del usuario.
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    /**
     * Devuelve el usuario asociado al token actual.
     */
    public function me(Request $request): UserResource
    {
        return UserResource::make($request->user());
    }
}
