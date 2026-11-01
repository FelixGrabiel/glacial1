/* =============================================================
   Alertas de pendientes para el bot de WhatsApp (proyecto glacial-whatsapp): DECIDE qué enviar. Archivo de referencia, sin dependencias.
   El bot lee la página con  window.glacialAvisos.pendientesFinalizar()  y  window.glacialAvisos.pendientesEntrega()  (ver docs/produccion/avisos-*.md),
   y con este módulo decide qué mandar, sin repetir y sin molestar. Cópialo tal cual al bot (se prueba en tests/bot-alertas.test.js).

   Uso (en el bot, cada 30 minutos):
     const A=require('./alertas-pendientes');
     const fin=await page.evaluate(()=>window.glacialAvisos.pendientesFinalizar());
     const ent=await page.evaluate(()=>window.glacialAvisos.pendientesEntrega());
     const r=A.decidir({finalizar:fin.items,entrega:ent.listo?ent.items:[]},estado,Date.now());
     if(r.mensaje){ await enviarAlGrupo(r.mensaje); estado=r.estado; guardarEnDisco(estado); }
   `estado` es un objeto simple que se guarda en la PC del bot (JSON). Si la página no cargó o dio error, NO llames a decidir: no se envía nada.
   ============================================================= */
'use strict';
const HORAS_REPETIR=4;                 // un aviso ya enviado se repite como máximo cada 4 h
const SILENCIO={desde:22,hasta:6};     // hora de Lima: de 22:00 a 06:00 no se envía nada
const MAX_POR_DIA=12;                  // tope de mensajes por día (el bot usa una librería no oficial: no abusar)
const TITULOS={finalizar:'⚠️ *REPORTES SIN FINALIZAR*',entrega:'⚠️ *FALTA ENTREGAR EL TURNO*'};
const PIE={finalizar:'Finalícenlos en GLACIAL: Historial › Continuar reporte.',entrega:'Entrégalo en GLACIAL: Entrega de turno.'};

/* Hora (0-23) y día (AAAA-MM-DD) de Lima para un instante en ms. Lima es UTC-5 todo el año. */
const lima=ms=>{const d=new Date(Number(ms)-5*3600000);return {hora:d.getUTCHours(),dia:d.toISOString().slice(0,10)};};
const enSilencio=ms=>{const h=lima(ms).hora;return SILENCIO.desde>SILENCIO.hasta?(h>=SILENCIO.desde||h<SILENCIO.hasta):(h>=SILENCIO.desde&&h<SILENCIO.hasta);};

/* ¿Hay que avisar de este item? Nuevo, o pasó de ámbar a rojo, o ya pasaron HORAS_REPETIR desde el último aviso. */
function debeAvisar(tipo,item,estado,ahoraMs){
  const previo=estado&&estado.avisados&&estado.avisados[tipo+'|'+item.id];
  if(!previo)return true;
  if(item.nivel==='roja'&&previo.nivel!=='roja')return true;
  return ahoraMs-previo.enviadoMs>=HORAS_REPETIR*3600000;
}
function armarMensaje(porTipo){
  return Object.keys(TITULOS).filter(t=>porTipo[t]&&porTipo[t].length).map(t=>TITULOS[t]+'\n'+porTipo[t].map(x=>'• '+x.texto).join('\n')+'\n'+PIE[t]).join('\n\n');
}
/* Devuelve {mensaje, estado, motivo}. mensaje vacío = no enviar. estado = el nuevo estado a guardar (solo cambia si se envía). */
function decidir(listas,estadoPrevio,ahoraMs){
  const estado=JSON.parse(JSON.stringify(estadoPrevio||{}));estado.avisados=estado.avisados||{};estado.dias=estado.dias||{};
  if(enSilencio(ahoraMs))return {mensaje:'',estado:estadoPrevio||estado,motivo:'silencio'};
  const dia=lima(ahoraMs).dia;
  if((estado.dias[dia]||0)>=MAX_POR_DIA)return {mensaje:'',estado:estadoPrevio||estado,motivo:'tope diario'};
  const porTipo={};
  Object.keys(TITULOS).forEach(t=>{porTipo[t]=((listas&&listas[t])||[]).filter(x=>x&&x.id&&x.texto&&debeAvisar(t,x,estado,ahoraMs));});
  const mensaje=armarMensaje(porTipo);
  if(!mensaje)return {mensaje:'',estado:estadoPrevio||estado,motivo:'nada nuevo'};
  Object.keys(porTipo).forEach(t=>porTipo[t].forEach(x=>{estado.avisados[t+'|'+x.id]={nivel:x.nivel||'ambar',enviadoMs:ahoraMs};}));
  estado.dias[dia]=(estado.dias[dia]||0)+1;
  // limpieza: se olvidan los avisos de más de 14 días y los contadores de días viejos
  Object.keys(estado.avisados).forEach(k=>{if(ahoraMs-estado.avisados[k].enviadoMs>14*86400000)delete estado.avisados[k];});
  Object.keys(estado.dias).forEach(d=>{if(d<lima(ahoraMs-14*86400000).dia)delete estado.dias[d];});
  return {mensaje,estado,motivo:'enviar'};
}
module.exports={decidir,debeAvisar,armarMensaje,enSilencio,lima,HORAS_REPETIR,SILENCIO,MAX_POR_DIA};
