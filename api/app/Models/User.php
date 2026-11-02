<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Usuario de la aplicación.
 *
 * role queda fuera de Fillable a propósito: solo se asigna desde la
 * administración. Los tokens Bearer pertenecen a Sanctum.
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Atributos que deben convertirse a tipos nativos.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            // Laravel hashea la contraseña al asignarla; nunca se guarda en texto plano.
            'password' => 'hashed',
        ];
    }

    /**
     * Indica si el usuario tiene permisos de administración.
     */
    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    /**
     * Favoritos creados por el usuario.
     *
     * @return HasMany<Favorite, $this>
     */
    public function favorites(): HasMany
    {
        return $this->hasMany(Favorite::class);
    }

    /**
     * Items bloqueados por este administrador.
     *
     * @return HasMany<BlockedItem, $this>
     */
    public function blockedItems(): HasMany
    {
        return $this->hasMany(BlockedItem::class, 'blocked_by');
    }
}
