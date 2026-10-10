# Impacto Económico: valores unitarios por línea y permisos

## Causa probable del incidente (por lectura de código; falta comprobarla en el entorno publicado)
1. El formulario exigía línea + marca + presentación: no había un valor general por línea.
2. El único botón «Abrir valores unitarios» estaba dentro de la vista ya calculada, y la pestaña solo salía con el rol Gerente/Gerente General.
   Sin producción, sin resultados o con datos cargando, el botón no existía.
3. `render()` terminaba en «Cargando datos…» o en un error de módulos sin dar acceso al formulario.
4. El acceso dependía solo del nombre del rol; no había permiso explícito por usuario ni forma de habilitar al Administrador.
5. Posible diferencia de versión de scripts en la página publicada (cache). Se subieron las versiones (`?v=20261010-eco1`).

## Qué cambió
- **Valor unitario por línea** (PET 1, PET 2, B7L, B20L, CAJAS 20L; unidades Botella / Bidón / Caja), con vigencia, historial, UID y nombre.
  Resolución: valor específico vigente en la fecha del evento → valor general de la línea vigente → «Sin valor unitario configurado».
  El cero explícito es válido; un campo vacío no se guarda; una vigencia futura no afecta eventos anteriores.
- **Botón CONFIGURAR VALORES UNITARIOS** en el encabezado + pestaña «Valores unitarios»: abren el mismo componente (`glacialEconomico.abrirPantalla`).
  Es alcanzable aunque no haya datos, producción ni gráficos. Si no hay permiso o la cuenta está en Modo visualización general, el formulario explica el motivo.
- **Estado de guardado vs publicación** separados, con reintento (un fallo al publicar no significa que el valor se perdió).
- **Permisos explícitos** `verImpactoEconomico` y `gestionarValoresUnitarios` por usuario (`users[].economico = {ver, gestionar, temporal, actualizadoPor, actualizadoEn}`
  + `economicoHistorial`). El rol dice quién puede recibirlos; el permiso dice quién los tiene. «Todos los permisos» no los concede.
  - Gerencia sin campo `economico` conserva ver + gestionar (autorización existente); se puede revocar.
  - Jefatura: solo «ver» (consulta de lo publicado). Nunca gestiona.
  - Administrador: sin acceso por defecto; otro Administrador lo habilita (habilitación temporal, revocable). Gestionar implica ver.
  - Se asignan en **Gestionar usuarios → Editar permisos → IMPACTO ECONÓMICO** y en **Impacto económico → pestaña Permisos** (solo Administrador).
- **Publicación**: la hace el navegador de quien gestiona (Gerencia o Administrador habilitado); Jefatura con «ver» lee `resultadosEconomicos`.
- **Revocación**: se aplica a sesiones abiertas (se cierran escuchas y se vacían valores/resultados de memoria).
- **Exportar** resultados en soles exige el permiso de exportación y el permiso de consulta económica vigente.
- **Reglas** (`firestore.rules.etapa2.txt`): `ecoGestionar()` y `ecoVer()` leen `sync/perfiles[uid].eco`; el rol se vuelve a comprobar en las reglas.
  `valoresUnitarios` acepta `tipo: 'linea'`. `sync/perfiles` lleva el campo `eco` (lo publica `36-seguridad-auth.js`).

## Archivos
`js/produccion/50, 55, 56, 58`, `js/accesos/36-seguridad-auth.js`, nuevo `js/accesos/10c-impacto-economico-permisos.js`, `index.html`,
`firestore.rules.etapa2.txt`, pruebas `tests/impacto-economico-permisos.test.js` (+ ajustes a `economico`, `economico-resultados`, `modo-visualizacion`).

## Pasos para publicar (en este orden)
1. Subir el código a PRUEBAS (lo ordena el usuario: «sube main y main:pruebas»).
2. **Publicar `firestore.rules.etapa2.txt`** en Firebase (lo hace el usuario).
3. Un Administrador abre Gestionar usuarios y guarda cualquier cambio (o el de permisos) para que `sync/perfiles` se republique con el campo `eco`.
4. Asignar permisos: Gerencia (ya conserva ver + gestionar), Jefatura «ver», Administrador habilitado si corresponde.
5. Recargar con Ctrl+F5 para tomar las versiones nuevas de los scripts.

## Pendiente de comprobar en PRUEBAS con cuentas reales
- Cuenta de Gerencia: encuentra el botón, guarda un valor de línea, se ve en un segundo dispositivo.
- Jefatura con «ver»: ve soles publicados y no ve valores; sin «ver», solo modo operativo.
- Revocar a un usuario con sesión abierta: pierde el acceso sin recargar.
- Administrador habilitado: abre el formulario y guarda; deshabilitado: recibe el mensaje de falta de permiso.
- Cuenta en Modo visualización general: mensaje explícito al intentar guardar.
