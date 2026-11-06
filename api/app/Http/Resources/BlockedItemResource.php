<?php

namespace App\Http\Resources;

use App\Models\BlockedItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Contrato JSON en camelCase de un bloqueo administrativo.
 *
 * @mixin BlockedItem
 */
class BlockedItemResource extends JsonResource
{
    /**
     * Expone el bloqueo sin relaciones ni datos internos.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'itemId' => $this->item_id,
            'reason' => $this->reason,
            'blockedBy' => $this->blocked_by,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
