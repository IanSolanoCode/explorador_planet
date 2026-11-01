<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Representación pública mínima del usuario.
 *
 * No expone password, remember_token, tokens de Sanctum ni relaciones.
 */
class UserResource extends JsonResource
{
    /**
     * Solo estos cuatro campos forman parte del contrato público.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
        ];
    }
}
