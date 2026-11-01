<?php

namespace App\Services;

use App\Exceptions\IptvOrgException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class IptvOrgService
{
    private const BASE_URL = 'https://iptv-org.github.io/api';

    private const TIMEOUT_SECONDS = 30;

    private const CACHE_HOURS = 6;

    /**
     * Devuelve los canales normalizados de un país, separando adultos.
     *
     * @return array<int, array<string, mixed>>
     */
    public function channelsByCountry(string $code, bool $adult = false): array
    {
        $cache = Cache::store('file');
        $key = $this->cacheKey($code, $adult);

        if ($cache->has($key)) {
            return $cache->get($key);
        }

        [$regular, $adultChannels] = $this->build($code);

        $cache->put($this->cacheKey($code, false), $regular, now()->addHours(self::CACHE_HOURS));
        $cache->put($this->cacheKey($code, true), $adultChannels, now()->addHours(self::CACHE_HOURS));

        return $adult ? $adultChannels : $regular;
    }

    private function cacheKey(string $code, bool $adult): string
    {
        return 'iptv:tv:'.($adult ? 'adult:' : '').$code;
    }

    /**
     * Construye las listas de TV procesando un archivo cada vez.
     *
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, array<string, mixed>>}
     */
    private function build(string $code): array
    {
        $channels = $this->channelsFor($code);
        $streams = $this->streamsFor($channels);
        $channels = $this->excludeBlocked($channels);
        $logos = $this->logosFor($channels);

        $regular = [];
        $adultChannels = [];

        foreach ($channels as $id => $channel) {
            if (! isset($streams[$id])) {
                continue;
            }

            $stream = $streams[$id];

            $item = [
                'id' => $channel['id'],
                'name' => $channel['name'],
                'country' => $channel['country'],
                'streamUrl' => $stream['url'],
                'logo' => $logos[$id] ?? '',
                'category' => $this->category($channel['categories']),
                'source' => 'iptv-org',
                'secure' => str_starts_with($stream['url'], 'https://'),
            ];

            if ($channel['is_nsfw']) {
                $adultChannels[] = $item;
            } else {
                $regular[] = $item;
            }
        }

        Log::info('IPTV TV construido.', [
            'country' => $code,
            'regular' => count($regular),
            'adult' => count($adultChannels),
            'peak_memory_bytes' => memory_get_peak_usage(true),
        ]);

        unset($channels, $streams, $logos);

        return [$regular, $adultChannels];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function channelsFor(string $code): array
    {
        $payload = $this->fetchJson('channels.json');
        $channels = [];

        foreach ($payload as $channel) {
            if (($channel['country'] ?? null) !== $code || ! empty($channel['closed'])) {
                continue;
            }

            $id = (string) ($channel['id'] ?? '');

            if ($id === '') {
                continue;
            }

            $channels[$id] = [
                'id' => $id,
                'name' => trim((string) ($channel['name'] ?? '')),
                'country' => $code,
                'categories' => is_array($channel['categories'] ?? null) ? $channel['categories'] : [],
                'is_nsfw' => (bool) ($channel['is_nsfw'] ?? false),
            ];
        }

        unset($payload, $channel);

        return $channels;
    }

    /**
     * @param  array<string, array<string, mixed>>  $channels
     * @return array<string, array<string, mixed>>
     */
    private function streamsFor(array $channels): array
    {
        $payload = $this->fetchJson('streams.json');
        $streams = [];

        foreach ($payload as $stream) {
            $channelId = $stream['channel'] ?? null;

            if (! is_string($channelId) || ! isset($channels[$channelId])) {
                continue;
            }

            if ($this->isNotEmpty($stream['referrer'] ?? null) || $this->isNotEmpty($stream['user_agent'] ?? null)) {
                continue;
            }

            $url = trim((string) ($stream['url'] ?? ''));

            if ($url === '') {
                continue;
            }

            $candidate = [
                'url' => $url,
                'quality' => $stream['quality'] ?? null,
                'labels' => is_array($stream['labels'] ?? null) ? $stream['labels'] : [],
            ];

            if (! isset($streams[$channelId]) || $this->streamScore($candidate) > $this->streamScore($streams[$channelId])) {
                $streams[$channelId] = $candidate;
            }
        }

        unset($payload, $stream);

        return $streams;
    }

    /**
     * @param  array<string, array<string, mixed>>  $channels
     * @return array<string, array<string, mixed>>
     */
    private function excludeBlocked(array $channels): array
    {
        $payload = $this->fetchJson('blocklist.json');
        $blocked = [];

        foreach ($payload as $entry) {
            $channelId = $entry['channel'] ?? null;

            if (is_string($channelId) && $channelId !== '') {
                $blocked[$channelId] = true;
            }
        }

        unset($payload, $entry);

        return array_diff_key($channels, $blocked);
    }

    /**
     * @param  array<string, array<string, mixed>>  $channels
     * @return array<string, string>
     */
    private function logosFor(array $channels): array
    {
        $payload = $this->fetchJson('logos.json');
        $logos = [];

        foreach ($payload as $logo) {
            $channelId = $logo['channel'] ?? null;

            if (! is_string($channelId) || ! isset($channels[$channelId])) {
                continue;
            }

            $url = trim((string) ($logo['url'] ?? ''));

            if ($url === '') {
                continue;
            }

            $score = $this->logoScore($logo);

            if (! isset($logos[$channelId]) || $score > $logos[$channelId]['score']) {
                $logos[$channelId] = ['score' => $score, 'url' => $url];
            }
        }

        unset($payload, $logo);

        return array_map(static fn (array $logo): string => $logo['url'], $logos);
    }

    /**
     * @param  array<string, mixed>  $stream
     */
    private function streamScore(array $stream): int
    {
        $secure = str_starts_with((string) $stream['url'], 'https://') ? 1 : 0;
        $quality = (int) preg_replace('/\D+/', '', (string) ($stream['quality'] ?? ''));
        $notGeoBlocked = in_array('Geo-blocked', $stream['labels'], true) ? 0 : 1;

        return $secure * 1_000_000 + $quality * 100 + $notGeoBlocked;
    }

    /**
     * @param  array<string, mixed>  $logo
     */
    private function logoScore(array $logo): int
    {
        $inUse = (bool) ($logo['in_use'] ?? false) ? 1_000_000_000 : 0;
        $channelLogo = ($logo['feed'] ?? null) === null ? 100_000_000 : 0;
        $area = ((int) ($logo['width'] ?? 0)) * ((int) ($logo['height'] ?? 0));

        return $inUse + $channelLogo + min($area, 99_999_999);
    }

    /**
     * @param  array<int, string>  $categories
     */
    private function category(array $categories): string
    {
        foreach ($categories as $category) {
            $category = trim((string) $category);

            if ($category !== '' && $category !== 'general') {
                return $category;
            }
        }

        foreach ($categories as $category) {
            $category = trim((string) $category);

            if ($category !== '') {
                return $category;
            }
        }

        return '';
    }

    private function isNotEmpty(mixed $value): bool
    {
        return trim((string) $value) !== '';
    }

    /**
     * @return array<int, mixed>
     */
    private function fetchJson(string $file): array
    {
        try {
            $response = Http::timeout(self::TIMEOUT_SECONDS)
                ->acceptJson()
                ->get(self::BASE_URL.'/'.$file);
        } catch (Throwable $e) {
            Log::warning('No se pudo descargar un archivo de iptv-org.', [
                'file' => $file,
                'error' => $e->getMessage(),
            ]);

            throw new IptvOrgException('No se pudo descargar '.$file.' desde iptv-org.', previous: $e);
        }

        if (! $response->successful()) {
            Log::warning('iptv-org respondió con error.', [
                'file' => $file,
                'status' => $response->status(),
            ]);

            throw new IptvOrgException('iptv-org respondió con un error al descargar '.$file.'.');
        }

        $data = json_decode($response->body(), true);

        unset($response);

        if (! is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
            Log::warning('iptv-org devolvió un archivo no válido.', ['file' => $file]);

            throw new IptvOrgException('iptv-org devolvió un archivo no válido: '.$file.'.');
        }

        return $data;
    }
}
