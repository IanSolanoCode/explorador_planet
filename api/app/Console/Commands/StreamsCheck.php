<?php

namespace App\Console\Commands;

use App\Models\StreamCheck;
use App\Services\IptvOrgService;
use App\Services\StreamChecker;
use Illuminate\Console\Command;

/**
 * Comprueba el estado de los streams de TV y registra los caídos en
 * `stream_checks` para que el filtro del endpoint de TV los oculte.
 *
 * Selecciona los pares nunca comprobados primero y luego los más antiguos,
 * mezclando países dentro de cada bloque para que un grupo de canales muertos
 * no llene un lote. Un fallo aislado no oculta el canal: hace falta el tercer
 * fallo consecutivo.
 */
class StreamsCheck extends Command
{
    protected $signature = 'streams:check
        {--limit=800 : Máximo de streams a comprobar}
        {--country= : Código ISO de país a comprobar (opcional)}
        {--concurrency=10 : Peticiones simultáneas}';

    protected $description = 'Comprueba los streams de TV y registra los caídos';

    private const SHUFFLE_BLOCK = 100;

    public function handle(IptvOrgService $iptvOrg, StreamChecker $checker): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $concurrency = max(1, (int) $this->option('concurrency'));
        $country = $this->option('country');

        $country = $country !== null && trim((string) $country) !== '' ? strtoupper(trim((string) $country)) : null;

        $this->info('Obteniendo los streams de iptv-org...');

        $pairs = $iptvOrg->allStreamPairs();

        if ($country !== null) {
            $pairs = array_values(array_filter($pairs, static fn (array $pair): bool => $pair['country'] === $country));
        } else {
            $pairs = array_values($pairs);
        }

        $this->info('Seleccionando candidatos...');

        $existing = $this->existingLookup($pairs);
        $selected = $this->selectCandidates($pairs, $existing, $limit);

        if ($selected === []) {
            $this->info('No hay streams que comprobar.');

            return self::SUCCESS;
        }

        $this->info('Comprobando '.count($selected).' streams (concurrencia '.$concurrency.')...');

        $summary = $checker->check($selected, $existing, $concurrency);

        $this->info(sprintf(
            'Resultado: %d comprobados, %d vivos, %d caídos, %d rechazados (%.2f s, %d MiB).',
            $summary['total'],
            $summary['alive'],
            $summary['dead'],
            $summary['rejected'],
            $summary['elapsed'],
            (int) round($summary['peak_memory_bytes'] / 1048576),
        ));

        if ($summary['discarded']) {
            $this->error('posible fallo de red o certificados: lote descartado, ejecución detenida.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * Carga las comprobaciones previas de los ids implicados, una sola consulta.
     *
     * @param  array<int, array{item_id: string, streamUrl: string, country: string}>  $pairs
     * @return array<string, StreamCheck>
     */
    private function existingLookup(array $pairs): array
    {
        $ids = array_values(array_unique(array_column($pairs, 'item_id')));

        $lookup = [];

        foreach (StreamCheck::whereIn('item_id', $ids)->get() as $row) {
            $lookup[$row->item_id."\0".$row->stream_url] = $row;
        }

        return $lookup;
    }

    /**
     * Ordena: nunca comprobados primero (mezclados), luego los más antiguos
     * por checked_at, mezclando dentro de bloques para repartir países.
     *
     * @param  array<int, array{item_id: string, streamUrl: string, country: string}>  $pairs
     * @param  array<string, StreamCheck>  $lookup
     * @return array<int, array{item_id: string, streamUrl: string, country: string}>
     */
    private function selectCandidates(array $pairs, array $lookup, int $limit): array
    {
        $never = [];
        $checked = [];

        foreach ($pairs as $pair) {
            if (! isset($lookup[$pair['item_id']."\0".$pair['streamUrl']])) {
                $never[] = $pair;
            } else {
                $checked[] = [
                    'pair' => $pair,
                    'checked_at' => $lookup[$pair['item_id']."\0".$pair['streamUrl']]->checked_at,
                ];
            }
        }

        shuffle($never);

        usort($checked, static fn (array $a, array $b) => $a['checked_at'] <=> $b['checked_at']);

        $checkedPairs = $this->shuffleInBlocks(array_column($checked, 'pair'), self::SHUFFLE_BLOCK);

        return array_slice(array_merge($never, $checkedPairs), 0, $limit);
    }

    /**
     * @param  array<int, array{item_id: string, streamUrl: string, country: string}>  $items
     * @return array<int, array{item_id: string, streamUrl: string, country: string}>
     */
    private function shuffleInBlocks(array $items, int $blockSize): array
    {
        $result = [];

        foreach (array_chunk($items, $blockSize) as $chunk) {
            shuffle($chunk);
            $result = array_merge($result, $chunk);
        }

        return $result;
    }
}
