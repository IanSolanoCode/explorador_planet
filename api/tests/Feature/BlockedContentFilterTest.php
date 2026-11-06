<?php

namespace Tests\Feature;

use App\Models\BlockedItem;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Verifica que TV y radio filtran blocked_items después de leer la caché.
 *
 * Las fuentes externas se simulan con Http::fake; la caché de archivo se
 * aísla en storage/framework/cache/testing para no mezclar pruebas.
 */
class BlockedContentFilterTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        config(['cache.stores.file.path' => storage_path('framework/cache/testing')]);
        Cache::forgetDriver('file');
        Cache::store('file')->flush();
        Http::preventStrayRequests();
    }

    protected function tearDown(): void
    {
        Cache::store('file')->flush();
        parent::tearDown();
    }

    /**
     * Un canal bloqueado desaparece de /tv.
     */
    public function test_blocked_tv_channel_disappears_from_tv(): void
    {
        $this->fakeSources(
            channels: [
                $this->tvChannel('tv-1'),
                $this->tvChannel('tv-2'),
            ],
            streams: [
                $this->tvStream('tv-1'),
                $this->tvStream('tv-2'),
            ],
        );

        BlockedItem::create([
            'type' => 'tv',
            'item_id' => 'tv-1',
            'reason' => 'Bloqueo de prueba',
        ]);

        $response = $this->getJson('/api/countries/MX/tv');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(['tv-2'], $this->ids($response));
    }

    /**
     * Un canal adulto bloqueado desaparece de /tv/adult.
     */
    public function test_blocked_adult_channel_disappears_from_tv_adult(): void
    {
        $this->fakeSources(
            channels: [
                $this->tvChannel('tv-regular'),
                $this->tvChannel('adult-1', true),
                $this->tvChannel('adult-2', true),
            ],
            streams: [
                $this->tvStream('tv-regular'),
                $this->tvStream('adult-1'),
                $this->tvStream('adult-2'),
            ],
        );

        BlockedItem::create([
            'type' => 'tv',
            'item_id' => 'adult-1',
            'reason' => 'Bloqueo de prueba',
        ]);

        $response = $this->getJson('/api/countries/MX/tv/adult');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(['adult-2'], $this->ids($response));
    }

    /**
     * Una emisora bloqueada desaparece de /radio.
     */
    public function test_blocked_radio_station_disappears_from_radio(): void
    {
        $this->fakeSources(stations: [
            $this->radioStation('radio-1'),
            $this->radioStation('radio-2'),
        ]);

        BlockedItem::create([
            'type' => 'radio',
            'item_id' => 'radio-1',
            'reason' => 'Bloqueo de prueba',
        ]);

        $response = $this->getJson('/api/countries/MX/radio');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(['radio-2'], $this->ids($response));
    }

    /**
     * Al eliminar el bloqueo, el contenido vuelve a aparecer.
     */
    public function test_content_returns_after_unblocking(): void
    {
        $this->fakeSources(
            channels: [
                $this->tvChannel('tv-1'),
                $this->tvChannel('tv-2'),
            ],
            streams: [
                $this->tvStream('tv-1'),
                $this->tvStream('tv-2'),
            ],
        );

        $block = BlockedItem::create([
            'type' => 'tv',
            'item_id' => 'tv-1',
            'reason' => 'Bloqueo temporal',
        ]);

        $blocked = $this->getJson('/api/countries/MX/tv');
        $blocked->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(['tv-2'], $this->ids($blocked));

        $block->delete();

        $restored = $this->getJson('/api/countries/MX/tv');
        $restored->assertOk()->assertJsonCount(2, 'data');
        $this->assertContains('tv-1', $this->ids($restored));
    }

    /**
     * Un bloqueo de radio no afecta a TV aunque el id coincida.
     */
    public function test_radio_block_does_not_affect_tv_with_same_id(): void
    {
        $this->fakeSources(
            channels: [$this->tvChannel('shared-id')],
            streams: [$this->tvStream('shared-id')],
            stations: [$this->radioStation('shared-id')],
        );

        BlockedItem::create([
            'type' => 'radio',
            'item_id' => 'shared-id',
            'reason' => 'Bloqueo solo de radio',
        ]);

        $tv = $this->getJson('/api/countries/MX/tv');
        $tv->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(['shared-id'], $this->ids($tv));

        $radio = $this->getJson('/api/countries/MX/radio');
        $radio->assertOk()->assertJsonCount(0, 'data');
    }

    /**
     * Con la caché caliente, un bloqueo nuevo aplica de inmediato sin refetch.
     */
    public function test_block_applies_immediately_with_warm_cache(): void
    {
        $this->fakeSources(
            channels: [
                $this->tvChannel('tv-1'),
                $this->tvChannel('tv-2'),
            ],
            streams: [
                $this->tvStream('tv-1'),
                $this->tvStream('tv-2'),
            ],
        );

        $first = $this->getJson('/api/countries/MX/tv');
        $first->assertOk()->assertJsonCount(2, 'data');
        Http::assertSentCount(4);

        BlockedItem::create([
            'type' => 'tv',
            'item_id' => 'tv-1',
            'reason' => 'Bloqueo con caché caliente',
        ]);

        $second = $this->getJson('/api/countries/MX/tv');
        $second->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(['tv-2'], $this->ids($second));

        // No se volvió a consultar iptv-org: el filtro se aplicó sobre la caché.
        Http::assertSentCount(4);
    }

    /**
     * El filtro realiza una sola consulta a blocked_items por petición.
     */
    public function test_filter_uses_one_database_query(): void
    {
        $this->fakeSources(
            channels: [$this->tvChannel('tv-1')],
            streams: [$this->tvStream('tv-1')],
        );

        $blockedItemQueries = 0;

        DB::listen(function ($query) use (&$blockedItemQueries) {
            if (str_contains($query->sql, 'blocked_items')) {
                $blockedItemQueries++;
            }
        });

        $this->getJson('/api/countries/MX/tv')->assertOk();

        $this->assertSame(1, $blockedItemQueries);
    }

    /**
     * Registra respuestas falsas para iptv-org y Radio Browser.
     */
    private function fakeSources(
        array $channels = [],
        array $streams = [],
        array $logos = [],
        array $stations = [],
    ): void {
        Http::fake([
            'https://iptv-org.github.io/api/channels.json' => Http::response($channels),
            'https://iptv-org.github.io/api/streams.json' => Http::response($streams),
            'https://iptv-org.github.io/api/blocklist.json' => Http::response([]),
            'https://iptv-org.github.io/api/logos.json' => Http::response($logos),
            'https://*.api.radio-browser.info/*' => Http::response($stations),
        ]);
    }

    private function tvChannel(string $id, bool $adult = false): array
    {
        return [
            'id' => $id,
            'name' => 'Canal '.$id,
            'country' => 'MX',
            'categories' => ['news'],
            'is_nsfw' => $adult,
            'closed' => false,
        ];
    }

    private function tvStream(string $id): array
    {
        return [
            'channel' => $id,
            'url' => 'https://example.com/'.$id.'.m3u8',
            'quality' => '720p',
            'labels' => [],
            'referrer' => null,
            'user_agent' => null,
        ];
    }

    private function radioStation(string $id): array
    {
        return [
            'stationuuid' => $id,
            'name' => 'Radio '.$id,
            'countrycode' => 'MX',
            'url_resolved' => 'https://example.com/'.$id,
            'favicon' => 'https://example.com/'.$id.'.png',
            'tags' => 'news,talk',
        ];
    }

    /**
     * Extrae los ids de una respuesta JSON con envoltura data.
     *
     * @return array<int, string>
     */
    private function ids($response): array
    {
        return array_column($response->json('data'), 'id');
    }
}
