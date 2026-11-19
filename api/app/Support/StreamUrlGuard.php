<?php

namespace App\Support;

use App\Exceptions\StreamUrlNotAllowedException;

/**
 * Valida que una URL de stream sea segura antes de pedirla por HTTP.
 *
 * Bloquea direcciones privadas, locales, de enlace local y de metadatos en la
 * nube para evitar peticiones SSRF desde el servidor. Además de validar cada
 * salto, devuelve la IP resuelta para fijarla con CURLOPT_RESOLVE y evitar
 * que el DNS cambie entre la validación y la conexión (DNS rebinding).
 */
class StreamUrlGuard
{
    /**
     * Rangos IPv4 no enrutables/reservados (red, prefijo).
     */
    private const PRIVATE_V4 = [
        ['0.0.0.0', 8],
        ['10.0.0.0', 8],
        ['100.64.0.0', 10],
        ['127.0.0.0', 8],
        ['169.254.0.0', 16],
        ['172.16.0.0', 12],
        ['192.168.0.0', 16],
        ['192.0.0.0', 24],
        ['192.0.2.0', 24],
        ['198.18.0.0', 15],
        ['198.51.100.0', 24],
        ['203.0.113.0', 24],
        ['224.0.0.0', 4],
        ['240.0.0.0', 4],
    ];

    /**
     * @var callable(string): array<int, string>
     */
    private $resolver;

    /**
     * @param  (callable(string): array<int, string>)|null  $resolver  Resolución
     *   inyectable para tests; por defecto usa gethostbynamel + DNS_AAAA.
     */
    public function __construct(?callable $resolver = null)
    {
        $this->resolver = $resolver ?? function (string $host): array {
            $ips = [];

            // gethostbynamel consulta también el archivo hosts; devuelve IPv4.
            $v4 = @gethostbynamel($host);

            if (is_array($v4)) {
                $ips = array_merge($ips, $v4);
            }

            // Complementa con IPv6, que gethostbynamel no devuelve.
            $aaaa = @dns_get_record($host, DNS_AAAA);

            if (is_array($aaaa)) {
                foreach ($aaaa as $record) {
                    if (isset($record['ipv6'])) {
                        $ips[] = $record['ipv6'];
                    }
                }
            }

            return array_values(array_unique($ips));
        };
    }

    /**
     * Valida la URL y devuelve el host, el puerto y la IP a fijar.
     *
     * `ip` es null cuando el host ya es una IP pública literal (no hace falta
     * fijar nada) y la IP resuelta en caso contrario.
     *
     * @return array{host: string, port: int, ip: ?string}
     *
     * @throws StreamUrlNotAllowedException
     */
    public function validate(string $url): array
    {
        $parts = parse_url($url);

        if ($parts === false) {
            throw StreamUrlNotAllowedException::notAllowed($url);
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));

        if (! in_array($scheme, ['http', 'https'], true)) {
            throw StreamUrlNotAllowedException::notAllowed((string) ($parts['host'] ?? $url));
        }

        // Se rechazan credenciales embebidas (user:pass@) para no enviarlas.
        if (($parts['user'] ?? '') !== '' || ($parts['pass'] ?? '') !== '') {
            throw StreamUrlNotAllowedException::notAllowed((string) ($parts['host'] ?? $url));
        }

        $host = (string) ($parts['host'] ?? '');

        if ($host === '') {
            throw StreamUrlNotAllowedException::notAllowed($url);
        }

        $host = strtolower(rtrim($host, '.'));
        $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);

        // localhost y subdominios bajo él se tratan como locales (RFC 6761).
        if ($host === 'localhost' || str_ends_with($host, '.localhost')) {
            throw StreamUrlNotAllowedException::notAllowed($host);
        }

        // Entero o hexadecimal: curl/OS podría reinterpretarlos como IPv4.
        if (preg_match('/^0x[0-9a-f]+$/i', $host) || preg_match('/^\d+$/', $host)) {
            throw StreamUrlNotAllowedException::notAllowed($host);
        }

        // Los literales IPv6 llegan entre corchetes en parse_url.
        if (str_starts_with($host, '[') && str_ends_with($host, ']')) {
            $host = substr($host, 1, -1);
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if (! $this->isPublicIp($host)) {
                throw StreamUrlNotAllowedException::notAllowed($host);
            }

            return ['host' => $host, 'port' => $port, 'ip' => null];
        }

        // Hostname: resolver y exigir que todas las direcciones sean públicas.
        $ips = ($this->resolver)($host);

        if ($ips === []) {
            throw StreamUrlNotAllowedException::dns($host);
        }

        foreach ($ips as $ip) {
            if (! $this->isPublicIp($ip)) {
                throw StreamUrlNotAllowedException::notAllowed($host);
            }
        }

        return ['host' => $host, 'port' => $port, 'ip' => $ips[0]];
    }

    private function isPublicIp(string $ip): bool
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return $this->isPublicIpv4($ip);
        }

        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            return $this->isPublicIpv6($ip);
        }

        return false;
    }

    private function isPublicIpv4(string $ip): bool
    {
        $ipLong = ip2long($ip);

        if ($ipLong === false) {
            return false;
        }

        foreach (self::PRIVATE_V4 as [$network, $bits]) {
            $networkLong = ip2long($network);
            $mask = ~0 << (32 - $bits);

            if (($ipLong & $mask) === ($networkLong & $mask)) {
                return false;
            }
        }

        return true;
    }

    private function isPublicIpv6(string $ip): bool
    {
        $bin = @inet_pton($ip);

        if ($bin === false || strlen($bin) !== 16) {
            return false;
        }

        // No especificada (::) y loopback (::1).
        if ($ip === '::' || $ip === '::1') {
            return false;
        }

        // IPv4-mapeada (::ffff:a.b.c.d) y NAT64 (64:ff9b::/96): valida la v4.
        if (str_starts_with($bin, str_repeat("\0", 10)."\xff\xff")
            || str_starts_with($bin, "\x00\x64\xff\x9b".str_repeat("\0", 8))) {
            $v4 = long2ip(unpack('N', substr($bin, 12, 4))[1]);

            return $this->isPublicIpv4($v4);
        }

        // fc00::/7 (direcciones únicas locales).
        if ((ord($bin[0]) & 0xfe) === 0xfc) {
            return false;
        }

        // fe80::/10 (enlace local).
        if (ord($bin[0]) === 0xfe && (ord($bin[1]) & 0xc0) === 0x80) {
            return false;
        }

        // 2001:db8::/32 (documentación).
        if (ord($bin[0]) === 0x20 && ord($bin[1]) === 0x01
            && ord($bin[2]) === 0x0d && ord($bin[3]) === 0xb8) {
            return false;
        }

        // ff00::/8 (multidifusión).
        if (ord($bin[0]) === 0xff) {
            return false;
        }

        return true;
    }
}
