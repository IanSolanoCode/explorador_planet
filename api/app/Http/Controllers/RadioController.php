<?php

namespace App\Http\Controllers;

use App\Http\Resources\RadioStationResource;
use App\Services\RadioBrowserService;

class RadioController extends Controller
{
    public function __construct(private readonly RadioBrowserService $radioBrowser) {}

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

        return RadioStationResource::collection($stations);
    }
}
