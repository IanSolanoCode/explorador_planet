<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Última comprobación conocida de cada stream de TV.
 *
 * La clave única (item_id, stream_url) permite varios streams por canal y
 * evita duplicados entre ejecuciones del comando. is_alive solo pasa a false
 * tras tres fallos consecutivos, así un fallo aislado no oculta el canal.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stream_checks', function (Blueprint $table) {
            $table->id();
            // Los ids de iptv-org son cortos; 191 mantiene la clave única por
            // debajo del límite de 3072 bytes de InnoDB con utf8mb4.
            $table->string('item_id', 191);
            $table->string('stream_url', 512);
            $table->boolean('is_alive')->default(false);
            $table->unsignedSmallInteger('consecutive_failures')->default(0);
            $table->unsignedSmallInteger('http_status')->nullable();
            // Solo códigos cortos (timeout, no_hls, direccion_no_permitida...).
            $table->string('error', 200)->nullable();
            $table->timestamp('checked_at');
            $table->timestamp('last_ok_at')->nullable();
            $table->timestamps();

            $table->unique(['item_id', 'stream_url']);
            $table->index('checked_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stream_checks');
    }
};
