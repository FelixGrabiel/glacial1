/* Alertas de pendientes para el bot (referencia en docs/whatsapp-control/alertas-pendientes.js): sin repetir, con silencio nocturno y tope diario. */
const A=require('../docs/whatsapp-control/alertas-pendientes.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const L=(y,m,d,h,mi)=>Date.UTC(y,m-1,d,h+5,mi||0);          // hora de Lima → ms
const fin=(id,nivel)=>({id,nivel:nivel||'ambar',texto:'PET1 · Día 30/10: reporte sin finalizar · hace 3 h'});
const ent=(id,nivel)=>({id,nivel:nivel||'ambar',texto:'Falta entregar el turno DÍA 31/10 al siguiente supervisor · hace 2 h'});
const t0=L(2026,11,1,10,0);

let r=A.decidir({finalizar:[fin('r1')],entrega:[ent('2026-10-31_DIA')]},null,t0);
ok(r.motivo==='enviar'&&/REPORTES SIN FINALIZAR/.test(r.mensaje)&&/FALTA ENTREGAR EL TURNO/.test(r.mensaje)&&r.mensaje.split('\n\n').length===2,'un solo mensaje agrupado con cada tipo en su bloque');
const e1=r.estado;
r=A.decidir({finalizar:[fin('r1')],entrega:[ent('2026-10-31_DIA')]},e1,t0+30*60000);
ok(r.mensaje===''&&r.motivo==='nada nuevo','a la media hora no repite lo ya avisado');
r=A.decidir({finalizar:[fin('r1'),fin('r2')],entrega:[]},e1,t0+30*60000);
ok(/r2|PET1/.test(r.mensaje)&&r.mensaje.split('•').length===2,'si aparece uno nuevo, avisa solo el nuevo');
r=A.decidir({finalizar:[fin('r1','roja')],entrega:[]},e1,t0+30*60000);
ok(r.motivo==='enviar','si pasa de ámbar a rojo, se vuelve a avisar');
r=A.decidir({finalizar:[fin('r1')],entrega:[]},e1,t0+4*3600000+60000);
ok(r.motivo==='enviar','pasadas 4 h se repite el recordatorio');
r=A.decidir({finalizar:[fin('r9')],entrega:[]},e1,L(2026,11,1,23,0));
ok(r.motivo==='silencio'&&r.mensaje==='','de 22:00 a 06:00 no envía nada');
r=A.decidir({finalizar:[fin('r9')],entrega:[]},e1,L(2026,11,2,5,59));ok(r.motivo==='silencio','a las 05:59 sigue en silencio');
r=A.decidir({finalizar:[fin('r9')],entrega:[]},e1,L(2026,11,2,6,0));ok(r.motivo==='enviar','a las 06:00 ya puede enviar');
let est=null,n=0;for(let i=0;i<20;i++){const x=A.decidir({finalizar:[fin('n'+i)],entrega:[]},est,L(2026,11,3,7,0)+i*60000);if(x.mensaje){n++;est=x.estado;}}
ok(n===A.MAX_POR_DIA,'tope diario de '+A.MAX_POR_DIA+' mensajes');
r=A.decidir({finalizar:[],entrega:[]},null,t0);ok(r.mensaje===''&&r.motivo==='nada nuevo','sin pendientes no se envía nada');
r=A.decidir(null,null,t0);ok(r.mensaje==='','listas ausentes: no falla ni envía');
ok(JSON.stringify(e1)===JSON.stringify(A.decidir({finalizar:[fin('r1')],entrega:[ent('2026-10-31_DIA')]},null,t0).estado),'decidir no modifica el estado recibido (devuelve uno nuevo)');
console.log(fallas?'\n'+fallas+' fallas':'\nAlertas del bot correctas');process.exit(fallas?1:0);
