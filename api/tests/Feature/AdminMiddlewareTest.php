<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Comprueba el middleware admin con una ruta temporal definida dentro del test.
 *
 * La ruta no se registra en routes/api.php. DatabaseTransactions evita dejar
 * usuarios o tokens de prueba en la base de datos.
 */
class AdminMiddlewareTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Define la ruta protegida que solo existe durante este test.
     */
    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['auth:sanctum', 'admin'])
            ->get('/api/test/admin-only', fn () => response()->json(['ok' => true]));
    }

    /**
     * La suite debe ejecutarse contra la base de test, nunca contra producción.
     */
    public function test_tests_run_against_the_test_database(): void
    {
        $this->assertSame('explorador_planet_test', DB::connection()->getDatabaseName());
    }

    /**
     * Sin token, auth:sanctum debe responder 401 antes de comprobar el rol.
     */
    public function test_guest_receives_401(): void
    {
        $this->getJson('/api/test/admin-only')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    /**
     * Un usuario normal debe recibir 403 con el mensaje del middleware.
     */
    public function test_normal_user_receives_403(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/test/admin-only')
            ->assertForbidden()
            ->assertExactJson(['message' => 'Solo administradores.']);
    }

    /**
     * Un usuario con rol admin debe acceder a la ruta.
     */
    public function test_admin_receives_200(): void
    {
        $admin = User::factory()->create();
        $admin->role = 'admin';
        $admin->save();

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/test/admin-only')
            ->assertOk()
            ->assertExactJson(['ok' => true]);
    }
}
