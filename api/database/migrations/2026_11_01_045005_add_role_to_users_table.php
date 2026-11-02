<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Añade el rol de autorización a los usuarios.
 *
 * Se usa string para poder añadir roles sin otra migración; el valor
 * por defecto es "user".
 */
return new class extends Migration
{
    /**
     * Ejecuta la migración.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // El rol no es fillable; la base garantiza el valor por defecto.
            $table->string('role', 16)->default('user')->after('email');
        });
    }

    /**
     * Revierte la migración.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }
};
