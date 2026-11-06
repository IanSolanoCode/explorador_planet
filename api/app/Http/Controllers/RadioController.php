<?php

namespace App\Http\Controllers;

use App\Http\Resources\RadioStationResource;
use App\Services\RadioBrowserService;
use App\Support\BlockedItemFilter;

class RadioController extends Controller
{
    public function __construct(
        private readonly RadioBrowserService $radioBrowser,
        private readonly BlockedItemFilter $blockedItemFilter,
    ) {}

    public function __invoke(string $code)
    {
        $code = $this->validateCountryCode($code);

        $stations = $this->radioBrowser->stationsByCountry($code);

        if ($stations === null) {
            return response()->json([
                'message' => 'No se pudo obtener la radio desde Radio Browser.',
                'error' => 'radio_browser_unavailable',
            ], 502);
        }

        // Se filtra después de la caché para que los bloqueos nuevos apliquen al instante.
        $stations = $this->blockedItemFilter->filter('radio', $stations);

        return RadioStationResource::collection($stations);
    }
}
