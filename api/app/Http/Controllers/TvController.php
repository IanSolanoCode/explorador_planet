<?php

namespace App\Http\Controllers;

use App\Http\Resources\TvChannelResource;

class TvController extends Controller
{
    public function __invoke(string $code)
    {
        $code = $this->validateCountryCode($code);

        return TvChannelResource::collection($this->channels()[$code] ?? []);
    }

    /**
     * Datos mock temporalmente. Se sustituirán por IptvOrgService.
     *
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function channels(): array
    {
        return [
            'MX' => [
                [
                    'id' => 'tv-mx-1',
                    'name' => 'Canal 22',
                    'country' => 'MX',
                    'streamUrl' => 'https://example.com/streams/tv-mx-1.m3u8',
                    'logo' => 'https://example.com/logos/tv-mx-1.png',
                    'category' => 'Cultura',
                ],
                [
                    'id' => 'tv-mx-2',
                    'name' => 'TV UNAM',
                    'country' => 'MX',
                    'streamUrl' => 'https://example.com/streams/tv-mx-2.m3u8',
                    'logo' => 'https://example.com/logos/tv-mx-2.png',
                    'category' => 'Educación',
                ],
            ],
            'ES' => [
                [
                    'id' => 'tv-es-1',
                    'name' => 'TVE Internacional',
                    'country' => 'ES',
                    'streamUrl' => 'https://example.com/streams/tv-es-1.m3u8',
                    'logo' => 'https://example.com/logos/tv-es-1.png',
                    'category' => 'Generalista',
                ],
                [
                    'id' => 'tv-es-2',
                    'name' => 'Canal 24 Horas',
                    'country' => 'ES',
                    'streamUrl' => 'https://example.com/streams/tv-es-2.m3u8',
                    'logo' => 'https://example.com/logos/tv-es-2.png',
                    'category' => 'Noticias',
                ],
            ],
            'AR' => [
                [
                    'id' => 'tv-ar-1',
                    'name' => 'Televisión Pública',
                    'country' => 'AR',
                    'streamUrl' => 'https://example.com/streams/tv-ar-1.m3u8',
                    'logo' => 'https://example.com/logos/tv-ar-1.png',
                    'category' => 'Generalista',
                ],
                [
                    'id' => 'tv-ar-2',
                    'name' => 'Encuentro',
                    'country' => 'AR',
                    'streamUrl' => 'https://example.com/streams/tv-ar-2.m3u8',
                    'logo' => 'https://example.com/logos/tv-ar-2.png',
                    'category' => 'Cultura',
                ],
            ],
        ];
    }
}
