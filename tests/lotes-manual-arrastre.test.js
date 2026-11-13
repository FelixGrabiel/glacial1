/* Trazabilidad (auditoría 12/11/2026): punto 1 — lote escrito a mano en el cuadro; punto 2 — la producción nueva trae los lotes en uso de la anterior. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
global.window=global;
require(R+'/js/asistente/87-trazabilidad-lotes-nucleo.js');
const L=require(R+'/js/asistente/92-lotes-en-cuadro.js');
require(R+'/js/asistente/90-control-proceso-nucleo.js');
const I=require(R+'/js/asistente/94-trazabilidad-informe.js');
const CP=global.glacialControlProcesoNucleo;

/* ---------- punto 1: lote escrito a mano ---------- */
let r=L.entradaManual({categoria:'tapas',loteProveedor:'  pg-100 163 ',insumo:'Tapa 28 mm azul'});
ok(r.ok&&r.entrada.manual===true&&r.entrada.loteId==='MAN-TAPAS-PG100163'&&r.entrada.loteProveedor==='pg-100 163'&&r.entrada.categoria==='tapas'&&r.entrada.unidadIds.length===0,'la entrada manual guarda el lote como se escribió (sin espacios sobrantes) y una clave MAN- por categoría y lote');
ok(L.entradaManual({categoria:'tapas',loteProveedor:'PG-100163'}).entrada.loteId===r.entrada.loteId,'«pg-100 163» y «PG-100163» son el mismo lote (sin separadores ni mayúsculas)');
ok(L.entradaManual({categoria:'preformas',loteProveedor:'PG100163'}).entrada.loteId!==r.entrada.loteId,'el mismo texto en otra categoría es otro lote');
ok(!L.entradaManual({categoria:'tapas',loteProveedor:' - '}).ok&&!L.entradaManual({categoria:'otro',loteProveedor:'ABC'}).ok&&!L.entradaManual({loteProveedor:'ABC'}).ok,'sin lote o sin categoría válida no se agrega');
ok(L.entradaManual({categoria:'etiquetas',loteProveedor:'X'.repeat(80)}).entrada.loteProveedor.length===40,'el lote se corta a 40 caracteres');
ok(L.esManual(r.entrada)&&L.esManual({loteId:'MAN-X-1'})&&!L.esManual({loteId:'LI-000001'}),'se reconoce lo escrito a mano');

const lotes=[{id:'LI-000002',loteProveedor:'PG10016320',producto:'Preforma 90 g',categoria:'preformas',proveedor:'Prov A'},
  {id:'LI-000007',loteProveedor:'12158',producto:'Etiqueta',categoria:'etiquetas'},{id:'LI-000011',loteProveedor:'12-158',producto:'Etiqueta',categoria:'etiquetas',unidoEn:'LI-000007'}];
ok(L.resolverManual(L.entradaManual({categoria:'preformas',loteProveedor:'pg 10016320'}).entrada,lotes).id==='LI-000002','cuando la foto se valida, el lote escrito a mano se enlaza solo al del sistema');
ok(L.resolverManual(L.entradaManual({categoria:'tapas',loteProveedor:'PG10016320'}).entrada,lotes)===null,'no se enlaza con un lote de otra categoría');
ok(L.resolverManual(L.entradaManual({categoria:'etiquetas',loteProveedor:'12158'}).entrada,lotes).id==='LI-000007','con lotes unidos se enlaza al destino de la unión');
ok(L.resolverManual({loteId:'LI-000002'},lotes)===null,'un lote del sistema no pasa por el enlace manual');

/* Control de proceso: la columna de lote se llena igual con lo escrito a mano. */
const cuadroM={numero:1,marca:'Cielo',lotesInsumo:[L.entradaManual({categoria:'tapas',loteProveedor:'T-77'}).entrada,L.entradaManual({categoria:'preformas',loteProveedor:'P-9'}).entrada]};
const col=CP.lotesDelCuadro(cuadroM);
ok(col.tapa==='T-77'&&col.preforma==='P-9','el Control de proceso llena L.TAPA y L.PREFORMA con los lotes escritos a mano');

/* Informe: hacia adelante y hacia atrás con lotes escritos a mano. */
const regs=[{id:'R1',linea:'B7L',fecha:'2026-11-12',turno:'DÍA',estadoRegistro:'EN_REGISTRO',cuadros:[{numero:1,marca:'Cielo',presentacion:'7L',lote:'CB7',produccion:{efectiva:500},
    lotesInsumo:[L.entradaManual({categoria:'preformas',loteProveedor:'pg 10016320'}).entrada,L.entradaManual({categoria:'tapas',loteProveedor:'T-77',insumo:'Tapa 48 mm'}).entrada,
      {loteId:'LI-000002',loteProveedor:'PG10016320',categoria:'preformas',unidadIds:['LI-000002-1']}]}]}];
const usos=I.usosDeRegistros(regs,lotes);
ok(usos.length===2,'el mismo lote escrito a mano y tomado del sistema en una producción cuenta una sola vez');
ok(usos.some(u=>u.loteId==='LI-000002'&&u.proveedor==='Prov A')&&usos.some(u=>u.loteId==='MAN-TAPAS-T77'&&u.manual),'lo enlazado se cuenta en el lote del sistema; lo no validado queda con su clave MAN-');
let b=I.buscar('T-77',{lotes,unidades:[],usos});
ok(b.insumos.length===1&&b.insumos[0].lote.manual&&b.insumos[0].usos.length===1&&b.insumos[0].usos[0].lotePT,'hacia adelante: se busca un lote escrito a mano y muestra dónde se usó');
b=I.buscar('CB7',{lotes,unidades:[],usos});
ok(b.productos.length===1&&b.productos[0].insumos.tapas&&b.productos[0].insumos.tapas[0].loteProveedor==='T-77','hacia atrás: el lote de producto muestra el lote escrito a mano');
ok(I.filasExcel(usos).some(f=>/^Escrito a mano/.test(f[0])),'el Excel marca el lote escrito a mano en vez de una clave interna');
ok(I.cobertura(regs,{}).con===1,'una producción con lotes escritos a mano cuenta como rastreable');

/* ---------- punto 2: arrastre de los lotes en uso ---------- */
const sis={loteId:'LI-000002',loteProveedor:'PG10016320',categoria:'preformas',insumo:'Preforma 90 g',unidadIds:['LI-000002-1']};
const man=L.entradaManual({categoria:'tapas',loteProveedor:'T-77'}).entrada;
const enLinea=[{id:'LI-000002-1',loteId:'LI-000002',linea:'B7L',estado:'EN_USO'},{id:'LI-000002-2',loteId:'LI-000002',linea:'B7L',estado:'ENTREGADA_LINEA'}];
const borr={id:'R9',linea:'B7L',fecha:'2026-11-12',turno:'DÍA',cuadros:[{numero:1,marca:'Cielo',lotesInsumo:[sis,man]},{numero:2,marca:'Bells'}]};
let a=L.arrastrables({reporte:borr,indice:1,registros:[],unidades:enLinea,lotes});
ok(a.lista.length===2&&a.lista.every(x=>x.arrastrado)&&/Producción 1 de este reporte/.test(a.origen),'la producción 2 trae los lotes de la producción 1 del mismo reporte, marcados como traídos');
ok(a.lista.find(x=>x.loteId==='LI-000002').unidadIds.join()==='LI-000002-1,LI-000002-2','del sistema trae las cajas/bobinas que siguen en la línea');
ok(borr.cuadros[0].lotesInsumo[0].arrastrado===undefined,'no modifica la producción de origen');
a=L.arrastrables({reporte:borr,indice:1,registros:[],unidades:[],lotes});
ok(a.lista.length===1&&a.lista[0].loteId===man.loteId,'un lote del sistema que ya no está en la línea (consumido o devuelto) no se trae; el escrito a mano sí');
a=L.arrastrables({reporte:borr,indice:0,registros:[],unidades:enLinea,lotes});
ok(a.lista.length===0&&a.origen==='','la producción 1 sin reportes anteriores no trae nada');

const nuevo={id:'R10',linea:'B7L',fecha:'2026-11-12',turno:'NOCHE',cuadros:[{numero:1,marca:'Cielo'}]};
const prev=[{id:'R8',linea:'B7L',fecha:'2026-11-11',turno:'NOCHE',cuadros:[{numero:1,lotesInsumo:[man]}]},
  {id:'R9',linea:'B7L',fecha:'2026-11-12',turno:'DÍA',cuadros:[{numero:1,lotesInsumo:[man]},{numero:2,lotesInsumo:[sis]}]},
  {id:'RX',linea:'PET1',fecha:'2026-11-12',turno:'DÍA',cuadros:[{numero:1,lotesInsumo:[L.entradaManual({categoria:'tapas',loteProveedor:'OTRA'}).entrada]}]}];
a=L.arrastrables({reporte:nuevo,indice:0,registros:prev,unidades:enLinea,lotes});
ok(a.lista.length===1&&a.lista[0].loteId==='LI-000002'&&/Producción 2 · 12\/11 Día/.test(a.origen),'el turno nuevo trae los lotes de la última producción del turno anterior de su línea (no de otra línea)');
a=L.arrastrables({reporte:{id:'R11',linea:'B7L',fecha:'2026-11-12',turno:'DÍA',cuadros:[{numero:1}]},indice:0,registros:prev,unidades:enLinea,lotes});
ok(a.lista.length===1&&a.lista[0].loteId===man.loteId&&/11\/11 Noche/.test(a.origen),'el turno día no toma lotes de otro reporte del mismo día y turno; toma la noche anterior');
a=L.arrastrables({reporte:{id:'R12',linea:'B7L',fecha:'2026-11-16',turno:'DÍA',cuadros:[{numero:1}]},indice:0,registros:prev,unidades:enLinea,lotes});
ok(a.lista.length===0,'no se traen lotes de hace más de 2 días');

/* ---------- pantalla e integración ---------- */
const s92=leer('js/asistente/92-lotes-en-cuadro.js'),s94=leer('js/asistente/94-trazabilidad-informe.js'),html=leer('index.html');
ok(/q\.lotesInsumo===undefined/.test(s92)&&/d>=0&&d<=1/.test(s92)&&/puedeEscribirRegistro/.test(s92)&&/cache\.listo&&!cache\.error/.test(s92),'el arrastre solo ocurre en producciones que nunca tocaron sus lotes, de hoy o ayer, editables y con las cajas de la línea ya leídas');
ok(/Escribir un lote a mano/.test(s92)&&/loteCuadroManual/.test(s92)&&/se enlaza solo/.test(s92)&&/Quita el visto de los que ya se acabaron/.test(s92),'el panel ofrece escribir el lote a mano y avisa de los lotes traídos');
ok(/escrito a mano/.test(s92)&&/ya está en el sistema como/.test(s92),'el panel dice si el lote escrito a mano ya está en el sistema');
ok(/programarGuardadoAutomaticoReporte\(\);\n    const y=window\.scrollY;/.test(s92),'marcar o desmarcar un lote guarda el reporte');
ok(/Escrito a mano · sin foto validada/.test(s94),'el informe distingue lo escrito a mano');
ok(/92-lotes-en-cuadro\.js\?v=2026\d{4}-/.test(html)&&/94-trazabilidad-informe\.js\?v=20261113-tz2/.test(html),'index.html carga las versiones nuevas');
console.log(fallas?'\n'+fallas+' fallas':'\nLote a mano y arrastre correctos');
process.exit(fallas?1:0);
