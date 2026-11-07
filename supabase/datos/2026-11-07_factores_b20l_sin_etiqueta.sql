-- GLACIAL · 07/11/2026 · B20L no lleva etiqueta (confirmado por el dueño): factor 0 «No aplica», como los demás que no corresponden.
-- Así el Asistente no lo muestra como «Pendiente de configurar» ni pide etiquetas para B20L. Se puede ejecutar más de una vez.
with t as (select (extract(epoch from now())*1000)::bigint ms),
f as (select l.linea, l.insumo, l.linea||'_'||l.insumo||'_x_x_20261107' id from (values ('B20L','ETIQUETA')) l(linea,insumo)),
d as (
  select f.id, jsonb_build_object('id',f.id,'base','UND','nota','No aplica: B20L no lleva etiqueta (confirmado por Producción, 07/11/2026)','linea',f.linea,'marca','*',
    'activo',true,'factor',0,'insumo',f.insumo,'origen','manual','version',1,'cantidadBase',1,'presentacion','*','vigenteDesde','2026-11-07','vigenteHasta',null,
    'actualizadoEn',jsonb_build_object('__ts',t.ms),'actualizadoPor','Carga de factores confirmados (auditoría Asistente 07/11/2026)','actualizadoUid','') datos, t.ms
  from f, t
),
ins as (
  insert into public.fs_docs(coleccion,id,datos,version,partes,conteos,tocados,raiz)
  select 'apFactores', id, datos, 1, '{}', '{}'::jsonb, 0, 'apFactores' from d
  on conflict do nothing returning id
)
insert into public.fs_docs(coleccion,id,datos,version,partes,conteos,tocados,raiz)
select 'apAuditoria','carga-apFactores-'||d.id,
  jsonb_build_object('en',jsonb_build_object('__ts',d.ms),'uid','','antes',null,'docId',d.id,'despues',d.datos,'usuario','Carga de factores confirmados (auditoría Asistente 07/11/2026)','coleccion','apFactores','operacion','CREAR'),
  1,'{}','{}'::jsonb,0,'apAuditoria'
from d join ins on ins.id=d.id
on conflict do nothing
returning id;
