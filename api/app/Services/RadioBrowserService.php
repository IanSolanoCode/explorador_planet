<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class RadioBrowserService
{
    /**
     * Servidor de semilla para descubrir el resto de la red por DNS.
     */
    private const SEED_SERVER = 'de1.api.radio-browser.info';

    /**
     * Servidores de respaldo si el descubrimiento DNS no devuelve nombres.
     *
     * @var array<int, string>
     */
    private const FALLBACK_SERVERS = [
        'de1.api.radio-browser.info',
        'de2.api.radio-browser.info',
    ];

    private const TIMEOUT_SECONDS = 5;

    private const CACHE_HOURS = 6;

    private const LIMIT = 50;

    private const MAX_TAGS = 5;

    /**
     * Devuelve las emisoras normalizadas de un país o null si todos los servidores fallan.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function stationsByCountry(string $code): ?array
    {
        $cache = Cache::store('file');
        $key = 'radio-browser:stations:'.$code;

        $cached = $cache->get($key);

        if (is_array($cached)) {
            return $cached;
        }

        $stations = $this->fetch($code);

        if ($stations === null) {
            return null;
        }

        $cache->put($key, $stations, now()->addHours(self::CACHE_HOURS));

        return $stations;
    }

    /**
     * Consulta los servidores disponibles hasta obtener una respuesta válida.
     *
     * @return array<int, array<string, mixed>>|null
     */
    private function fetch(string $code): ?array
    {
        foreach ($this->servers() as $server) {
            try {
                $response = Http::withHeaders(['User-Agent' => $this->userAgent()])
                    ->acceptJson()
                    ->connectTimeout(self::TIMEOUT_SECONDS)
                    ->timeout(self::TIMEOUT_SECONDS)
                    ->get('https://'.$server.'/json/stations/bycountrycodeexact/'.rawurlencode($code), [
                        'hidebroken' => 'true',
                        'order' => 'votes',
                        'reverse' => 'true',
                        'limit' => self::LIMIT,
                    ]);

                if (! $response->successful()) {
                    Log::warning('Radio Browser respondió con error.', [
                        'server' => $server,
                        'status' => $response->status(),
                    ]);

                    continue;
                }

                $payload = $response->json();

                if (! is_array($payload)) {
                    Log::warning('Radio Browser devolvió una respuesta no válida.', [
                        'server' => $server,
                    ]);

                    continue;
                }

                return array_map(
                    fn (array $station): array => $this->normalize($station, $code),
                    $payload,
                );
            } catch (Throwable $e) {
                Log::warning('No se pudo contactar con Radio Browser.', [
                    'server' => $server,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return null;
    }

    /**
     * Lista de servidores: descubiertos por DNS, respaldos y orden aleatorio.
     *
     * @return array<int, string>
     */
    private function servers(): array
    {
        $servers = [];

        $ips = @gethostbynamel('all.api.radio-browser.info') ?: [];

        foreach ($ips as $ip) {
            $name = @gethostbyaddr($ip);

            if (is_string($name) && str_ends_with($name, '.api.radio-browser.info')) {
                $servers[] = $name;
            }
        }

        $servers = array_merge($servers, [self::SEED_SERVER], self::FALLBACK_SERVERS);
        $servers = array_values(array_unique($servers));

        shuffle($servers);

        return $servers;
    }

    /**
     * Adapta una emisora de Radio Browser al contrato de radio.
     *
     * @param  array<string, mixed>  $station
     * @return array<string, mixed>
     */
    private function normalize(array $station, string $code): array
    {
        $tags = array_map(
            'trim',
            explode(',', (string) ($station['tags'] ?? '')),
        );

        $tags = array_values(array_filter($tags, fn (string $tag): bool => $tag !== ''));
        $tags = array_values(array_unique($tags));

        return [
            'id' => (string) ($station['stationuuid'] ?? ''),
            'name' => trim((string) ($station['name'] ?? '')),
            'country' => (string) ($station['countrycode'] ?? $code),
            'streamUrl' => (string) ($station['url_resolved'] ?? ''),
            'logo' => (string) ($station['favicon'] ?? ''),
            'tags' => array_slice($tags, 0, self::MAX_TAGS),
        ];
    }

    private function userAgent(): string
    {
        return 'ExploradorPlanet/1.0 (+'.config('app.url').')';
    }
}
