<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Valida y normaliza los datos de registro.
 *
 * El email se guarda en minúsculas y el campo role se rechaza siempre:
 * el rol solo se asigna desde la administración.
 */
class RegisterRequest extends FormRequest
{
    /**
     * El registro es un endpoint público.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normaliza el email antes de validar para que la unicidad no dependa
     * de mayúsculas y minúsculas.
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
     * Reglas de validación del registro.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', Rule::unique(User::class)],
            // confirmed exige que coincida con password_confirmation.
            'password' => ['required', 'string', 'max:255', 'confirmed', Password::min(8)->mixedCase()->numbers()],
            // missing rechaza cualquier presencia de role, incluso null o cadena vacía.
            'role' => ['missing'],
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
            'name.required' => 'El nombre es obligatorio.',
            'email.required' => 'El email es obligatorio.',
            'email.email' => 'El email no es válido.',
            'email.unique' => 'El email ya está registrado.',
            'password.required' => 'La contraseña es obligatoria.',
            'password.confirmed' => 'La confirmación de la contraseña no coincide.',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres.',
            'password.mixed' => 'La contraseña debe incluir mayúsculas y minúsculas.',
            'password.numbers' => 'La contraseña debe incluir al menos un número.',
            'role.missing' => 'El campo role no está permitido.',
        ];
    }
}
