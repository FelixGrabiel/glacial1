-- GLACIAL · 07/11/2026 · Factores de consumo de TAPAS y ETIQUETAS (confirmados por el dueño: 1 por unidad producida)
-- Tapas: PET1, PET2, B7L y B20L. Etiquetas: PET1, PET2 y B7L. Todas las marcas y presentaciones, base UND, vigencia desde 07/11/2026.
-- Mismo formato que el resto de apFactores, con su registro en apAuditoria (operación CREAR). No toca otros factores.
-- Se puede ejecutar más de una vez (on conflict do nothing).
with t as (select (extract(epoch from now())*1000)::bigint ms),
f as (
  select l.linea, l.insumo, l.linea||'_'||l.insumo||'_x_x_20261107' id
  from (values ('PET1','TAPA'),('PET2','TAPA'),('B7L','TAPA'),('B20L','TAPA'),('PET1','ETIQUETA'),('PET2','ETIQUETA'),('B7L','ETIQUETA')) l(linea,insumo)
),
d as (
  select f.id, jsonb_build_object('id',f.id,'base','UND','nota','1 por unidad producida (confirmado por Producción, 07/11/2026)','linea',f.linea,'marca','*',
    'activo',true,'factor',1,'insumo',f.insumo,'origen','manual','version',1,'cantidadBase',1,'presentacion','*','vigenteDesde','2026-11-07','vigenteHasta',null,
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
on conflict do nothing;
