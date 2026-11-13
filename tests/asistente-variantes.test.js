/* Variantes de insumo: preformas por gramaje, polietileno 48/54/56 cm, stretch por rollo (17 / 2 kg) y etiquetas por tipo (roll feed, bobina, B7L, B10L).
   Datos inventados salvo las reglas de gramaje y capacidad, que vienen del código (Inicio) y de lo indicado por Producción. */
const fs=require('fs'),vm=require('vm'),path=require('path');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const sn={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp};vm.createContext(sn);sn.window=sn;
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..','js/asistente/70-asistente-nucleo.js'),'utf8'),sn);
const N=sn.glacialAsistenteNucleo;

/* gramaje por presentación */
ok(N.gramajeDe('PET1','pack_regular_380mlx24und/ln')==='12.7','380 ml → 12.7 g');
ok(N.gramajeDe('PET1','pack_regular_625mlx15und/la')==='15.7','625 ml regular → 15.7 g');
ok(N.gramajeDe('PET2','Pack saborizada_625mlx15und')==='17.7'&&N.gramajeDe('PET2','Pack gas_625mlx6und')==='21.7','625 ml saborizada 17.7 g · con gas 21.7 g');
ok(N.gramajeDe('PET1','pack_regular_sc_1lx12und/ln')==='21.7'&&N.gramajeDe('PET1','pack_regular_1.5lx6und')==='33.7'&&N.gramajeDe('PET2','Pack c/Sticker_Regular_2.5Lx6und')==='42.7','1 L 21.7 g · 1.5 L 33.7 g · 2.5 L 42.7 g');
ok(N.gramajeDe('B7L','*')==='90'&&N.gramajeDe('PET1','otra cosa')===null,'B7L 90 g; presentación desconocida → null (no se inventa)');

/* separación de factores existentes */
const F=(insumo,linea,presentacion,base,cantidadBase,factor)=>({id:insumo+linea+presentacion,insumo,linea,marca:'*',presentacion,base,cantidadBase,factor,activo:true,vigenteHasta:null,vigenteDesde:'2020-01-01',origen:'codigo'});
const fx=[
  F('CAJA_PREFORMA','PET1','pack_regular_625mlx6und/la','UND',18750,1),F('CAJA_PREFORMA','PET1','pack_regular_2.5lx6und','UND',7900,1),F('CAJA_PREFORMA','B7L','*','UND',2900,1),
  F('CAJA_PREFORMA','C20L','*','UND',1,0),
  F('POLIETILENO','PET1','pack_regular_2.5lx6und','PALETA',1,1.89),F('POLIETILENO','B7L','*','PALETA',1,2.02),F('POLIETILENO','C20L','*','PALETA',1,0.9),F('POLIETILENO','B20L','*','PALETA',1,0),
  F('STRETCH','PET1','pack_regular_2.5lx6und','PALETA',1,0.34),
  F('ETIQUETA','PET1','*','UND',1,1),F('ETIQUETA','B7L','*','UND',1,1),F('ETIQUETA','C20L','*','UND',1,0),
  F('TAPA','PET1','*','UND',1,1),F('CARTON','PET1','pack_regular_2.5lx6und','PALETA',1,4)
];
const m=N.variantesDeFactores(fx),destino=f=>{const x=m.find(y=>y.orig===f);return x&&x.nuevos.map(n=>n.insumo).join(',');};
ok(destino(fx[0])==='PREFORMA_15_7'&&m.find(y=>y.orig===fx[0]).nuevos[0].cantidadBase===18000,'625 ml: PREFORMA_15_7 con 18 000 preformas por caja (capacidad física por gramaje)');
ok(destino(fx[1])==='PREFORMA_42_7'&&destino(fx[2])==='PREFORMA_90','2.5 L → 42.7 g; B7L → 90 g');
ok(destino(fx[3])===undefined,'preformas de C20L (No aplica) se quedan en el insumo base');
ok(destino(fx[4])==='POLIETILENO_56'&&destino(fx[5])==='POLIETILENO_48'&&destino(fx[6])==='POLIETILENO_54'&&destino(fx[7])==='POLIETILENO_56','polietileno: PET 56 cm · B7L 48 cm · C20L 54 cm · el resto 56 cm');
const st=m.find(y=>y.orig===fx[8]).nuevos[0];
ok(st.insumo==='STRETCH_17KG'&&Math.abs(st.factor*17-0.34)<1e-12,'stretch: factor en rollos de 17 kg (0.34 kg ÷ 17)');
ok(destino(fx[9])==='ETIQUETA_RF_625,ETIQUETA_BOBINA_2_5L','etiquetas PET: una por presentación (roll feed 625 ml, bobina 2.5 L)');
ok(destino(fx[10])==='ETIQUETA_B7L'&&destino(fx[11])===undefined,'etiqueta B7L; C20L (No aplica) se queda en el base');
ok(destino(fx[12])===undefined&&destino(fx[13])===undefined,'tapas y cartón no cambian');
ok(N.INSUMOS_VARIANTE.some(i=>i.codigo==='ETIQUETA_B10L')&&N.INSUMOS_VARIANTE.some(i=>i.codigo==='STRETCH_2KG'&&i.kgPorUnidad===2&&i.unidad==='rollo')
  &&N.INSUMOS_VARIANTE.filter(i=>i.grupo==='CAJA_PREFORMA').length===7&&N.INSUMOS_VARIANTE.every(i=>!N.validarInsumo(i).length),'catálogo: 7 gramajes, 3 anchos, 2 rollos, 7 etiquetas; todos válidos');
const fin=N.aplicarVariantes(fx);
ok(fin.length===fx.length-m.length+m.reduce((s,x)=>s+x.nuevos.length,0)&&!fin.some(f=>f.insumo==='POLIETILENO'||f.insumo==='STRETCH'),'aplicarVariantes: nada queda en el polietileno ni el stretch base');

/* requerimientos: una variante que no corresponde al cuadro no sale «sin factor» */
const ins=[{codigo:'CAJA_PREFORMA',activo:false,grupo:''},...N.INSUMOS_VARIANTE.filter(i=>i.grupo==='CAJA_PREFORMA')].map(i=>({...i,nombre:i.nombre||i.codigo,unidad:'caja'}));
const fac=N.aplicarVariantes(fx).filter(f=>/PREFORMA/.test(f.insumo)).map(f=>({...f,fecha:undefined}));
const cuadro={clave:'k',linea:'PET1',marca:'Scala',presentacion:'pack_regular_2.5lx6und',fecha:'2026-11-13',programado:7900,unidadesPorPaleta:0,completar:false};
const req=N.requerimientos({cuadros:[cuadro],factores:fac,insumos:ins,movimientos:[]});
ok(req.length===1&&req[0].insumo.codigo==='PREFORMA_42_7'&&Math.round(req[0].requerido*1000)/1000===1.053,'el cuadro de 2.5 L pide solo cajas de 42.7 g (7 900 ÷ 7 500) y no hay filas «sin factor» de otros gramajes');

/* grupo → variante en la fachada de consumo (71-asistente-datos.js) y conservación al editar */
const d71=fs.readFileSync(path.resolve(__dirname,'..','js/asistente/71-asistente-datos.js'),'utf8');
ok(/cache\.insumos\.filter\(i=>i\.grupo===insumo\)/.test(d71)&&/aciertos\.length!==1/.test(d71)&&/kgPorUnidad/.test(d71)&&/if\(antes&&antes\.grupo\)d\.grupo=antes\.grupo/.test(d71),'consumo(grupo) elige la variante con factor, convierte rollos a kg y editar no pierde el grupo');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
