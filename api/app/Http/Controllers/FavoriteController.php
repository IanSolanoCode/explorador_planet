<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreFavoriteRequest;
use App\Http\Resources\FavoriteResource;
use App\Models\Favorite;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * Gestiona los favoritos del usuario autenticado.
 *
 * Cada usuario puede registrar hasta 200 favoritos entre TV y radio.
 * Los items bloqueados globalmente no pueden añadirse y se ocultan del listado.
 */
class FavoriteController extends Controller
{
    /**
     * Lista los favoritos del usuario autenticado, más recientes primero.
     *
     * Oculta los favoritos cuya tupla (type, item_id) esté presente en
     * la tabla blocked_items, preservando su existencia en la base de datos
     * para el conteo de límites.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $favorites = $request->user()
            ->favorites()
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('blocked_items')
                    ->whereColumn('blocked_items.type', 'favorites.type')
                    ->whereColumn('blocked_items.item_id', 'favorites.item_id');
            })
            ->latest('id')
            ->get();

        return FavoriteResource::collection($favorites);
    }

    /**
     * Da de alta un nuevo favorito para el usuario autenticado.
     *
     * user_id se asigna exclusivamente desde el usuario autenticado para
     * impedir que un cliente suplante a otro usuario.
     */
    public function store(StoreFavoriteRequest $request): JsonResponse
    {
        $data = $request->validated();

        $favorite = $request->user()->favorites()->create([
            'type' => $data['type'],
            'item_id' => $data['itemId'],
            'name' => $data['name'],
            'country' => strtoupper($data['country']),
            'stream_url' => $data['streamUrl'],
            'logo' => $data['logo'] ?? null,
        ]);

        return FavoriteResource::make($favorite)
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Elimina un favorito propio.
     *
     * Si el registro no existe o pertenece a otro usuario, responde 404
     * con idéntico mensaje en ambos casos para evitar la enumeración de recursos.
     */
    public function destroy(Request $request, int $id): Response|JsonResponse
    {
        $favorite = Favorite::find($id);

        if (! $favorite || $favorite->user_id !== $request->user()->id) {
            return response()->json([
                'message' => 'Favorito no encontrado.',
            ], 404);
        }

        $favorite->delete();

        return response()->noContent();
    }
}

