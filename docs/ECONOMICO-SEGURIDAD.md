# Información económica protegida por ROL (Etapa 2)

## Quién ve qué

| Usuario (rol) | Valores unitarios | Historial | Soles con detalle | Resultados en S/ autorizados |
|---|---|---|---|---|
| **Gerencia**: `Gerente General`, `Gerente` | Lee y escribe | Lee | Sí | Sí |
| **Jefatura**: `Jefe de Producción`, `Jefe de Operaciones`, `Jefatura` | **permission-denied** | **permission-denied** | No | Sí (Etapa 3) |
| Administrador, supervisores y demás | **permission-denied** | **permission-denied** | No | **permission-denied** |

El rol `Administrador` **no** da acceso económico. Las reglas de Firestore leen el rol de `sync/perfiles` (el mismo que usa el resto de las reglas); el navegador usa el rol de su usuario solo para decidir si abre la escucha.

> **Qué implica decidir por rol.** El Administrador asigna los roles en Gestión de usuarios y escribe `sync/users` y `sync/perfiles`. Por lo tanto, **un Administrador podría cambiarse o crear un usuario con rol Gerente y obtener acceso**. Es la contrapartida de no usar una lista protegida desde Firebase Console. Se mitiga con la bitácora de cambios de usuarios y con que el historial de valores guarda el UID de quien cambia cada valor.

## Estructura de Firestore

### `valoresUnitarios/{id}` — solo Gerencia
Un documento por línea + marca + presentación (`P__pet1__scala__2-5-l`), por línea + insumo (`I__pet1--botellas`) o la meta (`META__perdida-mensual`).

`tipo` (`producto` / `insumo` / `meta`), `linea`, `marca`, `presentacion`, `componente`, `unidad`, `clave`, `valorUnitario` (el vigente hoy), `fechaVigencia`, `vigencias` {fecha: valor}, `activo`, `version`, `actualizadoPorUid`, `fechaActualizacion` (hora del servidor).

No se borra: se usa `activo = false`.

### `valoresUnitariosHistorial/{id_version}` — solo se crea
`valorId`, `version`, `valorAnterior`, `valorNuevo`, `fechaVigenciaNueva`, `linea`, `marca`, `presentacion`, `componente`, `uid`, `timestamp` (hora del servidor). Las reglas exigen que cada cambio de un valor cree su historial **en la misma transacción** (`existsAfter` / `getAfter`).

### `resultadosEconomicos/{id}` — para la Etapa 3
Soles ya calculados, sin valores unitarios. Escribe Gerencia; leen Gerencia y Jefatura.

## Cómo dar o quitar el acceso
Gestión de usuarios → rol del usuario:
- **Gerencia:** `Gerente General` o `Gerente`.
- **Jefatura económica:** `Jefe de Producción`, `Jefe de Operaciones` o `Jefatura`.
- **Quitar el acceso:** cambiarle el rol. Su navegador abierto deja de escuchar y borra los valores de la memoria en segundos.

## Cambios exactos en las reglas (`firestore.rules.etapa2.txt`)
- **Nuevo:** funciones `esGerencia()` (rol `Gerente General` o `Gerente`) y `esJefaturaEco()` (rol `Jefe de Producción`, `Jefe de Operaciones` o `Jefatura`).
- **Nuevo:** `match /valoresUnitarios/{id}`, `/valoresUnitariosHistorial/{id}`, `/resultadosEconomicos/{id}`.
- **Modificado:** `configEconomica` (versión anterior): ahora solo Gerencia la lee, nadie la escribe.
- **Modificado:** `sync/precios`: solo Gerencia lo lee (para migrar); **se quitó de la lista de documentos que cualquier usuario puede escribir**.
- **Eliminado:** `puedeVerImpacto()` (daba acceso al Administrador y a quien tuviera el permiso).
- **Índices:** ninguno (el historial se consulta con un `where` simple y se ordena en el navegador).

## Migrar y borrar los valores antiguos (en este orden)
1. Publicar las reglas nuevas en la base real (y en PRUEBAS).
2. Gerencia: Impacto económico → **Valores unitarios** → «Importar valores anteriores». Copia el margen por producto (a cada línea donde aparece), el costo de los insumos y la meta. Los precios por línea de `sync/precios` se muestran solo como referencia (no son márgenes).
3. Comprobar los valores y completar los que falten («Productos sin valor unitario configurado»).
4. Firebase Console → borrar el documento `sync/precios` y los tres documentos de `configEconomica` (`margenes`, `costos`, `general`).
5. Opcional: quitar de las reglas el bloque `configEconomica` y la línea de `precios`.

El historial de Git conserva los precios por defecto que estaban escritos en `01-config.js`; eso no se puede borrar sin reescribir el repositorio.

## Revisión de documentos históricos
Por el código, ningún documento guarda montos (`resumenesTurno`, `avancesTurno`, `records` no los calculan). Para comprobarlo en la base real, desde la consola del navegador de un usuario que lea `resumenesTurno`:

```js
db.collection('resumenesTurno').get().then(s => {
  const mal = [];
  const buscar = (o, ruta, id) => { if (o && typeof o === 'object') Object.keys(o).forEach(k => {
    if (/soles|precio|costo|monto|valorUnitario|economic/i.test(k)) mal.push(id + ' → ' + ruta + k);
    buscar(o[k], ruta + k + '.', id); }); };
  s.docs.forEach(d => buscar(d.data(), '', d.id));
  console.log(mal.length ? mal : 'Sin campos económicos');
});
```

## Pruebas desde la consola (PRUEBAS)
Con la sesión de cada usuario abierta:
```js
db.collection('valoresUnitarios').get().then(s => console.log('LEYÓ', s.size)).catch(e => console.log(e.code));          // esperado: permission-denied (todos menos Gerencia)
db.collection('valoresUnitariosHistorial').get().then(s => console.log('LEYÓ', s.size)).catch(e => console.log(e.code)); // idem
db.collection('sync').doc('precios').get().then(d => console.log('LEYÓ')).catch(e => console.log(e.code));                // idem
db.collection('configEconomica').doc('margenes').get().then(d => console.log('LEYÓ')).catch(e => console.log(e.code));    // idem
db.collection('valoresUnitarios').doc('P__x').set({tipo:'producto'}).catch(e => console.log(e.code));                    // permission-denied (incluso Gerencia: faltan campos e historial)
```

## Etapa 3 · Qué ve cada rol en Impacto económico

| Rol | Pantalla | Fuente de los datos |
|---|---|---|
| Gerencia | Completa (S/, cascada, rankings, valores y supuestos, Excel con supuestos) y «Valores unitarios» | `valoresUnitarios` (escucha en vivo) + cálculo en su navegador (`50-impacto-economico.js`) |
| Jefatura | «Resultado económico» (S/) + «Parte operativa» (minutos, unidades, paradas, rankings) | `resultadosEconomicos` (soles ya calculados) + datos operativos de siempre |
| Administrador, supervisores y demás | «Impacto operativo» + el aviso «Los valores económicos están reservados a Gerencia y Jefatura autorizada.» | Solo datos operativos |

### Arquitectura para que Jefatura vea S/ sin valores unitarios (opción B, sin backend)
1. El navegador de Gerencia calcula los soles con el mismo motor y publica un documento por día: `resultadosEconomicos/{AAAA-MM-DD}` (totales, por línea, por motivo, por turno y por componente de merma, solo soles) y `resultadosEconomicos/meta`.
2. Se publica al abrir la sesión, cada vez que cambia un valor, cada minuto el día de hoy y cada hora todo el mes en curso y el anterior. Solo se escribe lo que cambió.
3. Las reglas dejan escribir solo a Gerencia y leer a Gerencia y Jefatura. El navegador de Jefatura **no** abre ninguna escucha hacia `valoresUnitarios`.

**Límites (importantes):**
- Si ningún dispositivo de Gerencia está abierto, Jefatura ve la última publicación (la pantalla indica la hora). La alternativa sin esta dependencia es una Cloud Function (plan Blaze).
- Para que Jefatura no deduzca el valor dividiendo soles entre unidades, los documentos publicados no traen unidades ni minutos junto a los soles, no hay detalle por producto y la pantalla separa «Resultado económico» de «Parte operativa». Aun así, **dos cifras agregadas distintas de un mismo periodo permiten estimar un promedio**; no se puede garantizar matemáticamente.
- «Impacto económico» sigue gobernado por el permiso `perdidasSoles` (quién ve la opción del menú); el contenido lo decide el rol.

## Etapa 4 · Lista de pruebas en PRUEBAS (con la sesión de cada usuario)

**Gerencia (rol Gerente / Gerente General)**
1. Impacto económico → Valores unitarios: crear un valor para una línea + marca + presentación, cambiarlo y abrir el Historial (anterior, nuevo, UID, hora).
2. Abrir la misma cuenta en otro dispositivo: el cambio aparece sin recargar y el Impacto se recalcula.
3. Quitar un valor a un producto con actividad: aparece «Productos sin valor unitario configurado» (línea · marca · presentación) y no se calcula como S/ 0.

**Jefatura (rol Jefe de Producción / Jefe de Operaciones / Jefatura)**
4. Impacto económico muestra «Resultado económico» en S/ y «Parte operativa», sin pantalla de valores ni supuestos.
5. En la consola, las 4 lecturas de la sección anterior dan `permission-denied`.
6. Cambiar un valor en Gerencia: el resultado de Jefatura se actualiza en menos de un minuto.

**Administrador y Supervisor**
7. Impacto operativo sin S/ ni palabras económicas y con el aviso de «reservados a Gerencia y Jefatura autorizada».
8. Las 4 lecturas de consola dan `permission-denied`; tampoco pueden leer `resultadosEconomicos`.

**Revisión del navegador no autorizado (Administrador/Supervisor/Jefatura)**
9. Pestaña Network (filtro `firestore`): no deben aparecer peticiones a `valoresUnitarios`, `valoresUnitariosHistorial`, `configEconomica` ni `sync/precios` (Jefatura solo a `resultadosEconomicos`).
10. Almacenamiento y variables:
```js
JSON.stringify({ls: {...localStorage}, ss: {...sessionStorage}});               // no debe traer valores económicos
Object.keys(window).filter(k => /eco|valor|precio|margen|costo/i.test(k));      // solo funciones: glacialEconomico, glacialImpactoResultados…
glacialEconomico.docs();                                                         // en no-Gerencia: {margenes:{valores:{}}, costos:{valores:{}}, general:{}} (vacío)
```

## Rediseño del dashboard (esquema v2)

**Reglas de Firestore: no cambian** (siguen las de `firestore.rules.etapa2.txt`; no hay que volver a publicarlas ni crear índices).

### Qué ve cada rol (la misma pantalla, distinta fuente)
| Rol | Pestañas | Cifras | Origen de los eventos |
|---|---|---|---|
| Gerencia | Resumen ejecutivo · Análisis de pérdidas · Valores unitarios | S/, minutos, unidades; faltantes con botón «Configurar valores» | Calcula en su navegador con los valores unitarios |
| Jefatura | Resumen ejecutivo · Análisis de pérdidas | S/, minutos, unidades; solo cobertura de valorización (sin acceso a configurar) | Lee `resultadosEconomicos/{AAAA-MM-DD}` (eventos ya valorizados) |
| Demás roles | Resumen ejecutivo · Análisis de pérdidas | Solo minutos y unidades; ninguna cifra en S/ | Calculan con `provSinValores()` (S/ = null) |

### Documento publicado por día (v2)
`resultadosEconomicos/{AAAA-MM-DD}` = `{fecha, v:2, filas:[{t,h,tu,g,l,m,p,mq,c,mi,u,s,e,f}], faltan:{productos,insumos}, generadoPorUid, generadoEn}`.
Cada fila es un evento (t = P parada / V velocidad / M merma; mi = minutos; u = unidades; s = soles o null si falta el valor; f = `valor`/`costo` si falta). **No trae valores unitarios, márgenes, costos ni precios.** `resultadosEconomicos/meta` conserva la meta mensual. Los documentos de la versión 1 (sin `filas`) se ignoran y pueden borrarse a mano.
Gerencia publica una ventana de **70 días**: al abrir sesión, al cambiar un valor, cada minuto (hoy y ayer) y cada hora (toda la ventana); solo escribe lo que cambió (huella por documento).

> **Riesgo aceptado:** al publicar soles y unidades del mismo evento, Jefatura puede deducir el valor unitario (soles ÷ unidades). El negocio decidió que Jefatura vea las unidades. Si más adelante se quiere impedirlo, hay que dejar de publicar `u` en las filas de Jefatura.

### Máquina
El registro no guarda la máquina de una parada. Solo se asigna cuando el texto del motivo la nombra (Etiquetadora, Empaquetadora, Sopladora, Envasadora, Rinser); el resto queda «Sin clasificar», y el análisis de máquinas lista las causas registradas de ese grupo.

### Semáforo
Solo se evalúa contra la **meta mensual** (Valores unitarios → Meta mensual) y solo en el periodo «Mes actual»: Favorable < 80 %, Atención de 80 % a 100 %, Crítico al superar la meta. No hay otros umbrales: sin una meta definida no se muestra semáforo. **Propuesta:** si se desean umbrales por línea o por tipo de pérdida, habría que agregarlos como nuevos valores en `valoresUnitarios` (tipo `meta`).

### Periodo de comparación
Mes actual → mes anterior hasta el mismo día del mes (o su último día si es más corto). Hoy / 7 días / 30 días / Rango → el mismo número de días inmediatamente anteriores. Cada KPI y cada análisis dice con qué periodo se compara.

### Archivos
`56-impacto-resultados.js` (datos y publicación) · `57-impacto-estado.js` (estado de filtros y agregación, puro) · `58-impacto-dashboard.js` (pantalla) · `59-impacto-analisis.js` (análisis automático, puro) · `60-impacto-excel.js` (Excel por rol). Pruebas: `tests/impacto-estado.test.js`, `tests/economico-resultados.test.js`, `docs/PRUEBAS-IMPACTO.md`.
