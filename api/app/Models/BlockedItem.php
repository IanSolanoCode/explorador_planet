<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Item bloqueado globalmente por un administrador.
 *
 * La tabla evita duplicados mediante la clave única (type, item_id).
 */
class BlockedItem extends Model
{
    // blocked_by se asigna desde el usuario autenticado, no desde la petición.
    protected $fillable = [
        'type',
        'item_id',
        'reason',
    ];

    /**
     * Administrador que creó el bloqueo; puede ser null si la cuenta se eliminó.
     *
     * @return BelongsTo<User, $this>
     */
    public function blocker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'blocked_by');
    }
}
