-- GLACIAL · Mantenimiento · los registros CFA-CA-F-023 empiezan DESDE CERO en la semana 46 de 2026 (decisión del dueño, 09/11/2026).
-- No se cargan registros anteriores y la pantalla no deja iniciar semanas anteriores a la 46 (js/mantenimiento/71-plan-anual-nucleo.js › inicioRegistros).
-- Requiere glacial_47. Repetible. APLICADA en PRUEBAS (09/11/2026). PRODUCCIÓN: junto con el resto del módulo, con aprobación del dueño.
update public.mtto_config set datos = datos || '{"inicioRegistros":{"anio":2026,"semana":46}}'::jsonb where id = 'config';
