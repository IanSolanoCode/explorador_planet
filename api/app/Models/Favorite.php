<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Favorito de TV o radio guardado por un usuario.
 *
 * La unicidad de (user_id, type, item_id) se garantiza en la base de datos.
 */
class Favorite extends Model
{
    /** Límite máximo de favoritos por usuario. */
    public const MAX_PER_USER = 200;

    // user_id se asigna desde la relación, no desde la petición.
    protected $fillable = [
        'type',
        'item_id',
        'name',
        'country',
        'stream_url',
        'logo',
    ];

    /**
     * Usuario propietario del favorito.
     *
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
