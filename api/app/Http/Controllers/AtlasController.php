<?php

namespace App\Http\Controllers;

use App\Http\Resources\CountryResource;

class AtlasController extends Controller
{
    public function __invoke(string $code)
    {
        $code = $this->validateCountryCode($code);
        $country = $this->countries()[$code] ?? null;

        if ($country === null) {
            return response()->json([
                'message' => "No hay datos de atlas para el país {$code}.",
            ], 404);
        }

        return new CountryResource($country);
    }

    /**
     * Datos mock temporalmente. Se sustituirán por RestCountriesService.
     *
     * @return array<string, array<string, mixed>>
     */
    private function countries(): array
    {
        return [
            'MX' => [
                'code' => 'MX',
                'name' => 'México',
                'officialName' => 'Estados Unidos Mexicanos',
                'capital' => 'Ciudad de México',
                'region' => 'Américas',
                'subregion' => 'América del Norte',
                'population' => 128932753,
                'latlng' => [23.0, -102.0],
                'flag' => 'https://flagcdn.com/w320/mx.png',
                'languages' => ['Español'],
                'currencies' => ['MXN - Peso mexicano'],
            ],
            'ES' => [
                'code' => 'ES',
                'name' => 'España',
                'officialName' => 'Reino de España',
                'capital' => 'Madrid',
                'region' => 'Europa',
                'subregion' => 'Europa del Sur',
                'population' => 47351567,
                'latlng' => [40.0, -4.0],
                'flag' => 'https://flagcdn.com/w320/es.png',
                'languages' => ['Español'],
                'currencies' => ['EUR - Euro'],
            ],
            'AR' => [
                'code' => 'AR',
                'name' => 'Argentina',
                'officialName' => 'República Argentina',
                'capital' => 'Buenos Aires',
                'region' => 'Américas',
                'subregion' => 'América del Sur',
                'population' => 45376763,
                'latlng' => [-34.0, -64.0],
                'flag' => 'https://flagcdn.com/w320/ar.png',
                'languages' => ['Español', 'Guaraní'],
                'currencies' => ['ARS - Peso argentino'],
            ],
        ];
    }
}
