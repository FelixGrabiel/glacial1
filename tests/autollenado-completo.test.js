/* Registro que se llena solo durante el turno (35c-autollenado-completo.js, 23/11/2026). */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const ms=(h,m,dia)=>new Date(2026,10,dia||29,h,m||0).getTime();

function entorno(o){
  o=o||{};
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,isFinite,Boolean};
  vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/produccion/35b-personal-desde-tareo.js'),sb);
  sb.glacialConfigIndicadores=()=>o.cfg||{};
  sb.loadProgramaciones=()=>o.programaciones||[];
  sb.loadTareos=()=>o.tareos||[];
  sb.loadWorkers=()=>[];
  sb.horasDefectoCuadro=t=>String(t).includes('NOCHE')?{inicio:'19:00',fin:'07:00'}:{inicio:'07:00',fin:'19:00'};
  sb.normalizarCuadros=d=>d.cuadros;
  sb.actualizados=[];sb.actualizarCuadro=i=>sb.actualizados.push(i);
  sb.ponerProductoEnCuadro=(q,p)=>{q.marca=p.marca;q.presentacion=p.presentacion;q.marcaPorDefecto=false;q.ratioNominal=600;q.lote='CF3';};
  sb.draft=o.draft||null;
  vm.runInContext(leer('js/produccion/35c-autollenado-completo.js'),sb);
  return sb;
}
const vacio=n=>({numero:n,marca:'',presentacion:'',horaInicio:'',horaFin:'',produccion:{programada:0,efectiva:0,sopladas:0,calidad:0,paletas:0},paradasProgramadas:[],paradasNoProgramadas:[],mermas:[],insumos:{}});
const prog=(marca,estado,inicio,fin,extra)=>Object.assign({linea:'B7L',fecha:'2026-11-29',turno:'DÍA',marca,presentacion:'7L',cantidadProgramada:5000,estadoOperacion:{estado,inicio,finalizadaEn:fin}},extra||{});

/* 1) puras */
let sb=entorno();
const A=sb.glacialAutollenadoCompleto;
ok(A.vencimiento('2026-11-29','DÍA',12)==='2027-11-29'&&A.vencimiento('2026-11-29','NOCHE',12)==='2027-11-30','vencimiento: 1 año; el turno noche lleva la fecha del día siguiente (como Control de proceso)');
ok(A.vencimiento('2026-08-31','DÍA',6)==='2027-02-28'&&A.vencimiento('','DÍA',12)==='','vida útil en meses (31/08 + 6 meses = 28/02); sin fecha no inventa');
ok(A.vidaUtilMeses('B7L')===12&&entorno({cfg:{vidaUtilMeses:{B7L:18}}}).glacialAutollenadoCompleto.vidaUtilMeses('B7L')===18,'vida útil: 12 meses si no hay configuración, o la de la línea');
const d0={linea:'B7L',fecha:'2026-11-29',turno:'DÍA',cuadros:[vacio(1)]};
const ps=A.productosDelTurno(d0,[prog('Aro','EN_PRODUCCION',ms(12,10)),prog('Scala','FINALIZADA',ms(7,30),ms(12,0)),prog('Glacial','PENDIENTE',0),prog('Cielo','CANCELADA',ms(9)),
  Object.assign(prog('Otra','EN_PRODUCCION',ms(8)),{linea:'PET1'}),Object.assign(prog('Noche','EN_PRODUCCION',ms(20)),{turno:'NOCHE'})]);
ok(ps.map(p=>p.marca).join(',')==='Scala,Aro,Glacial','productos del bloque en orden de inicio (sin cancelados, otras líneas ni la noche)');
ok(ps[0].inicio==='07:30'&&ps[0].fin==='12:00'&&ps[1].inicio==='12:10'&&ps[1].fin===''&&!ps[2].iniciado,'horas: Iniciar 07:30 / Finalizar 12:00; la marca en curso aún no tiene fin; la pendiente no está iniciada');
const d1={cuadros:[{marca:'Scala',presentacion:'7L',produccion:{}},vacio(2),vacio(3),vacio(4)]};
const pa=A.marcasPorAgregar(d1,ps);
ok(pa.length===1&&pa[0].i===1&&pa[0].producto.marca==='Aro','solo se agrega la marca iniciada que no tiene pestaña (Aro en la pestaña 2; Glacial no se inició)');
const def={inicio:'07:00',fin:'19:00'};
ok(JSON.stringify(A.horasPorPoner({horaInicio:'07:00',horaFin:'19:00'},ps[0],def))==='{"horaInicio":"07:30","horaFin":"12:00"}','las horas por defecto del turno se reemplazan por las de Iniciar y Finalizar');
ok(JSON.stringify(A.horasPorPoner({horaInicio:'08:15',horaFin:''},ps[0],def))==='{"horaFin":"12:00"}','una hora cambiada a mano se respeta; solo se completa la que falta');
ok(JSON.stringify(A.horasPorPoner({horaInicio:'07:30',horaFin:'11:00',autoHoras:{inicio:'07:30',fin:'11:00'}},ps[0],def))==='{"horaFin":"12:00"}','lo que puso el llenado se actualiza si cambia el origen');
ok(JSON.stringify(A.horasPorPoner({horaInicio:'07:00',horaFin:'19:00',estadoCuadro:'FINALIZADO'},ps[0],def))==='{}','una pestaña finalizada no se toca');

/* 2) llenado completo de un registro abierto */
const draft={linea:'B7L',fecha:'2026-11-29',turno:'DÍA',autollenadoV1:true,estadoRegistro:'EN_REGISTRO',
  cuadros:[Object.assign(vacio(1),{marca:'Scala',presentacion:'7L',horaInicio:'07:00',horaFin:'19:00',lote:'CF3'}),vacio(2),vacio(3),vacio(4)],
  personal:[{posicion:'Sopladora',nombre:'',cargo:''},{posicion:'Envasadora',nombre:'Ya Escrito',cargo:'X'},{posicion:'Etiquetadora',nombre:'',cargo:''}]};
const tareos=[{fecha:'2026-11-29',turno:'DÍA',area:'Producción',personal:[{trabajadorId:'1',nombre:'Ana Soplado',cargo:'MAQUINISTA SOPLADOR',asistencia:'ASISTIÓ'},
  {trabajadorId:'2',nombre:'Beto Etiqueta',cargo:'ETIQUETADOR',asistencia:'ASISTIÓ'},{trabajadorId:'3',nombre:'Falta Uno',cargo:'ENVASADOR',asistencia:'FALTA'}]}];
sb=entorno({draft,tareos,programaciones:[prog('Scala','FINALIZADA',ms(7,30),ms(12,0)),prog('Aro','EN_PRODUCCION',ms(12,10))]});
ok(sb.glacialAutollenadoCompleto.completar(draft)===true,'el registro abierto se completa');
ok(draft.cuadros[1].marca==='Aro'&&draft.cuadros[1].lote==='CF3'&&draft.cuadros[1].autoMarca,'la 2.ª marca del turno aparece sola en su pestaña');
ok(draft.cuadros[0].horaInicio==='07:30'&&draft.cuadros[0].horaFin==='12:00'&&draft.cuadros[1].horaInicio==='12:10'&&draft.cuadros[1].horaFin==='','horas de cada marca desde Iniciar/Finalizar');
ok(draft.cuadros[0].fechaVencimiento==='2027-11-29'&&draft.cuadros[1].fechaVencimiento==='2027-11-29'&&!draft.cuadros[2].fechaVencimiento,'vencimiento en las marcas del turno (no en pestañas vacías)');
ok(draft.personal[0].nombre==='Ana Soplado'&&draft.personal[1].nombre==='Ya Escrito'&&draft.personal[2].nombre==='Beto Etiqueta'&&draft.autoPersonal,'personal desde el Tareo sin botón; no pisa lo escrito ni pone a quien faltó');
ok(sb.actualizados.includes(0)&&sb.actualizados.includes(1),'se recalculan las pestañas cambiadas (horas del turno, insumos)');
ok(sb.glacialAutollenadoCompleto.completar(draft)===false,'una segunda vuelta sin cambios no hace nada');
draft.cuadros[0].horaFin='11:45';
ok(sb.glacialAutollenadoCompleto.completar(draft)===false&&draft.cuadros[0].horaFin==='11:45','si el supervisor corrige la hora de fin, se respeta');
const fin={...draft,estadoRegistro:'FINALIZADO',cuadros:[vacio(1),vacio(2)]};
ok(sb.glacialAutollenadoCompleto.completar(fin)===false&&sb.glacialAutollenadoCompleto.completar({...draft,autollenadoV1:undefined})===false,'registros finalizados o sin autollenado no se tocan');

const T=sb.GlacialPersonalTareo;
const prop=T.proponer([{nombre:'Ana Soplado',posicion:'Sopladora',linea:''},{nombre:'Beto Etiqueta',posicion:'Etiquetadora',linea:''}],[{posicion:'Sopladora 1',nombre:''},{posicion:'Sopladora 2',nombre:''},{posicion:'Etiquetado 1',nombre:''}],'B7L');
ok(prop.length===2&&prop[0].i===0&&prop[1].i===2,'B7L: «Sopladora 1» y «Etiquetado 1» reconocen al soplador y al etiquetador del tareo (una persona por fila)');

/* 3) lista «Para cerrar el turno» */
const lista=sb.glacialAutollenadoCompleto.pendientesCierre(draft);
const est=t=>(lista.find(x=>x.etiqueta.startsWith(t))||{}).estado;
ok(est('Marcas del turno (2)')==='auto'&&est('Personal')==='auto'&&est('Lote y vencimiento')==='auto','marcas, personal, lote y vencimiento: automático');
ok(est('Bidones soplados')==='falta'&&est('Calidad')==='falta'&&est('Mermas')==='falta'&&est('Observaciones')==='opcional','sopladas, calidad y mermas faltan; observaciones opcional');
ok(est('Horas de inicio y fin')==='falta'&&/Aro/.test(lista.find(x=>x.etiqueta.startsWith('Horas')).detalle),'avisa que falta la hora de fin de Aro (todavía en curso)');
draft.cuadros.slice(0,2).forEach(q=>{q.produccion.sopladas=100;q.produccion.calidad=2;q.mermas=[{item:'Bidones',peso:1,unidades:3}];q.horaFin=q.horaFin||'19:00';});
const l2=sb.glacialAutollenadoCompleto.pendientesCierre(draft);
ok(['Bidones soplados','Calidad','Mermas'].every(t=>l2.find(x=>x.etiqueta===t).estado==='ok')&&l2.find(x=>x.etiqueta.startsWith('Horas')).estado!=='falta','al ingresarlos pasan a «ingresado»');
const pc=sb.glacialAutollenadoCompleto.pendientesCierre({linea:'C20L',cuadros:[{marca:'San Fernando',produccion:{}}]});
ok(!pc.some(x=>/soplad|Calidad|disponibles/.test(x.etiqueta)),'Cajas 20L no pide sopladas ni calidad');
ok(/Para cerrar el turno faltan/.test(sb.glacialAutollenadoCompleto.panelHtml({linea:'C20L',cuadros:[]})),'el panel dice cuántos datos faltan');

/* 3b) obligatorios para finalizar y horas efectivas negativas */
{const A2=sb.glacialAutollenadoCompleto;
const q=o=>Object.assign({numero:1,marca:'Scala',presentacion:'7L',horaInicio:'07:00',horaFin:'09:00',horasTurno:2,lote:'CF3',
  produccion:{efectiva:1000,paletas:10,calidad:3,sopladas:1100},paradasProgramadas:[{tiempoMin:60}],paradasNoProgramadas:[{tiempoMin:30}],
  mermas:[{item:'Bidones',peso:1,unidades:3}],insumos:{planchasCarton:10}},o||{});
const reg=(cs,o)=>Object.assign({linea:'B7L',estadoRegistro:'EN_REGISTRO',cuadros:cs,personal:[{nombre:'Ana'}]},o||{});
ok(A2.horasEfectivasReales(q())===0.5&&A2.horasEfectivasReales(q({paradasNoProgramadas:[{tiempoMin:90}]}))===-0.5&&A2.horasEfectivasReales(q({horasTurno:0}))===null,'horas efectivas sin tope: 2 h − 1,5 h = 0,5 h; con 150 min de paradas = −0,5 h');
ok(A2.obligatoriosCierre(reg([q()])).length===0,'un reporte completo no pide nada más');
const f=A2.obligatoriosCierre(reg([q({produccion:{efectiva:1000,paletas:10,calidad:0,sopladas:1100},mermas:[],insumos:{},lote:''})],{personal:[{nombre:''}]}));
ok(f.includes('Producción 1: bidones de calidad')&&f.includes('Producción 1: mermas (o marca «Sin mermas en esta producción»)')&&f.includes('Producción 1: insumos')&&f.includes('Producción 1: lote')&&f.includes('Personal del turno: al menos una persona'),'faltan: calidad, mermas, insumos, lote y personal');
ok(!A2.obligatoriosCierre(reg([q({mermas:[],sinMermas:true})])).length,'«Sin mermas en esta producción» cumple el requisito de mermas');
ok(A2.obligatoriosCierre(reg([q({produccion:{efectiva:0}})])).includes('Producción 1: producción efectiva')&&A2.obligatoriosCierre(reg([q({produccion:{efectiva:5,paletas:0,calidad:1}})])).includes('Producción 1: paletas'),'sin producción efectiva o sin paletas no se finaliza');
ok(A2.obligatoriosCierre(reg([q({produccion:{efectiva:129,paletas:3,sopladas:0}})],{linea:'B20L'})).includes('Producción 1: bidones disponibles')&&!A2.obligatoriosCierre(reg([q({produccion:{efectiva:850,paletas:17}})],{linea:'C20L'})).some(t=>/calidad|disponibles/.test(t)),'B20L pide bidones disponibles; Cajas 20L no pide calidad');
ok(!A2.obligatoriosCierre(reg([q({mermas:[]})],{estadoRegistro:'REABIERTO'})).length,'un reporte reabierto para corregir no exige lo nuevo');
ok(!A2.obligatoriosCierre(reg([q(),{marca:'X',marcaPorDefecto:true,produccion:{}}])).length,'la marca puesta por defecto (sin usar) no cuenta');
const lista2=A2.pendientesCierre(reg([q({paradasNoProgramadas:[{tiempoMin:90}]})]));
ok(lista2.find(x=>x.etiqueta==='Horas efectivas').estado==='falta'&&/−?-0\.50 h/.test(lista2.find(x=>x.etiqueta==='Horas efectivas').detalle),'«Para cerrar» marca las horas efectivas negativas');
const f35=leer('js/produccion/35c-autollenado-completo.js');
ok(/raiz\.validarReporteParaFinalizar=function/.test(f35)&&/reg-horas-negativas/.test(f35)&&/registroSinMermas/.test(f35),'se suma a «Falta para finalizar», avisa en vivo las horas negativas y ofrece «Sin mermas»');}

/* 4) conexión */
const html=leer('index.html');
ok(html.indexOf('35c-autollenado-completo.js?v=')>html.indexOf('35b-personal-desde-tareo.js?v=')&&html.indexOf('35c-autollenado-completo.js?v=')<html.indexOf('12-init.js'),'index.html carga 35c después de 35b y antes de 12-init');
const f35c=leer('js/produccion/35c-autollenado-completo.js');
ok(/raiz\.cuadro1DesdeProgramacion=function/.test(f35c)&&/raiz\.renderFormTab=function/.test(f35c),'se engancha al autollenado (cada pintado y cada minuto) y al formulario');
ok(/vidaUtilMeses:Object\.assign\(\{\},remota\.vidaUtilMeses/.test(leer('js/produccion/47-analisis-paradas.js')),'la configuración expone vidaUtilMeses');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
