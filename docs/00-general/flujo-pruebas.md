# Flujo de pruebas y producción

Dos sitios, un solo repositorio (`felixgrabiel/glacial1`):

| Sitio | Rama | Dirección | Base de datos |
|---|---|---|---|
| Producción | `main` | https://felixgrabiel.github.io/glacial1/ | PRODUCCIÓN (`ehtbwmvwoxcdefvlxttu`) |
| Pruebas | `pruebas` | https://glacial-pruebas.vercel.app | PRUEBAS (`mvxjopvnnagqytegtexi`) |

La página elige sola la base de datos según su dirección (`js/nucleo/01-config.js`: solo `felixgrabiel.github.io` es producción;
cualquier otra dirección usa PRUEBAS y muestra la franja roja «BASE DE PRUEBAS»).

## Cómo se trabaja
1. Los cambios se suben **primero a `pruebas`**. Vercel publica solo en el sitio de pruebas.
2. Se prueba ahí, con la franja roja y datos de prueba.
3. Si todo está bien, se pasa a `main` (producción). Nunca al revés.

Las migraciones de base de datos y las funciones de Supabase siguen la misma regla: primero PRUEBAS, después PRODUCCIÓN con aprobación.
