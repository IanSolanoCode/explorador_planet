<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Bloqueos globales de contenido. Un item solo puede bloquearse una vez.
 */
return new class extends Migration
{
    /**
     * Ejecuta la migración.
     */
    public function up(): void
    {
        Schema::create('blocked_items', function (Blueprint $table) {
            $table->id();
            $table->string('type', 10);
            $table->string('item_id', 255);
            $table->string('reason');
            // blocked_by puede quedar null si se elimina la cuenta del administrador.
            $table->foreignId('blocked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['type', 'item_id']);
        });
    }

    /**
     * Revierte la migración.
     */
    public function down(): void
    {
        Schema::dropIfExists('blocked_items');
    }
};
