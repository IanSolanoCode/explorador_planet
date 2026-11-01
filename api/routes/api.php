<?php

use App\Http\Controllers\AtlasController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\RadioController;
use App\Http\Controllers\TvController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Autenticación
|--------------------------------------------------------------------------
| Registro y login son públicos. Logout y /me requieren un token Bearer.
| Los límites de peticiones se definen en AppServiceProvider.
*/

Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
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
