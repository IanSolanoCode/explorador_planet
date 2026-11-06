<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBlockedItemRequest;
use App\Http\Resources\BlockedItemResource;
use App\Models\BlockedItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Administración de bloqueos globales de TV y radio.
 *
 * Todas las rutas usan auth:sanctum y el middleware admin. blocked_by se
 * asigna desde el administrador autenticado, nunca desde el cuerpo.
 */
class AdminBlockedItemController extends Controller
{
    /**
     * Lista todos los bloqueos, más recientes primero.
     */
    public function index(): AnonymousResourceCollection
    {
        return BlockedItemResource::collection(
            BlockedItem::latest('id')->get()
        );
    }

    /**
     * Crea un bloqueo para el administrador autenticado.
     */
    public function store(StoreBlockedItemRequest $request): JsonResponse
    {
        $data = $request->validated();

        $blockedItem = $request->user()->blockedItems()->create([
            'type' => $data['type'],
            'item_id' => $data['itemId'],
            'reason' => $data['reason'],
        ]);

        return BlockedItemResource::make($blockedItem)
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Elimina un bloqueo existente.
     *
     * Responde 404 JSON si el id no existe.
     */
    public function destroy(int $id): Response|JsonResponse
    {
        $blockedItem = BlockedItem::find($id);

        if (! $blockedItem) {
            return response()->json([
                'message' => 'Bloqueo no encontrado.',
            ], 404);
        }

        $blockedItem->delete();

        return response()->noContent();
    }
}
