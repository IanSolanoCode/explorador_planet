<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

/**
 * Crea o actualiza el administrador definido en las variables ADMIN_* del .env.
 *
 * El comando nunca imprime la contraseña; solo confirma el email afectado.
 */
class AdminCreate extends Command
{
    /**
     * @var string
     */
    protected $signature = 'admin:create';

    /**
     * @var string
     */
    protected $description = 'Crea o actualiza el administrador inicial desde ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD';

    /**
     * Ejecuta el comando.
     */
    public function handle(): int
    {
        $name = trim((string) config('admin.name'));
        $email = Str::lower(trim((string) config('admin.email')));
        $password = (string) config('admin.password');

        // Comprueba primero que las tres variables existan y no estén vacías.
        $missing = [];

        if ($name === '') {
            $missing[] = 'ADMIN_NAME';
        }

        if ($email === '') {
            $missing[] = 'ADMIN_EMAIL';
        }

        if ($password === '') {
            $missing[] = 'ADMIN_PASSWORD';
        }

        if ($missing !== []) {
            $this->error('Faltan variables en .env: '.implode(', ', $missing));

            return self::FAILURE;
        }

        // Aplica las mismas reglas de contraseña que el registro público.
        $validator = Validator::make(
            [
                'name' => $name,
                'email' => $email,
                'password' => $password,
            ],
            [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'string', 'email', 'max:255'],
                'password' => ['required', 'string', 'max:255', Password::min(8)->mixedCase()->numbers()],
            ],
            [
                'name.required' => 'ADMIN_NAME no puede estar vacío.',
                'email.required' => 'ADMIN_EMAIL no puede estar vacío.',
                'email.email' => 'ADMIN_EMAIL no es un email válido.',
                'password.required' => 'ADMIN_PASSWORD no puede estar vacío.',
                'password.min' => 'ADMIN_PASSWORD debe tener al menos 8 caracteres.',
                'password.mixed' => 'ADMIN_PASSWORD debe incluir mayúsculas y minúsculas.',
                'password.numbers' => 'ADMIN_PASSWORD debe incluir al menos un número.',
            ],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $data = $validator->validated();

        // Si el email ya existe se actualiza; si no, se crea un usuario nuevo.
        $user = User::where('email', $data['email'])->first();
        $wasExisting = $user !== null;

        $user ??= new User();
        $user->name = $data['name'];
        $user->email = $data['email'];
        $user->password = $data['password'];
        $user->role = 'admin';
        $user->save();

        $message = $wasExisting ? 'Administrador actualizado' : 'Administrador creado';

        $this->info($message.': '.$user->email);

        return self::SUCCESS;
    }
}
