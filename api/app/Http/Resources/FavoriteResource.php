<?php

namespace App\Http\Resources;

use App\Models\Favorite;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Normaliza un favorito del usuario al contrato JSON en camelCase.
 *
 * @mixin Favorite
 */
class FavoriteResource extends JsonResource
{
    /**
     * Transforma el modelo Favorite en un array con claves camelCase.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'itemId' => $this->item_id,
            'name' => $this->name,
            'country' => $this->country,
            'streamUrl' => $this->stream_url,
            'logo' => $this->logo,
        ];
    }
}

