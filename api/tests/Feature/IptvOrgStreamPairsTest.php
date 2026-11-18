<?php

namespace Tests\Feature;

use App\Services\IptvOrgService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Comprueba que `allStreamPairs` devuelve lo mismo que `channelsByCountry`
 * para cada país, reutilizando los filtros existentes.
 *
 * Usa Http::fake y aísla la caché de archivo; no llama a internet.
 */
class IptvOrgStreamPairsTest extends TestCase
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

    public function test_pairs_match_channels_by_country_for_mx_es_and_co(): void
    {
        $this->fakeSources();

        $service = app(IptvOrgService::class);

        $pairs = $service->allStreamPairs();

        // Una sola descarga de channels.json, streams.json y blocklist.json.
        Http::assertSentCount(3);

        // El canal adulto también se comprueba, pero no aparece en /tv.
        $this->assertContains('mx-adult', array_column($pairs, 'item_id'));

        foreach (['MX', 'ES', 'CO'] as $code) {
            $expected = array_map(
                static fn (array $channel): array => [
                    'item_id' => $channel['id'],
                    'streamUrl' => $channel['streamUrl'],
                ],
                $service->channelsByCountry($code),
            );

            $actual = array_values(array_filter(
                $pairs,
                static fn (array $pair): bool => $pair['country'] === $code && $pair['item_id'] !== 'mx-adult',
            ));

            $this->assertSame($this->sorted($expected), $this->sorted($actual), "Países distintos en {$code}");
        }

        // La segunda llamada sale de la caché: no vuelve a descargar nada.
        $service->allStreamPairs();
        Http::assertSentCount(3 + 4 * 3);
    }

    private function sorted(array $pairs): array
    {
        usort($pairs, static fn (array $a, array $b): int => strcmp($a['item_id'], $b['item_id']));

        return array_map(
            static fn (array $pair): string => $pair['item_id'].'|'.$pair['streamUrl'],
            $pairs,
        );
    }

    /**
     * Fixture con canales cerrados, bloqueados y con referrer, que deben
     * quedar fuera de ambos caminos.
     */
    private function fakeSources(): void
    {
        $channels = [
            $this->channel('mx-1', 'MX'),
            $this->channel('mx-2', 'MX'),
            $this->channel('mx-adult', 'MX', true),
            $this->channel('mx-closed', 'MX', false, true),
            $this->channel('mx-blocked', 'MX'),
            $this->channel('mx-referrer', 'MX'),
            $this->channel('mx-no-stream', 'MX'),
            $this->channel('es-1', 'ES'),
            $this->channel('co-1', 'CO'),
            $this->channel('co-2', 'CO'),
        ];

        $streams = [
            // Calidad baja en HTTP y alta en HTTPS: debe ganar la segunda.
            $this->stream('mx-1', 'http://example.com/mx-1-low.m3u8', '480p'),
            $this->stream('mx-1', 'https://example.com/mx-1-hd.m3u8', '1080p'),
            $this->stream('mx-2', 'https://example.com/mx-2.m3u8', '720p'),
            $this->stream('mx-adult', 'https://example.com/mx-adult.m3u8', '720p'),
            $this->stream('mx-closed', 'https://example.com/mx-closed.m3u8', '720p'),
            $this->stream('mx-blocked', 'https://example.com/mx-blocked.m3u8', '720p'),
            $this->stream('mx-referrer', 'https://example.com/mx-referrer.m3u8', '720p', 'https://ref.example.com'),
            $this->stream('es-1', 'https://example.com/es-1.m3u8', '720p'),
            $this->stream('co-1', 'https://example.com/co-1.m3u8', '720p'),
            $this->stream('co-2', 'https://example.com/co-2.m3u8', '720p'),
        ];

        Http::fake([
            'https://iptv-org.github.io/api/channels.json' => Http::response($channels),
            'https://iptv-org.github.io/api/streams.json' => Http::response($streams),
            'https://iptv-org.github.io/api/blocklist.json' => Http::response([['channel' => 'mx-blocked']]),
            'https://iptv-org.github.io/api/logos.json' => Http::response([]),
        ]);
    }

    private function channel(string $id, string $country, bool $adult = false, bool $closed = false): array
    {
        return [
            'id' => $id,
            'name' => 'Canal '.$id,
            'country' => $country,
            'categories' => ['news'],
            'is_nsfw' => $adult,
            'closed' => $closed,
        ];
    }

    private function stream(string $channel, string $url, string $quality, ?string $referrer = null): array
    {
        return [
            'channel' => $channel,
            'url' => $url,
            'quality' => $quality,
            'labels' => [],
            'referrer' => $referrer,
            'user_agent' => null,
        ];
    }
}
