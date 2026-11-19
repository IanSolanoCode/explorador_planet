<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

/**
 * Verifica que streams:check queda programado cada hora sin solapamiento.
 *
 * Arranca el kernel de consola (para cargar routes/console.php) y luego
 * inspecciona el Schedule ya registrado.
 */
class StreamCheckSchedulerTest extends TestCase
{
    public function test_streams_check_is_scheduled_hourly_without_overlapping(): void
    {
        // Cargar routes/console.php a través del kernel de consola.
        $this->artisan('schedule:list')->assertSuccessful();

        $event = collect(app(Schedule::class)->events())
            ->first(fn ($event) => str_contains((string) ($event->command ?? ''), 'streams:check'));

        $this->assertNotNull($event, 'No se encontró streams:check en el scheduler.');

        $this->assertStringContainsString('--limit=800', (string) $event->command);
        $this->assertSame('0 * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
        $this->assertSame(50, $event->expiresAt);
    }
}
