<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Se lanza cuando una URL de stream no supera el guardado de seguridad
 * (esquema no http/https, host privado/reservado o imposible de resolver).
 *
 * `reason` solo admite los códigos cortos que la tabla stream_checks acepta:
 * `direccion_no_permitida` o `dns`. El comprobador los copia a la columna
 * `error` sin propagar el mensaje, que puede incluir el host para los logs.
 */
class StreamUrlNotAllowedException extends RuntimeException
{
    public function __construct(
        public readonly string $reason,
        string $message = '',
    ) {
        parent::__construct($message !== '' ? $message : $reason);
    }

    public static function notAllowed(string $host): self
    {
        return new self('direccion_no_permitida', 'Dirección no permitida: '.$host);
    }

    public static function dns(string $host): self
    {
        return new self('dns', 'No se pudo resolver el host: '.$host);
    }
}
