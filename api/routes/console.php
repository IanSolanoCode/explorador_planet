<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Comprobación horaria de los streams de TV.
 *
 * No se usa ->timeout(): los eventos del scheduler de esta versión de Laravel
 * no exponen ese método. El comando se autolimita con un tope interno de 40
 * minutos y withoutOverlapping evita solapamientos; su mutex expira a los 50
 * minutos por si el proceso se interrumpe.
 */
Schedule::command('streams:check --limit=800')->hourly()->withoutOverlapping(50);
