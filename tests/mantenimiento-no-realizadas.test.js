/* Registro de mantenimiento: «No se realizó» con motivo y arrastre a la semana siguiente (glacial_53). Datos inventados. */
const fs=require('fs'),path=require('path');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const N=require('../js/mantenimiento/71-plan-anual-nucleo.js');
const leer=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');

const plan=[{id:'p1',actividad:'HORNO DE PREFORMAS / LIMPIEZA',frecuencia:'SEMANAL',semanas:[41],orden:1},{id:'p2',actividad:'CAMPANAS / REVISIÓN',frecuencia:'SEMANAL',semanas:[41],orden:2}];
const pend=[{id:'a1',plan_actividad_id:'p9',equipo:'BOCINAS',actividad:'LUBRICACIÓN',frecuencia:'SEMANAL',motivo_no:'Falta de repuesto',anio_origen:2026,semana_origen:40}];
const acts=N.actividadesParaRegistro(plan,41,pend);
ok(acts.length>=1&&acts[0].equipo==='BOCINAS'&&acts[0].item===1&&acts[0].origen_actividad_id==='a1'&&acts[0].semana_origen===40&&acts[0].motivo_origen==='Falta de repuesto','lo pendiente de la semana anterior entra primero, enlazado a la actividad de origen');
ok(acts.every((a,i)=>a.item===i+1),'los números de item se reordenan seguidos');
ok(N.actividadesParaRegistro(plan,41).every(a=>!a.origen_actividad_id),'sin pendientes, el registro es el de siempre');
ok(N.pendientesFaltantes([{id:'a1'},{id:'a2'}],[{origen_actividad_id:'a1'}]).map(p=>p.id).join()==='a2','al abrir un registro ya iniciado no se repite una actividad que ya pasó');
ok(N.estadoActividad({realizado:true})==='ok'&&N.estadoActividad({no_realizado:true})==='no'&&N.estadoActividad({})==='sin','estado: realizada / no se realizó / sin decidir');
ok(N.textoOrigen({origen_actividad_id:'a1',semana_origen:40,anio_origen:2026},2026)==='Pendiente desde la semana 40'&&N.textoOrigen({origen_actividad_id:'a1',semana_origen:51,anio_origen:2025},2026)==='Pendiente desde la semana 51 de 2025'&&N.textoOrigen({},2026)==='','texto «Pendiente desde la semana N»');
const pr=N.progresoRegistro([{realizado:true},{no_realizado:true,motivo_no:'x'},{},{}]);
ok(pr.hechas===1&&pr.no===1&&pr.sin===2&&pr.total===4,'progreso: 1 realizada, 1 no realizada, 2 sin decidir');
ok(N.MOTIVOS_NO_REALIZADO.length>=4&&N.MOTIVOS_NO_REALIZADO[N.MOTIVOS_NO_REALIZADO.length-1]==='Otros','hay motivos frecuentes y al final «Otros» (se escribe a mano)');

/* pantalla y datos */
const d72=leer('js/mantenimiento/72-plan-anual-datos.js'),p76=leer('js/mantenimiento/76-registro-pantalla.js'),p77=leer('js/mantenimiento/77-registro-impresion.js'),idx=leer('index.html');
ok(/rpc\('mtto_pendientes_arrastrables'/.test(d72)&&/traerPendientes/.test(d72)&&/marcarNoRealizada/.test(d72)&&/quitarNoRealizada/.test(d72)&&/Escribe el motivo/.test(d72),'datos: trae pendientes, marca «No se realizó» (motivo obligatorio) y la quita');
ok(/if\(realizado\)await quitarArrastradaSinTocar/.test(d72)&&/if\(h\.realizado\|\|h\.no_realizado\|\|String\(h\.observacion/.test(d72),'al hacerla, la copia que pasó a la semana siguiente se quita solo si nadie la tocó');
ok(/data-rg-no=/.test(p76)&&/data-rg-motivo=/.test(p76)&&/Motivo de por qué no se realizó/.test(p76)&&/guardarMotivo/.test(p76)&&/D\.traerPendientes\(reg\)/.test(p76),'pantalla: botón ✗, motivo y pendientes al abrir');
ok(/El motivo es obligatorio/.test(p76)&&/pasará a las actividades de la próxima semana/i.test(p76),'pantalla: motivo obligatorio y aviso de que pasa a la próxima semana');
ok(/NO REALIZADA/.test(p77),'impreso: marca las no realizadas');
ok(/glacial_53/.test(fs.readFileSync(path.resolve(__dirname,'..','supabase/migraciones/glacial_53_mantenimiento_no_realizadas.sql'),'utf8'))&&/71-plan-anual-nucleo\.js\?v=\d{8}-fo\d/.test(idx),'migración y versión del script');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
