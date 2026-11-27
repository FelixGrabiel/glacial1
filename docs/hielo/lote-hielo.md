# Hielo · lote automático

**Archivos:** `js/hielo/97l-hielo-lote.js` (cálculo) · `js/hielo/97-hielo.js` (formulario y validación) · pruebas `tests/hielo-lote.test.js` y `tests/hielo-lote.e2e.js`.

## Formato
`LOTE = TURNO + MARCA + MÁQUINA + SEMANA + DÍA JULIANO`, todo junto, sin separadores.

| Parte | Valores |
|---|---|
| Turno | Día e Intermedio = **2** · Noche = **1** (como el lote de Agua) |
| Marca · Cubos | 1 = Glacial (3 y 1.5 kg), Rappi, Hoteles, Molitalia, Nutra, Certificado · 2 = Cuisine · 3 = Scala · 4 = Tottus · 6 = Bell's y Aro · 7 = Listo · 9 = Austral · 13 = Precio Uno |
| Marca · Vasos | 10 = Oxxo · 1 = Glacial |
| Marca · Premium | 1 = Glacial · 2 = Cuisine · 6 = Bell's |
| Máquina | Cubos: tolva manual = **1**, envasadora automática = **3** · Vasos = **2** · Premium = **0** |
| Semana | 2 dígitos (la misma semana del lote de Agua) |
| Día juliano | 3 dígitos (día del año) |

Ejemplos (26/11/2026: semana 48, día 330): Glacial 3 kg · tolva manual · Día → **21148330** · Precio Uno 1.5 kg · envasadora · Noche → **113348330**.

## Reglas
- El lote sale solo (no se edita) cuando la fila tiene producción, y se actualiza al cambiar marca, estación, turno o fecha.
- **Molitalia, Certificado y Hoteles**: casilla para escribir el lote a mano; es **obligatorio para finalizar** si se produjo.
- Marcas sin código en la tabla (p. ej. **San Fernando**): también a mano y obligatorio.
- Un reporte finalizado conserva su lote.
