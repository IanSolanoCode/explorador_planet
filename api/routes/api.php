<?php

use App\Http\Controllers\AdminBlockedItemController;
use App\Http\Controllers\AtlasController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\FavoriteController;
use App\Http\Controllers\RadioController;
use App\Http\Controllers\TvController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Autenticación y favoritos del usuario
|--------------------------------------------------------------------------
| Registro y login son públicos. Logout, /me y la gestión de favoritos
| requieren un token Bearer emitido por Sanctum.
*/

Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/favorites', [FavoriteController::class, 'index']);
    Route::post('/favorites', [FavoriteController::class, 'store']);
    Route::delete('/favorites/{id}', [FavoriteController::class, 'destroy'])->whereNumber('id');
});

/*
|--------------------------------------------------------------------------
| Administración de bloqueos
|--------------------------------------------------------------------------
| Requiere token Bearer y rol admin; un usuario normal recibe 403.
*/

Route::middleware(['auth:sanctum', 'admin'])->prefix('admin')->group(function () {
    Route::get('/blocked', [AdminBlockedItemController::class, 'index']);
    Route::post('/blocked', [AdminBlockedItemController::class, 'store']);
    Route::delete('/blocked/{id}', [AdminBlockedItemController::class, 'destroy'])->whereNumber('id');
});

/*
|--------------------------------------------------------------------------
| Módulos públicos
|--------------------------------------------------------------------------
| Atlas, radio y TV no requieren autenticación en esta etapa.
*/

Route::get('/countries/{code}/atlas', AtlasController::class);
Route::get('/countries/{code}/radio', RadioController::class);
Route::get('/countries/{code}/tv', TvController::class);
Route::get('/countries/{code}/tv/adult', [TvController::class, 'adult']);
