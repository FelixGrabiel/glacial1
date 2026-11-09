-- GLACIAL · Mantenimiento · carga del PLAN-PROGRAMA MTTO 2026 (generado por supabase/datos/importar_plan_mtto.py). Repetible.
-- Requiere glacial_47. Reemplaza las actividades del año de estas máquinas; no toca nada más.
begin;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('SOP', 'SOPLADORA', 1, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('SOP CARB', 'SOPLADORA 8 CAVIDADES', 2, true) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('ENV', 'ENVASADORA', 3, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('ENV CARB', 'ENVASADORA ISOBÁRICA DE 32 VÁLVULAS', 4, true) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('DISP', 'DISPENSADOR DE TAPAS', 5, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('DISP CARB', 'DISPENSADOR DE TAPAS PLANA DE ENVASADORA ISOBÁRICA', 6, true) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('DISP CARB (2)', 'DISPENSADOR DE TAPAS SPORT CAP DE ENVASADORA ISOBÁRICA', 7, true) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('ETIQ', 'ETIQUETADORA', 8, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('CALD', 'CALDERO DE VAPOR', 9, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('SEC', 'SECADORA DE BOTELLAS', 10, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('INK JET', 'INK JET', 11, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('EMP', 'EMPAQUETADORA', 12, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('HORNO', 'HORNO TERMOCONTRAÍBLE', 13, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('COMP. BP', 'COMPRESORES BAJA PRESIÓN', 14, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('COMP. AP', 'COMPRESORES ALTA PRESIÓN', 15, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('COMP. AP CARB', 'COMPRESORES ALTA PRESIÓN DE SOPLADORA DE 8 CAVIDADES', 16, true) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('COMP. TOR', 'COMPRESOR DE TORNILLO', 17, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('FAJA T', 'FAJAS TRANSPORTADORAS', 18, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values ('TRAT. AGUA', 'TRATAMIENTO DE AGUA', 19, false) on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;
delete from public.mtto_plan_actividades where anio = 2026 and maquina_id in (select id from public.mtto_maquinas where codigo_hoja in ('SOP', 'SOP CARB', 'ENV', 'ENV CARB', 'DISP', 'DISP CARB', 'DISP CARB (2)', 'ETIQ', 'CALD', 'SEC', 'INK JET', 'EMP', 'HORNO', 'COMP. BP', 'COMP. AP', 'COMP. AP CARB', 'COMP. TOR', 'FAJA T', 'TRAT. AGUA'));
insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)
select m.id, 2026, v.frec, v.bloque, v.item, v.actividad, v.insumos, v.n_tec, case when v.todo then '["1 - 52","","","","","","","","","","",""]'::jsonb else v.meses::jsonb end, case when v.todo then array(select generate_series(1,52)) else v.semanas end, v.todo, v.orden
from (values
('SOP','SEMANAL',1,'1','BOCINAS DE LAS GUÍAS DE LAS VARILLAS DE ESTIRAMIENTO / LUBRICACIÓN','GRASA MULTIPROPÓSITO',1,'',null,true,1),
('SOP','SEMANAL',1,'2','HORNO DE PREFORMAS / LIMPIEZA','TRAPO INDUSTRIAL',1,'',null,true,2),
('SOP','SEMANAL',1,'3','CAMPANAS DENTADAS (TURNELAS) / REVISIÓN','N/A',1,'',null,true,3),
('SOP','SEMANAL',1,'4','SISTEMA DE TRANSPORTE HORNO PREFORMAS / LUBRICACIÓN','GRASA MULTIPROPÓSITO',1,'',null,true,4),
('SOP','SEMANAL',1,'5','CONEXIONES ELÉCTRICAS / AJUSTES','N/A',1,'',null,true,5),
('SOP','SEMANAL',1,'6','CHUMACERAS / LUBRICACIÓN','GRASA MULTIPROPÓSITO',1,'',null,true,6),
('SOP','SEMANAL',1,'7','CIRCUITO DE REFRIGERACIÓN / LIMPIEZA INTERNA','N/A',1,'',null,true,7),
('SOP','SEMANAL',1,'8','BOMBA DE ACEITE HIDRÁULICO / NIVEL','ACEITE HIDRÁULICO',1,'',null,true,8),
('SOP','SEMANAL',1,'9','UNIDAD DE MANTENIMIENTO AIRE COMPRIMIDO / LIMPIEZA','ACEITE PARA UNIDAD DE MTTO',1,'',null,true,9),
('SOP','SEMANAL',1,'10','TOLVA DE PREFORMAS / LIMPIEZA Y AJUSTES','TRAPO INDUSTRIAL',1,'',null,true,10),
('SOP','SEMANAL',1,'11','SOPLADORA / AJUSTES GENERALES','N/A',1,'',null,true,11),
('SOP','SEMANAL',1,'12','FILTROS DE AIRE DE ALTA PRESIÓN / LIMPIEZA','N/A',1,'',null,true,12),
('SOP','SEMANAL',1,'13','TOBERAS / REVISIÓN','ORING',1,'',null,true,13),
('SOP','SEMANAL',1,'14','BOBINAS ELECTROVÁVULAS / LIMPIEZA','LIMPIACONTACTO',1,'',null,true,14),
('SOP','SEMANAL',1,'15','VETILADOR SOPLADOR / LIMPIEZA','DESENGRASANTE / TRAPO INDUSTRIAL',1,'',null,true,15),
('SOP','SEMANAL',1,'16','MANIFOLD AIRE ALTA PRESIÓN / LIMPIEZA','TRAPO INDUSTRIAL',1,'',null,true,16),
('SOP','SEMANAL',1,'16','PINZAS NEUMÁTICAS / REVISIÓN','N/A',1,'',null,true,17),
('SOP','SEMANAL',1,'17','SENSORES / LIMPIEZA','LIMPIACONTACTO',1,'',null,true,18),
('SOP','MENSUAL',3,'1','SISTEMA DE REFRIGERACIÓN / LIMPIEZA QUÍMICA','QUITA SARRO',1,'["1","5","9","13","18","22","26","31","35","39","44","48"]','{1,5,9,13,18,22,26,31,35,39,44,48}'::integer[],false,19),
('SOP','MENSUAL',3,'2','FILTRO BOMBA DE VACÍO / REEMPLAZO','FILTRO',1,'["1","5","9","13","18","22","26","31","35","39","44","48"]','{1,5,9,13,18,22,26,31,35,39,44,48}'::integer[],false,20),
('SOP','MENSUAL',3,'3','CONECTORES NEUMÁTICOS E HIDRÁULICOS / REVISIÓN','N/A',1,'["1","5","9","13","18","22","26","31","35","39","44","48"]','{1,5,9,13,18,22,26,31,35,39,44,48}'::integer[],false,21),
('SOP','SEMESTRAL',6,'1','PISTONES NEUMÁTICOS / MANTENIMIENTO','GRASA ESPECIAL/TRAPO INDUSTRIAL',2,'["","","9","","","","","","35","","",""]','{9,35}'::integer[],false,22),
('SOP','SEMESTRAL',6,'2','MOTORES ELÉCTRICOS / REEMPLAZO DE RODAMIENTOS','RODAMIENTOS',2,'["","","","13","","","","","","39","",""]','{13,39}'::integer[],false,23),
('SOP','SEMESTRAL',6,'3','VÁLVULAS ELECTRONEUMÁTICAS / REVISIÓN','N/A',1,'["","","9","","","","","","35","","",""]','{9,35}'::integer[],false,24),
('SOP','SEMESTRAL',6,'4','FAJAS DE RODILLLOS / REEMPLAZO','FAJAS',1,'["","5","","","","","","31","","","",""]','{5,31}'::integer[],false,25),
('SOP','SEMESTRAL',6,'5','CAJA DE ENGRANES / REEMPLAZO DE ACEITE','ACEITE PARA ENGRANAJES',1,'["","","","","18","","","","","","44",""]','{18,44}'::integer[],false,26),
('SOP','SEMESTRAL',6,'6','FILTROS DE AIRE DE ALTA PRESIÓN / REEMPLAZO','FILTROS',1,'["","","","","18","","","","","","44",""]','{18,44}'::integer[],false,27),
('SOP','SEMESTRAL',6,'7','RODAMIENTOS VENTILADORES CHILLER / REEMPLAZO','RODAMIENTOS',1,'["","","","","","22","","","","","","48"]','{22,48}'::integer[],false,28),
('SOP','SEMESTRAL',6,'8','MOLDES / MTTO','QUÍMICO LIMPIA METALES',1,'["","","","","","22","","","","","","48"]','{22,48}'::integer[],false,29),
('SOP','ANUAL',7,'1','MANGUERAS, LLAVES DE PASO / REEMPLAZO','MANGUERA/LLAVES DE PASO',1,'["","","","13","","","","","","","",""]','{13}'::integer[],false,30),
('SOP','ANUAL',7,'2','COMPONENTES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES','LLAVES TÉRMICAS/CONTACTORES',1,'["","","","13","","","","","","","",""]','{13}'::integer[],false,31),
('SOP','ANUAL',7,'3','BOCINAS GUÍAS VARILLAS ESTIR. / REEMPLAZO','BOCINAS',1,'["","","","","","","","31","","","",""]','{31}'::integer[],false,32),
('SOP','ANUAL',7,'4','RETENES PRENSA NEUMÁTICA / REEMPLAZO','RETENES',2,'["","","","","18","","","","","","",""]','{18}'::integer[],false,33),
('SOP','ANUAL',7,'5','SIST. TRANSMISIÓN HORNO / MTTO','GRASA MULTIPROPÓSITO/RODAMIENTOS',1,'["","","","13","","","","","","","",""]','{13}'::integer[],false,34),
('SOP','ANUAL',7,'6','ELECTROVÁVULAS/REEMPLAZO','ELECTROVÁVULAS',1,'["","","","","","","","31","","","",""]','{31}'::integer[],false,35),
('SOP','ANUAL',7,'7','PISTONES NEUMÁTICOS/REEMPLAZO','PISTONES NEUMÁTICOS',1,'["","","","","","","26","","","","",""]','{26}'::integer[],false,36),
('SOP','ANUAL',7,'8','MOTORES ELÉCTRICOS / REBOBINADO','REBOBINADO',1,'["","","","","","","","","","39","",""]','{39}'::integer[],false,37),
('ENV','SEMANAL',1,'1','VÁLVULAS DE LLENADO / LIMPIEZA INTERNA, LAVADO Y DESINFECCIÓN','DRAX/DIVOSAN',1,'',null,true,1),
('ENV','SEMANAL',1,'2','ENGRANAJES / AJUSTES MECÁNICOS Y ENGRASE','GRASA MULTIPROPÓSITO',1,'',null,true,2),
('ENV','SEMANAL',1,'3','GUÍAS DE PORTAUÑAS / LUBRICACIÓN Y AJUSTE MECÁNICO','GRASA SANTARIA',1,'',null,true,3),
('ENV','SEMANAL',1,'4','EJES ENCAPSULADORES / LUBRICACIÓN','GRASA MULTIPROPÓSITO',1,'',null,true,4),
('ENV','SEMANAL',1,'5','UÑAS DEL RINSER / LAVADO Y DESINFECCIÓN','DRAX/DIVOSAN',1,'',null,true,5),
('ENV','SEMANAL',1,'6','SINCRONIZACIÓN DE DISCOS / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,6),
('ENV','SEMANAL',1,'7','FAJAS DEL MOTOR ELÉCTRICO / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,7),
('ENV','SEMANAL',1,'8','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,8),
('ENV','SEMANAL',1,'9','FILTRO DE AIRE SOPLADOR / LIMPIEZA','HERRAMIENTAS',1,'',null,true,9),
('ENV','SEMANAL',1,'10','ENCAPSULADORES / LIMPIEZA','HERRAMIENTAS',1,'',null,true,10),
('ENV','QUINCENAL',2,'1','MECANISMO DE GIRO ENCAPSULADORES / LUCBIRCACIÓN','GRASA MULTIPROPÓSITO',1,'["1,3","5,7","9,11","13,15","17,19,21","23,25","27,29","31,33","35,37","39,41,43","45,47","49,51"]','{1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43,45,47,49,51}'::integer[],false,11),
('ENV','QUINCENAL',2,'2','RODAMIENTO CENTRAL DEL EJE DE LA SECCIÓN DE TAPADO / ENGRASE','GRASA PARA RODAMIENTOS',1,'["1,3","5,7","9,11","13,15","17,19,21","23,25","27,29","31,33","35,37","39,41,43","45,47","49,51"]','{1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43,45,47,49,51}'::integer[],false,12),
('ENV','MENSUAL',3,'1','FILTRO DE AIRE SOPLADOR / REEMPLAZO','FILTRO',1,'["3","7","11","15","19","23","27","31","35","39","44","48"]','{3,7,11,15,19,23,27,31,35,39,44,48}'::integer[],false,13),
('ENV','MENSUAL',3,'2','MECANISMO GIRATORIO TANQUE ENVASADO / LUBRICACIÓN','GRASA SANITARIA',1,'["3","7","11","15","19","23","27","31","35","39","44","48"]','{3,7,11,15,19,23,27,31,35,39,44,48}'::integer[],false,14),
('ENV','MENSUAL',3,'3','CAJA REDUCTORA / INSPECCIÓN LUBRICACIÓN','N/A',1,'["3","7","11","15","19","23","27","31","35","39","44","48"]','{3,7,11,15,19,23,27,31,35,39,44,48}'::integer[],false,15),
('ENV','TRIMESTRAL',5,'1','SELLOS INTERNOS VÁLVULAS DE LLENADO / REEMPLAZO','ORING',1,'["1","","","13","","","26","","","39","",""]','{1,13,26,39}'::integer[],false,16),
('ENV','TRIMESTRAL',5,'2','ENCAPSULADORES / REEMPLAZO DE RODAMIENTOS','RODAMIENTOS 6006',2,'["1","","","13","","","26","","","39","",""]','{1,13,26,39}'::integer[],false,17),
('ENV','SEMESTRAL',6,'1','MOTOR ELÉCTRICO / MANTENIMIENTO ELECTROMECÁNICO','RODAMIENTOS',2,'["","","","","","25","","","","","","51"]','{25,51}'::integer[],false,18),
('ENV','SEMESTRAL',6,'2','BOMBAS DE AGUA / MANTENIMIENTO ELECTROMECÁNICO','RODAMIENTOS / SELLO MECÁNICO',2,'["","","","13","","","","","","43","",""]','{13,43}'::integer[],false,19),
('ENV','SEMESTRAL',6,'3','EJES CENTRALES / REEMPLAZO DE RODAMIENTOS','RODAMIENTOS 6008',2,'["","","9","","","","","","37","","",""]','{9,37}'::integer[],false,20),
('ENV','SEMESTRAL',6,'4','MOTOR ELÉCTRICO / REEMPLAZO DE FAJAS','FAJAS',1,'["","","","","21","","","","","","47",""]','{21,47}'::integer[],false,21),
('ENV','SEMESTRAL',6,'5','CAJA REDUCTORA / REEMPLAZO DE ACEITE LUBRICANTE','ACEITE PARA ENGRANAJES',2,'["","7","","","","","","33","","","",""]','{7,33}'::integer[],false,22),
('ENV','ANUAL',7,'1','EJE CENTRAL RINSER / REEMPLAZO DE RODAMIENTOS','RODAMIENTOS: CÓNICO HR30210J / BOLA 6210-ZZ-C3',1,'["","","","","","26","","","","","",""]','{26}'::integer[],false,23),
('ENV','ANUAL',7,'2','EJES CENTRAL TANQUE / REEMPLAZO DE RODAMIENTOS','RODAMIENTOS: CÓNICO 32060 X / BOLA 6026 ZZR',1,'["","","","","","","","33","","","",""]','{33}'::integer[],false,24),
('ENV','ANUAL',7,'3','EJES CENTRAL TAPADO / REEMPLAZO DE RODAMIENTOS','RODAMIENTOS',1,'["","","","","","","","33","","","",""]','{33}'::integer[],false,25),
('ENV','ANUAL',7,'4','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS/CONTACTORES/CABLES',1,'["","","","","","25","","","","","",""]','{25}'::integer[],false,26),
('DISP','SEMANAL',1,'1','TENSORES DE FAJA TRANSPORTADORA / AJUSTE MECÁNICO','HERRAMIENTAS',1,'',null,true,1),
('DISP','SEMANAL',1,'2','ESLABONES Y TRAVESAÑOS DE FAJA TRANSPORTADORA / REVISIÓN Y AJUSTE MECÁNICO','HERRAMIENTAS',1,'',null,true,2),
('DISP','SEMANAL',1,'3','CHUMACERAS / LUBRICACIÓN','GRASA MULTIPROPÓSITO',1,'',null,true,3),
('DISP','SEMANAL',1,'4','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,4),
('DISP','SEMESTRAL',6,'1','MOTOR ELÉCTRICO / MANTENIMIENTO ELECTROMECÁNICO','RODAMIENTOS',1,'["","","","","17","","","","","39","",""]','{17,39}'::integer[],false,5),
('DISP','SEMESTRAL',6,'2','CAJA REDUCTORA / REEMPLAZO DE ACEITE LUBRICANTE','ACEITE PARA ENGRANAJES',1,'["","","","","17","","","","","39","",""]','{17,39}'::integer[],false,6),
('DISP','SEMESTRAL',6,'3','CHUMACERAS / REEMPLAZO','CHUMACERAS F205',1,'["","","","","17","","","","","39","",""]','{17,39}'::integer[],false,7),
('DISP','ANUAL',7,'1','MOTOR ELÉCTRICO / REBOBINADO','TALLER EXTERNO',1,'["","","","","","","","","","42","",""]','{42}'::integer[],false,8),
('DISP','ANUAL',7,'2','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS/CONTACTORES/CABLES',1,'["","","","","","","","","","42","",""]','{42}'::integer[],false,9),
('ETIQ','SEMANAL',1,'1','GUÍAS (BARRAS) DE DESPLAZAMIENTO / LUBRICACIÓN','GRASA MULTIPROPÓSITO',1,'',null,true,1),
('ETIQ','SEMANAL',1,'2','TORNILLOS SIN FIN / LUBRICACIÓN','GRASA MULTIPROPÓSITO',1,'',null,true,2),
('ETIQ','SEMANAL',1,'3','BLOQUE DE CUCHILLAS / REEMPLAZO DE CUCHILLAS','CUCHILLAS',1,'',null,true,3),
('ETIQ','SEMANAL',1,'4','BLOQUE DE CUCHILLAS / LIMPIEZA DE CONTACTOS','SPRAY LIMPIA CONTACTOS',1,'',null,true,4),
('ETIQ','SEMANAL',1,'5','RODILLOS DE MANDRIL / REVISIÓN Y LUBRICACIÓN','GRASA MULTIPROPÓSITO',1,'',null,true,5),
('ETIQ','SEMANAL',1,'6','RUEDAS LANZA ETIQUETAS / REVISIÓN Y AJUSTE MECÁNICO','HERRAMIENTAS',1,'',null,true,6),
('ETIQ','SEMANAL',1,'7','CONEXIONES ELÉCTRICAS / AJUSTE','HERRAMIENTAS',1,'',null,true,7),
('ETIQ','SEMANAL',1,'8','ACOPLE MOTOR CUCHILLAS/AJUSTES','HERRAMIENTAS',1,'',null,true,8),
('ETIQ','SEMANAL',1,'9','FAJAS BLOQUE DE CUCHILLAS/ REVISIÓN','HERRAMIENTAS',1,'',null,true,9),
('ETIQ','SEMANAL',1,'10','SENSORES/REVISIÓN','HERRAMIENTAS',1,'',null,true,10),
('ETIQ','TRIMESTRAL',5,'1','RODAMIENTOS CAJA DE ENGRANAJES / REEMPLAZO','RODAMIENTOS 6201',1,'["","","11","","","25","","","38","","","51"]','{11,25,38,51}'::integer[],false,11),
('ETIQ','TRIMESTRAL',5,'2','RODAMIENTOS MANDRILES / REEMPLAZO','RODAMIENTOS 605',1,'["","7","","","20","","","33","","","47",""]','{7,20,33,47}'::integer[],false,12),
('ETIQ','SEMESTRAL',6,'1','MOTORES ELÉCTRICOS / MTTO ELECTROMECÁNICO','RODAMIENTOS',1,'["","","","13","","","","","","39","",""]','{13,39}'::integer[],false,13),
('ETIQ','SEMESTRAL',6,'2','RODAMIENTOS DE RODILLOS / REEMPLAZO','RODAMIENTOS 6901/6202',1,'["","","","","17","","","","","","47",""]','{17,47}'::integer[],false,14),
('ETIQ','ANUAL',7,'1','MOTOR ELÉCTRICO / REBOBINADO','TALLER EXTERNO',1,'["","","","13","","","","","","","",""]','{13}'::integer[],false,15),
('ETIQ','ANUAL',7,'2','FAJAS / REEMPLAZO','FAJAS',1,'["","","","13","","","","","","","",""]','{13}'::integer[],false,16),
('ETIQ','ANUAL',7,'3','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS/CONTACTORES/CABLES',2,'["","","","","","23","","","","","",""]','{23}'::integer[],false,17),
('CALD','SEMANAL',1,'1','PURGA / LIMPIEZA INTERNA','HERRAMIENTAS Y EQUIPOS',1,'',null,true,1),
('CALD','SEMANAL',1,'2','CONEXIONES ELÉCTRICAS / AJUSTE','HERRAMIENTAS',1,'',null,true,2),
('CALD','SEMANAL',1,'3','FILTROS DE SEDIMENTOS / LIMPIEZA','HERRAMIENTAS',1,'',null,true,3),
('CALD','SEMANAL',1,'4','MANGUERAS Y CONEXIONES / REVISÓN','N/A',1,'',null,true,4),
('CALD','SEMANAL',1,'5','RESISTENCIAS / REVISIÓN ELÉCTRICA','HERRAMIENTAS',1,'',null,true,5),
('CALD','SEMANAL',1,'6','ELECTRODOS DE NIVEL / LIMPIEZA','HERRAMIENTAS',1,'',null,true,6),
('CALD','SEMANAL',1,'7','VÁLVULA SOLENOIDE / LIMPIEZA','HERRAMIENTAS',1,'',null,true,7),
('CALD','SEMANAL',1,'8','FILTRO Y TUBERÍAS 1/2" / LIMPIEZA','HERRAMIENTAS',1,'',null,true,8),
('CALD','MENSUAL',3,'1','TANQUE / LIMPIEZA INTERNA PROFUNDA','EMPAQUETADURAS',1,'["3","7","11","15","19","23","27","31","35","39","44","48"]','{3,7,11,15,19,23,27,31,35,39,44,48}'::integer[],false,9),
('CALD','MENSUAL',3,'2','RESISTENCIAS / LIMPIEZA INTERNA PROFUNDA','HERRAMIENTAS',1,'["3","7","11","15","19","23","27","31","35","39","44","48"]','{3,7,11,15,19,23,27,31,35,39,44,48}'::integer[],false,10),
('CALD','SEMESTRAL',6,'1','BOMBA DE AGUA / MTTO ELECTROMECÁNICO','RODAMIENTOS',1,'["","","","15","","","","","","42","",""]','{15,42}'::integer[],false,11),
('CALD','SEMESTRAL',6,'2','MANÓMETROS / REEMPLAZO','MANÓMETROS',1,'["","","","15","","","","","","42","",""]','{15,42}'::integer[],false,12),
('CALD','SEMESTRAL',6,'3','RESISTENCIAS / REEMPLAZO','RESISTENCIAS 4500W',1,'["","","","","17","","","","","","47",""]','{17,47}'::integer[],false,13),
('CALD','SEMESTRAL',6,'4','MANGUERAS, LLAVES DE PASO / REEMPLAZO','MANGUERAS Y VÁLVULAS DE GLOBO',1,'["","","","","17","","","","","","47",""]','{17,47}'::integer[],false,14),
('CALD','ANUAL',7,'2','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS/CONTACTORES/CABLES',1,'["","","","","","","27","","","","",""]','{27}'::integer[],false,15),
('SEC','SEMANAL',1,'1','MANGUERAS Y BOQUILLAS / REVISIÓN Y AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,1),
('SEC','SEMANAL',1,'2','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,2),
('SEC','SEMESTRAL',6,'1','MANGUERAS Y ABRAZADERAS / REEMPLAZO','MANGUERAS 2" / ABRAZADERAS 2" ACERO INOX.',1,'["","","9","","","","","","35","","",""]','{9,35}'::integer[],false,3),
('SEC','ANUAL',7,'1','MOTOR ELÉCTRICO / MANTENIMIENTO ELECTROMECÁNICO','RODAMIENTOS',1,'["","","","","","","29","","","","",""]','{29}'::integer[],false,4),
('SEC','ANUAL',7,'2','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS/CONTACTORES/CABLES',1,'["","","","","","","","","","41","",""]','{41}'::integer[],false,5),
('INK JET','SEMANAL',1,'1','CABEZAL DE IMPRESIÓN / REVISIÓN Y LIMPIEZA','HERRAMIENTAS',1,'',null,true,1)
) as v(cod, frec, bloque, item, actividad, insumos, n_tec, meses, semanas, todo, orden)
join public.mtto_maquinas m on m.codigo_hoja = v.cod;
insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)
select m.id, 2026, v.frec, v.bloque, v.item, v.actividad, v.insumos, v.n_tec, case when v.todo then '["1 - 52","","","","","","","","","","",""]'::jsonb else v.meses::jsonb end, case when v.todo then array(select generate_series(1,52)) else v.semanas end, v.todo, v.orden
from (values
('INK JET','18 MESES',8,'1','KIT DE FILTROS / REEMPLAZO','TINTA Y DISOLVENTE',1,'["","","","","","25","","","","","",""]','{25}'::integer[],false,2),
('INK JET','BIANUAL',9,'1','FILTROS DE LÍNEA / REEMPLAZO','TINTA Y DISOLVENTE',1,'["","","","","","","","","","41","",""]','{41}'::integer[],false,3),
('EMP','SEMANAL',1,'1','PRENSA DE SELLADO / LIMPIEZA','HERRAMIENTAS',1,'',null,true,1),
('EMP','SEMANAL',1,'2','PRENSA DE SELLADO / AJUSTES MECÁNICOS Y CALIBRACIÓN','HERRAMIENTAS',1,'',null,true,2),
('EMP','SEMANAL',1,'3','SENSORES / REVISÓN Y LIMPIEZA','HERRAMIENTAS',1,'',null,true,3),
('EMP','SEMANAL',1,'4','GUÍAS DE PISTONES NEUMÁTICOS / LUBRICACIÓN','GRASA MULTIPROPÓSITO/TRAPO INDUSTRIAL',1,'',null,true,4),
('EMP','SEMANAL',1,'5','CHUMACERAS / LUBRICACIÓN','GRASA MULTIPROPÓSITO/TRAPO INDUSTRIAL',1,'',null,true,5),
('EMP','SEMANAL',1,'6','CADENAS Y PIÑONES / LUBRICACIÓN Y AJUSTES MECÁNICOS','GRASA MULTIPROPÓSITO/TRAPO INDUSTRIAL',1,'',null,true,6),
('EMP','SEMANAL',1,'7','SOPORTE DE BOBINAS / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,7),
('EMP','SEMANAL',1,'8','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,8),
('EMP','SEMANAL',1,'9','RESISTENCIAS / REVISIÓN ELÉCTRICA','HERRAMIENTAS',1,'',null,true,9),
('EMP','SEMANAL',1,'10','BOBINAS ELECTROVÁLVULAS / LIMPIEZA','LIMPIACONTACTO',1,'',null,true,10),
('EMP','SEMANAL',1,'11','FAJAS TRANSPORTADORAS / REVISIÓN Y AJUSTES','HERRAMIENTAS',1,'',null,true,11),
('EMP','MENSUAL',3,'1','MOTOREDUCTORES / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'["3","7","11","15","19","23","27","31","35","39","44","48"]','{3,7,11,15,19,23,27,31,35,39,44,48}'::integer[],false,12),
('EMP','TRIMESTRAL',5,'1','TEFLÓN PRENSA DE SELLADO / REEMPLAZO','TEFLÓN',1,'["","7","","","20","","","33","","","47",""]','{7,20,33,47}'::integer[],false,13),
('EMP','SEMESTRAL',6,'1','MOTOREDUCTORES / MANTENIMIENTO ELECTROMECÁNICO','RODAMIENTOS',1,'["","","","15","","","","","","41","",""]','{15,41}'::integer[],false,14),
('EMP','SEMESTRAL',6,'2','JEBE PRENSA DE SELLADO / REEMPLAZO','JEBE',1,'["","","","15","","","","","","41","",""]','{15,41}'::integer[],false,15),
('EMP','SEMESTRAL',6,'3','PISTONES NEUMÁTICOS / MANTENIMIENTO INTERNO','GRASA ESPECIAL',2,'["","","","","17","","","","","","47",""]','{17,47}'::integer[],false,16),
('EMP','ANUAL',7,'1','CHUMACERAS / REEMPLAZO','CHUMACERAS',1,'["","","","13","","","","","","","",""]','{13}'::integer[],false,17),
('EMP','ANUAL',7,'2','RESISTENCIA DE SELLADO/REEMPLAZO','RESISTENCIA TUBULAR 1000W',1,'["","","","","","25","","","","","",""]','{25}'::integer[],false,18),
('EMP','ANUAL',7,'4','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS/CONTACTORES/CABLES',1,'["","","","","","","","33","","","",""]','{33}'::integer[],false,19),
('HORNO','SEMANAL',1,'1','RESISTENCIAS / REVISIÓN ELÉCTRICA Y AJUSTES','HERRAMIENTAS',1,'',null,true,1),
('HORNO','SEMANAL',1,'2','LÁMINAS LATERALES / LIMPIEZA','HERRAMIENTAS',1,'',null,true,2),
('HORNO','SEMANAL',1,'3','TERMOCUPLAS / REVISIÓN ELÉCTRICA Y LIMPIEZA','HERRAMIENTAS',1,'',null,true,3),
('HORNO','SEMANAL',1,'4','VENTILADOR CENTRÍFUGO / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,4),
('HORNO','SEMANAL',1,'5','CHUMACERAS / LUBRICACIÓN','GRASA MULTIPROPÓSITO/TRAPO INDUSTRIAL',1,'',null,true,5),
('HORNO','SEMANAL',1,'6','CADENAS Y PIÑONES / LUBRICACIÓN Y AJUSTES MECÁNICOS','GRASA MULTIPROPÓSITO/TRAPO INDUSTRIAL',1,'',null,true,6),
('HORNO','SEMANAL',1,'7','EJES FAJA METÁLICA / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,7),
('HORNO','SEMANAL',1,'8','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,8),
('HORNO','TRIMESTRAL',5,'1','CAJA REDUCTORA / INSPECCIÓN LUBRICACIÓN','HERRAMIENTAS',1,'["","7","","","20","","","33","","","47",""]','{7,20,33,47}'::integer[],false,9),
('HORNO','SEMESTRAL',6,'1','RODILLOS DE FAJA METÁLICA / REEMPLAZO DE RODAMIENTOS','RODAMIENTOS',1,'["","","","15","","","","","","41","",""]','{15,41}'::integer[],false,10),
('HORNO','SEMESTRAL',6,'2','MOTOR ELÉCTRICO / MANTENIMIENTO ELECTROMECÁNICO','RODAMIENTOS',1,'["","","","","17","","","","","","47",""]','{17,47}'::integer[],false,11),
('HORNO','SEMESTRAL',6,'3','CAJA REDUCTORA / REEMPLAZO DE ACEITE','HERRAMIENTAS',1,'["","","","","17","","","","","","47",""]','{17,47}'::integer[],false,12),
('HORNO','ANUAL',7,'1','CHUMACERAS / REEMPLAZO','CHUMACERAS',1,'["","","","","","","","31","","","",""]','{31}'::integer[],false,13),
('HORNO','ANUAL',7,'3','RESISTENCIA DE HORNO/REEMPLAZO','RESISTENCIA TUBULAR 2000W',1,'["","","","","","","","33","","","",""]','{33}'::integer[],false,14),
('HORNO','ANUAL',7,'4','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS/CONTACTORES/CABLES',1,'["","","","","","","","33","","","",""]','{33}'::integer[],false,15),
('COMP. BP','SEMANAL',1,'1','FILTROS DE CONDENSADO / LIMPIEZA INTERNA','HERRAMIENTAS',1,'',null,true,1),
('COMP. BP','SEMANAL',1,'2','BOBINAS VÁLVUVAS SOLENOIDE / LIMPIEZA','LIMPIACONTACTO VISTONY/TRAPO INDUSTRIAL',1,'',null,true,2),
('COMP. BP','SEMANAL',1,'3','VÁLVUVA CHECK / LIMPIEZA','LIMPIACONTACTO VISTONY/TRAPO INDUSTRIAL',1,'',null,true,3),
('COMP. BP','SEMANAL',1,'4','CONEXIONES NEUMÁTICAS / REVISIÓN Y AJUSTES','HERRAMIENTAS',1,'',null,true,4),
('COMP. BP','SEMANAL',1,'5','CONEXIONES ELÉCTRICAS / REVISIÓN Y AJUSTES','HERRAMIENTAS',1,'',null,true,5),
('COMP. BP','SEMANAL',1,'6','FAJAS MOTORES ELÉCTRICOS / REVISIÓN Y LUBRICACIÓN','LUBRICANTE PARA FAJAS',1,'',null,true,6),
('COMP. BP','SEMANAL',1,'7','REJILLAS DE PROTECCIÓN / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,7),
('COMP. BP','SEMANAL',1,'8','SOPORTES / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,8),
('COMP. BP','SEMANAL',1,'9','SALA DE COMPRESORES / LIMPIEZA','HERRAMIENTAS',1,'',null,true,9),
('COMP. BP','SEMANAL',1,'10','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,10),
('COMP. BP','BIMESTRAL',4,'1','ACEITE LUBRICANTE / REEMPLAZO','ACEITE AIR COMPRESSOR OIL 100 VISTONY',1,'["1","","9","","17","","26","","35","","44",""]','{1,9,17,26,35,44}'::integer[],false,11),
('COMP. BP','TRIMESTRAL',5,'1','FILTRO DE AIRE ADMISIÓN / REEMPLAZO','FILTRO CILÍNDRICO DE AIRE',1,'["","5","","","19","","","33","","","47",""]','{5,19,33,47}'::integer[],false,12),
('COMP. BP','TRIMESTRAL',5,'2','SECADORA / MTTO PROFUNDO','HERRAMIENTAS',1,'["","5","","","19","","","33","","","47",""]','{5,19,33,47}'::integer[],false,13),
('COMP. BP','TRIMESTRAL',5,'3','FILTROS DE CONDENSADO / REEMPLAZO','FILTROS',1,'["","5","","","19","","","33","","","47",""]','{5,19,33,47}'::integer[],false,14),
('COMP. BP','ANUAL',7,'1','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS / CONTACTORES / CABLES',1,'["","","11","","","","","","","","",""]','{11}'::integer[],false,15),
('COMP. BP','ANUAL',7,'2','MANGUERAS, LLAVES DE PASO / REEMPLAZO','MANGUERAS 1" / VÁLVULAS DE GLOBO 1"',1,'["","","11","","","","","","","","",""]','{11}'::integer[],false,16),
('COMP. BP','18 MESES',8,'1','CABEZAL/MANTENIMIENTO PROFUNDO','TALLER EXTERNO',1,'["","","9","","","","","","","","",""]','{9}'::integer[],false,17),
('COMP. BP','18 MESES',8,'2','MOTOR ELÉCTRICO/MANTENIMIENTO PROFUNDO','TALLER EXTERNO',1,'["","","9","","","","","","","","",""]','{9}'::integer[],false,18),
('COMP. AP','SEMANAL',1,'1','FILTROS DE CONDENSADO / LIMPIEZA INTERNA','HERRAMIENTAS',1,'',null,true,1),
('COMP. AP','SEMANAL',1,'2','BOBINAS VÁLVUVAS SOLENOIDE / LIMPIEZA','LIMPIACONTACTO VISTONY/TRAPO INDUSTRIAL',1,'',null,true,2),
('COMP. AP','SEMANAL',1,'3','VÁLVUVA CHECK / LIMPIEZA','LIMPIACONTACTO VISTONY/TRAPO INDUSTRIAL',1,'',null,true,3),
('COMP. AP','SEMANAL',1,'4','CONEXIONES NEUMÁTICAS / REVISIÓN Y AJUSTES','HERRAMIENTAS',1,'',null,true,4),
('COMP. AP','SEMANAL',1,'5','CONEXIONES ELÉCTRICAS / REVISIÓN Y AJUSTES','HERRAMIENTAS',1,'',null,true,5),
('COMP. AP','SEMANAL',1,'6','FAJAS MOTORES ELÉCTRICOS / REVISIÓN Y LUBRICACIÓN','LUBRICANTE PARA FAJAS',1,'',null,true,6),
('COMP. AP','SEMANAL',1,'7','REJILLAS DE PROTECCIÓN / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,7),
('COMP. AP','SEMANAL',1,'8','SOPORTES / AJUSTES MECÁNICOS','HERRAMIENTAS',1,'',null,true,8),
('COMP. AP','SEMANAL',1,'9','SALA DE COMPRESORES / LIMPIEZA','HERRAMIENTAS',1,'',null,true,9),
('COMP. AP','SEMANAL',1,'10','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,10),
('COMP. AP','BIMESTRAL',4,'1','ACEITE LUBRICANTE / REEMPLAZO','ACEITE AIR COMPRESSOR OIL 100 VISTONY',1,'["1","","9","","17","","26","","35","","44",""]','{1,9,17,26,35,44}'::integer[],false,11),
('COMP. AP','TRIMESTRAL',5,'1','FILTRO DE AIRE ADMISIÓN / REEMPLAZO','FILTRO CILÍNDRICO DE AIRE',1,'["","5","","","19","","","33","","","47",""]','{5,19,33,47}'::integer[],false,12),
('COMP. AP','TRIMESTRAL',5,'2','SECADORA / MTTO PROFUNDO','HERRAMIENTAS',1,'["","5","","","19","","","33","","","47",""]','{5,19,33,47}'::integer[],false,13),
('COMP. AP','TRIMESTRAL',5,'3','FILTROS DE CONDENSADO / REEMPLAZO','FILTROS',1,'["","5","","","19","","","33","","","47",""]','{5,19,33,47}'::integer[],false,14),
('COMP. AP','ANUAL',7,'1','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS / CONTACTORES / CABLES',1,'["","","11","","","","","","","","",""]','{11}'::integer[],false,15),
('COMP. AP','ANUAL',7,'2','MANGUERAS, LLAVES DE PASO / REEMPLAZO','MANGUERAS 1" / VÁLVULAS DE GLOBO 1"',1,'["","","11","","","","","","","","",""]','{11}'::integer[],false,16),
('COMP. AP','18 MESES',8,'1','CABEZAL/MANTENIMIENTO PROFUNDO','TALLER EXTERNO',1,'["","","","15","","","","","","","",""]','{15}'::integer[],false,17),
('COMP. AP','18 MESES',8,'2','MOTOR ELÉCTRICO/MANTENIMIENTO PROFUNDO','TALLER EXTERNO',1,'["","","","15","","","","","","","",""]','{15}'::integer[],false,18),
('COMP. TOR','SEMANAL',1,'1','CONEXIONES NEUMÁTICAS / REVISIÓN Y AJUSTES','HERRAMIENTAS',1,'',null,true,1),
('COMP. TOR','SEMANAL',1,'2','FAJA / REVISIÓN Y LUBRICACIÓN','LUBRICANTE PARA FAJAS',1,'',null,true,2),
('COMP. TOR','SEMANAL',1,'3','COMPRESOR / LIMPIEZA','TRAPO INDUSTRIAL',1,'',null,true,3),
('COMP. TOR','SEMANAL',1,'4','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,4),
('COMP. TOR','TRIMESTRAL',5,'1','SECADORA / LIMPIEZA','HERRAMIENTAS',1,'["1","","","13","","","27","","","39","",""]','{1,13,27,39}'::integer[],false,5),
('COMP. TOR','SEMESTRAL',6,'1','ACEITE LUBRICANTE / REEMPLAZO','ACEITE ADINOL 46',1,'["1","","","","","","27","","","","",""]','{1,27}'::integer[],false,6),
('COMP. TOR','SEMESTRAL',6,'2','FILTRO DE AIRE ADMISIÓN / REEMPLAZO','FILTRO DE ASPIRACIÓN',1,'["1","","","","","","27","","","","",""]','{1,27}'::integer[],false,7),
('COMP. TOR','SEMESTRAL',6,'3','FILTRO DE ACEITE / REEMPLAZO','FILTRO DE ACEITE',1,'["1","","","","","","27","","","","",""]','{1,27}'::integer[],false,8),
('COMP. TOR','SEMESTRAL',6,'4','RECOGEDOR DE IMPUERZAS / LIMPIEZA','HERRAMIENTAS',1,'["1","","","","","","27","","","","",""]','{1,27}'::integer[],false,9),
('COMP. TOR','ANUAL',7,'1','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS / CONTACTORES / CABLES',1,'["","","","13","","","","","","","",""]','{13}'::integer[],false,10),
('COMP. TOR','ANUAL',7,'2','MANGUERAS, LLAVES DE PASO / REEMPLAZO','MANGUERAS / VÁLVULAS DE GLOBO',1,'["","","","","","","","","","43","",""]','{43}'::integer[],false,11),
('FAJA T','SEMANAL',1,'1','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,1),
('FAJA T','SEMANAL',1,'2','CHUMACERAS / LUBRICACIÓN','GRASA MULTIPROPÓSITO/TRAPO INDUSTRIAL',1,'',null,true,2),
('FAJA T','SEMANAL',1,'3','FAJAS TRANSPORTADORAS / LUBRICACIÓN','SILICONA DESMOLDANTE',1,'',null,true,3),
('FAJA T','TRIMESTRAL',5,'1','CAJA REDUCTORA / REEMPLAZO ACEITE LUBRICANTE','ACEITE PARA CAJAS REDUCTORAS',1,'["","5","","","19","","","33","","","47",""]','{5,19,33,47}'::integer[],false,4),
('FAJA T','TRIMESTRAL',5,'1','FAJAS TRANSPORTADORAS / DESMONTAJE Y REVISIÓN','HERRAMIENTAS',1,'["","5","","","19","","","33","","","47",""]','{5,19,33,47}'::integer[],false,5),
('FAJA T','SEMESTRAL',6,'1','MOTORES ELÉCTRICOS / REEMPLAZO DE RODAMIENTOS','RODAMIENTOS',1,'["","","","","17","","","","","","47",""]','{17,47}'::integer[],false,6),
('FAJA T','SEMESTRAL',6,'2','CHUMACERAS / REEMPLAZO','CHUMACERAS F205 1"',1,'["","","","","17","","","","","","47",""]','{17,47}'::integer[],false,7),
('FAJA T','ANUAL',7,'1','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS / CONTACTORES / CABLES',1,'["","","","","","","","","","41","",""]','{41}'::integer[],false,8),
('TRAT. AGUA','SEMANAL',1,'1','BOMBA DE AGUA ÓSMOSIS INVERSA / LUBRICACIÓN DE RODAMIENTOS','GRASA MULTIPROPÓSITO',1,'',null,true,1),
('TRAT. AGUA','SEMANAL',1,'2','SENSORES DE NIVEL / REVISIÓN DE FUNCIONAMIENTO','HERRAMIENTAS',1,'',null,true,2),
('TRAT. AGUA','SEMANAL',1,'3','CONEXIONES ELÉCTRICAS / AJUSTES','HERRAMIENTAS',1,'',null,true,3),
('TRAT. AGUA','SEMESTRAL',6,'1','BOMBA DE AGUA TK1 / MANTENIMIENTO ELECTROMECÁNICO','RODAMIENTOS Y SELLO MECÁNICO',2,'["","","","","21","","","","","","47",""]','{21,47}'::integer[],false,4),
('TRAT. AGUA','ANUAL',7,'1','BOMBA DE AGUA ÓSMOSIS INVERSA / MANTENIMIENTO ELECTROMECÁNICO','RODAMIENTOS',2,'["2","","","","","","","","","","",""]','{2}'::integer[],false,5),
('TRAT. AGUA','ANUAL',7,'2','MANÓMETROS, FLUJOMETROS / REEMPLAZO','MANÓMETROS, FLUJOMETROS',1,'["","","","15","","","","","","","",""]','{15}'::integer[],false,6),
('TRAT. AGUA','ANUAL',7,'3','COMPONENETES ELÉCTRICOS / REEMPLAZO DE LLAVES, CONTACTORES, CABLES','LLAVES TÉRMICAS / CONTACTORES / CABLES',1,'["","","","","","","","","37","","",""]','{37}'::integer[],false,7)
) as v(cod, frec, bloque, item, actividad, insumos, n_tec, meses, semanas, todo, orden)
join public.mtto_maquinas m on m.codigo_hoja = v.cod;
insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)
select d.id, o.anio, o.frecuencia, o.bloque_orden, o.item, o.actividad, o.insumos, o.n_tecnicos, o.semanas_por_mes, o.semanas, o.es_todo_el_anio, o.orden
from public.mtto_plan_actividades o join public.mtto_maquinas c on c.id = o.maquina_id and c.codigo_hoja = 'SOP', public.mtto_maquinas d
where d.codigo_hoja = 'SOP CARB' and o.anio = 2026;   -- hoja idéntica a SOP
insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)
select d.id, o.anio, o.frecuencia, o.bloque_orden, o.item, o.actividad, o.insumos, o.n_tecnicos, o.semanas_por_mes, o.semanas, o.es_todo_el_anio, o.orden
from public.mtto_plan_actividades o join public.mtto_maquinas c on c.id = o.maquina_id and c.codigo_hoja = 'ENV', public.mtto_maquinas d
where d.codigo_hoja = 'ENV CARB' and o.anio = 2026;   -- hoja idéntica a ENV
insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)
select d.id, o.anio, o.frecuencia, o.bloque_orden, o.item, o.actividad, o.insumos, o.n_tecnicos, o.semanas_por_mes, o.semanas, o.es_todo_el_anio, o.orden
from public.mtto_plan_actividades o join public.mtto_maquinas c on c.id = o.maquina_id and c.codigo_hoja = 'DISP', public.mtto_maquinas d
where d.codigo_hoja = 'DISP CARB' and o.anio = 2026;   -- hoja idéntica a DISP
insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)
select d.id, o.anio, o.frecuencia, o.bloque_orden, o.item, o.actividad, o.insumos, o.n_tecnicos, o.semanas_por_mes, o.semanas, o.es_todo_el_anio, o.orden
from public.mtto_plan_actividades o join public.mtto_maquinas c on c.id = o.maquina_id and c.codigo_hoja = 'DISP', public.mtto_maquinas d
where d.codigo_hoja = 'DISP CARB (2)' and o.anio = 2026;   -- hoja idéntica a DISP
insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)
select d.id, o.anio, o.frecuencia, o.bloque_orden, o.item, o.actividad, o.insumos, o.n_tecnicos, o.semanas_por_mes, o.semanas, o.es_todo_el_anio, o.orden
from public.mtto_plan_actividades o join public.mtto_maquinas c on c.id = o.maquina_id and c.codigo_hoja = 'COMP. AP', public.mtto_maquinas d
where d.codigo_hoja = 'COMP. AP CARB' and o.anio = 2026;   -- hoja idéntica a COMP. AP
commit;
