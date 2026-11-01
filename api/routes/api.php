<?php

use App\Http\Controllers\AtlasController;
use App\Http\Controllers\RadioController;
use App\Http\Controllers\TvController;
use Illuminate\Support\Facades\Route;

Route::get('/countries/{code}/atlas', AtlasController::class);
Route::get('/countries/{code}/radio', RadioController::class);
Route::get('/countries/{code}/tv', TvController::class);
Route::get('/countries/{code}/tv/adult', [TvController::class, 'adult']);
