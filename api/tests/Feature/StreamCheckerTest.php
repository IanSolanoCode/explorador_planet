<?php

namespace Tests\Feature;

use App\Models\StreamCheck;
use App\Services\StreamChecker;
use App\Support\StreamUrlGuard;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Verifica StreamChecker con Http::fake e IPs literales (sin DNS real).
 *
 * Cubre: vivo, no-HLS, timeout, http_<status>, redirección relativa, redirección
 * a privada, redirección excesiva, tercer fallo consecutivo, reinicio tras éxito
 * y el freno de red con referencia viva y caída.
 */
class StreamCheckerTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
    }

    public function test_alive_stream_is_recorded(): void
    {
        Http::fake([
            'http://93.184.216.34/alive.m3u8' => Http::response("#EXTM3U\n#EXTINF:-1,Test\nhttp://x/1.ts\n"),
        ]);

        $this->checker()->check([$this->pair('ch-1', 'http://93.184.216.34/alive.m3u8')], [], 5);

        $row = StreamCheck::where('item_id', 'ch-1')->firstOrFail();

        $this->assertTrue($row->is_alive);
        $this->assertSame(0, $row->consecutive_failures);
        $this->assertNull($row->error);
        $this->assertSame(200, $row->http_status);
    }

    public function test_200_without_extm3u_is_no_hls_and_not_hidden_yet(): void
    {
        Http::fake([
            'http://93.184.216.34/plain.m3u8' => Http::response('hello world', 200),
        ]);

        $this->checker()->check([$this->pair('ch-1', 'http://93.184.216.34/plain.m3u8')], [], 5);

        $row = StreamCheck::where('item_id', 'ch-1')->firstOrFail();

        $this->assertSame('no_hls', $row->error);
        $this->assertSame(200, $row->http_status);
        $this->assertSame(1, $row->consecutive_failures);
        $this->assertTrue($row->is_alive); // primer fallo: aún visible
    }

    public function test_timeout_is_recorded(): void
    {
        Http::fake([
            'http://93.184.216.34/timeout.m3u8' => function () {
                throw new ConnectionException('cURL error 28: Operation timed out after 8001 ms');
            },
        ]);

        $this->checker()->check([$this->pair('ch-1', 'http://93.184.216.34/timeout.m3u8')], [], 5);

        $row = StreamCheck::where('item_id', 'ch-1')->firstOrFail();

        $this->assertSame('timeout', $row->error);
        $this->assertNull($row->http_status);
    }

    public function test_http_error_status_is_recorded(): void
    {
        Http::fake([
            'http://93.184.216.34/missing.m3u8' => Http::response('not found', 404),
        ]);

        $this->checker()->check([$this->pair('ch-1', 'http://93.184.216.34/missing.m3u8')], [], 5);

        $row = StreamCheck::where('item_id', 'ch-1')->firstOrFail();

        $this->assertSame('http_404', $row->error);
        $this->assertSame(404, $row->http_status);
    }

    public function test_relative_redirect_is_followed(): void
    {
        Http::fake([
            'http://93.184.216.34/start.m3u8' => Http::response('', 302, ['Location' => '/real.m3u8']),
            'http://93.184.216.34/real.m3u8' => Http::response("#EXTM3U\n#EXTINF:-1,x\n", 200),
        ]);

        $this->checker()->check([$this->pair('ch-1', 'http://93.184.216.34/start.m3u8')], [], 5);

        $row = StreamCheck::where('item_id', 'ch-1')->firstOrFail();

        $this->assertTrue($row->is_alive);
        $this->assertNull($row->error);
    }

    public function test_redirect_to_private_is_rejected(): void
    {
        Http::fake([
            'http://93.184.216.34/start.m3u8' => Http::response('', 302, ['Location' => 'http://127.0.0.1/steal']),
        ]);

        $this->checker()->check([$this->pair('ch-1', 'http://93.184.216.34/start.m3u8')], [], 5);

        $row = StreamCheck::where('item_id', 'ch-1')->firstOrFail();

        $this->assertSame('direccion_no_permitida', $row->error);
    }

    public function test_excessive_redirects_are_marked_redireccion(): void
    {
        Http::fake([
            'http://93.184.216.34/loop.m3u8' => Http::response('', 302, ['Location' => 'http://93.184.216.34/loop.m3u8']),
        ]);

        $this->checker()->check([$this->pair('ch-1', 'http://93.184.216.34/loop.m3u8')], [], 5);

        $row = StreamCheck::where('item_id', 'ch-1')->firstOrFail();

        $this->assertSame('redireccion', $row->error);
        $this->assertSame(302, $row->http_status);
    }

    public function test_stream_hides_only_on_third_consecutive_failure(): void
    {
        Http::fake([
            'http://93.184.216.34/dead.m3u8' => function () {
                throw new ConnectionException('cURL error 28: Operation timed out');
            },
        ]);

        $checker = $this->checker();
        $pair = $this->pair('ch-1', 'http://93.184.216.34/dead.m3u8');

        $checker->check([$pair], [], 5);
        $this->assertSame(1, $this->row('ch-1')->consecutive_failures);
        $this->assertTrue($this->row('ch-1')->is_alive);

        $checker->check([$pair], $this->lookup(), 5);
        $this->assertSame(2, $this->row('ch-1')->consecutive_failures);
        $this->assertTrue($this->row('ch-1')->is_alive);

        $checker->check([$pair], $this->lookup(), 5);
        $this->assertSame(3, $this->row('ch-1')->consecutive_failures);
        $this->assertFalse($this->row('ch-1')->is_alive);
    }

    public function test_success_resets_consecutive_failures(): void
    {
        $attempts = 0;

        Http::fake([
            'http://93.184.216.34/flap.m3u8' => function () use (&$attempts) {
                $attempts++;

                if ($attempts <= 2) {
                    throw new ConnectionException('cURL error 28: Operation timed out');
                }

                return Http::response("#EXTM3U\n#EXTINF:-1,x\n", 200);
            },
        ]);

        $checker = $this->checker();
        $pair = $this->pair('ch-1', 'http://93.184.216.34/flap.m3u8');

        $checker->check([$pair], [], 5);
        $checker->check([$pair], $this->lookup(), 5);
        $this->assertSame(2, $this->row('ch-1')->consecutive_failures);

        $checker->check([$pair], $this->lookup(), 5);

        $row = $this->row('ch-1');
        $this->assertTrue($row->is_alive);
        $this->assertSame(0, $row->consecutive_failures);
        $this->assertNull($row->error);
        $this->assertNotNull($row->last_ok_at);
    }

    public function test_network_brake_discards_batch_when_reference_down(): void
    {
        Http::fake([
            'http://93.184.216.34/stream/*' => function () {
                throw new ConnectionException('cURL error 28: Operation timed out');
            },
            'http://8.8.8.8/reference.json' => function () {
                throw new ConnectionException('cURL error 28: Operation timed out');
            },
        ]);

        $pairs = $this->manyPairs(20);

        $summary = $this->checker()->check($pairs, [], 10);

        $this->assertTrue($summary['discarded']);
        $this->assertSame(0, StreamCheck::count());
    }

    public function test_network_brake_writes_when_reference_up(): void
    {
        Http::fake([
            'http://93.184.216.34/stream/*' => function () {
                throw new ConnectionException('cURL error 28: Operation timed out');
            },
            'http://8.8.8.8/reference.json' => Http::response('[]', 200),
        ]);

        $pairs = $this->manyPairs(20);

        $summary = $this->checker()->check($pairs, [], 10);

        $this->assertFalse($summary['discarded']);
        $this->assertSame(20, StreamCheck::count());

        foreach (StreamCheck::all() as $row) {
            $this->assertSame('timeout', $row->error);
            $this->assertSame(1, $row->consecutive_failures);
            $this->assertTrue($row->is_alive);
        }
    }

    /**
     * @param  int  $count
     * @return array<int, array{item_id: string, streamUrl: string, country: string}>
     */
    private function manyPairs(int $count): array
    {
        $pairs = [];

        for ($i = 1; $i <= $count; $i++) {
            $pairs[] = $this->pair("ch-$i", "http://93.184.216.34/stream/$i.m3u8");
        }

        return $pairs;
    }

    /**
     * @return array{item_id: string, streamUrl: string, country: string}
     */
    private function pair(string $id, string $url): array
    {
        return ['item_id' => $id, 'streamUrl' => $url, 'country' => 'MX'];
    }

    private function checker(): StreamChecker
    {
        // Resolver inyectado para evitar DNS real; la URL de referencia es una
        // IP literal para que el freno de red no dependa del sistema.
        return new StreamChecker(
            new StreamUrlGuard(fn (string $host): array => ['93.184.216.34']),
            'http://8.8.8.8/reference.json',
        );
    }

    private function row(string $id): StreamCheck
    {
        return StreamCheck::where('item_id', $id)->firstOrFail();
    }

    /**
     * @return array<string, StreamCheck>
     */
    private function lookup(): array
    {
        $lookup = [];

        foreach (StreamCheck::all() as $row) {
            $lookup[$row->item_id."\0".$row->stream_url] = $row;
        }

        return $lookup;
    }
}
