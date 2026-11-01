<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

/**
 * Valida y normaliza las credenciales de acceso.
 *
 * La contraseña no se somete a las reglas de complejidad del registro:
 * en login solo importa que coincida con el hash almacenado.
 */
class LoginRequest extends FormRequest
{
    /**
     * El login es un endpoint público.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normaliza el email para que coincida con el valor guardado en registro.
     */
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge([
                'email' => Str::lower(trim($this->input('email'))),
            ]);
        }
    }

    /**
     * Reglas de validación del login.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
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
            'email.required' => 'El email es obligatorio.',
            'email.email' => 'El email no es válido.',
            'password.required' => 'La contraseña es obligatoria.',
        ];
    }
}
