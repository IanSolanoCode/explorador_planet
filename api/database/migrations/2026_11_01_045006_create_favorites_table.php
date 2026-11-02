<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Favoritos por usuario. La clave única evita duplicar el mismo item.
 */
return new class extends Migration
{
    /**
     * Ejecuta la migración.
     */
    public function up(): void
    {
        Schema::create('favorites', function (Blueprint $table) {
            $table->id();
            // Si se elimina el usuario, sus favoritos se eliminan en cascada.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // type identifica el módulo (tv|radio); item_id conserva el id de la fuente.
            $table->string('type', 10);
            $table->string('item_id', 255);
            $table->string('name');
            $table->string('country', 2);
            $table->text('stream_url');
            $table->text('logo')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'type', 'item_id']);
        });
    }

    /**
     * Revierte la migración.
     */
    public function down(): void
    {
        Schema::dropIfExists('favorites');
    }
};
