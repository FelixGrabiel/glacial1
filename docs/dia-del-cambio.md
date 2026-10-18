# Día del cambio: de Firebase a Supabase

**Fecha acordada:** sábado 17 de octubre de 2026, a partir de las 22:00 (hora de Lima). Se adelantó desde el 1 de noviembre
(y luego desde el domingo 18 a las 20:00) porque el plan gratuito de Firebase empezó a agotar su límite diario («Quota exceeded») con el uso real. **Duración:** unos 30 minutos sin usar la página.

Quién hace qué: **Felix** (Administrador) hace lo que requiere su sesión, sus contraseñas o la consola de Firebase;
**Claude** hace la copia, las comprobaciones y la publicación. Nada de esto borra datos: Firebase queda intacto como respaldo.

| | Producción | Pruebas |
|---|---|---|
| Proyecto de Supabase | `ehtbwmvwoxcdefvlxttu` | `mvxjopvnnagqytegtexi` («GLACIAL pruebas») |
| Cuenta del Administrador (`admin@glacial.app`) | uid `b901a9a1-0c36-45b4-82e1-331e75ee1067` | uid `b89cadf4-5ca6-42c4-a19a-4d07fb371f72` |
| Página | https://felixgrabiel.github.io/glacial1/ | vista previa de la rama `supabase` (franja roja) |

## Los días anteriores

- [ ] Pausa de cambios en `main` desde el sábado 17 en la noche.
- [x] Integrar en la rama `supabase` lo último de `main` y repetir las pruebas (`tests/puente-supabase.test.js`, `tests/puente-pagina.e2e.js`).
      Hecho el 17-10-2026: tareo por técnico, reinicio de PIN, Supervisor de Mantenimiento en la rotación y en el tareo,
      gramaje 21.7 en PET1. No requirió cambios en la base: las reglas de `sync/tecnicosMant` y `sync/rotacionesMantenimiento`
      en Supabase ya son las mismas que en Firebase. Pasan las 87 pruebas y la prueba de la página real.
- [ ] Ensayo en PRUEBAS con dos o tres personas reales (supervisor, mantenimiento, RRHH).
- [ ] Comprobar que el proyecto de producción de Supabase está activo. Los proyectos gratuitos se pausan si pasan una semana
      quietos (se reanudan con un botón). Para evitarlo, cada proyecto hace una consulta diaria al otro (tarea
      `glacial-mantener-activo`, migración `glacial_20o`) y hay una tarea programada de Claude cada lunes que lo revisa.
- [ ] Avisar al personal: día y hora, 30 minutos sin usar la página; al volver hay que **recargar** y entrar con la **contraseña temporal nueva**.
- [ ] Decidir el plan de Supabase para producción (el gratuito no tiene copias de seguridad diarias; el Pro guarda 7 días).
      Mientras tanto: copia completa de la base justo después del cambio y una semanal.
- [ ] En los dos proyectos de Supabase: Authentication → desactivar «Allow new users to sign up».

## El día del cambio

1. **Pausa.** Felix confirma que nadie está usando la página.
2. **Firebase en solo lectura.** Felix publica en la consola de Firebase (Firestore → Reglas) el contenido de
   `firestore.rules.solo-lectura.txt`. Desde ese momento nadie puede guardar en Firebase.
3. **Copia final.** Felix abre la página de producción como Administrador en el panel de navegador de Claude.
   Claude ejecuta `docs/migracion/copiar-firebase-a-supabase.js` contra el proyecto de producción (clave de un solo uso)
   y compara conteos, tamaños y huella general con `glacial_fs.importacion`. Después anula la clave y quita el permiso.
4. **Aplicar y limpiar** (Claude, en el proyecto de producción):
   ```sql
   select glacial_fs.aplicar_importacion('b901a9a1-0c36-45b4-82e1-331e75ee1067'::uuid, 'admin', 'admin@glacial.app', array['jefe','supervisor']);
   select glacial_fs.limpiar_fuera_de_la_copia();   -- da de baja lo registrado durante los ensayos
   ```
   Se conservan las cuentas ya creadas en Supabase y el historial queda enlazado a ellas.
5. **Publicar la página nueva.** Claude une la rama `supabase` a `main` y la sube. A los pocos minutos
   https://felixgrabiel.github.io/glacial1/ ya usa Supabase. Comprobación: sin franja roja, consola con
   «entorno: PRODUCCION · base de datos: supabase-ehtbwmvwoxcdefvlxttu».
6. **Cuentas.** Felix entra con `admin` (contraseña de Supabase) → Configuración → Gestionar usuarios →
   «Migrar usuarios a cuentas seguras» → todos los que falten. Guarda el archivo de contraseñas temporales y las reparte.
   El historial de cada persona pasa solo a su cuenta nueva.
7. **Prueba con dos dispositivos.** Registrar una paleta en uno y verla aparecer en el otro; revisar tareo, avance y
   la exportación a Excel / Google Sheets.
8. **Cerrar Firebase.** Felix publica `firestore.rules.cerrado.txt`. Quien tenga abierta la página antigua verá un
   error y, al recargar, entrará a la nueva.
9. **Aviso al personal:** ya pueden entrar.

## Si algo sale mal (volver a Firebase)

1. Claude revierte en `main` la unión del paso 5 (la página vuelve a ser la de Firebase en minutos).
2. Felix publica de nuevo `firestore.rules.etapa2.txt` en la consola de Firebase.
3. Lo que se haya registrado en Supabase después del paso 5 se lista y se vuelve a ingresar a mano:
   ```sql
   select coleccion, id, actualizado_en from public.fs_docs where actualizado_por is not null and actualizado_en > '<hora del paso 5>' order by actualizado_en;
   ```

## La primera semana

- Revisar a diario los avisos de tiempo real consumidos (el plan gratuito incluye 2 millones al mes) y los errores.
- Firebase se conserva cerrado, sin borrar, al menos un mes.
- Eliminar la tarea programada semanal «GLACIAL: revisar que Supabase siga activo» (ya no hace falta con la página en uso).
- Pendientes para después: pasar el proyecto a la cuenta de la empresa, plan con copias de seguridad, y retirar de la
  página lo que ya no se usa de Firebase.
