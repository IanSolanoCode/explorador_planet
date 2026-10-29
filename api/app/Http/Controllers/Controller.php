<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Validator;

abstract class Controller
{
    /**
     * Normaliza y valida que el código de país tenga exactamente 2 letras.
     */
    protected function validateCountryCode(string $code): string
    {
        $code = strtoupper($code);

        Validator::make(
            ['code' => $code],
            ['code' => ['required', 'string', 'regex:/^[A-Za-z]{2}$/']],
            [
                'code.required' => 'El código de país debe tener 2 letras.',
                'code.regex' => 'El código de país debe tener 2 letras.',
            ],
        )->validate();

        return $code;
    }
}
