<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Credenciales del administrador inicial
    |--------------------------------------------------------------------------
    |
    | Estas variables se usan únicamente desde el comando admin:create.
    | No deben versionarse en el repositorio.
    |
    */

    'name' => env('ADMIN_NAME'),
    'email' => env('ADMIN_EMAIL'),
    'password' => env('ADMIN_PASSWORD'),
];
