# Pruebas del dashboard de Impacto económico

## Automáticas (`node tests/<archivo>.test.js`)
- `impacto-estado.test.js`: filtros cruzados y acumulativos (línea → máquina → causa), multiselección, quitar chips, limpiar, día seleccionado, periodos y comparación, valores faltantes, análisis automático con datos / sin datos / un dato / todo en cero (sin NaN ni Infinity), coincidencia del texto con los números, Excel por rol.
- `economico-resultados.test.js`: publicación v2 por Gerencia (sin valores unitarios), Jefatura lee solo `resultadosEconomicos`, los demás no abren escuchas y reciben soles = null, pantalla sin pestaña de valores para Jefatura.
- `economico.test.js`: escuchas, valores con historial, migración.

## Manuales en PRUEBAS (con la sesión de cada rol)
1. **Gerencia**: abrir Impacto económico; cambiar periodo (Hoy / 7 / 30 / Mes / Rango + Aplicar); tocar una barra de línea, luego una máquina, luego una causa y comprobar chips, KPI, tabla y análisis; tocar de nuevo para quitar; «Limpiar selección».
2. **Gerencia**: «Ver detalle →» de Top máquinas; bajar Planta → Máquina → Causa → Evento; «Usar como filtro».
3. **Gerencia**: quitar el valor de un producto: debe salir el aviso con «Configurar valores →» y el total no debe sumar S/ 0.
4. **Jefatura**: misma pantalla en S/, sin pestaña «Valores unitarios» y sin botón de configurar; aviso de cobertura si faltan valores. En Network, solo `resultadosEconomicos`.
5. **Administrador / Supervisor**: pantalla en minutos y unidades; ninguna cifra ni palabra en soles; Excel sin columna de pérdida.
6. **Celular / tablet**: filtros desplegables, sin barra horizontal, gráficos legibles, toque en barras selecciona/deselecciona.
7. **Tiempo real**: cambiar un valor en Gerencia; el dashboard de Gerencia se recalcula y el de Jefatura se actualiza en menos de un minuto.
8. **Excel**: abrir el archivo de cada rol y comprobar que no hay hojas ni columnas ocultas ni valores unitarios (salvo la hoja «Supuestos», solo Gerencia).
