# Información económica protegida por UID (Etapa 2)

## Quién ve qué

| Usuario | Valores unitarios | Historial | Soles con detalle | Resultados en S/ autorizados |
|---|---|---|---|---|
| Gerencia (UID en `accesoEconomico`, nivel `gerencia`) | Lee y escribe | Lee | Sí | Sí |
| Jefatura con acceso económico (nivel `jefatura`) | **permission-denied** | **permission-denied** | No | Sí (Etapa 3) |
| Administrador, supervisores y demás | **permission-denied** | **permission-denied** | No | **permission-denied** |

El rol `Administrador` **no** da acceso económico: las reglas no leen el rol ni los permisos, solo el UID.

## Estructura de Firestore

### `accesoEconomico/{UID}` — se crea SOLO desde Firebase Console
| Campo | Ejemplo |
|---|---|
| `nivel` | `gerencia` o `jefatura` |
| `nombre` | `Nombre del Gerente` (solo para que tú lo reconozcas) |
| `desde` | `2026-10-06` |

Las reglas no permiten escribir esta colección desde la app (ni al Administrador). Cada usuario solo puede leer **su propio** documento (así su navegador sabe su nivel).

**Cómo obtener el UID:** Firebase Console → Authentication → Usuarios → columna «UID de usuario» de la cuenta del Gerente (la cuenta segura de la app, no una cuenta antigua).

**Registrar al Gerente:** Firestore Database → «Iniciar colección» `accesoEconomico` → ID del documento = el UID → campos `nivel` = `gerencia`, `nombre`, `desde`.

**Registrar Jefatura económica:** igual, un documento por persona con `nivel` = `jefatura`.

**Retirar un acceso:** borrar el documento `accesoEconomico/{UID}`. Los navegadores abiertos de esa persona dejan de escuchar y borran los valores de la memoria en segundos.

> **Importante:** «Restablecer clave» o recrear a un usuario crea una cuenta nueva con **UID nuevo**. Si le pasa a Gerencia o a Jefatura económica, hay que registrar el UID nuevo. Esto también impide que el Administrador tome el UID de otra persona restableciéndole la clave.

### `valoresUnitarios/{id}` — solo Gerencia
Un documento por línea + marca + presentación (`P__pet1__scala__2-5-l`), por línea + insumo (`I__pet1--botellas`) o la meta (`META__perdida-mensual`).

`tipo` (`producto` / `insumo` / `meta`), `linea`, `marca`, `presentacion`, `componente`, `unidad`, `clave`, `valorUnitario` (el vigente hoy), `fechaVigencia`, `vigencias` {fecha: valor}, `activo`, `version`, `actualizadoPorUid`, `fechaActualizacion` (hora del servidor).

No se borra: se usa `activo = false`.

### `valoresUnitariosHistorial/{id_version}` — solo se crea
`valorId`, `version`, `valorAnterior`, `valorNuevo`, `fechaVigenciaNueva`, `linea`, `marca`, `presentacion`, `componente`, `uid`, `timestamp` (hora del servidor). Las reglas exigen que cada cambio de un valor cree su historial **en la misma transacción** (`existsAfter` / `getAfter`).

### `resultadosEconomicos/{id}` — para la Etapa 3
Soles ya calculados, sin valores unitarios. Escribe Gerencia; leen Gerencia y Jefatura económica.

## Cambios exactos en las reglas (`firestore.rules.etapa2.txt`)
- **Nuevo:** funciones `nivelEconomico()`, `esGerencia()` y `esJefaturaEco()` (por UID).
- **Nuevo:** `match /accesoEconomico/{uid}`, `/valoresUnitarios/{id}`, `/valoresUnitariosHistorial/{id}`, `/resultadosEconomicos/{id}`.
- **Modificado:** `configEconomica` (versión anterior): ahora solo Gerencia la lee, nadie la escribe.
- **Modificado:** `sync/precios`: solo Gerencia lo lee (para migrar); **se quitó de la lista de documentos que cualquier usuario puede escribir**.
- **Eliminado:** `puedeVerImpacto()` (daba acceso al Administrador y a roles).
- **Índices:** ninguno (el historial se consulta con un `where` simple y se ordena en el navegador).

## Migrar y borrar los valores antiguos (en este orden)
1. Publicar las reglas nuevas en la base real (y en PRUEBAS).
2. Registrar el UID de Gerencia en `accesoEconomico`.
3. Gerencia: Impacto económico → **Valores unitarios** → «Importar valores anteriores». Copia el margen por producto (a cada línea donde aparece), el costo de los insumos y la meta. Los precios por línea de `sync/precios` se muestran solo como referencia (no son márgenes).
4. Comprobar los valores y completar los que falten («Productos sin valor unitario configurado»).
5. Firebase Console → borrar el documento `sync/precios` y los tres documentos de `configEconomica` (`margenes`, `costos`, `general`).
6. Opcional: quitar de las reglas el bloque `configEconomica` y la línea de `precios`.

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
