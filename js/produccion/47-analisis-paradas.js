/* =========================================================
   LOTE 3 · ANÁLISIS DE PARADAS E INDICADORES DE LÍNEA (solo lectura)
   Pantalla «Análisis de paradas» + tarjeta «Disponibilidad de hoy» en el Inicio.

   FUENTE DE LOS MINUTOS: las paradas del semáforo, es decir calcularTiemposLinea() de 23b-tiempos-linea.js
   (botones + supervisor, solapes fusionados, estándar del refrigerio). Se suma por línea · turno · día
   operativo, así que los totales COINCIDEN con los del semáforo para el mismo rango. Los datos ya están en
   memoria (sync/programaciones y registros): 0 lecturas nuevas. La bitácora solo aporta el TÉCNICO
   (se escucha únicamente el rango pedido, máx. 31 días, y se cierra al salir de la pantalla).

   DEFINICIONES (oficiales de GLACIAL, no cambian):
     Tiempo planificado = duración de la programación − paradas programadas
     Tiempo en marcha   = tiempo planificado − paradas no programadas
     Horas efectivas    = tiempo transcurrido − (programadas + no programadas) ÷ 60
     Ratio (UND/h)      = cantidad producida ÷ horas efectivas
     Disponibilidad     = tiempo en marcha ÷ tiempo planificado
     MTTR = minutos de paradas no programadas ÷ cantidad;   MTBF = tiempo en marcha ÷ cantidad
     OEE (base) = disponibilidad × rendimiento (Calidad: no se mide)
        rendimiento = (sopladas totales ÷ horas efectivas) ÷ velocidad estándar     (usa el TOTAL)
        calidad     = (sopladas − rechazadas) ÷ sopladas                              (usa las BUENAS)
        rechazadas  = merma de «Botellas» del registro del supervisor; sopladas = registro del supervisor.
   Metas y velocidades estándar: sync/configIndicadores (en vivo; se editan solo los campos cambiados).
   Cargar después de 43, 44 y 46. No modifica datos existentes.
   ========================================================= */
(function(){
  'use strict';

  const MS_MIN=60000;
  const HORA_CORTE=7;            // día operativo 07:00–07:00 (igual que el semáforo y la bitácora)
  const MAX_DIAS=92;             // rango máximo (se calcula en memoria: no gasta lecturas)
  const MAX_DIAS_TECNICO=31;     // agrupar por técnico consulta la bitácora
  const LIMITE_EVENTOS=2000;
  const DEF_METAS={verdePct:90,ambarPct:80};
  const JEFATURA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];   // = reglas etapa 2
  const TURNOS=['DÍA','INTERMEDIO','NOCHE'];
  const COLORES=['#d93a3a','#df8b00','#2f7fd0','#13814a','#7a4fd0'];
  const SIN_TECNICO='Sin técnico registrado';

  /* ---------- utilidades ---------- */
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const parseISO=f=>{const [y,m,d]=String(f).split('-').map(Number);return new Date(y,m-1,d,0,0,0,0);};
  const addDias=(f,n)=>{const d=parseISO(f);d.setDate(d.getDate()+n);return iso(d);};
  const dias=(a,b)=>Math.round((parseISO(b)-parseISO(a))/86400000)+1;
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const fmtFecha=f=>fechaOk(f)?f.slice(8,10)+'/'+f.slice(5,7):'';
  const fmt=n=>Math.round(num(n)).toLocaleString('es-PE');
  const fmt1=n=>(Math.round(num(n)*10)/10).toLocaleString('es-PE',{minimumFractionDigits:1,maximumFractionDigits:1});
  const pct=v=>v==null?'—':(v*100).toFixed(1)+' %';
  const inicioOperativo=f=>{const d=parseISO(f);d.setHours(HORA_CORTE,0,0,0);return d;};
  const lunesDe=f=>{const d=parseISO(f);return addDias(f,-((d.getDay()+6)%7));};
  function diaOperativoActual(){
    try{
      if(typeof window.glacialTurnoVigente==='function'){
        const t=window.glacialTurnoVigente();
        if(t&&fechaOk(t.fecha))return t.fecha;
      }
    }catch(_){/* cálculo propio */}
    const d=new Date(ahoraMs());
    if(d.getHours()<HORA_CORTE)d.setDate(d.getDate()-1);
    return iso(d);
  }
  function nombreLinea(k){
    try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}
  }
  const puede=()=>typeof window.puedeVerBitacoraMtto==='function'&&window.puedeVerBitacoraMtto();
  function puedeConfigurar(){
    const u=typeof state!=='undefined'?state.user:null;
    if(!u)return false;
    const rol=String(u.rol||'').trim();
    return rol==='Administrador'||JEFATURA.includes(rol)||(typeof tienePermiso==='function'&&tienePermiso('configurar_umbrales'));
  }
  const chip=()=>window.glacialEstadoDatos?window.glacialEstadoDatos.chip():'';

  /* ---------- metas y velocidades estándar (sync/configIndicadores) ---------- */
  let remota={},desubConfig=null;
  const claveVel=(linea,pres)=>String(linea)+'|'+String(pres||'').trim();
  const normVel=k=>norm(k).replace(/\s+/g,'');
  function metas(){
    const m=remota.metas||{};
    const d=GlacialIndicadores.normalizarMetas({disponibilidad:{verde:m.verdePct,ambar:m.ambarPct}}).disponibilidad;
    return {verdePct:d.verde,ambarPct:d.ambar};
  }
  function velocidades(){
    const o={},v=remota.velocidades||{};
    Object.keys(v).forEach(k=>{if(num(v[k])>0)o[normVel(k)]=num(v[k]);});
    return o;
  }
  // Tabla única de velocidad estándar: sync/configIndicadores y, si el formato no está ahí, el catálogo base de 01-config.js
  // (la misma regla que usa Planificación y el registro de producción; ver 49-resumen-indicadores.js).
  const velocidadDe=(linea,pres)=>velocidades()[normVel(claveVel(linea,pres))]||
    (typeof window.glacialVelocidadEstandar==='function'?window.glacialVelocidadEstandar(linea,pres,''):0)||0;
  window.glacialConfigIndicadores=()=>({metas:metas(),velocidades:Object.assign({},remota.velocidades||{}),metasReporte:Object.assign({},remota.metasReporte||{})});
  window.glacialConfigIndicadoresOyentes=window.glacialConfigIndicadoresOyentes||[];
  const nivelDisp=p=>{
    const m=metas();
    return GlacialIndicadores.colorSegunMeta(p==null?null:p*100,{verde:m.verdePct,ambar:m.ambarPct});
  };

  function escucharConfig(){
    if(desubConfig||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    try{
      desubConfig=db.collection('sync').doc('configIndicadores').onSnapshot(snap=>{
        remota=snap.exists?(snap.data()||{}):{};
        window.glacialConfigIndicadoresOyentes.forEach(f=>{try{f();}catch(_){/* oyente ajeno */}});
        refrescar();
      },()=>{desubConfig=null;});
    }catch(_){desubConfig=null;}
  }
  window.glacialConfigIndicadoresEscuchar=()=>escucharConfig();
  window.glacialPuedeConfigurarIndicadores=()=>puedeConfigurar();
  function detenerConfig(){
    if(desubConfig){try{desubConfig();}catch(_){/* ya cerrado */}}
    desubConfig=null;remota={};
  }

  /* =========================================================
     MOTOR DE INDICADORES (funciones puras: se prueban sin pantalla)
     ========================================================= */
  function construirUnidad(g,t){
    const duracion=num(t.tiempoTranscurridoMin),prog=num(t.minPausasProgramadas),np=num(t.minParadasNoProgramadas);
    const planificado=Math.max(0,duracion-prog);                   // duración de la programación − paradas programadas
    const enMarcha=GlacialIndicadores.horasEfectivas({transcurridoMin:duracion,paradasProgramadasMin:prog,paradasNoProgramadasMin:np})*60;         // planificado − paradas no programadas
    const items=Array.isArray(t.paradasClasificadas)?t.paradasClasificadas:[];
    const npItems=items.filter(x=>x.clasif==='NO_PROGRAMADA'),pItems=items.filter(x=>x.clasif==='PROGRAMADA');
    return {linea:g.linea,fecha:g.fecha,turno:g.turno,bloque:g.bloque||(g.turno==='NOCHE'?'NOCHE':'DIA_INTERMEDIO'),
      t,duracion,prog,np,planificado,enMarcha,disp:GlacialIndicadores.disponibilidad(planificado,np),
      nNp:npItems.length,npItems,pItems,ajusteNp:num(t.ajusteNpMin),ajusteProg:num(t.ajusteProgMin)};
  }

  function listarUnidades(desde,hasta,filtros){
    const f=filtros||{};
    const salida={unidades:[],sinInicio:0};
    if(typeof window.calcularTiemposLinea!=='function')return salida;
    let prog=[];try{prog=loadProgramaciones()||[];}catch(_){prog=[];}
    const grupos=new Map();
    prog.forEach(p=>{
      if(!p||!p.linea||!p.fecha||p.fecha<desde||p.fecha>hasta||!(num(p.cantidadProgramada)>0))return;
      if(p.estadoOperacion&&p.estadoOperacion.estado==='CANCELADA')return;
      const bloque=p.turno==='NOCHE'?'NOCHE':'DIA_INTERMEDIO';
      const k=p.linea+'|'+p.fecha+'|'+bloque;
      if(!grupos.has(k))grupos.set(k,{linea:p.linea,fecha:p.fecha,bloque,turno:p.turno});
    });
    grupos.forEach(g=>{
      if(f.linea&&g.linea!==f.linea)return;
      if(f.turno&&g.turno!==f.turno)return;
      let t=null;try{t=window.calcularTiemposLinea(g.linea,g.turno,g.fecha);}catch(_){t=null;}
      if(!t||!t.ok){salida.sinInicio++;return;}      // sin inicio real todavía: no hay tiempos que medir
      salida.unidades.push(construirUnidad(g,t));
    });
    salida.unidades.sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.linea.localeCompare(b.linea)||a.turno.localeCompare(b.turno));
    return salida;
  }

  function resumenIndicadores(us){
    let plan=0,marcha=0,np=0,prog=0,nNp=0,ajNp=0;
    us.forEach(u=>{plan+=u.planificado;marcha+=u.enMarcha;np+=u.np;prog+=u.prog;nNp+=u.nNp;ajNp+=u.ajusteNp;});
    return {planificado:plan,enMarcha:marcha,npMin:np,progMin:prog,nNp,ajusteNp:ajNp,
      disp:GlacialIndicadores.disponibilidad(plan,np),mttr:nNp>0?np/nNp:null,mtbf:nNp>0?marcha/nNp:null};
  }

  /* Pareto: agrupa las paradas por motivo / línea / turno / técnico. */
  function etiquetaMotivo(motivo,abrirOtro){
    const m=String(motivo||'').trim();
    if(!m)return 'Sin motivo';
    if(!abrirOtro&&/^otro\b/i.test(m))return 'Otro';
    return m;
  }
  function armarPareto(us,o){
    const op=Object.assign({agrupar:'motivo',metrica:'minutos',incluirProg:false,abrirOtro:false,tecnicoDe:null},o||{});
    const grupos=new Map();
    let totalItems=0,ajuste=0;
    us.forEach(u=>{
      const items=u.npItems.concat(op.incluirProg?u.pItems:[]);
      ajuste+=u.ajusteNp+(op.incluirProg?u.ajusteProg:0);
      items.forEach(it=>{
        let clave;
        if(op.agrupar==='linea')clave=nombreLinea(u.linea);
        else if(op.agrupar==='turno')clave=u.turno;
        else if(op.agrupar==='tecnico')clave=(op.tecnicoDe&&op.tecnicoDe(it,u))||SIN_TECNICO;
        else clave=etiquetaMotivo(it.motivo,op.abrirOtro);
        const g=grupos.get(clave)||{clave,cantidad:0,minutos:0};
        g.cantidad++;g.minutos+=it.minutos;grupos.set(clave,g);
        totalItems+=it.minutos;
      });
    });
    const filas=[...grupos.values()];
    const valor=f=>op.metrica==='cantidad'?f.cantidad:f.minutos;
    filas.sort((a,b)=>valor(b)-valor(a)||b.minutos-a.minutos||a.clave.localeCompare(b.clave,'es'));
    const total=filas.reduce((s,f)=>s+valor(f),0);
    let acum=0;
    filas.forEach(f=>{f.valor=valor(f);f.pct=total>0?f.valor/total:0;acum+=f.pct;f.acum=Math.min(1,acum);});
    return {filas,metrica:op.metrica,totalItemsMin:totalItems,ajusteMin:ajuste,
      totalMin:totalItems+ajuste,totalCantidad:filas.reduce((s,f)=>s+f.cantidad,0)};
  }

  /* Tendencia: minutos por semana (lunes–domingo) de los motivos principales. */
  function armarTendencia(us,hoy,o){
    const op=Object.assign({semanas:8,top:5,incluirProg:false},o||{});
    const lunesActual=lunesDe(hoy);
    const semanas=[];for(let i=op.semanas-1;i>=0;i--)semanas.push(addDias(lunesActual,-7*i));
    const idx=new Map(semanas.map((s,i)=>[s,i]));
    const porMotivo=new Map();
    us.forEach(u=>{
      const i=idx.get(lunesDe(u.fecha));
      if(i===undefined)return;
      u.npItems.concat(op.incluirProg?u.pItems:[]).forEach(it=>{
        const m=etiquetaMotivo(it.motivo,false);
        const r=porMotivo.get(m)||{motivo:m,total:0,porSemana:Array(op.semanas).fill(0)};
        r.total+=it.minutos;r.porSemana[i]+=it.minutos;porMotivo.set(m,r);
      });
    });
    const motivos=[...porMotivo.values()].sort((a,b)=>b.total-a.total).slice(0,op.top);
    return {semanas,motivos};
  }

  /* Tiempos de reparación (MTTR) y entre fallas (MTBF) por línea y por técnico. */
  function armarReparacion(us,tecnicoDe){
    const porLinea=new Map(),porTecnico=new Map();
    us.forEach(u=>{
      const l=porLinea.get(u.linea)||{clave:nombreLinea(u.linea),np:0,n:0,marcha:0};
      l.np+=u.np;l.n+=u.nNp;l.marcha+=u.enMarcha;porLinea.set(u.linea,l);
      const vistos=new Set();
      u.npItems.forEach(it=>{
        const nombre=(tecnicoDe&&tecnicoDe(it,u))||SIN_TECNICO;
        const t=porTecnico.get(nombre)||{clave:nombre,np:0,n:0,marcha:0};
        t.np+=it.minutos;t.n++;
        const kU=u.linea+'|'+u.fecha+'|'+u.turno;
        if(!vistos.has(kU)){vistos.add(kU);t.marcha+=u.enMarcha;}
        porTecnico.set(nombre,t);
      });
    });
    const calc=r=>({...r,mttr:r.n>0?r.np/r.n:null,mtbf:r.n>0?r.marcha/r.n:null});
    return {lineas:[...porLinea.values()].map(calc).sort((a,b)=>a.clave.localeCompare(b.clave,'es')),
      tecnicos:[...porTecnico.values()].map(calc).sort((a,b)=>b.np-a.np)};
  }

  /* OEE (base): rendimiento con las sopladas TOTALES, calidad con las BUENAS. */
  function datosRegistro(u){
    let recs=[];try{recs=loadRecords()||[];}catch(_){recs=[];}
    let sop=0,rech=0,hay=false;const porPres=new Map();
    recs.forEach(r=>{
      if(!r||r.linea!==u.linea||r.fecha!==u.fecha)return;
      const grupo=r.grupoTurno||(typeof grupoTurnoReporte==='function'?grupoTurnoReporte(r.turno):(r.turno==='NOCHE'?'NOCHE':'DIA_INTERMEDIO'));
      if(grupo!==u.bloque)return;
      const cuadros=typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[]);
      cuadros.forEach(q=>{
        const s=num(q&&q.produccion&&q.produccion.sopladas);
        if(s>0){hay=true;sop+=s;const p=(q&&q.presentacion)||'';porPres.set(p,(porPres.get(p)||0)+s);}
        ((q&&q.mermas)||[]).forEach(m=>{if(norm(m&&m.item)==='botellas')rech+=num(m.unidades);});
      });
    });
    return {sopladas:sop,rechazadas:rech,hay,porPresentacion:porPres};
  }
  function calcularOee(u,datos,velFn){
    if(!datos||!datos.hay)return {estado:'SIN_REGISTRO'};
    const horas=u.enMarcha/60;
    if(horas<=0||u.disp===null)return {estado:'SIN_HORAS'};
    let denom=0,falta=false;
    datos.porPresentacion.forEach((s,pres)=>{const v=velFn(u.linea,pres);if(!(v>0)){falta=true;return;}denom+=s/v;});
    if(falta||denom<=0)return {estado:'SIN_VELOCIDAD'};
    const velocidad=datos.sopladas/denom;                     // velocidad estándar ponderada por lo soplado
    const ratioSop=datos.sopladas/horas;
    const rend=GlacialIndicadores.rendimiento(ratioSop,velocidad);     // sin tope
    return {estado:'OK',ratioSop,velocidad,rend,cal:null,disp:u.disp,oee:GlacialIndicadores.oee(u.disp,rend),aRevisar:GlacialIndicadores.rendimientoARevisar(rend),
      sopladas:datos.sopladas,rechazadas:datos.rechazadas};
  }
  const textoOee=o=>({SIN_VELOCIDAD:'Falta velocidad estándar',SIN_REGISTRO:'Falta registro de sopladas',SIN_HORAS:'—'}[o.estado]||'');

  /* Técnico de cada parada: bitácora (paradaId, o la hora de inicio como respaldo). */
  function resolvedorTecnico(eventos){
    const porId=new Map(),lista=[];
    (eventos||[]).forEach(e=>{
      if(e.accion!=='DETENER'&&e.accion!=='PAUSAR')return;
      lista.push(e);
      if(e.paradaId)porId.set(e.paradaId,e.tecnicoNombre||e.cuenta||'');
    });
    return (item,u)=>{
      if(item.id&&porId.has(item.id))return porId.get(item.id)||null;
      if(item.inicio){
        const e=lista.find(x=>x.linea===u.linea&&Math.abs(x.ts-item.inicio)<=120000);
        if(e)return e.tecnicoNombre||e.cuenta||null;
      }
      return null;
    };
  }

  /* =========================================================
     ESTADO Y CÁLCULO DE LA PANTALLA
     ========================================================= */
  const F={rango:'hoy',desde:'',hasta:'',linea:'',turno:'',agrupar:'motivo',metrica:'minutos',incluirProg:false,abrirOtro:false};
  const tec={clave:'',eventos:[],cargando:false,error:'',desub:null,listo:false};
  let cacheTend={key:'',res:null};

  function aplicarRango(r){
    const hoy=diaOperativoActual();
    F.rango=r;
    if(r==='hoy')F.desde=F.hasta=hoy;
    else if(r==='ayer')F.desde=F.hasta=addDias(hoy,-1);
    else if(r==='semana'){F.desde=lunesDe(hoy);F.hasta=hoy;}
    else if(r==='mes'){F.desde=hoy.slice(0,8)+'01';F.hasta=hoy;}
    else{F.rango='personalizado';if(!fechaOk(F.desde)||!fechaOk(F.hasta))F.desde=F.hasta=hoy;}
  }

  const msDe=v=>!v?0:typeof v.toMillis==='function'?v.toMillis():(typeof v.seconds==='number'?v.seconds*1000:Number(v)||0);
  function detenerTecnicos(){
    if(tec.desub){try{tec.desub();}catch(_){/* ya cerrada */}}
    tec.desub=null;tec.clave='';tec.listo=false;tec.eventos=[];tec.error='';
  }
  function pedirTecnicos(){
    if(typeof db==='undefined')return;
    const clave=F.desde+'|'+F.hasta;
    if(tec.desub&&tec.clave===clave)return;
    detenerTecnicos();
    if(dias(F.desde,F.hasta)>MAX_DIAS_TECNICO){tec.error='Para ver técnicos el rango máximo es de '+MAX_DIAS_TECNICO+' días (consulta la bitácora).';return;}
    tec.clave=clave;tec.cargando=true;
    try{
      const T=firebase.firestore.Timestamp;
      tec.desub=db.collection('bitacoraMantenimiento')
        .where('timestamp','>=',T.fromDate(inicioOperativo(F.desde)))
        .where('timestamp','<',T.fromDate(inicioOperativo(addDias(F.hasta,1))))
        .orderBy('timestamp','asc').limit(LIMITE_EVENTOS)
        .onSnapshot(snap=>{
          tec.eventos=snap.docs.map(d=>{const x=d.data({serverTimestamps:'estimate'});return Object.assign({},x,{id:d.id,ts:msDe(x.timestamp)});});
          tec.listo=true;tec.cargando=false;tec.error='';
          refrescar();
        },e=>{tec.error='No se pudo cargar la bitácora: '+((e&&e.message)||e);tec.cargando=false;tec.listo=true;refrescar();});
    }catch(e){tec.error=String((e&&e.message)||e);tec.cargando=false;}
  }
  const necesitaTecnicos=()=>F.agrupar==='tecnico'||verTecnicosPedido;
  let verTecnicosPedido=false;

  function calcularTodo(){
    const rango=listarUnidades(F.desde,F.hasta,{linea:F.linea,turno:F.turno});
    const us=rango.unidades;
    const tecnicoDe=tec.listo?resolvedorTecnico(tec.eventos):null;
    const resumen=resumenIndicadores(us);
    const pareto=armarPareto(us,{agrupar:F.agrupar,metrica:F.metrica,incluirProg:F.incluirProg,abrirOtro:F.abrirOtro,tecnicoDe});
    const reparacion=armarReparacion(us,tecnicoDe);
    const velFn=velocidadDe;
    const oee=us.map(u=>({u,o:calcularOee(u,datosRegistro(u),velFn)}));
    // tendencia: últimas 8 semanas (independiente del rango), con los filtros de línea y turno
    const hoy=diaOperativoActual();
    const desde8=addDias(lunesDe(hoy),-49);
    let prog=null,recs=null;try{prog=loadProgramaciones();recs=loadRecords();}catch(_){/* sin datos */}
    const key=[hoy,F.linea,F.turno,F.incluirProg].join('|');
    if(!(cacheTend.key===key&&cacheTend.prog===prog&&cacheTend.recs===recs&&cacheTend.min===Math.floor(ahoraMs()/MS_MIN)))
      cacheTend={key,prog,recs,min:Math.floor(ahoraMs()/MS_MIN),
        res:armarTendencia(listarUnidades(desde8,hoy,{linea:F.linea,turno:F.turno}).unidades,hoy,{incluirProg:F.incluirProg})};
    return {rango,us,resumen,pareto,reparacion,oee,tendencia:cacheTend.res,tecnicoDe,hoy};
  }

  /* =========================================================
     DIBUJO
     ========================================================= */
  function estilos(){
    if(document.getElementById('ap-css'))return;
    const s=document.createElement('style');s.id='ap-css';
    s.textContent=`
      .ap-rangos{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
      .ap-rangos button{border:1px solid #c5d0db;background:#fff;border-radius:999px;padding:4px 12px;font-size:12px;cursor:pointer}
      .ap-rangos button.active{background:#10265f;color:#fff;border-color:#10265f}
      .ap-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0}
      .ap-kpi{border:1px solid #dfe4ea;border-radius:10px;padding:10px 12px;background:#fff;border-left:6px solid #9aa9b8}
      .ap-kpi span{display:block;font-size:12px;color:#5a6b7b}.ap-kpi b{font-size:22px;color:#1b2a38}.ap-kpi small{display:block;font-size:11px;color:#5a6b7b}
      .ap-kpi.verde{border-left-color:#13814a}.ap-kpi.ambar{border-left-color:#df8b00}.ap-kpi.roja{border-left-color:#d93a3a}
      .ap-sec{margin:14px 0 6px;font-size:15px;color:#10265f}
      .ap-nota{font-size:12px;color:#5a6b7b;margin:4px 0}
      .ap-aviso{padding:8px 12px;border-radius:8px;background:#fff8e6;border:1px solid #f0c36a;margin:8px 0;font-size:13px}
      .ap-vacio{padding:14px;border:1px dashed #c5d0db;border-radius:10px;color:#4a5b6b;font-size:13px;background:#f8fafc;margin:8px 0}
      .ap-svg{width:100%;height:auto;max-width:760px;display:block}
      .ap-celda.verde{background:#cdeedd}.ap-celda.ambar{background:#fbe3b0}.ap-celda.roja{background:#f4c7c3}
      .ap-tabla-scroll{overflow-x:auto}.ap-tabla-scroll table{min-width:520px}
      .ap-leyenda{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;margin:4px 0}
      .ap-leyenda i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}
      .dh-card{border:1px solid #dfe4ea;border-left:8px solid #9aa9b8;border-radius:12px;background:#fff;padding:12px 16px;margin-bottom:12px;cursor:pointer;box-shadow:0 3px 12px rgba(17,57,91,.055)}
      .dh-card.verde{border-left-color:#13814a}.dh-card.ambar{border-left-color:#df8b00}.dh-card.roja{border-left-color:#d93a3a}
      .dh-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.dh-top h3{margin:0;font-size:14px;letter-spacing:.04em;color:#10265f}
      .dh-fila{display:flex;justify-content:space-between;gap:10px;margin-top:6px;padding:6px 10px;border-radius:8px;background:#f7f9fb;font-size:13px;border-left:5px solid #9aa9b8}
      .dh-fila.verde{border-left-color:#13814a;background:#effbf4}.dh-fila.ambar{border-left-color:#df8b00;background:#fffbea}.dh-fila.roja{border-left-color:#d93a3a;background:#fff5f5}
      .dh-motivo{margin-top:8px;font-size:13px;color:#31475c}
    `;
    document.head.appendChild(s);
  }

  const opcionesSel=(lista,sel,todos)=>'<option value="">'+todos+'</option>'+lista.map(v=>{
    const val=Array.isArray(v)?v[0]:v,txt=Array.isArray(v)?v[1]:v;
    return '<option value="'+esc(val)+'"'+(val===sel?' selected':'')+'>'+esc(txt)+'</option>';}).join('');

  function svgPareto(p){
    const filas=p.filas.slice(0,15);
    if(!filas.length)return '';
    const resto=p.filas.slice(15);
    if(resto.length)filas.push({clave:'Resto ('+resto.length+')',valor:resto.reduce((s,f)=>s+f.valor,0),acum:1});
    const W=720,H=330,mL=52,mR=46,mT=16,mB=104,alto=H-mT-mB;
    const max=Math.max(...filas.map(f=>f.valor))||1;
    const bw=(W-mL-mR)/filas.length;
    const barras=filas.map((f,i)=>{
      const h=(f.valor/max)*alto,x=mL+i*bw+bw*0.12,y=mT+alto-h;
      const cx=mL+i*bw+bw/2;
      const nombre=f.clave.length>22?f.clave.slice(0,21)+'…':f.clave;
      return '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+(bw*0.76).toFixed(1)+'" height="'+h.toFixed(1)+'" fill="#2f7fd0"><title>'+esc(f.clave)+': '+fmt(f.valor)+(p.metrica==='cantidad'?' paradas':' min')+'</title></rect>'+
        '<text x="'+cx.toFixed(1)+'" y="'+(y-3).toFixed(1)+'" font-size="10" text-anchor="middle" fill="#1b2a38">'+fmt(f.valor)+'</text>'+
        '<text transform="translate('+cx.toFixed(1)+','+(mT+alto+12)+') rotate(-40)" font-size="10" text-anchor="end" fill="#31475c">'+esc(nombre)+'</text>';
    }).join('');
    const pts=filas.map((f,i)=>(mL+i*bw+bw/2).toFixed(1)+','+(mT+alto*(1-f.acum)).toFixed(1)).join(' ');
    const puntos=filas.map((f,i)=>'<circle cx="'+(mL+i*bw+bw/2).toFixed(1)+'" cy="'+(mT+alto*(1-f.acum)).toFixed(1)+'" r="3" fill="#d93a3a"/>').join('');
    const ejes='<line x1="'+mL+'" y1="'+(mT+alto)+'" x2="'+(W-mR)+'" y2="'+(mT+alto)+'" stroke="#9aa9b8"/>'+
      '<text x="'+(mL-6)+'" y="'+(mT+8)+'" font-size="10" text-anchor="end" fill="#5a6b7b">'+fmt(max)+'</text>'+
      '<text x="'+(mL-6)+'" y="'+(mT+alto)+'" font-size="10" text-anchor="end" fill="#5a6b7b">0</text>'+
      '<text x="'+(W-mR+6)+'" y="'+(mT+8)+'" font-size="10" fill="#d93a3a">100 %</text>'+
      '<text x="'+(W-mR+6)+'" y="'+(mT+alto)+'" font-size="10" fill="#d93a3a">0 %</text>';
    return '<svg class="ap-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Pareto de paradas por '+(p.metrica==='cantidad'?'cantidad':'minutos')+'">'+
      ejes+barras+'<polyline points="'+pts+'" fill="none" stroke="#d93a3a" stroke-width="2"/>'+puntos+'</svg>';
  }

  function svgTendencia(t){
    if(!t||!t.motivos.length)return '';
    const W=720,H=240,mL=48,mR=20,mT=14,mB=34,alto=H-mT-mB,ancho=W-mL-mR;
    const max=Math.max(1,...t.motivos.flatMap(m=>m.porSemana));
    const x=i=>mL+(t.semanas.length>1?ancho*i/(t.semanas.length-1):0);
    const y=v=>mT+alto*(1-v/max);
    const lineas=t.motivos.map((m,k)=>'<polyline fill="none" stroke="'+COLORES[k%5]+'" stroke-width="2" points="'+
      m.porSemana.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ')+'"/>'+
      m.porSemana.map((v,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="3" fill="'+COLORES[k%5]+'"><title>'+esc(m.motivo)+' · semana del '+fmtFecha(t.semanas[i])+': '+fmt(v)+' min</title></circle>').join('')).join('');
    const etiquetas=t.semanas.map((s,i)=>'<text x="'+x(i).toFixed(1)+'" y="'+(H-10)+'" font-size="10" text-anchor="middle" fill="#5a6b7b">'+fmtFecha(s)+'</text>').join('');
    return '<svg class="ap-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Tendencia semanal de minutos de parada por motivo">'+
      '<line x1="'+mL+'" y1="'+(mT+alto)+'" x2="'+(W-mR)+'" y2="'+(mT+alto)+'" stroke="#9aa9b8"/>'+
      '<text x="'+(mL-6)+'" y="'+(mT+8)+'" font-size="10" text-anchor="end" fill="#5a6b7b">'+fmt(max)+' min</text>'+lineas+etiquetas+'</svg>'+
      '<div class="ap-leyenda">'+t.motivos.map((m,k)=>'<span><i style="background:'+COLORES[k%5]+'"></i>'+esc(m.motivo)+'</span>').join('')+'</div>';
  }

  function tablaPareto(p,agrupar){
    const etiqueta={motivo:'Motivo',linea:'Línea',turno:'Turno',tecnico:'Técnico'}[agrupar];
    const u=p.metrica==='cantidad'?'cantidad':'minutos';
    return '<div class="ap-tabla-scroll"><table class="tareo-table"><thead><tr><th>'+etiqueta+'</th><th>Cantidad</th><th>Minutos</th><th>% ('+u+')</th><th>Acumulado</th></tr></thead><tbody>'+
      p.filas.map(f=>'<tr><td>'+esc(f.clave)+'</td><td>'+fmt(f.cantidad)+'</td><td>'+fmt(f.minutos)+'</td><td>'+(f.pct*100).toFixed(1)+' %</td><td>'+(f.acum*100).toFixed(1)+' %</td></tr>').join('')+
      (Math.abs(p.ajusteMin)>=0.5?'<tr><td><i>Ajuste por solapes y topes (igual que el semáforo)</i></td><td>—</td><td>'+(p.ajusteMin>0?'+':'')+fmt(p.ajusteMin)+'</td><td>—</td><td>—</td></tr>':'')+
      '<tr><td><b>Total (coincide con el semáforo)</b></td><td><b>'+fmt(p.totalCantidad)+'</b></td><td><b>'+fmt(p.totalMin)+'</b></td><td>100 %</td><td></td></tr></tbody></table></div>';
  }

  function tablaDisponibilidad(d){
    if(!d.us.length)return '';
    const porLinea=new Map();
    d.us.forEach(u=>{const r=porLinea.get(u.linea)||[];r.push(u);porLinea.set(u.linea,r);});
    const filasProm=[...porLinea.entries()].map(([l,us])=>{
      const r=resumenIndicadores(us);
      return '<tr><td><b>'+esc(nombreLinea(l))+'</b> · promedio del rango</td><td>—</td><td>'+fmt(r.planificado)+'</td><td>'+fmt(r.enMarcha)+'</td><td class="ap-celda '+nivelDisp(r.disp)+'"><b>'+pct(r.disp)+'</b></td></tr>';
    }).join('');
    const filas=d.us.map(u=>'<tr><td>'+esc(nombreLinea(u.linea))+'</td><td>'+fmtFecha(u.fecha)+' · '+esc(u.turno)+'</td><td>'+fmt(u.planificado)+'</td><td>'+fmt(u.enMarcha)+'</td><td class="ap-celda '+nivelDisp(u.disp)+'">'+pct(u.disp)+'</td></tr>').join('');
    const g=d.resumen,m=metas();
    return '<h3 class="ap-sec">Disponibilidad por línea, turno y día</h3>'+
      '<p class="ap-nota">Disponibilidad = tiempo en marcha ÷ tiempo planificado. Meta: verde desde '+m.verdePct+' %, ámbar desde '+m.ambarPct+' %. Promedio del rango = tiempo en marcha total ÷ tiempo planificado total.</p>'+
      '<div class="ap-tabla-scroll"><table class="tareo-table"><thead><tr><th>Línea</th><th>Día · turno</th><th>Planificado (min)</th><th>En marcha (min)</th><th>Disponibilidad</th></tr></thead><tbody>'+
      filasProm+filas+
      '<tr><td><b>Todas las líneas</b></td><td>—</td><td><b>'+fmt(g.planificado)+'</b></td><td><b>'+fmt(g.enMarcha)+'</b></td><td class="ap-celda '+nivelDisp(g.disp)+'"><b>'+pct(g.disp)+'</b></td></tr></tbody></table></div>';
  }

  function tablaReparacion(d){
    const fila=r=>'<tr><td>'+esc(r.clave)+'</td><td>'+fmt(r.n)+'</td><td>'+fmt(r.np)+'</td><td>'+(r.n>0?fmt1(r.mttr)+' min':'Sin paradas')+'</td><td>'+(r.n>0?fmt1(r.mtbf)+' min':'Sin paradas')+'</td></tr>';
    const cab='<thead><tr><th>%</th><th>Paradas no programadas</th><th>Minutos</th><th>Tiempo medio de reparación</th><th>Tiempo medio entre fallas</th></tr></thead>';
    const tecnicos=necesitaTecnicos()
      ?(tec.error?'<div class="ap-aviso">'+esc(tec.error)+'</div>':(!tec.listo?'<div class="ap-aviso">Cargando técnicos de la bitácora…</div>'
        :'<div class="ap-tabla-scroll"><table class="tareo-table">'+cab.replace('%','Técnico')+'<tbody>'+
          (d.reparacion.tecnicos.length?d.reparacion.tecnicos.map(fila).join(''):'<tr><td colspan="5">Sin paradas</td></tr>')+'</tbody></table></div>'))
      :'<div class="ap-nota"><button type="button" class="btn btn-ghost btn-sm" data-ap-tecnicos>Ver por técnico</button> consulta la bitácora del rango (hasta '+LIMITE_EVENTOS+' lecturas).</div>';
    return '<h3 class="ap-sec">Tiempos de reparación y entre fallas</h3>'+
      '<p class="ap-nota">Reparación = minutos de paradas no programadas ÷ cantidad. Entre fallas = tiempo en marcha ÷ cantidad.</p>'+
      '<div class="ap-tabla-scroll"><table class="tareo-table">'+cab.replace('%','Línea')+'<tbody>'+
      (d.reparacion.lineas.length?d.reparacion.lineas.map(fila).join(''):'<tr><td colspan="5">Sin paradas</td></tr>')+'</tbody></table></div>'+tecnicos;
  }

  function tablaOee(d){
    if(!d.oee.length)return '';
    const filas=d.oee.map(({u,o})=>'<tr><td>'+esc(nombreLinea(u.linea))+'</td><td>'+fmtFecha(u.fecha)+' · '+esc(u.turno)+'</td><td>'+pct(u.disp)+'</td>'+
      (o.estado==='OK'
        ?'<td>'+fmt(o.ratioSop)+' UND/h</td><td>'+fmt(o.velocidad)+'</td><td>'+pct(o.rend)+(o.aRevisar?' <small>revisar velocidad estándar</small>':'')+'</td><td>'+GlacialIndicadores.NOTA_CALIDAD.replace('Calidad: ','')+'</td><td class="ap-celda '+nivelDisp(o.oee)+'"><b>'+pct(o.oee)+'</b></td>'
        :'<td colspan="5" class="ap-nota">'+esc(textoOee(o))+'</td>')+'</tr>').join('');
    const ok=d.oee.filter(x=>x.o.estado==='OK');
    const prom=ok.length?ok.reduce((s,x)=>s+x.o.oee,0)/ok.length:null;
    return '<h3 class="ap-sec">Base para el OEE</h3>'+
      '<p class="ap-nota">Rendimiento = (sopladas ÷ horas efectivas) ÷ velocidad estándar (usa el total). Calidad: no se mide. Las sopladas salen del registro del supervisor (rechazadas = merma de «Botellas»). Si falta la velocidad estándar o el registro, no se calcula.</p>'+
      '<div class="ap-tabla-scroll"><table class="tareo-table"><thead><tr><th>Línea</th><th>Día · turno</th><th>Disponibilidad</th><th>Ratio sobre sopladas</th><th>Velocidad estándar</th><th>Rendimiento</th><th>Calidad</th><th>OEE (base)</th></tr></thead><tbody>'+filas+
      '<tr><td><b>Promedio de los turnos calculables</b></td><td colspan="6">'+ok.length+' de '+d.oee.length+' turnos</td><td><b>'+pct(prom)+'</b></td></tr></tbody></table></div>';
  }

  function render(){
    const main=document.getElementById('main');
    if(!main)return;
    if(!puede()){main.innerHTML='<div class="empty-state"><h4>Acceso no autorizado</h4></div>';return;}
    estilos();escucharConfig();
    if(!fechaOk(F.desde)||!fechaOk(F.hasta))aplicarRango(F.rango);
    if(necesitaTecnicos())pedirTecnicos();else if(tec.desub)detenerTecnicos();
    const largo=dias(F.desde,F.hasta);
    let d=null,aviso='';
    if(F.hasta<F.desde)aviso='La fecha final no puede ser anterior a la inicial.';
    else if(largo>MAX_DIAS)aviso='El rango pedido es de '+largo+' días y el máximo es '+MAX_DIAS+' días. Acota las fechas.';
    else d=calcularTodo();
    const rb=(k,t)=>'<button type="button" data-ap-rango="'+k+'" class="'+(F.rango===k?'active':'')+'">'+t+'</button>';
    const lineas=(typeof LINES!=='undefined'?LINES:[]).map(l=>[l.key,l.name]);
    const hoy=diaOperativoActual();
    let cuerpo='';
    if(!aviso&&necesitaTecnicos()&&tec.error)aviso=tec.error;       // p. ej. rango de más de 31 días para ver técnicos
    if(d){
      const r=d.resumen,pa=d.pareto;
      const sin=d.rango.sinInicio;
      cuerpo+='<div class="ap-kpis">'+
        '<div class="ap-kpi"><span>Paradas no programadas</span><b>'+fmt(r.nNp)+'</b></div>'+
        '<div class="ap-kpi"><span>Minutos no programados</span><b>'+fmt(r.npMin)+'</b><small>programados: '+fmt(r.progMin)+' min</small></div>'+
        '<div class="ap-kpi '+nivelDisp(r.disp)+'"><span>Disponibilidad</span><b>'+pct(r.disp)+'</b><small>en marcha '+fmt(r.enMarcha)+' de '+fmt(r.planificado)+' min planificados</small></div>'+
        '<div class="ap-kpi"><span>Tiempo medio de reparación</span><b>'+(r.mttr==null?'Sin paradas':fmt1(r.mttr)+' min')+'</b></div>'+
        '<div class="ap-kpi"><span>Tiempo medio entre fallas</span><b>'+(r.mtbf==null?'Sin paradas':fmt1(r.mtbf)+' min')+'</b></div></div>';
      if(sin)cuerpo+='<p class="ap-nota">'+sin+' turno(s) con programación pero sin inicio real no se miden.</p>';
      if(!d.us.length){
        cuerpo+='<div class="ap-vacio"><b>Sin turnos con datos en este rango.</b><br>El análisis usa los turnos con inicio real de la línea desde Producción Actual. Prueba con «Ayer», «Esta semana» o «Este mes».</div>';
      }else{
        cuerpo+='<h3 class="ap-sec">Pareto de paradas '+(F.incluirProg?'(no programadas y programadas)':'no programadas')+' por '+({motivo:'motivo',linea:'línea',turno:'turno',tecnico:'técnico'}[F.agrupar])+'</h3>';
        if(F.agrupar==='tecnico'){
          if(!tec.error&&!tec.listo)cuerpo+='<div class="ap-aviso">Cargando técnicos de la bitácora…</div>';
          else if(!tec.error)cuerpo+='<p class="ap-nota">El técnico sale de la bitácora; las paradas sin registro ahí (supervisor, históricas) van a «'+SIN_TECNICO+'».</p>';
        }
        cuerpo+=pa.filas.length?svgPareto(pa)+tablaPareto(pa,F.agrupar):'<div class="ap-vacio"><b>Sin paradas'+(F.incluirProg?'':' no programadas')+' en este rango.</b></div>';
        cuerpo+='<h3 class="ap-sec">Tendencia: minutos de parada por semana (últimas 8 semanas)</h3>'+
          (d.tendencia&&d.tendencia.motivos.length?svgTendencia(d.tendencia)+'<div class="ap-tabla-scroll"><table class="tareo-table"><thead><tr><th>Motivo</th>'+d.tendencia.semanas.map(s=>'<th>'+fmtFecha(s)+'</th>').join('')+'</tr></thead><tbody>'+
            d.tendencia.motivos.map(m=>'<tr><td>'+esc(m.motivo)+'</td>'+m.porSemana.map(v=>'<td>'+fmt(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'
            :'<div class="ap-vacio">Sin paradas en las últimas 8 semanas con estos filtros.</div>');
        cuerpo+=tablaDisponibilidad(d)+tablaReparacion(d)+tablaOee(d);
      }
    }
    main.innerHTML='<div class="main-head" id="analisis-paradas-view"><div><h2>Análisis de paradas</h2>'+
      '<div class="sub">Solo lectura · día operativo 07:00–07:00 · minutos iguales a los del semáforo '+chip()+'</div></div></div>'+
      '<div class="panel"><div class="panel-body">'+
      '<div class="ap-rangos">'+rb('hoy','Hoy')+rb('ayer','Ayer')+rb('semana','Esta semana')+rb('mes','Este mes')+rb('personalizado','Personalizado')+'</div>'+
      '<div class="tar2-toolbar" style="margin-bottom:10px;gap:10px;flex-wrap:wrap">'+
        '<div class="field-sm"><label>Desde</label><input type="date" id="ap-desde" value="'+esc(F.desde)+'" max="'+esc(hoy)+'"></div>'+
        '<div class="field-sm"><label>Hasta</label><input type="date" id="ap-hasta" value="'+esc(F.hasta)+'" max="'+esc(hoy)+'"></div>'+
        '<div class="field-sm"><label>Línea</label><select id="ap-linea">'+opcionesSel(lineas,F.linea,'Todas')+'</select></div>'+
        '<div class="field-sm"><label>Turno</label><select id="ap-turno">'+opcionesSel(TURNOS,F.turno,'Todos')+'</select></div>'+
        '<div class="field-sm"><label>Agrupar por</label><select id="ap-agrupar">'+[['motivo','Motivo'],['linea','Línea'],['turno','Turno'],['tecnico','Técnico']].map(([v,t])=>'<option value="'+v+'"'+(F.agrupar===v?' selected':'')+'>'+t+'</option>').join('')+'</select></div>'+
        '<div class="field-sm"><label>Ver por</label><select id="ap-metrica"><option value="minutos"'+(F.metrica==='minutos'?' selected':'')+'>Minutos</option><option value="cantidad"'+(F.metrica==='cantidad'?' selected':'')+'>Cantidad de paradas</option></select></div>'+
        '<div class="field-sm"><label>&nbsp;</label><label style="font-weight:600"><input type="checkbox" id="ap-prog"'+(F.incluirProg?' checked':'')+'> Incluir programadas</label></div>'+
        '<div class="field-sm"><label>&nbsp;</label><label style="font-weight:600"><input type="checkbox" id="ap-otro"'+(F.abrirOtro?' checked':'')+'> Abrir «Otro»</label></div>'+
        '<div class="field-sm"><label>&nbsp;</label>'+(puedeConfigurar()?'<button type="button" class="btn btn-ghost btn-sm" data-ap-config>Metas y velocidades</button> ':'')+
        '<button type="button" class="btn btn-primary btn-sm" data-ap-excel'+(d&&d.us.length?'':' disabled')+'>Exportar a Excel</button></div>'+
      '</div>'+(aviso?'<div class="ap-aviso">'+esc(aviso)+'</div>':'')+cuerpo+'</div></div>';
  }

  /* =========================================================
     TARJETA «DISPONIBILIDAD DE HOY» (Inicio)
     ========================================================= */
  function datosHoy(){
    const hoy=diaOperativoActual();
    const u=typeof state!=='undefined'?state.user:null;
    const rol=String((u&&u.rol)||'').trim();
    const soloLinea=(rol==='Supervisor'||rol==='Supervisor de Producción')&&u&&u.linea?u.linea:'';
    const rango=listarUnidades(hoy,hoy,{linea:soloLinea});
    const porLinea=new Map();
    rango.unidades.forEach(x=>{const r=porLinea.get(x.linea)||[];r.push(x);porLinea.set(x.linea,r);});
    const filas=[...porLinea.entries()].map(([l,us])=>({linea:l,nombre:nombreLinea(l),r:resumenIndicadores(us)}))
      .sort((a,b)=>(a.r.disp??2)-(b.r.disp??2));
    const pa=armarPareto(rango.unidades,{agrupar:'motivo',metrica:'minutos',incluirProg:false});
    return {hoy,filas,principal:pa.filas[0]||null,total:resumenIndicadores(rango.unidades)};
  }
  function htmlDisponibilidadHoy(){
    const d=datosHoy();
    const nivelGlobal=nivelDisp(d.total.disp);
    const cuerpo=d.filas.length?d.filas.map(f=>'<div class="dh-fila '+nivelDisp(f.r.disp)+'"><strong>'+esc(f.nombre)+'</strong><span>'+pct(f.r.disp)+
      ' · no programadas '+fmt(f.r.npMin)+' min en '+fmt(f.r.nNp)+' paradas</span></div>').join('')
      :'<div class="ap-nota">Aún no hay líneas con inicio real en este día operativo.</div>';
    const motivo=d.principal?'<div class="dh-motivo">Motivo principal de parada hoy: <b>'+esc(d.principal.clave)+'</b> · '+fmt(d.principal.minutos)+' min ('+(d.principal.pct*100).toFixed(0)+' % de las no programadas)</div>'
      :(d.filas.length?'<div class="dh-motivo">Sin paradas no programadas hoy.</div>':'');
    return {clase:nivelGlobal,html:'<div class="dh-top"><h3>DISPONIBILIDAD DE HOY</h3>'+chip()+'</div>'+cuerpo+motivo+
      '<div class="ap-nota">Disponibilidad = tiempo en marcha ÷ tiempo planificado. Toca para abrir el análisis.</div>'};
  }
  function pintarTarjetaHoy(){
    const el=document.getElementById('disp-hoy');
    if(!el)return;
    const t=htmlDisponibilidadHoy();
    el.className='dh-card '+t.clase;el.innerHTML=t.html;
  }

  /* =========================================================
     EXCEL
     ========================================================= */
  function textoFiltros(){
    return 'Rango (días operativos 07:00–07:00): '+F.desde+' a '+F.hasta+' · Línea: '+(F.linea?nombreLinea(F.linea):'todas')+
      ' · Turno: '+(F.turno||'todos')+' · Agrupar por: '+F.agrupar+' · Ver por: '+(F.metrica==='cantidad'?'cantidad':'minutos')+
      ' · Programadas: '+(F.incluirProg?'incluidas':'no incluidas')+' · «Otro»: '+(F.abrirOtro?'abierto':'agrupado');
  }
  async function exportar(){
    if(typeof ExcelJS==='undefined'){alert('No se pudo cargar ExcelJS. Revisa tu conexión a internet y recarga la página.');return;}
    const d=calcularTodo();
    if(!d.us.length){alert('No hay datos con esos filtros.');return;}
    const wb=new ExcelJS.Workbook();wb.creator='GLACIAL';wb.created=new Date();
    const filtros=textoFiltros();
    const hoja=(nombre,titulo,cols,filas,anchos)=>{
      const ws=wb.addWorksheet(nombre);
      ws.addRow([titulo]).font={bold:true,size:14};
      ws.addRow([filtros]).font={italic:true,color:{argb:'FF5A6B7B'}};
      ws.addRow([]);
      const h=ws.addRow(cols);
      h.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E79'}};c.alignment={horizontal:'center',wrapText:true};});
      filas.forEach(f=>ws.addRow(f));
      ws.views=[{state:'frozen',ySplit:4}];
      (anchos||[]).forEach((w,i)=>ws.getColumn(i+1).width=w);
      return ws;
    };
    const r=d.resumen,m=metas();
    hoja('Indicadores','Análisis de paradas · indicadores',['Indicador','Valor','Detalle'],[
      ['Paradas no programadas',r.nNp,''],['Minutos no programados',Math.round(r.npMin),'programados: '+Math.round(r.progMin)+' min'],
      ['Tiempo planificado (min)',Math.round(r.planificado),'duración de la programación − paradas programadas'],
      ['Tiempo en marcha (min)',Math.round(r.enMarcha),'planificado − paradas no programadas'],
      ['Disponibilidad',r.disp==null?'—':+(r.disp*100).toFixed(1),'% · meta verde ≥ '+m.verdePct+' %, ámbar ≥ '+m.ambarPct+' %'],
      ['Tiempo medio de reparación (min)',r.mttr==null?'Sin paradas':+r.mttr.toFixed(1),'minutos NP ÷ paradas NP'],
      ['Tiempo medio entre fallas (min)',r.mtbf==null?'Sin paradas':+r.mtbf.toFixed(1),'tiempo en marcha ÷ paradas NP']],[36,18,60]);
    const etq={motivo:'Motivo',linea:'Línea',turno:'Turno',tecnico:'Técnico'}[F.agrupar];
    hoja('Pareto','Pareto de paradas',[etq,'Cantidad','Minutos','% ('+(F.metrica==='cantidad'?'cantidad':'minutos')+')','Acumulado %'],
      d.pareto.filas.map(f=>[f.clave,f.cantidad,Math.round(f.minutos),+(f.pct*100).toFixed(1),+(f.acum*100).toFixed(1)])
        .concat(Math.abs(d.pareto.ajusteMin)>=0.5?[['Ajuste por solapes y topes','',Math.round(d.pareto.ajusteMin),'','']]:[])
        .concat([['TOTAL (coincide con el semáforo)',d.pareto.totalCantidad,Math.round(d.pareto.totalMin),100,'']]),[40,12,12,16,14]);
    hoja('Tendencia','Minutos de parada por semana (8 semanas)',['Motivo'].concat(d.tendencia.semanas.map(s=>'Semana del '+s)),
      d.tendencia.motivos.map(x=>[x.motivo].concat(x.porSemana.map(v=>Math.round(v)))),[36]);
    hoja('Disponibilidad','Disponibilidad por línea, turno y día',['Fecha','Línea','Turno','Planificado (min)','En marcha (min)','Disponibilidad %'],
      d.us.map(u=>[u.fecha,nombreLinea(u.linea),u.turno,Math.round(u.planificado),Math.round(u.enMarcha),u.disp==null?'—':+(u.disp*100).toFixed(1)]),[12,14,12,18,16,16]);
    hoja('Reparación','Tiempos de reparación y entre fallas',['Línea / técnico','Paradas NP','Minutos NP','Reparación (min)','Entre fallas (min)'],
      d.reparacion.lineas.concat(necesitaTecnicos()?d.reparacion.tecnicos:[]).map(x=>[x.clave,x.n,Math.round(x.np),x.n?+x.mttr.toFixed(1):'Sin paradas',x.n?+x.mtbf.toFixed(1):'Sin paradas']),[34,14,14,18,18]);
    hoja('OEE base','Base para el OEE',['Fecha','Línea','Turno','Disponibilidad %','Ratio sobre sopladas','Velocidad estándar','Rendimiento %','Calidad %','OEE %','Observación'],
      d.oee.map(({u,o})=>o.estado==='OK'
        ?[u.fecha,nombreLinea(u.linea),u.turno,+(u.disp*100).toFixed(1),Math.round(o.ratioSop),Math.round(o.velocidad),+(o.rend*100).toFixed(1),'no se mide',+(o.oee*100).toFixed(1),o.aRevisar?'revisar velocidad estándar':'']
        :[u.fecha,nombreLinea(u.linea),u.turno,u.disp==null?'—':+(u.disp*100).toFixed(1),'','','','','',textoOee(o)]),[12,14,12,16,18,18,14,12,10,28]);
    const tecnicoDe=d.tecnicoDe;
    hoja('Paradas','Paradas del rango',['Fecha','Línea','Turno','Motivo','Tipo','Minutos','Origen','Técnico'],
      d.us.flatMap(u=>u.npItems.concat(F.incluirProg?u.pItems:[]).map(it=>[u.fecha,nombreLinea(u.linea),u.turno,it.motivo,it.clasif==='PROGRAMADA'?'Programada':'No programada'+(it.exceso?' (exceso)':''),+it.minutos.toFixed(1),it.origen,(tecnicoDe&&tecnicoDe(it,u))||''])),[12,14,12,36,22,10,14,26]);
    const buffer=await wb.xlsx.writeBuffer();
    const nombre='Analisis_paradas_'+F.desde+(F.hasta!==F.desde?'_a_'+F.hasta:'')+'.xlsx';
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=document.createElement('a');a.href=url;a.download=nombre;document.body.appendChild(a);a.click();
    setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},1500);
  }

  /* =========================================================
     EDITOR DE METAS Y VELOCIDADES (Administrador y Jefatura)
     ========================================================= */
  function formatosConocidos(){
    const filas=[];const vistos=new Set();
    const add=(l,p)=>{const k=normVel(claveVel(l,p));if(!p||vistos.has(k))return;vistos.add(k);filas.push({linea:l,pres:p});};
    try{(typeof LINES!=='undefined'?LINES:[]).forEach(l=>((typeof PRESENTACIONES_POR_LINEA!=='undefined'&&PRESENTACIONES_POR_LINEA[l.key])||[]).forEach(p=>add(l.key,p)));}catch(_){/* sin catálogo */}
    try{(loadProgramaciones()||[]).forEach(p=>{if(p&&p.linea&&p.presentacion)add(p.linea,p.presentacion);});}catch(_){/* sin datos */}
    Object.keys(remota.velocidades||{}).forEach(k=>{const [l,...r]=k.split('|');add(l,r.join('|'));});
    return filas;
  }
  /* Una sola escritura de metas y velocidades (la usan este editor y el Catálogo de Planificación).
     velNuevas: {'LINEA|presentación': número | '__borrar__'}. set con merge: solo se tocan los campos indicados. */
  async function guardarConfigIndicadores(metasNuevas,velNuevas){
    const ref=db.collection('sync').doc('configIndicadores');
    const borrar=()=>firebase.firestore.FieldValue.delete();
    await db.runTransaction(async tx=>{
      await tx.get(ref);
      const cambios={actualizadoPor:(state.user&&state.user.username)||'',actualizadoEn:ahoraMs()};
      if(metasNuevas&&Object.keys(metasNuevas).length)cambios.metas=metasNuevas;
      if(velNuevas&&Object.keys(velNuevas).length){
        cambios.velocidades={};
        Object.entries(velNuevas).forEach(([k,v])=>{cambios.velocidades[k]=v==='__borrar__'?borrar():v;});
      }
      tx.set(ref,cambios,{merge:true});
    });
  }
  window.glacialGuardarConfigIndicadores=guardarConfigIndicadores;
  function abrirConfig(){
    if(!puedeConfigurar()){alert('Solo el Administrador o Jefatura pueden cambiar las metas y velocidades.');return;}
    escucharConfig();
    const m=metas(),vel=remota.velocidades||{};
    const formatos=formatosConocidos();
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10060;padding:16px;';
    const valorActual=(l,p)=>{const k=normVel(claveVel(l,p));const e=Object.entries(vel).find(([kk])=>normVel(kk)===k);return e?e[1]:'';};
    fondo.innerHTML='<div class="modal" style="max-width:640px;width:100%;max-height:90vh;overflow:auto;background:#fff;border-radius:12px;padding:16px">'+
      '<h3 style="margin:0 0 6px">Metas de disponibilidad y velocidad estándar</h3>'+
      '<p class="small-muted" style="margin:0 0 10px">Se ven en todos los dispositivos en segundos. Solo se guardan los campos que cambies.</p>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><label style="flex:1;font-size:13px">Verde desde (%)<input type="number" data-meta="verdePct" min="1" max="100" value="'+m.verdePct+'" style="display:block;width:100%;padding:6px"></label>'+
      '<label style="flex:1;font-size:13px">Ámbar desde (%)<input type="number" data-meta="ambarPct" min="1" max="100" value="'+m.ambarPct+'" style="display:block;width:100%;padding:6px"></label></div>'+
      '<h4 style="margin:12px 0 4px">Velocidad estándar (UND/h) por línea y formato</h4>'+
      '<table style="width:100%;font-size:13px"><thead><tr><th align="left">Línea</th><th align="left">Formato (presentación)</th><th align="left">UND/h</th></tr></thead><tbody>'+
      formatos.map(f=>'<tr><td>'+esc(nombreLinea(f.linea))+'</td><td>'+esc(f.pres)+'</td><td><input type="number" min="0" data-vel="'+esc(claveVel(f.linea,f.pres))+'" data-orig="'+esc(valorActual(f.linea,f.pres))+'" value="'+esc(valorActual(f.linea,f.pres))+'" placeholder="'+esc(typeof window.glacialVelocidadCatalogo==='function'&&window.glacialVelocidadCatalogo(f.linea,f.pres,'')>0?'catálogo: '+window.glacialVelocidadCatalogo(f.linea,f.pres,''):'sin definir')+'" style="width:110px;padding:4px"></td></tr>').join('')+'</tbody></table>'+
      '<div data-cfg-error style="color:#c62828;font-size:12px;min-height:16px;margin-top:6px"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="btn btn-ghost" data-cfg-x>Cancelar</button><button type="button" class="btn btn-primary" data-cfg-ok>Guardar</button></div></div>';
    document.body.appendChild(fondo);
    const err=t=>{const e=fondo.querySelector('[data-cfg-error]');if(e)e.textContent=t;};
    fondo.querySelector('[data-cfg-x]').onclick=()=>fondo.remove();
    fondo.querySelector('[data-cfg-ok]').onclick=async()=>{
      const metasNuevas={},velNuevas={};
      const mv=Number(fondo.querySelector('[data-meta="verdePct"]').value),ma=Number(fondo.querySelector('[data-meta="ambarPct"]').value);
      if(!Number.isFinite(mv)||!Number.isFinite(ma)||mv<1||mv>100||ma<1||ma>100){err('Las metas deben estar entre 1 y 100 %.');return;}
      if(ma>mv){err('La meta ámbar no puede ser mayor que la verde.');return;}
      if(mv!==m.verdePct)metasNuevas.verdePct=mv;
      if(ma!==m.ambarPct)metasNuevas.ambarPct=ma;
      const inputs=[...fondo.querySelectorAll('[data-vel]')];
      for(const el of inputs){
        const clave=el.getAttribute('data-vel'),orig=String(el.getAttribute('data-orig')||''),val=String(el.value||'').trim();
        if(val===orig)continue;
        if(val===''){velNuevas[clave]='__borrar__';continue;}
        const n=Number(val);
        if(!Number.isFinite(n)||n<=0){err('La velocidad de '+clave.replace('|',' · ')+' debe ser un número mayor que 0.');return;}
        velNuevas[clave]=n;
      }
      if(!Object.keys(metasNuevas).length&&!Object.keys(velNuevas).length){fondo.remove();return;}
      if(window.glacialEstadoDatos&&!window.glacialEstadoDatos.enLinea){err('Sin conexión: no se guardó. Inténtalo cuando vuelva la conexión.');return;}
      err('Guardando…');
      try{
        await guardarConfigIndicadores(metasNuevas,velNuevas);
        fondo.remove();
        alert('Guardado. Se actualiza en todos los dispositivos.');
      }catch(e){err('No se pudo guardar (¿sin conexión o sin permiso?): '+((e&&e.message)||e));}
    };
  }

  /* =========================================================
     EVENTOS, NAVEGACIÓN Y ACTUALIZACIÓN EN VIVO
     ========================================================= */
  let temporizador=null;
  function refrescar(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      try{
        if(typeof state==='undefined'||!state.user)return;
        if(state.currentTab==='analisis-paradas'&&document.getElementById('analisis-paradas-view'))render();
        pintarTarjetaHoy();
      }catch(e){console.warn('Análisis de paradas:',e&&e.message||e);}
    },300);
  }
  ['onProgramacionesUpdated','onRecordsUpdated'].forEach(nombre=>{
    const anterior=globalThis[nombre];
    if(typeof anterior!=='function')return;
    globalThis[nombre]=function(){
      const r=anterior.apply(this,arguments);
      refrescar();
      return r;
    };
  });
  setInterval(()=>{
    if(typeof state==='undefined'||!state.user)return;
    if(state.currentTab==='analisis-paradas'||document.getElementById('disp-hoy'))refrescar();
  },60000);
  if(typeof handleLogout==='function'){
    const salirAnterior=handleLogout;
    handleLogout=function(){
      const r=salirAnterior.apply(this,arguments);
      detenerConfig();detenerTecnicos();
      return r;
    };
  }

  const main0=()=>document.getElementById('main');
  main0()?.addEventListener('change',e=>{
    if(!document.getElementById('analisis-paradas-view'))return;
    const id=e.target.id;
    if(id==='ap-desde'||id==='ap-hasta'){
      F.desde=document.getElementById('ap-desde').value;F.hasta=document.getElementById('ap-hasta').value;
      if(fechaOk(F.desde)&&(!fechaOk(F.hasta)||F.hasta<F.desde))F.hasta=F.desde;
      F.rango='personalizado';render();return;
    }
    if(id==='ap-prog'){F.incluirProg=!!e.target.checked;render();return;}
    if(id==='ap-otro'){F.abrirOtro=!!e.target.checked;render();return;}
    const mapa={'ap-linea':'linea','ap-turno':'turno','ap-agrupar':'agrupar','ap-metrica':'metrica'};
    if(mapa[id]){F[mapa[id]]=e.target.value;render();}
  });
  main0()?.addEventListener('click',e=>{
    const t=e.target.closest&&e.target.closest('#disp-hoy');
    if(t){window.analisisParadasAbrir({rango:'hoy'});return;}
    if(!document.getElementById('analisis-paradas-view'))return;
    const rango=e.target.closest('[data-ap-rango]')?.dataset.apRango;
    if(rango){aplicarRango(rango);render();return;}
    if(e.target.closest('[data-ap-tecnicos]')){verTecnicosPedido=true;render();return;}
    if(e.target.closest('[data-ap-config]')){abrirConfig();return;}
    if(e.target.closest('[data-ap-excel]')){exportar();}
  });

  window.analisisParadasAbrir=function(o){
    if(!puede()){alert('No tienes permiso para ver el análisis de paradas.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    if(o&&o.rango)aplicarRango(o.rango);else aplicarRango(F.rango);
    state.currentTab='analisis-paradas';
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  };
  window.goAnalisisParadas=()=>window.analisisParadasAbrir();

  if(typeof ajustarVistaSegunPermisos==='function'){
    const anterior=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){
      if(state.currentTab==='analisis-paradas'&&puede())return;
      return anterior.apply(this,arguments);
    };
  }
  if(typeof renderMain==='function'){
    const anterior=renderMain;
    renderMain=function(){
      if(state.currentTab==='analisis-paradas'&&!state.showWelcome&&puede()){render();return;}
      if(tec.desub&&state.currentTab!=='analisis-paradas'){detenerTecnicos();verTecnicosPedido=false;}   // salió: deja de leer
      return anterior.apply(this,arguments);
    };
  }
  if(typeof grupoSidebarActivo==='function'){
    const anterior=grupoSidebarActivo;
    grupoSidebarActivo=function(){return state.currentTab==='analisis-paradas'?'mantenimiento':anterior.apply(this,arguments);};
  }
  if(typeof renderSidebar==='function'){
    const anterior=renderSidebar;
    renderSidebar=function(){
      const r=anterior.apply(this,arguments);
      const b=document.getElementById('btn-analisis-paradas');
      if(b){
        const mostrar=!!(typeof state!=='undefined'&&state.user)&&puede();
        b.hidden=!mostrar;b.style.display=mostrar?'':'none';
        const activo=mostrar&&state.currentTab==='analisis-paradas';
        b.classList.toggle('active',activo);
        if(activo)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
        if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      }
      return r;
    };
  }

  /* Tarjeta en el Inicio */
  if(typeof renderCentroPerfil==='function'){
    const anterior=renderCentroPerfil;
    renderCentroPerfil=function(main){
      const r=anterior.apply(this,arguments);
      try{
        const m=main||document.getElementById('main');
        if(m&&puede()&&state.currentTab==='centro-perfil'&&!m.querySelector('#disp-hoy')){
          const shell=m.querySelector&&m.querySelector('.cp-shell');
          if(shell){
            estilos();escucharConfig();
            const t=htmlDisponibilidadHoy();
            const html='<section id="disp-hoy" class="dh-card '+t.clase+'" role="button" tabindex="0" aria-label="Disponibilidad de hoy: abrir el análisis de paradas">'+t.html+'</section>';
            const previo=m.querySelector('#pry-turno')||m.querySelector('#pp-hoy');
            const titulo=shell.querySelector('.cp-title-row');
            if(previo&&previo.insertAdjacentHTML)previo.insertAdjacentHTML('afterend',html);
            else if(titulo)titulo.insertAdjacentHTML('afterend',html);
            else shell.insertAdjacentHTML('afterbegin',html);
          }
        }
      }catch(e){console.warn('Tarjeta «Disponibilidad de hoy»:',e&&e.message||e);}
      return r;
    };
    window.renderCentroPerfil=renderCentroPerfil;
  }

  window.glacialAnalisisParadas={construirUnidad,resumenIndicadores,armarPareto,armarTendencia,armarReparacion,
    calcularOee,datosRegistro,resolvedorTecnico,listarUnidades,nivelDisp,render,abrirConfig,exportar,
    estado:F,tecnicos:tec,escucharConfig,pintarTarjetaHoy,calcularTodo,htmlDisponibilidadHoy};
})();
