<?php

namespace App\Http\Controllers;

use App\Exceptions\IptvOrgException;
use App\Http\Resources\TvChannelResource;
use App\Services\IptvOrgService;
use Illuminate\Support\Facades\Log;

class TvController extends Controller
{
    public function __construct(private readonly IptvOrgService $iptvOrg) {}

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

        return TvChannelResource::collection($channels);
    }
}
