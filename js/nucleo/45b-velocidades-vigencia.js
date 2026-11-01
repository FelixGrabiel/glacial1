/* =========================================================
   VELOCIDAD ESTÁNDAR CON VIGENCIA E HISTORIAL (funciones puras)

   La tabla de velocidades vive en sync/configIndicadores y no cambia de forma:
     velocidades          { "PET1|Pack_Regular_2.5Lx6und": 1920, … }       ← la VIGENTE (la leen Planificación, Resumen, Registro, etc.)
   Se agregan dos campos, que solo escribe la pantalla «Velocidades estándar» de Mantenimiento:
     velocidadesVigencia  { clave: {desde:'AAAA-MM-DD', por, en, motivo} } ← desde cuándo rige la vigente y quién la puso
     velocidadesHistorial { clave: [ {valor, desde, hasta, por, en, motivo, reemplazadoPor, reemplazadoEn, motivoCambio}, … ] } ← lo anterior, del más antiguo al más reciente

   Regla: al cambiar una velocidad, el valor nuevo empieza a regir desde la fecha indicada (hoy) y lo que había queda en el historial
   (con el periodo en que estuvo vigente). Nada se borra. Los reportes ya registrados conservan su propio ratio nominal.

   Funciones puras: reciben la configuración y devuelven el resultado; no leen la pantalla ni el reloj (la fecha y la hora se pasan).
   ========================================================= */
(function(raiz){
  'use strict';

  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s]+/g,' ').trim();
  const normClave=k=>norm(k).replace(/\s+/g,'');          // misma regla que usa la tabla de velocidades (49-resumen-indicadores.js)
  const esFechaIso=v=>{
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
    const [a,m,d]=v.split('-').map(Number),f=new Date(Date.UTC(a,m-1,d));
    return f.getUTCFullYear()===a&&f.getUTCMonth()===m-1&&f.getUTCDate()===d;
  };
  const dos=n=>String(n).padStart(2,'0');
  const diaAnterior=iso=>{const [a,m,d]=iso.split('-').map(Number),f=new Date(Date.UTC(a,m-1,d-1));return f.getUTCFullYear()+'-'+dos(f.getUTCMonth()+1)+'-'+dos(f.getUTCDate());};
  const MIN_MOTIVO=5,MAX_VELOCIDAD=200000;

  /* La clave tal como está escrita en la tabla (puede variar en mayúsculas o espacios); si no existe, la que se pidió. */
  function claveExacta(cfg,clave){
    const v=(cfg&&cfg.velocidades)||{},n=normClave(clave);
    const hallada=Object.keys(v).find(k=>normClave(k)===n);
    return hallada||String(clave);
  }
  const buscar=(mapa,cfg,clave)=>{
    const m=(cfg&&cfg[mapa])||{},n=normClave(clave);
    const k=Object.keys(m).find(x=>normClave(x)===n);
    return k?m[k]:undefined;
  };

  /* Velocidad vigente y desde cuándo rige. */
  function vigente(cfg,clave){
    const valor=num(buscar('velocidades',cfg,clave));
    const vig=buscar('velocidadesVigencia',cfg,clave)||{};
    return {valor:valor>0?valor:null,desde:esFechaIso(vig.desde)?vig.desde:'',por:String(vig.por||''),en:num(vig.en)||null,motivo:String(vig.motivo||'')};
  }

  /* Historial de una clave, del más reciente al más antiguo (para mostrarlo). */
  function historial(cfg,clave){
    const h=buscar('velocidadesHistorial',cfg,clave);
    return (Array.isArray(h)?h:[]).filter(x=>x&&num(x.valor)>0).map(x=>({valor:num(x.valor),desde:esFechaIso(x.desde)?x.desde:'',hasta:esFechaIso(x.hasta)?x.hasta:'',por:String(x.por||''),en:num(x.en)||null,motivo:String(x.motivo||''),reemplazadoPor:String(x.reemplazadoPor||''),reemplazadoEn:num(x.reemplazadoEn)||null,motivoCambio:String(x.motivoCambio||'')})).reverse();
  }

  /* Velocidad que regía en una fecha ISO. Sin historial o fecha inválida: la vigente. Antes del primer registro conocido: la más antigua. */
  function velocidadEn(cfg,clave,fecha){
    const act=vigente(cfg,clave);
    if(!esFechaIso(fecha))return act.valor;
    if(!act.desde||fecha>=act.desde)return act.valor;
    const h=historial(cfg,clave).slice().reverse();          // del más antiguo al más reciente
    if(!h.length)return act.valor;
    const dentro=h.find(x=>(!x.desde||fecha>=x.desde)&&(!x.hasta||fecha<=x.hasta));
    return dentro?dentro.valor:h[0].valor;
  }

  /* Prepara el cambio. e = {valor, desde:'AAAA-MM-DD' (hoy), por, motivo, ahoraMs}.
     Devuelve {error} o {patch:{velocidades,velocidadesVigencia,velocidadesHistorial}, clave, anterior, nuevo}; el patch es lo ÚNICO que hay que escribir. */
  function prepararCambio(cfg,clave,e){
    const x=e||{},valor=Number(x.valor);
    if(!String(clave||'').trim())return {error:'Falta indicar la línea y el formato.'};
    if(!Number.isFinite(valor)||valor<=0||valor>MAX_VELOCIDAD)return {error:'La velocidad debe ser un número mayor que cero (máximo '+MAX_VELOCIDAD.toLocaleString('es-PE')+').'};
    if(!Number.isInteger(valor))return {error:'Usa un número entero de unidades por hora.'};
    if(!esFechaIso(x.desde))return {error:'La fecha desde la que rige no es válida.'};
    const motivo=String(x.motivo||'').trim();
    if(motivo.length<MIN_MOTIVO)return {error:'Escribe el motivo del cambio (mínimo '+MIN_MOTIVO+' letras).'};
    const por=String(x.por||'').trim();
    if(!por)return {error:'Falta saber quién hace el cambio.'};
    const k=claveExacta(cfg,clave),act=vigente(cfg,k);
    if(act.valor===valor)return {error:'La velocidad ya es '+valor.toLocaleString('es-PE')+' UND/h: no hay nada que cambiar.'};
    if(act.desde&&x.desde<act.desde)return {error:'La nueva velocidad no puede empezar antes de la vigente ('+act.desde+').'};
    const previas=(buscar('velocidadesHistorial',cfg,k)||[]);
    const lista=Array.isArray(previas)?previas.slice():[];
    if(act.valor){
      lista.push({valor:act.valor,desde:act.desde||'',hasta:act.desde&&x.desde>act.desde?diaAnterior(x.desde):(act.desde||x.desde),
        por:act.por,en:act.en||0,motivo:act.motivo,reemplazadoPor:por,reemplazadoEn:num(x.ahoraMs)||Date.now(),motivoCambio:motivo});
    }
    return {clave:k,anterior:act.valor,nuevo:valor,patch:{
      velocidades:{[k]:valor},
      velocidadesVigencia:{[k]:{desde:x.desde,por,en:num(x.ahoraMs)||Date.now(),motivo}},
      velocidadesHistorial:{[k]:lista}
    }};
  }

  /* «PET1|Pack_Regular_2.5Lx6und|FONTLIFE» → {linea, presentacion, marca}. */
  function partesDeClave(clave){
    const p=String(clave||'').split('|');
    return {linea:p[0]||'',presentacion:p[1]||'',marca:p[2]||''};
  }

  const API=Object.freeze({normClave,esFechaIso,claveExacta,vigente,historial,velocidadEn,prepararCambio,partesDeClave,MIN_MOTIVO,MAX_VELOCIDAD});
  raiz.GlacialVelocidades=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
