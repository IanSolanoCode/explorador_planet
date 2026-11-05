<?php

namespace App\Http\Requests;

use App\Models\BlockedItem;
use App\Models\Favorite;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Valida los datos para dar de alta un favorito.
 *
 * Invariantes de seguridad:
 * - El usuario debe estar autenticado (auth:sanctum).
 * - type solo admite 'tv' o 'radio'.
 * - country se normaliza a 2 letras mayúsculas.
 * - streamUrl y logo solo admiten esquemas http:// y https://.
 * - Se rechaza con 422 si el item está bloqueado globalmente,
 *   si ya existe para el usuario o si supera el límite de 200 favoritos.
 */
class StoreFavoriteRequest extends FormRequest
{
    /**
     * El endpoint requiere usuario autenticado; la autorización la garantiza auth:sanctum.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normaliza los datos antes de aplicar las reglas de validación.
     */
    protected function prepareForValidation(): void
    {
        $country = $this->input('country');
        if (is_string($country)) {
            $this->merge([
                'country' => strtoupper(trim($country)),
            ]);
        }

        $itemId = $this->input('itemId');
        if (is_string($itemId)) {
            $this->merge([
                'itemId' => trim($itemId),
            ]);
        }

        $name = $this->input('name');
        if (is_string($name)) {
            $this->merge([
                'name' => trim($name),
            ]);
        }
    }

    /**
     * Reglas de validación para los campos del favorito.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::in(['tv', 'radio'])],
            'itemId' => ['required', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'country' => ['required', 'string', 'size:2', 'regex:/^[A-Z]{2}$/'],
            // Exige esquema http o https explícito; descarta javascript:, data:, ftp:, etc.
            'streamUrl' => ['required', 'string', 'regex:/^https?:\/\//i'],
            'logo' => ['nullable', 'string', 'regex:/^https?:\/\//i'],
        ];
    }

    /**
     * Mensajes de error en español para fallos de validación sintáctica.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'type.required' => 'El tipo de contenido es obligatorio.',
            'type.in' => 'El tipo de contenido debe ser tv o radio.',
            'itemId.required' => 'El identificador del item es obligatorio.',
            'itemId.max' => 'El identificador del item no puede superar los 255 caracteres.',
            'name.required' => 'El nombre es obligatorio.',
            'name.max' => 'El nombre no puede superar los 255 caracteres.',
            'country.required' => 'El código de país es obligatorio.',
            'country.size' => 'El código de país debe tener exactamente 2 letras.',
            'country.regex' => 'El código de país debe componerse de 2 letras.',
            'streamUrl.required' => 'La URL de transmisión es obligatoria.',
            'streamUrl.regex' => 'La URL de transmisión solo acepta esquemas http y https.',
            'logo.regex' => 'El logo solo acepta esquemas http y https.',
        ];
    }

    /**
     * Comprueba las reglas de negocio tras la validación sintáctica.
     *
     * Invariantes:
     * - No permite más de Favorite::MAX_PER_USER (200) favoritos por usuario.
     * - No permite agregar items registrados en blocked_items.
     * - No permite duplicar la tupla (type, itemId) para el mismo usuario.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            // Evita consultas a la base de datos si los campos básicos ya son inválidos.
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $user = $this->user();
            if (! $user) {
                return;
            }

            // Límite de favoritos por cuenta.
            if ($user->favorites()->count() >= Favorite::MAX_PER_USER) {
                $validator->errors()->add('favorite', 'Has alcanzado el límite máximo de ' . Favorite::MAX_PER_USER . ' favoritos.');
                return;
            }

            $type = (string) $this->input('type');
            $itemId = (string) $this->input('itemId');

            // Item bloqueado globalmente por administración.
            if (BlockedItem::where('type', $type)->where('item_id', $itemId)->exists()) {
                $validator->errors()->add('itemId', 'Este contenido ha sido bloqueado por administración.');
                return;
            }

            // Duplicado en la colección del usuario.
            if ($user->favorites()->where('type', $type)->where('item_id', $itemId)->exists()) {
                $validator->errors()->add('itemId', 'El contenido ya está en tus favoritos.');
                return;
            }
        });
    }
}
