<?php

namespace Tests\Unit;

use App\Exceptions\StreamUrlNotAllowedException;
use App\Support\StreamUrlGuard;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Verifica el guardado de seguridad de URLs de stream sin tocar red ni base.
 *
 * La resolución DNS se inyecta para no depender del sistema.
 */
class StreamUrlGuardTest extends TestCase
{
    public function test_accepts_public_ipv4_literal(): void
    {
        $pin = $this->guard()->validate('https://93.184.216.34/path.m3u8');

        $this->assertSame('93.184.216.34', $pin['host']);
        $this->assertSame(443, $pin['port']);
        $this->assertNull($pin['ip']); // literal: no hace falta fijar
    }

    public function test_accepts_public_ipv6_literal(): void
    {
        $pin = $this->guard()->validate('http://[2001:4860:4860::8888]/x');

        $this->assertSame('2001:4860:4860::8888', $pin['host']);
        $this->assertSame(80, $pin['port']);
        $this->assertNull($pin['ip']);
    }

    public function test_resolves_hostname_and_returns_ip_to_pin(): void
    {
        $guard = $this->guard(fn (string $host): array => $host === 'tv.example.com' ? ['8.8.8.8'] : []);

        $pin = $guard->validate('https://tv.example.com/stream');

        $this->assertSame('tv.example.com', $pin['host']);
        $this->assertSame('8.8.8.8', $pin['ip']);
    }

    public function test_rejects_non_http_scheme(): void
    {
        $this->assertRejected('ftp://93.184.216.34/file', 'direccion_no_permitida');
        $this->assertRejected('javascript:alert(1)', 'direccion_no_permitida');
    }

    public function test_rejects_localhost_and_subdomains(): void
    {
        $this->assertRejected('http://localhost/x', 'direccion_no_permitida');
        $this->assertRejected('http://api.localhost/x', 'direccion_no_permitida');
    }

    public function test_rejects_numeric_and_hex_ip_forms(): void
    {
        $this->assertRejected('http://2130706433/x', 'direccion_no_permitida'); // 127.0.0.1
        $this->assertRejected('http://0x7f000001/x', 'direccion_no_permitida');
    }

    /**
     * @return array<int, string>
     */
    public static function privateV4Provider(): array
    {
        return [
            ['127.0.0.1'],
            ['10.0.0.1'],
            ['172.16.0.1'],
            ['192.168.1.1'],
            ['169.254.169.254'],
            ['0.0.0.0'],
            ['100.64.0.1'],
            ['198.18.0.1'],
            ['224.0.0.1'],
            ['240.0.0.1'],
            ['192.0.2.1'],
            ['198.51.100.1'],
            ['203.0.113.1'],
        ];
    }

    /**
     * @dataProvider privateV4Provider
     */
    #[DataProvider('privateV4Provider')]
    public function test_rejects_private_ipv4(string $ip): void
    {
        $this->assertRejected('http://'.$ip.'/x', 'direccion_no_permitida');
    }

    /**
     * @return array<int, string>
     */
    public static function privateV6Provider(): array
    {
        return [
            ['::1'],
            ['::'],
            ['fc00::1'],
            ['fe80::1'],
            ['2001:db8::1'],
            ['ff02::1'],
        ];
    }

    /**
     * @dataProvider privateV6Provider
     */
    #[DataProvider('privateV6Provider')]
    public function test_rejects_private_ipv6(string $ip): void
    {
        $this->assertRejected('http://['.$ip.']/x', 'direccion_no_permitida');
    }

    public function test_rejects_ipv4_mapped_ipv6(): void
    {
        $this->assertRejected('http://[::ffff:127.0.0.1]/x', 'direccion_no_permitida');
    }

    public function test_rejects_nat64_embedding_private_v4(): void
    {
        $this->assertRejected('http://[64:ff9b::7f00:1]/x', 'direccion_no_permitida');
    }

    public function test_rejects_embedded_credentials(): void
    {
        $this->assertRejected('http://user:secret@93.184.216.34/x', 'direccion_no_permitida');
    }

    public function test_rejects_private_ip_returned_by_resolver(): void
    {
        $guard = $this->guard(fn (): array => ['10.0.0.5']);

        $this->assertRejectedWithGuard($guard, 'http://tv.example.com/x', 'direccion_no_permitida');
    }

    public function test_rejects_mixed_public_and_private_resolution(): void
    {
        $guard = $this->guard(fn (): array => ['8.8.8.8', '192.168.1.1']);

        $this->assertRejectedWithGuard($guard, 'http://tv.example.com/x', 'direccion_no_permitida');
    }

    public function test_dns_failure_is_reported_as_dns(): void
    {
        $guard = $this->guard(fn (): array => []);

        $this->assertRejectedWithGuard($guard, 'http://tv.example.com/x', 'dns');
    }

    private function guard(?callable $resolver = null): StreamUrlGuard
    {
        return new StreamUrlGuard($resolver);
    }

    private function assertRejected(string $url, string $reason): void
    {
        $this->assertRejectedWithGuard($this->guard(fn (): array => ['8.8.8.8']), $url, $reason);
    }

    private function assertRejectedWithGuard(StreamUrlGuard $guard, string $url, string $reason): void
    {
        try {
            $guard->validate($url);
            $this->fail('Se esperaba StreamUrlNotAllowedException para '.$url);
        } catch (StreamUrlNotAllowedException $e) {
            $this->assertSame($reason, $e->reason);
        }
    }
}
