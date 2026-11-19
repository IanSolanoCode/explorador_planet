<?php

namespace App\Services;

use App\Exceptions\StreamUrlNotAllowedException;
use App\Models\StreamCheck;
use App\Support\StreamUrlGuard;
use Illuminate\Http\Client\Pool;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Comprueba si los streams de TV responden y registra el resultado.
 *
 * Cada URL se valida con StreamUrlGuard (esquema, host y SSRF) antes de pedirla
 * y se fija la IP resuelta con CURLOPT_RESOLVE. Las redirecciones se siguen a
 * mano (máximo 3) para validar también cada destino. Un stream se considera
 * vivo si responde 200 y el cuerpo empieza por `#EXTM3U` (leyendo solo 4 KB).
 *
 * Un fallo aislado no oculta el canal: `is_alive` pasa a false al tercer fallo
 * consecutivo y cualquier éxito reinicia el contador.
 */
class StreamChecker
{
    private const USER_AGENT = 'ExploradorPlanet/1.0 (stream-checker)';

    private const TIMEOUT_SECONDS = 8;

    private const MAX_BODY_BYTES = 4096;

    private const MAX_REDIRECTS = 3;

    private const REFERENCE_URL = 'https://iptv-org.github.io/api/countries.json';

    private const MIN_BRAKE_BATCH = 20;

    private const BRAKE_FAILURE_RATIO = 0.9;

    private const BATCH_SIZE = 200;

    /**
     * Tope interno de ejecución en segundos (40 min). No se usa ->timeout()
     * porque el scheduler de esta versión de Laravel no lo expone.
     */
    private const MAX_RUN_SECONDS = 40 * 60;

    /**
     * @param  string|null  $referenceUrl  URL de referencia del freno de red;
     *   inyectable en tests para evitar DNS real.
     */
    public function __construct(
        private readonly StreamUrlGuard $guard,
        private readonly ?string $referenceUrl = null,
    ) {}

    /**
     * Comprueba los pares en lotes y persiste el resultado.
     *
     * `$lookup` asocia `item_id\0streamUrl` con la fila previa (para sumar
     * fallos consecutivos y conservar last_ok_at sin consultar de nuevo).
     *
     * @param  array<int, array{item_id: string, streamUrl: string, country: string}>  $pairs
     * @param  array<string, StreamCheck>  $lookup
     * @return array{total: int, alive: int, dead: int, rejected: int, discarded: bool, elapsed: float, peak_memory_bytes: int}
     */
    public function check(array $pairs, array $lookup, int $concurrency): array
    {
        $startedAt = microtime(true);
        $summary = ['total' => 0, 'alive' => 0, 'dead' => 0, 'rejected' => 0, 'discarded' => false, 'truncated' => false];

        foreach (array_chunk($pairs, self::BATCH_SIZE) as $batch) {
            if (microtime(true) - $startedAt > self::MAX_RUN_SECONDS) {
                $summary['truncated'] = true;
                Log::warning('streams:check alcanzó el tope interno de 40 minutos y se detiene.');
                break;
            }

            $result = $this->checkBatch($batch, $lookup, $concurrency);

            $summary['total'] += $result['total'];
            $summary['alive'] += $result['alive'];
            $summary['dead'] += $result['dead'];
            $summary['rejected'] += $result['rejected'];

            if ($result['discarded']) {
                $summary['discarded'] = true;
                break;
            }
        }

        $summary['elapsed'] = round(microtime(true) - $startedAt, 2);
        $summary['peak_memory_bytes'] = memory_get_peak_usage(true);

        return $summary;
    }

    /**
     * @param  array<int, array{item_id: string, streamUrl: string, country: string}>  $batch
     * @param  array<string, StreamCheck>  $lookup
     * @return array{total: int, alive: int, dead: int, rejected: int, discarded: bool}
     */
    private function checkBatch(array $batch, array $lookup, int $concurrency): array
    {
        $outcomes = $this->classify($batch, $concurrency);

        $attempted = 0;
        $failed = 0;
        $rejected = 0;

        foreach ($outcomes as $outcome) {
            if ($outcome['rejected']) {
                $rejected++;
                continue;
            }

            $attempted++;

            if (! $outcome['alive']) {
                $failed++;
            }
        }

        // Freno de red: si casi todo el lote falla, una petición de referencia
        // distingue una caída de red de streams realmente muertos.
        if ($attempted >= self::MIN_BRAKE_BATCH && ($failed / $attempted) > self::BRAKE_FAILURE_RATIO) {
            if (! $this->referenceReachable()) {
                Log::warning('posible fallo de red o certificados', [
                    'batch' => count($batch),
                    'attempted' => $attempted,
                    'failed' => $failed,
                ]);

                return [
                    'total' => $attempted,
                    'alive' => $attempted - $failed,
                    'dead' => $failed,
                    'rejected' => $rejected,
                    'discarded' => true,
                ];
            }
        }

        $this->persist($batch, $outcomes, $lookup);

        return [
            'total' => $attempted,
            'alive' => $attempted - $failed,
            'dead' => $failed,
            'rejected' => $rejected,
            'discarded' => false,
        ];
    }

    /**
     * Clasifica un lote siguiendo las redirecciones a mano y en paralelo.
     *
     * @param  array<int, array{item_id: string, streamUrl: string, country: string}>  $batch
     * @return array<int, array{alive: bool, http_status: ?int, error: ?string, rejected: bool}>
     */
    private function classify(array $batch, int $concurrency): array
    {
        $outcomes = [];
        $pending = [];

        foreach ($batch as $key => $pair) {
            $pending[$key] = ['url' => $pair['streamUrl'], 'redirects' => 0];
        }

        for ($round = 0; $round <= self::MAX_REDIRECTS; $round++) {
            if ($pending === []) {
                break;
            }

            $requests = [];
            $errnos = [];

            foreach ($pending as $key => $state) {
                try {
                    $pin = $this->guard->validate($state['url']);
                } catch (StreamUrlNotAllowedException $e) {
                    // Rechazo determinista: no depende de la red.
                    $outcomes[$key] = ['alive' => false, 'http_status' => null, 'error' => $e->reason, 'rejected' => true];
                    continue;
                }

                $sink = fopen('php://temp', 'w+');
                $requests[$key] = ['url' => $state['url'], 'sink' => $sink, 'pin' => $pin];
                $errnos[$key] = null;
            }

            if ($requests === []) {
                break;
            }

            $results = Http::pool(function (Pool $pool) use ($requests, &$errnos) {
                foreach ($requests as $key => $request) {
                    $pool->as((string) $key)
                        ->withOptions($this->requestOptions($request['pin'], $request['sink'], $errnos, $key))
                        ->get($request['url']);
                }
            }, $concurrency);

            $next = [];

            foreach ($requests as $key => $request) {
                $state = $pending[$key];
                $result = $results[$key] ?? null;

                if ($result instanceof Throwable) {
                    $outcomes[$key] = $this->outcomeFromError($result, $errnos[$key]);
                    fclose($request['sink']);
                    continue;
                }

                $status = $result->status();
                $location = $result->header('Location');

                if ($status >= 300 && $status < 400 && is_string($location) && $location !== '') {
                    fclose($request['sink']);

                    if ($state['redirects'] >= self::MAX_REDIRECTS) {
                        $outcomes[$key] = ['alive' => false, 'http_status' => $status, 'error' => 'redireccion', 'rejected' => false];
                        continue;
                    }

                    $nextUrl = $this->absoluteUrl($state['url'], $location);

                    if ($nextUrl === null) {
                        $outcomes[$key] = ['alive' => false, 'http_status' => $status, 'error' => 'redireccion', 'rejected' => false];
                        continue;
                    }

                    $next[$key] = ['url' => $nextUrl, 'redirects' => $state['redirects'] + 1];
                    continue;
                }

                if ($status === 200) {
                    // Se ignoran BOM y espacios iniciales antes de comprobar el
                    // encabezado del manifiesto HLS.
                    $body = ltrim($this->readPrefix($request['sink']), "\xEF\xBB\xBF \t\n\r\0\x0B");
                    $alive = str_starts_with($body, '#EXTM3U');

                    if ($alive) {
                        $outcomes[$key] = ['alive' => true, 'http_status' => 200, 'error' => null, 'rejected' => false];
                    } else {
                        // Un 200 incompleto por timeout no es un "no HLS": se
                        // distingue por el código del manejador (28).
                        $error = ($result->transferStats?->getHandlerErrorData() === 28) ? 'timeout' : 'no_hls';
                        $outcomes[$key] = ['alive' => false, 'http_status' => 200, 'error' => $error, 'rejected' => false];
                    }
                } else {
                    $outcomes[$key] = ['alive' => false, 'http_status' => $status, 'error' => 'http_'.$status, 'rejected' => false];
                }

                fclose($request['sink']);
            }

            $pending = $next;
        }

        // Por robustez: si quedó algún estado sin resolver, se marca redirección.
        foreach (array_keys($pending) as $key) {
            $outcomes[$key] ??= ['alive' => false, 'http_status' => null, 'error' => 'redireccion', 'rejected' => false];
        }

        return $outcomes;
    }

    /**
     * Opciones Guzzle por petición: sin redirecciones automáticas, sink en
     * memoria, corte a 4 KB y fijado de la IP resuelta.
     *
     * @param  array{host: string, port: int, ip: ?string}  $pin
     * @param  resource  $sink
     * @param  array<int|string, mixed>  $errnos
     * @return array<string, mixed>
     */
    private function requestOptions(array $pin, $sink, array &$errnos, string $key): array
    {
        $options = [
            'allow_redirects' => false,
            'connect_timeout' => self::TIMEOUT_SECONDS,
            'sink' => $sink,
            // Se aborta la descarga al superar 4 KB: un HLS grande no se trae entero.
            'progress' => function ($downloadTotal, $downloaded) {
                return $downloaded > self::MAX_BODY_BYTES;
            },
            'on_stats' => function ($transferStats) use (&$errnos, $key) {
                $errnos[$key] = $transferStats->getHandlerErrorData();
            },
        ];

        $resolve = $this->resolveOption($pin);

        if ($resolve !== []) {
            $options['curl'] = $resolve;
        }

        return $options;
    }

    /**
     * @param  array{host: string, port: int, ip: ?string}  $pin
     * @return array<int, array<int, string>>
     */
    private function resolveOption(array $pin): array
    {
        if ($pin['ip'] === null || ! defined('CURLOPT_RESOLVE')) {
            return [];
        }

        // IPv6 va entre corchetes en la entrada de CURLOPT_RESOLVE.
        $target = str_contains($pin['ip'], ':') ? '['.$pin['ip'].']' : $pin['ip'];

        return [CURLOPT_RESOLVE => [$pin['host'].':'.$pin['port'].':'.$target]];
    }

    /**
     * @return array{alive: bool, http_status: ?int, error: string, rejected: bool}
     */
    private function outcomeFromError(Throwable $e, mixed $errno): array
    {
        $code = $errno ?? $this->errnoFromMessage($e);

        $error = match (true) {
            $code === 28 => 'timeout',
            $code === 6 => 'dns',
            in_array($code, [35, 51, 53, 58, 60], true) => 'tls',
            default => 'red',
        };

        return ['alive' => false, 'http_status' => null, 'error' => $error, 'rejected' => false];
    }

    private function errnoFromMessage(Throwable $e): ?int
    {
        $message = $e->getMessage();

        if (preg_match('/cURL error (\d+)/', $message, $matches)) {
            return (int) $matches[1];
        }

        // Laravel envuelve la excepción de Guzzle; se recorre la cadena.
        for ($current = $e->getPrevious(); $current !== null; $current = $current->getPrevious()) {
            if (preg_match('/cURL error (\d+)/', $current->getMessage(), $matches)) {
                return (int) $matches[1];
            }
        }

        return null;
    }

    /**
     * @param  resource  $sink
     */
    private function readPrefix($sink): string
    {
        if (! is_resource($sink)) {
            return '';
        }

        rewind($sink);

        return (string) stream_get_contents($sink, self::MAX_BODY_BYTES);
    }

    private function absoluteUrl(string $base, string $location): ?string
    {
        $location = trim($location);

        if ($location === '') {
            return null;
        }

        $parts = parse_url($location);

        if ($parts === false) {
            return null;
        }

        if (isset($parts['scheme'])) {
            return in_array(strtolower($parts['scheme']), ['http', 'https'], true) ? $location : null;
        }

        $baseParts = parse_url($base);

        if ($baseParts === false || ! isset($baseParts['scheme'], $baseParts['host'])) {
            return null;
        }

        $authority = $baseParts['host'].(isset($baseParts['port']) ? ':'.$baseParts['port'] : '');

        if (str_starts_with($location, '//')) {
            return $baseParts['scheme'].':'.$location;
        }

        if (str_starts_with($location, '/')) {
            return $baseParts['scheme'].'://'.$authority.$location;
        }

        $path = $baseParts['path'] ?? '/';
        $dir = substr($path, 0, (int) strrpos($path, '/') + 1);

        return $baseParts['scheme'].'://'.$authority.$dir.$location;
    }

    private function referenceReachable(): bool
    {
        $url = $this->referenceUrl ?? self::REFERENCE_URL;

        try {
            $pin = $this->guard->validate($url);
        } catch (StreamUrlNotAllowedException) {
            return false;
        }

        $options = ['connect_timeout' => self::TIMEOUT_SECONDS];

        $resolve = $this->resolveOption($pin);

        if ($resolve !== []) {
            $options['curl'] = $resolve;
        }

        try {
            $response = Http::withOptions($options)
                ->timeout(self::TIMEOUT_SECONDS)
                ->withUserAgent(self::USER_AGENT)
                ->get($url);

            return $response->successful();
        } catch (Throwable $e) {
            Log::warning('Freno de red: la referencia no respondió.', ['url' => $url, 'error' => $e->getMessage()]);

            return false;
        }
    }

    /**
     * Persiste el lote con un único upsert.
     *
     * @param  array<int, array{item_id: string, streamUrl: string, country: string}>  $batch
     * @param  array<int, array{alive: bool, http_status: ?int, error: ?string, rejected: bool}>  $outcomes
     * @param  array<string, StreamCheck>  $lookup
     */
    private function persist(array $batch, array $outcomes, array $lookup): void
    {
        $now = now();
        $rows = [];

        foreach ($outcomes as $key => $outcome) {
            $pair = $batch[$key];
            $previous = $lookup[$pair['item_id']."\0".$pair['streamUrl']] ?? null;

            if ($outcome['alive']) {
                $failures = 0;
                $isAlive = true;
                $error = null;
                $lastOkAt = $now;
            } else {
                $failures = min((int) ($previous?->consecutive_failures ?? 0) + 1, 65535);
                $isAlive = $failures < 3;
                $error = $outcome['error'];
                $lastOkAt = $previous?->last_ok_at;
            }

            $rows[] = [
                'item_id' => $pair['item_id'],
                'stream_url' => $pair['streamUrl'],
                'is_alive' => $isAlive,
                'consecutive_failures' => $failures,
                'http_status' => $outcome['http_status'],
                'error' => $error,
                'checked_at' => $now,
                'last_ok_at' => $lastOkAt,
            ];
        }

        if ($rows === []) {
            return;
        }

        StreamCheck::upsert(
            $rows,
            ['item_id', 'stream_url'],
            ['is_alive', 'consecutive_failures', 'http_status', 'error', 'checked_at', 'last_ok_at'],
        );
    }
}
