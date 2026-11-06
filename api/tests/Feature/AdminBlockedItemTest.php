<?php

namespace Tests\Feature;

use App\Models\BlockedItem;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Pruebas de los endpoints administrativos de bloqueos.
 *
 * Usa DatabaseTransactions para no dejar registros y comprueba que la base
 * activa sea explorador_planet_test.
 */
class AdminBlockedItemTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Evita que la suite se ejecute contra la base de producción.
     */
    public function test_tests_run_against_the_test_database(): void
    {
        $this->assertSame('explorador_planet_test', DB::connection()->getDatabaseName());
    }

    /**
     * Sin token, los tres endpoints responden 401 JSON.
     */
    public function test_unauthenticated_requests_receive_401(): void
    {
        $this->getJson('/api/admin/blocked')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);

        $this->postJson('/api/admin/blocked', [])
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);

        $this->deleteJson('/api/admin/blocked/1')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    /**
     * Un usuario autenticado sin rol admin recibe 403 en todos los endpoints.
     */
    public function test_normal_user_receives_403(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/blocked')
            ->assertForbidden()
            ->assertExactJson(['message' => 'Solo administradores.']);

        $this->withToken($token)
            ->postJson('/api/admin/blocked', [])
            ->assertForbidden()
            ->assertExactJson(['message' => 'Solo administradores.']);

        $this->withToken($token)
            ->deleteJson('/api/admin/blocked/1')
            ->assertForbidden()
            ->assertExactJson(['message' => 'Solo administradores.']);
    }

    /**
     * Un admin crea un bloqueo y blocked_by sale del token, no del cuerpo.
     */
    public function test_admin_can_create_a_block(): void
    {
        $admin = $this->createAdmin();
        $otherUser = User::factory()->create();
        $token = $admin->createToken('test')->plainTextToken;

        $response = $this->withToken($token)
            ->postJson('/api/admin/blocked', [
                'type' => 'tv',
                'itemId' => 'canal-bloqueado-1',
                'reason' => 'Contenido no permitido',
                'blockedBy' => $otherUser->id,
            ]);

        $response->assertCreated()
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'type',
                    'itemId',
                    'reason',
                    'blockedBy',
                    'createdAt',
                    'updatedAt',
                ],
            ])
            ->assertJson([
                'data' => [
                    'type' => 'tv',
                    'itemId' => 'canal-bloqueado-1',
                    'reason' => 'Contenido no permitido',
                    'blockedBy' => $admin->id,
                ],
            ]);

        $this->assertDatabaseHas('blocked_items', [
            'id' => $response->json('data.id'),
            'type' => 'tv',
            'item_id' => 'canal-bloqueado-1',
            'reason' => 'Contenido no permitido',
            'blocked_by' => $admin->id,
        ]);
    }

    /**
     * El listado devuelve todos los bloqueos, del más reciente al más antiguo.
     */
    public function test_admin_can_list_blocks_newest_first(): void
    {
        $admin = $this->createAdmin();
        $token = $admin->createToken('test')->plainTextToken;

        $first = $admin->blockedItems()->create([
            'type' => 'radio',
            'item_id' => 'radio-antigua',
            'reason' => 'Motivo antiguo',
        ]);

        $second = $admin->blockedItems()->create([
            'type' => 'tv',
            'item_id' => 'tv-reciente',
            'reason' => 'Motivo reciente',
        ]);

        $response = $this->withToken($token)
            ->getJson('/api/admin/blocked');

        $response->assertOk()
            ->assertJsonCount(2, 'data');

        $data = $response->json('data');

        $this->assertSame($second->id, $data[0]['id']);
        $this->assertSame($first->id, $data[1]['id']);
        $this->assertSame($admin->id, $data[0]['blockedBy']);
        $this->assertArrayHasKey('createdAt', $data[0]);
        $this->assertArrayHasKey('updatedAt', $data[0]);
    }

    /**
     * Rechaza con 422 un duplicado de (type, itemId).
     */
    public function test_rejects_duplicate_block_with_422(): void
    {
        $admin = $this->createAdmin();
        $token = $admin->createToken('test')->plainTextToken;

        $admin->blockedItems()->create([
            'type' => 'tv',
            'item_id' => 'canal-duplicado',
            'reason' => 'Bloqueo previo',
        ]);

        $response = $this->withToken($token)
            ->postJson('/api/admin/blocked', [
                'type' => 'tv',
                'itemId' => 'canal-duplicado',
                'reason' => 'Intento duplicado',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['itemId']);

        $this->assertStringContainsString(
            'ya está bloqueado',
            $response->json('errors.itemId.0')
        );

        $this->assertDatabaseCount('blocked_items', 1);
    }

    /**
     * Rechaza type fuera de tv/radio.
     */
    public function test_rejects_invalid_type(): void
    {
        $admin = $this->createAdmin();
        $token = $admin->createToken('test')->plainTextToken;

        $response = $this->withToken($token)
            ->postJson('/api/admin/blocked', [
                'type' => 'atlas',
                'itemId' => 'item-1',
                'reason' => 'Motivo válido',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['type']);

        $this->assertStringContainsString(
            'tv o radio',
            $response->json('errors.type.0')
        );
    }

    /**
     * Rechaza un motivo vacío o compuesto solo por espacios.
     */
    public function test_rejects_empty_reason(): void
    {
        $admin = $this->createAdmin();
        $token = $admin->createToken('test')->plainTextToken;

        $response = $this->withToken($token)
            ->postJson('/api/admin/blocked', [
                'type' => 'radio',
                'itemId' => 'radio-1',
                'reason' => '   ',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['reason']);

        $this->assertStringContainsString(
            'motivo del bloqueo es obligatorio',
            $response->json('errors.reason.0')
        );
    }

    /**
     * Un admin elimina un bloqueo y recibe 204.
     */
    public function test_admin_can_delete_a_block(): void
    {
        $admin = $this->createAdmin();
        $token = $admin->createToken('test')->plainTextToken;

        $blockedItem = $admin->blockedItems()->create([
            'type' => 'radio',
            'item_id' => 'radio-a-borrar',
            'reason' => 'Motivo temporal',
        ]);

        $this->withToken($token)
            ->deleteJson('/api/admin/blocked/' . $blockedItem->id)
            ->assertNoContent();

        $this->assertDatabaseMissing('blocked_items', [
            'id' => $blockedItem->id,
        ]);
    }

    /**
     * Eliminar un id inexistente responde 404 JSON.
     */
    public function test_deleting_nonexistent_block_returns_404(): void
    {
        $admin = $this->createAdmin();
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->deleteJson('/api/admin/blocked/99999999')
            ->assertNotFound()
            ->assertExactJson(['message' => 'Bloqueo no encontrado.']);
    }

    /**
     * Crea un usuario con rol admin para las pruebas.
     */
    private function createAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->role = 'admin';
        $admin->save();

        return $admin;
    }
}
