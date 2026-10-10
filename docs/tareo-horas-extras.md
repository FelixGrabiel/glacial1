# Tareo: tarjeta HORAS EXTRAS, gráficos y jornada laborada

Archivo nuevo `js/personal/46-tareo-horas-extras.js` (`window.TareoHE`, solo lectura) conectado al **Resumen mensual** del Tareo (`13-tareo.js`). Reutiliza Chart.js 4.4.1 ya incluido.

## Resumen (siete tarjetas)
Fila 1: ASISTIÓ · FERIADO TRABAJADO · DÍAS TRABAJADOS · **HORAS EXTRAS**; fila 2: FALTAS POR JUSTIFICAR · FALTAS JUSTIFICADAS · DESCANSOS (ocupan el ancho). Se retiró **solo** la tarjeta visual COMISIÓN EXTERNA: el estado, sus registros, «Días trabajados» (que la sigue contando), la tabla de personal y las exportaciones no cambian. Los contadores generales siguen siendo del mes elegido (año/mes); Hoy / Esta semana / Mes gobierna la tarjeta de horas extras y los gráficos (se muestra siempre el intervalo aplicado).

## Fuente, clasificación y agregación
- **Una sola fuente por marcación**: `tareo.personal` de su área. El espejo de maquinistas de Mantenimiento no es otra jornada (los maquinistas se cuentan desde Producción; si un tareo viejo de Mantenimiento conserva uno, se ignora). Identidad de la jornada = área + persona (clave estable) + fecha operativa + turno: dos turnos legítimos de una persona no se fusionan. El turno noche cuenta en su fecha operativa (la de inicio).
- **Cálculo** (lógica vigente, en minutos enteros para que tarjeta, serie, ranking y tabla sumen igual): programada = `jornadaNormal` de ESE tareo (no se asume 8 h); laborada = ingreso→salida − refrigerio (una vez); saldo = laborada − programada. **A favor** y **en contra** se suman por separado, nunca netos.
- **Estados**: *válida* (Asistió con ingreso, salida y refrigerio completo o sin refrigerio; 0 min es válido) · *pendiente* (falta ingreso, salida o la mitad del refrigerio: no es 0 h ni saldo en contra; se muestra «Pendiente» y los gráficos lo dejan como ausencia) · fuera del cálculo: sin registro, faltas, descansos, feriado y comisión (sin saldo en la lógica oficial).
- **Grupos (no excluyentes)**: Producción y Mantenimiento = área del tareo; Supervisores y Maquinistas = cargo registrado **en cada jornada** (un cambio de cargo posterior no borra el historial). No se suman entre sí. Solo se ofrecen y agregan las áreas que el usuario puede ver (se filtra antes de agregar).
- **Períodos**: Hoy = fecha operativa de GLACIAL; Esta semana = lunes a domingo hasta hoy (misma definición de la rotación semanal); Mes = año/mes elegidos, hasta hoy si es el mes en curso (sin días futuros con 0 h).

## Pantallas
- **Panel Horas extras**: chips de grupo sincronizados con el selector de la tarjeta, indicadores (a favor / saldo en contra / pendientes), «Registros completos» o aviso con «Revisar», gráfico *Horas extras por día* (etiquetas y tooltips «1 h 30 min»; clic en una barra abre las jornadas del día), ranking *Trabajadores con más horas extras* (top 5 + «Otros» solo con los omitidos; clic abre el detalle) y tabla *Jornadas laboradas* con filtro exacto (Todas / 8 h / 10 h / 12 h / Otras; 9 h 30 no se redondea; los pendientes se ven en «Todas»).
- **Detalle HORAS EXTRAS POR TRABAJADOR**: filtros grupo, trabajador (identidad estable; DNI si hay homónimos), período y mes; indicadores (a favor, en contra, días con extras = fechas distintas, jornada máxima con su fecha); gráfico con dos vistas (Horas extras / Jornada laborada: programada gris, laborada azul, leyenda y tooltip con extras); tabla diaria completa (incluye jornadas sin extras y «Pendiente»). Los filtros se conservan al volver.
- Los cambios de otros equipos actualizan estas consultas (`onTareosUpdated`) sin tocar el formulario de edición; las instancias de Chart.js se destruyen antes de redibujar. Nada se guarda al visualizar. En Modo visualización solo se consultan las áreas permitidas; no hay exportaciones nuevas.

## Pruebas
`tests/tareo-horas-extras.test.js` (funciones reales de `13-tareo.js`): 10 h/10 h sin extras, a favor/en contra separados, cero válido vs pendiente, serie = tarjeta = ranking = tabla, «Otros», espejo de maquinistas, cargo histórico, grupos no excluyentes, varios turnos por fecha, noche, períodos sin días futuros, filtros exactos de jornada, filtrado por área autorizada, solo lectura, orden de tarjetas y retiro de Comisión externa. En el navegador: selector sincronizado, cambio de período/grupo sin acumular gráficos, detalle con las dos vistas y regreso conservando filtros.

## Integridad del tareo
El problema de marcaciones que se reinician o cambian de trabajador ya se reprodujo y corrigió antes (`docs/tareo-edicion-continua.md`); estas vistas no renderizan el formulario de edición ni escriben datos.

## Límites
El personal «por día» (no planilla) no entra a este análisis. Feriado trabajado y Comisión externa no tienen saldo en la lógica oficial, por eso no suman horas extras.
