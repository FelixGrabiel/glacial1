/* =============================================================
   GLACIAL · FECHA OPERATIVA — UNA SOLA FUENTE DE VERDAD
   -------------------------------------------------------------
   // FECHA-OPERATIVA: reglas de negocio (America/Lima, UTC-5, sin horario de verano; NUNCA UTC para fechas de negocio)
     · Día operativo = 07:00 → 07:00 del día siguiente.
     · Turno DÍA 07:00–15:00, INTERMEDIO 15:00–22:00, NOCHE 22:00–07:00 (DÍA + INTERMEDIO forman el bloque «DÍA», de 07:00 a 22:00).
     · La fecha operativa de un NOCHE es el día en que EMPEZÓ: de 00:00 a 07:00 es el día anterior.
   API (window.GlacialFecha):
     ahoraMs()                       hora actual en ms (reloj del servidor si ya se calibró; hora simulada si está activa)
     ahoraLima(ms?)                  {fecha:'YYYY-MM-DD', hora, minuto, minutos, ms, texto:'DD/MM/YYYY HH:MM'} en hora de Lima
     fechaISOLocal(dateOMs?)         'YYYY-MM-DD' en hora de Lima (nunca toISOString)
     turnoActual(ms?)                'DÍA' | 'INTERMEDIO' | 'NOCHE'
     bloqueActual(ms?)               'DÍA' | 'NOCHE' (INTERMEDIO cuenta como DÍA)
     fechaOperativa(ms?, turno?)     fecha operativa; con turno explícito 'NOCHE' resta el día si es de madrugada
     diaJuliano(fechaISO)            día del año (1–366)
     semanaISO(fechaISO)             semana ISO 8601 (lunes–domingo). El lote de producción sigue usando obtenerSemana (WEEKNUM, domingo)
     sumarDias(fechaISO, n)          'YYYY-MM-DD' ± n días (aritmética de calendario, sin zona horaria)
     hhmmAMs(fechaOperativaISO, 'HH:MM', turno)  instante real de una hora tecleada en un turno (NOCHE < 07:00 → +1 día)
     simulacion()                    {activa, ms, texto} si hay hora simulada
   SIMULAR HORA (solo Administrador o localhost): ?simularHora=2026-10-16T01:30  (se quita con ?simularHora=off)
     Desplaza Date.now() y new Date() sin argumentos; el reloj sigue corriendo desde esa hora. Muestra un aviso fijo.
   Se carga justo después de 01-config.js y antes de 45-indicadores.js.
   ============================================================= */
(function(){
  'use strict';
  if(window.GlacialFecha)return;
  const LIMA_MS=-5*3600000;
  const HORA_FIN_NOCHE=7,HORA_INICIO_NOCHE=22,HORA_FIN_DIA=15;
  const p2=n=>String(n).padStart(2,'0');

  /* ---------- hora simulada (solo Administrador o desarrollo) ---------- */
  const DateReal=Date;
  let sim={activa:false,offset:0,ms:0};
  function esDesarrollo(){
    try{const h=String(location.hostname||'');return h==='localhost'||h==='127.0.0.1'||location.protocol==='file:';}catch(_){return false;}
  }
  function esAdminSesion(){
    try{const u=JSON.parse(sessionStorage.getItem('rdp_session_v1')||'null');return !!u&&String(u.rol||'').trim()==='Administrador';}catch(_){return false;}
  }
  function leerParametro(){
    try{
      const q=new URLSearchParams(location.search).get('simularHora');
      if(q===null)return sessionStorage.getItem('glacial.simularHora');
      if(q==='off'||q===''){sessionStorage.removeItem('glacial.simularHora');return null;}
      return q;
    }catch(_){return null;}
  }
  /* 'YYYY-MM-DDTHH:MM[:SS]' interpretado como hora de Lima. */
  function parsearLima(txt){
    const m=String(txt||'').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(!m)return null;
    const ms=DateReal.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0))-LIMA_MS;
    return Number.isFinite(ms)?ms:null;
  }
  (function activarSimulacion(){
    const txt=leerParametro();
    if(!txt)return;
    const ms=parsearLima(txt);
    if(ms===null||!(esDesarrollo()||esAdminSesion())){
      if(ms!==null)console.warn('Hora simulada ignorada: solo el Administrador (o un entorno de desarrollo) puede simularla.');
      return;
    }
    try{sessionStorage.setItem('glacial.simularHora',txt);}catch(_){}
    const real0=DateReal.now();
    sim={activa:true,offset:ms-real0,ms,txt};
    window.glacialSimulacionOffsetMs=sim.offset;
    // Date que, sin argumentos, devuelve la hora simulada; con argumentos se comporta igual que el Date real.
    function DateSim(...a){
      if(!new.target)return new DateReal(DateReal.now()+sim.offset).toString();
      return a.length===0?new DateReal(DateReal.now()+sim.offset):new DateReal(...a);
    }
    DateSim.prototype=DateReal.prototype;
    DateSim.now=()=>DateReal.now()+sim.offset;
    DateSim.UTC=DateReal.UTC;DateSim.parse=DateReal.parse;
    window.Date=DateSim;
    document.addEventListener('DOMContentLoaded',function(){
      const d=document.createElement('div');
      d.id='glacial-hora-simulada';
      d.setAttribute('style','position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:2147483000;background:#7a1f1f;color:#fff;'
        +'font:600 12px system-ui,sans-serif;padding:6px 12px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.35)');
      d.textContent='HORA SIMULADA (Lima): '+txt.replace('T',' ')+' · no uses esto para registrar datos reales';
      d.title='Quitar: agrega ?simularHora=off a la dirección';
      document.body.appendChild(d);
    });
  })();

  /* ---------- partes de la hora de Lima ---------- */
  function msDe(x){
    if(x===undefined||x===null)return ahoraMs();
    if(x instanceof DateReal)return x.getTime();
    const n=Number(x);return Number.isFinite(n)?n:ahoraMs();
  }
  function ahoraMs(){
    // El reloj del servidor ya incluye el desplazamiento de la simulación (41-tareo-bloqueo.js).
    try{if(typeof window.tareoAhoraServidor==='function'){const v=Number(window.tareoAhoraServidor());if(Number.isFinite(v))return v;}}catch(_){}
    return DateReal.now()+(sim.activa?sim.offset:0);
  }
  function partes(ms){
    const d=new DateReal(ms+LIMA_MS);
    return {anio:d.getUTCFullYear(),mes:d.getUTCMonth()+1,dia:d.getUTCDate(),hora:d.getUTCHours(),minuto:d.getUTCMinutes(),dow:d.getUTCDay()};
  }
  const iso=(a,m,d)=>a+'-'+p2(m)+'-'+p2(d);
  function fechaISOLocal(x){const p=partes(msDe(x));return iso(p.anio,p.mes,p.dia);}
  function sumarDias(fecha,n){
    const m=String(fecha||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    const d=new DateReal(DateReal.UTC(+m[1],+m[2]-1,+m[3]+(Number(n)||0)));
    return iso(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
  }
  function ahoraLima(x){
    const ms=msDe(x),p=partes(ms);
    return {fecha:iso(p.anio,p.mes,p.dia),hora:p.hora,minuto:p.minuto,minutos:p.hora*60+p.minuto,ms,
      texto:p2(p.dia)+'/'+p2(p.mes)+'/'+p.anio+' '+p2(p.hora)+':'+p2(p.minuto)};
  }
  function turnoActual(x){
    const h=partes(msDe(x)).hora;
    if(h<HORA_FIN_NOCHE)return 'NOCHE';
    if(h<HORA_FIN_DIA)return 'DÍA';
    if(h<HORA_INICIO_NOCHE)return 'INTERMEDIO';
    return 'NOCHE';
  }
  const bloqueActual=x=>turnoActual(x)==='NOCHE'?'NOCHE':'DÍA';
  /* Día operativo: de 00:00 a 07:00 sigue siendo el día anterior. Con `turno` explícito: NOCHE de madrugada → día anterior;
     DÍA/INTERMEDIO → el día natural. */
  function fechaOperativa(x,turno){
    const ms=msDe(x),p=partes(ms),natural=iso(p.anio,p.mes,p.dia);
    const t=turno?String(turno).toUpperCase():null;
    if(t&&t.indexOf('NOCHE')<0)return natural;
    return p.hora<HORA_FIN_NOCHE?sumarDias(natural,-1):natural;
  }
  function diaJuliano(fecha){
    const m=String(fecha||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    return Math.round((DateReal.UTC(+m[1],+m[2]-1,+m[3])-DateReal.UTC(+m[1],0,1))/86400000)+1;
  }
  function semanaISO(fecha){
    const m=String(fecha||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    const d=new DateReal(DateReal.UTC(+m[1],+m[2]-1,+m[3]));
    const dia=d.getUTCDay()||7;
    d.setUTCDate(d.getUTCDate()+4-dia);
    const ini=DateReal.UTC(d.getUTCFullYear(),0,1);
    return Math.ceil(((d.getTime()-ini)/86400000+1)/7);
  }
  /* Instante (ms) de una hora HH:MM tecleada dentro de un turno cuya fecha operativa es `fecha`.
     NOCHE: las horas anteriores a las 07:00 pertenecen al día siguiente. */
  function hhmmAMs(fecha,hhmm,turno){
    const f=String(fecha||'').match(/^(\d{4})-(\d{2})-(\d{2})$/),h=String(hhmm||'').match(/^(\d{1,2}):(\d{2})/);
    if(!f||!h)return null;
    const noche=String(turno||'').toUpperCase().indexOf('NOCHE')>=0;
    const mas=noche&&(+h[1])<HORA_FIN_NOCHE?1:0;
    return DateReal.UTC(+f[1],+f[2]-1,+f[3]+mas,+h[1],+h[2])-LIMA_MS;
  }

  window.GlacialFecha={ahoraMs,ahoraLima,fechaISOLocal,turnoActual,bloqueActual,fechaOperativa,diaJuliano,semanaISO,sumarDias,hhmmAMs,
    simulacion:()=>({activa:sim.activa,ms:sim.ms,texto:sim.txt||''}),
    HORA_FIN_NOCHE,HORA_INICIO_NOCHE};
})();
