<?php

namespace App\Http\Requests;

use App\Models\BlockedItem;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Valida la creación de un bloqueo administrativo.
 *
 * La autorización real la realiza el middleware admin. blocked_by no se
 * valida ni se acepta desde el cuerpo: se asigna en el controlador.
 */
class StoreBlockedItemRequest extends FormRequest
{
    /**
     * La ruta ya está protegida por auth:sanctum y admin.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normaliza texto para que espacios en blanco no pasen como válidos.
     */
    protected function prepareForValidation(): void
    {
        foreach (['itemId', 'reason'] as $field) {
            $value = $this->input($field);

            if (is_string($value)) {
                $this->merge([
                    $field => trim($value),
                ]);
            }
        }
    }

    /**
     * Reglas sintácticas del bloqueo.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::in(['tv', 'radio'])],
            'itemId' => ['required', 'string', 'max:255'],
            'reason' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * Mensajes de validación en español.
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
            'reason.required' => 'El motivo del bloqueo es obligatorio.',
            'reason.max' => 'El motivo del bloqueo no puede superar los 255 caracteres.',
        ];
    }

    /**
     * Rechaza duplicados de (type, itemId) con un 422 claro.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $exists = BlockedItem::where('type', (string) $this->input('type'))
                ->where('item_id', (string) $this->input('itemId'))
                ->exists();

            if ($exists) {
                $validator->errors()->add(
                    'itemId',
                    'Este contenido ya está bloqueado.'
                );
            }
        });
    }
}
