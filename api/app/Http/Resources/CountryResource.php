<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CountryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->resource['code'],
            'name' => $this->resource['name'],
            'officialName' => $this->resource['officialName'],
            'capital' => $this->resource['capital'],
            'region' => $this->resource['region'],
            'subregion' => $this->resource['subregion'],
            'population' => $this->resource['population'],
            'latlng' => $this->resource['latlng'],
            'flag' => $this->resource['flag'],
            'languages' => $this->resource['languages'],
            'currencies' => $this->resource['currencies'],
        ];
    }
}
