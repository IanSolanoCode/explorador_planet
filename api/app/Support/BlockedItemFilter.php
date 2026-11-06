<?php

namespace App\Support;

use App\Models\BlockedItem;

/**
 * Filtra listas normalizadas de TV o radio contra blocked_items.
 *
 * Debe aplicarse después de leer la caché para que un bloqueo nuevo surta
 * efecto sin esperar a que expire la entrada cacheada.
 */
class BlockedItemFilter
{
    /**
     * Elimina de la lista los elementos cuyo id esté bloqueado para el tipo.
     *
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<string, mixed>>
     */
    public function filter(string $type, array $items): array
    {
        if ($items === []) {
            return [];
        }

        $ids = array_values(array_unique(array_map(
            static fn (array $item): string => (string) ($item['id'] ?? ''),
            $items,
        )));

        // Una sola consulta por petición: obtiene todos los ids bloqueados.
        $blockedIds = BlockedItem::query()
            ->where('type', $type)
            ->whereIn('item_id', $ids)
            ->pluck('item_id')
            ->all();

        if ($blockedIds === []) {
            return $items;
        }

        $blockedIds = array_fill_keys($blockedIds, true);

        return array_values(array_filter(
            $items,
            static fn (array $item): bool => ! isset($blockedIds[(string) ($item['id'] ?? '')]),
        ));
    }
}
