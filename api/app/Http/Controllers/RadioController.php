<?php

namespace App\Http\Controllers;

use App\Http\Resources\RadioStationResource;

class RadioController extends Controller
{
    public function __invoke(string $code)
    {
        $code = $this->validateCountryCode($code);

        return RadioStationResource::collection($this->stations()[$code] ?? []);
    }

    /**
     * Datos mock temporalmente. Se sustituirán por RadioBrowserService.
     *
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function stations(): array
    {
        return [
            'MX' => [
                [
                    'id' => 'radio-mx-1',
                    'name' => 'Radio Fórmula',
                    'country' => 'MX',
                    'streamUrl' => 'https://example.com/streams/radio-mx-1.mp3',
                    'logo' => 'https://example.com/logos/radio-mx-1.png',
                    'tags' => ['noticias', 'hablada'],
                ],
                [
                    'id' => 'radio-mx-2',
                    'name' => 'Los 40 México',
                    'country' => 'MX',
                    'streamUrl' => 'https://example.com/streams/radio-mx-2.mp3',
                    'logo' => 'https://example.com/logos/radio-mx-2.png',
                    'tags' => ['pop', 'música'],
                ],
            ],
            'ES' => [
                [
                    'id' => 'radio-es-1',
                    'name' => 'Cadena SER',
                    'country' => 'ES',
                    'streamUrl' => 'https://example.com/streams/radio-es-1.mp3',
                    'logo' => 'https://example.com/logos/radio-es-1.png',
                    'tags' => ['noticias', 'hablada'],
                ],
                [
                    'id' => 'radio-es-2',
                    'name' => 'LOS40 España',
                    'country' => 'ES',
                    'streamUrl' => 'https://example.com/streams/radio-es-2.mp3',
                    'logo' => 'https://example.com/logos/radio-es-2.png',
                    'tags' => ['pop', 'música'],
                ],
            ],
            'AR' => [
                [
                    'id' => 'radio-ar-1',
                    'name' => 'Radio Nacional',
                    'country' => 'AR',
                    'streamUrl' => 'https://example.com/streams/radio-ar-1.mp3',
                    'logo' => 'https://example.com/logos/radio-ar-1.png',
                    'tags' => ['noticias', 'cultura'],
                ],
                [
                    'id' => 'radio-ar-2',
                    'name' => 'La 100',
                    'country' => 'AR',
                    'streamUrl' => 'https://example.com/streams/radio-ar-2.mp3',
                    'logo' => 'https://example.com/logos/radio-ar-2.png',
                    'tags' => ['pop', 'música'],
                ],
            ],
        ];
    }
}
