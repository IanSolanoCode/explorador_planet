<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

/**
 * Configuración global de la aplicación.
 */
class AppServiceProvider extends ServiceProvider
{
    /**
     * Registra servicios de la aplicación.
     */
    public function register(): void
    {
        //
    }

    /**
     * Arranca los servicios y registra los limitadores de autenticación.
     */
    public function boot(): void
    {
        // Login: 5 intentos por minuto para la misma combinación email + IP.
        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return Limit::perMinute(5)->by($email.'|'.$request->ip());
        });

        // Registro: 5 altas por minuto desde la misma IP.
        RateLimiter::for('register', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });
    }
}
