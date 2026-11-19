<?php

namespace Tests\Feature;

use App\Models\StreamCheck;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Verifica que DeadStreamFilter oculta un canal solo por el par exacto
 * (item_id, streamUrl) con is_alive=false, aplicado en /tv y /tv/adult.
 *
 * Las fuentes iptv-org se simulan con Http::fake; la caché de archivo se aísla.
 */
class DeadStreamFilterTest extends TestCase
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

    public function test_dead_exact_pair_hides_channel(): void
    {
        $this->fakeSources(
            ['tv-1', 'tv-2', 'tv-3'],
            ['tv-1' => 'https://example.com/tv-1.m3u8', 'tv-2' => 'https://example.com/tv-2.m3u8', 'tv-3' => 'https://example.com/tv-3.m3u8'],
        );

        $this->createCheck('tv-1', 'https://example.com/tv-1.m3u8', false);
        $this->createCheck('tv-2', 'https://example.com/tv-2.m3u8', true);
        // tv-3 sin fila.

        $response = $this->getJson('/api/countries/MX/tv');

        $response->assertOk();
        $this->assertSame(['tv-2', 'tv-3'], $this->ids($response));
    }

    public function test_changed_url_is_not_hidden_by_old_dead_row(): void
    {
        // La fila caída corresponde a una URL antigua; el canal ahora sirve otra.
        $this->fakeSources(
            ['tv-1'],
            ['tv-1' => 'https://example.com/tv-1-NEW.m3u8'],
        );

        $this->createCheck('tv-1', 'https://example.com/tv-1-OLD.m3u8', false);

        $response = $this->getJson('/api/countries/MX/tv');

        $response->assertOk();
        $this->assertSame(['tv-1'], $this->ids($response));
    }

    public function test_dead_row_for_other_item_does_not_hide(): void
    {
        $this->fakeSources(
            ['tv-1', 'tv-2'],
            ['tv-1' => 'https://example.com/tv-1.m3u8', 'tv-2' => 'https://example.com/tv-2.m3u8'],
        );

        // Fila caída de otro canal, con la misma URL: no debe afectar a tv-1.
        $this->createCheck('tv-other', 'https://example.com/tv-1.m3u8', false);

        $response = $this->getJson('/api/countries/MX/tv');

        $response->assertOk();
        $this->assertSame(['tv-1', 'tv-2'], $this->ids($response));
    }

    public function test_dead_adult_pair_hides_from_tv_adult(): void
    {
        $this->fakeSources(
            ['tv-regular', 'adult-1'],
            ['tv-regular' => 'https://example.com/tv-regular.m3u8', 'adult-1' => 'https://example.com/adult-1.m3u8'],
        );

        $this->createCheck('adult-1', 'https://example.com/adult-1.m3u8', false);

        $response = $this->getJson('/api/countries/MX/tv/adult');

        $response->assertOk();
        $this->assertSame([], $this->ids($response));
    }

    public function test_filter_uses_one_database_query(): void
    {
        $this->fakeSources(
            ['tv-1'],
            ['tv-1' => 'https://example.com/tv-1.m3u8'],
        );

        $this->createCheck('tv-1', 'https://example.com/tv-1.m3u8', false);

        $queries = 0;

        DB::listen(function ($query) use (&$queries) {
            if (str_contains($query->sql, 'stream_checks')) {
                $queries++;
            }
        });

        $this->getJson('/api/countries/MX/tv')->assertOk();

        $this->assertSame(1, $queries);
    }

    /**
     * @param  array<int, string>  $channelIds
     * @param  array<string, string>  $streamUrls
     */
    private function fakeSources(array $channelIds, array $streamUrls): void
    {
        $channels = [];
        $streams = [];

        foreach ($channelIds as $id) {
            $channels[] = [
                'id' => $id,
                'name' => 'Canal '.$id,
                'country' => 'MX',
                'categories' => ['news'],
                'is_nsfw' => str_starts_with($id, 'adult'),
                'closed' => false,
            ];
        }

        foreach ($streamUrls as $id => $url) {
            $streams[] = [
                'channel' => $id,
                'url' => $url,
                'quality' => '720p',
                'labels' => [],
                'referrer' => null,
                'user_agent' => null,
            ];
        }

        Http::fake([
            'https://iptv-org.github.io/api/channels.json' => Http::response($channels),
            'https://iptv-org.github.io/api/streams.json' => Http::response($streams),
            'https://iptv-org.github.io/api/blocklist.json' => Http::response([]),
            'https://iptv-org.github.io/api/logos.json' => Http::response([]),
        ]);
    }

    private function createCheck(string $id, string $url, bool $alive): void
    {
        StreamCheck::create([
            'item_id' => $id,
            'stream_url' => $url,
            'is_alive' => $alive,
            'consecutive_failures' => $alive ? 0 : 3,
            'checked_at' => now(),
            'last_ok_at' => $alive ? now() : null,
        ]);
    }

    /**
     * @return array<int, string>
     */
    private function ids($response): array
    {
        return array_column($response->json('data'), 'id');
    }
}
