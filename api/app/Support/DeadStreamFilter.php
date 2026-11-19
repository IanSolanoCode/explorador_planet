<?php

namespace App\Support;

use App\Models\StreamCheck;

/**
 * Oculta de la lista de TV los canales cuyo stream actual esté caído.
 *
 * Un canal se oculta solo si existe una fila en `stream_checks` para el par
 * exacto (item_id, streamUrl) con `is_alive=false`. Si no hay fila, el canal
 * permanece visible. Se aplica después de leer la caché, con una sola consulta
 * por petición, igual que `BlockedItemFilter`.
 */
class DeadStreamFilter
{
    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<string, mixed>>
     */
    public function filter(array $items): array
    {
        if ($items === []) {
            return [];
        }

        $ids = array_values(array_unique(array_map(
            static fn (array $item): string => (string) ($item['id'] ?? ''),
            $items,
        )));

        // Una sola consulta: filas caídas de los ids implicados. El emparejado
        // por URL exacta se hace en memoria para no usar una regla "todos los
        // streams del canal".
        $dead = StreamCheck::query()
            ->where('is_alive', false)
            ->whereIn('item_id', $ids)
            ->get(['item_id', 'stream_url']);

        if ($dead->isEmpty()) {
            return $items;
        }

        $deadPairs = [];

        foreach ($dead as $row) {
            $deadPairs[$row->item_id][$row->stream_url] = true;
        }

        return array_values(array_filter(
            $items,
            static fn (array $item): bool => ! isset(
                $deadPairs[(string) ($item['id'] ?? '')][(string) ($item['streamUrl'] ?? '')],
            ),
        ));
    }
}
