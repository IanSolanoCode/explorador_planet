<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Resultado de la última comprobación de un stream de TV.
 *
 * La tabla usa la clave única (item_id, stream_url); is_alive solo cambia a
 * false cuando se acumulan tres fallos consecutivos, para no ocultar canales
 * por un corte puntual.
 */
class StreamCheck extends Model
{
    protected $fillable = [
        'item_id',
        'stream_url',
        'is_alive',
        'consecutive_failures',
        'http_status',
        'error',
        'checked_at',
        'last_ok_at',
    ];

    protected function casts(): array
    {
        return [
            'is_alive' => 'boolean',
            'consecutive_failures' => 'integer',
            'http_status' => 'integer',
            'checked_at' => 'datetime',
            'last_ok_at' => 'datetime',
        ];
    }
}
