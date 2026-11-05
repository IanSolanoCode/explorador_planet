<?php

namespace Tests\Feature;

use App\Models\BlockedItem;
use App\Models\Favorite;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Pruebas automatizadas para los endpoints de favoritos (/api/favorites).
 *
 * Utiliza DatabaseTransactions para evitar dejar registros en la base de datos
 * y comprueba explícitamente que la suite se ejecute en explorador_planet_test.
 */
class FavoriteTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Garantiza que los tests se ejecuten contra la base de test y no contra producción.
     */
    public function test_tests_run_against_the_test_database(): void
    {
        $this->assertSame('explorador_planet_test', DB::connection()->getDatabaseName());
    }

    /**
     * Peticiones sin token a los tres endpoints deben responder 401 en JSON.
     */
    public function test_unauthenticated_requests_receive_401(): void
    {
        $this->getJson('/api/favorites')
            ->assertUnauthorized()
            ->assertJson(['message' => 'Unauthenticated.']);

        $this->postJson('/api/favorites', [])
            ->assertUnauthorized()
            ->assertJson(['message' => 'Unauthenticated.']);

        $this->deleteJson('/api/favorites/1')
            ->assertUnauthorized()
            ->assertJson(['message' => 'Unauthenticated.']);
    }

    /**
     * Un usuario autenticado puede dar de alta un favorito con respuesta 201 y contrato camelCase.
     */
    public function test_authenticated_user_can_create_a_favorite(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $payload = [
            'type' => 'tv',
            'itemId' => 'canaldelasestrellas.mx',
            'name' => 'Las Estrellas',
            'country' => 'mx', // Debe convertirse a mayúsculas
            'streamUrl' => 'https://example.com/live/stream.m3u8',
            'logo' => 'https://example.com/logos/estrellas.png',
        ];

        $response = $this->withToken($token)
            ->postJson('/api/favorites', $payload);

        $response->assertCreated()
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'type',
                    'itemId',
                    'name',
                    'country',
                    'streamUrl',
                    'logo',
                ],
            ])
            ->assertJson([
                'data' => [
                    'type' => 'tv',
                    'itemId' => 'canaldelasestrellas.mx',
                    'name' => 'Las Estrellas',
                    'country' => 'MX',
                    'streamUrl' => 'https://example.com/live/stream.m3u8',
                    'logo' => 'https://example.com/logos/estrellas.png',
                ],
            ]);

        $this->assertDatabaseHas('favorites', [
            'id' => $response->json('data.id'),
            'user_id' => $user->id,
            'type' => 'tv',
            'item_id' => 'canaldelasestrellas.mx',
            'country' => 'MX',
        ]);
    }

    /**
     * Lista los favoritos del usuario autenticado ordenados del más reciente al más antiguo.
     */
    public function test_authenticated_user_can_list_their_favorites_newest_first(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        // Favorito del otro usuario que no debe aparecer
        $otherUser->favorites()->create([
            'type' => 'radio',
            'item_id' => 'radio-other',
            'name' => 'Emisora Ajena',
            'country' => 'AR',
            'stream_url' => 'https://example.com/radio-other',
        ]);

        $fav1 = $user->favorites()->create([
            'type' => 'tv',
            'item_id' => 'tv-1',
            'name' => 'Canal 1',
            'country' => 'ES',
            'stream_url' => 'https://example.com/tv1',
        ]);

        $fav2 = $user->favorites()->create([
            'type' => 'radio',
            'item_id' => 'radio-2',
            'name' => 'Radio 2',
            'country' => 'MX',
            'stream_url' => 'https://example.com/radio2',
        ]);

        $response = $this->withToken($token)
            ->getJson('/api/favorites');

        $response->assertOk()
            ->assertJsonCount(2, 'data');

        // Más reciente primero (fav2 creado después de fav1)
        $data = $response->json('data');
        $this->assertSame($fav2->id, $data[0]['id']);
        $this->assertSame($fav1->id, $data[1]['id']);
    }

    /**
     * Rechaza con 422 si el usuario intenta agregar un favorito con el mismo (type, itemId).
     */
    public function test_rejects_duplicate_favorite_with_422(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $user->favorites()->create([
            'type' => 'tv',
            'item_id' => 'channel-123',
            'name' => 'Canal Existente',
            'country' => 'CO',
            'stream_url' => 'https://example.com/live',
        ]);

        $response = $this->withToken($token)
            ->postJson('/api/favorites', [
                'type' => 'tv',
                'itemId' => 'channel-123',
                'name' => 'Intento Duplicado',
                'country' => 'CO',
                'streamUrl' => 'https://example.com/live',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['itemId']);

        $this->assertStringContainsString('ya está en tus favoritos', $response->json('errors.itemId.0'));
    }

    /**
     * Rechaza con 422 si el usuario ya alcanzó el límite de 200 favoritos.
     */
    public function test_rejects_with_422_when_reaching_limit_of_200(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $now = now();
        $bulk = [];
        for ($i = 1; $i <= Favorite::MAX_PER_USER; $i++) {
            $bulk[] = [
                'user_id' => $user->id,
                'type' => 'radio',
                'item_id' => 'station-' . $i,
                'name' => 'Emisora ' . $i,
                'country' => 'MX',
                'stream_url' => 'https://example.com/stream/' . $i,
                'logo' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        Favorite::insert($bulk);

        $response = $this->withToken($token)
            ->postJson('/api/favorites', [
                'type' => 'tv',
                'itemId' => 'new-channel',
                'name' => 'Nuevo Canal',
                'country' => 'MX',
                'streamUrl' => 'https://example.com/live',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['favorite']);

        $this->assertStringContainsString('límite máximo de 200 favoritos', $response->json('errors.favorite.0'));
    }

    /**
     * Rechaza con 422 si streamUrl o logo utilizan un esquema inválido como javascript:.
     */
    public function test_rejects_invalid_url_schemes(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        // streamUrl con javascript:
        $response = $this->withToken($token)
            ->postJson('/api/favorites', [
                'type' => 'tv',
                'itemId' => 'channel-xss',
                'name' => 'XSS Stream',
                'country' => 'MX',
                'streamUrl' => 'javascript:alert(1)',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['streamUrl']);

        // logo con javascript:
        $responseLogo = $this->withToken($token)
            ->postJson('/api/favorites', [
                'type' => 'tv',
                'itemId' => 'channel-logo-xss',
                'name' => 'XSS Logo',
                'country' => 'MX',
                'streamUrl' => 'https://example.com/live',
                'logo' => 'javascript:alert(document.cookie)',
            ]);

        $responseLogo->assertUnprocessable()
            ->assertJsonValidationErrors(['logo']);
    }

    /**
     * Rechaza con 422 si el item está en blocked_items (insertado directamente en el test).
     */
    public function test_rejects_blocked_item_with_422(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        // Inserción directa en blocked_items para simular bloqueo administrativo previo
        BlockedItem::create([
            'type' => 'tv',
            'item_id' => 'canal-bloqueado-1',
            'reason' => 'Contenido inapropiado',
            'blocked_by' => null,
        ]);

        $response = $this->withToken($token)
            ->postJson('/api/favorites', [
                'type' => 'tv',
                'itemId' => 'canal-bloqueado-1',
                'name' => 'Canal Prohibido',
                'country' => 'MX',
                'streamUrl' => 'https://example.com/live',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['itemId']);

        $this->assertStringContainsString('bloqueado', $response->json('errors.itemId.0'));
    }

    /**
     * Un favorito existente queda oculto del listado tras insertarse en blocked_items.
     */
    public function test_favorite_is_hidden_from_listing_after_being_blocked(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $favorite = $user->favorites()->create([
            'type' => 'tv',
            'item_id' => 'canal-a-bloquear',
            'name' => 'Canal Temporal',
            'country' => 'MX',
            'stream_url' => 'https://example.com/live',
        ]);

        // Antes del bloqueo aparece en el listado
        $before = $this->withToken($token)->getJson('/api/favorites');
        $before->assertOk()->assertJsonCount(1, 'data');

        // Se bloquea el item directamente en blocked_items
        BlockedItem::create([
            'type' => 'tv',
            'item_id' => 'canal-a-bloquear',
            'reason' => 'DMCA take down',
            'blocked_by' => null,
        ]);

        // Después del bloqueo queda oculto
        $after = $this->withToken($token)->getJson('/api/favorites');
        $after->assertOk()->assertJsonCount(0, 'data');

        // Pero el favorito sigue existiendo en la tabla favorites (para límite de 200)
        $this->assertDatabaseHas('favorites', [
            'id' => $favorite->id,
            'item_id' => 'canal-a-bloquear',
        ]);
    }

    /**
     * Un usuario puede eliminar un favorito propio y recibe 204 No Content.
     */
    public function test_user_can_delete_own_favorite(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $favorite = $user->favorites()->create([
            'type' => 'radio',
            'item_id' => 'radio-borrar',
            'name' => 'Radio a Borrar',
            'country' => 'MX',
            'stream_url' => 'https://example.com/radio',
        ]);

        $response = $this->withToken($token)
            ->deleteJson('/api/favorites/' . $favorite->id);

        $response->assertNoContent();

        $this->assertDatabaseMissing('favorites', [
            'id' => $favorite->id,
        ]);
    }

    /**
     * Intentar eliminar un favorito de otro usuario (o inexistente) responde 404 con idéntico mensaje.
     */
    public function test_deleting_foreign_or_nonexistent_favorite_returns_404(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $foreignFavorite = $otherUser->favorites()->create([
            'type' => 'tv',
            'item_id' => 'foreign-tv',
            'name' => 'TV Ajena',
            'country' => 'ES',
            'stream_url' => 'https://example.com/foreign',
        ]);

        // Intento de borrar favorito ajeno
        $foreignResponse = $this->withToken($token)
            ->deleteJson('/api/favorites/' . $foreignFavorite->id);

        $foreignResponse->assertNotFound()
            ->assertExactJson(['message' => 'Favorito no encontrado.']);

        // El registro ajeno NO fue eliminado
        $this->assertDatabaseHas('favorites', [
            'id' => $foreignFavorite->id,
        ]);

        // Intento de borrar favorito inexistente responde exactamente el mismo mensaje
        $nonExistentResponse = $this->withToken($token)
            ->deleteJson('/api/favorites/99999999');

        $nonExistentResponse->assertNotFound()
            ->assertExactJson(['message' => 'Favorito no encontrado.']);
    }
}

