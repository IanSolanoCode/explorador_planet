<?php

namespace App\Http\Controllers;

use App\Exceptions\IptvOrgException;
use App\Http\Resources\TvChannelResource;
use App\Services\IptvOrgService;
use App\Support\BlockedItemFilter;
use App\Support\DeadStreamFilter;
use Illuminate\Support\Facades\Log;

class TvController extends Controller
{
    public function __construct(
        private readonly IptvOrgService $iptvOrg,
        private readonly BlockedItemFilter $blockedItemFilter,
        private readonly DeadStreamFilter $deadStreamFilter,
    ) {}

    public function __invoke(string $code)
    {
        return $this->respond($code, false);
    }

    public function adult(string $code)
    {
        return $this->respond($code, true);
    }

    private function respond(string $code, bool $adult)
    {
        $code = $this->validateCountryCode($code);

        try {
            $channels = $this->iptvOrg->channelsByCountry($code, $adult);
        } catch (IptvOrgException $e) {
            Log::warning('No se pudo obtener la TV desde iptv-org.', [
                'country' => $code,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'No se pudo obtener la TV desde iptv-org.',
                'error' => 'iptv_org_unavailable',
            ], 502);
        }

        // Se filtra después de la caché para que los bloqueos nuevos apliquen al instante.
        $channels = $this->blockedItemFilter->filter('tv', $channels);

        // Los streams caídos se ocultan por par exacto (item_id, streamUrl).
        $channels = $this->deadStreamFilter->filter($channels);

        return TvChannelResource::collection($channels);
    }
}
