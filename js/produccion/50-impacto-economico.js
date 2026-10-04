/* =========================================================
   REPORTES · PARTE B · IMPACTO ECONÓMICO (cascada de pérdidas en unidades y en soles)

   Reemplaza el contenido de la pantalla «Impacto Económico» (renderPerdidasSoles). La vista anterior (precio por línea,
   solo paradas) sigue disponible con el enlace «Ver cálculo anterior» y no se modificó.

   PERMISO: el mismo de siempre, perdidasSoles (Administrador, jefatura y gerencia lo tienen por defecto; el Administrador
   se lo da a otros en Gestión de usuarios). Sin el permiso no se ve la opción y NO se cargan los valores económicos.
   Las reglas de la etapa 2 hacen cumplir lo sensible: leer y escribir margen, costos y meta (colección configEconomica).
   Los datos de producción, programación y paradas los siguen leyendo todos los usuarios con sesión (ya era así).

   CASCADA (por producto y turno, con el margen y costos vigentes en la fecha de cada evento):
     Producción potencial       = tiempo planificado × velocidad estándar
     Pérdida por paradas no prog. = minutos ÷ 60 × velocidad estándar × margen
     Pérdida por velocidad reducida = (velocidad estándar − ratio) × horas efectivas × margen        (si es negativa, cero)
     Pérdida por mermas         = cantidad de cada componente × su costo unitario
     Pérdida total              = paradas + velocidad + mermas
     Incumplimiento del plan    = (programado − producido) × margen    → se muestra aparte, NO se suma
   Sin horas extras ni costos de personal (eso irá en RRHH). Si falta velocidad, margen o costo, no se calcula ni se asume
   cero: el producto o componente aparece en «Faltan datos para calcular».

   DATOS: los mismos que el Resumen general (49-resumen-indicadores.js): semáforo en vivo para hoy y registro del turno
   para los turnos anteriores. Motivos de parada: los del sistema (bitácora/estado de la línea) cuando coinciden con el
   registro; si no, el texto del registro, marcado «clasificación estimada».

   FIRESTORE (nuevo): colección configEconomica con tres documentos, todos actualizados por campos (set con merge):
     margenes  → valores.{producto}.v.{AAAA-MM-DD} = {valor, por, en}     (cada cambio agrega una vigencia; la anterior se conserva)
     costos    → valores.{línea--componente}.v.{AAAA-MM-DD} = {valor, por, en}
     general   → metaPerdidaMes (meta máxima de pérdida mensual, S/)
   Cargar después de 49-resumen-indicadores.js.
   ========================================================= */
(function(){
  'use strict';

  const COL='configEconomica';
  const DOCS_ECO=['margenes','costos','general'];
  const A=()=>window.glacialReporteIndicadores;

  /* ---------- utilidades ---------- */
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const normKey=t=>norm(t).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtN=n=>Math.round(num(n)).toLocaleString('es-PE');
  const fmtS=n=>'S/ '+num(n).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtP=n=>n==null?'—':num(n).toLocaleString('es-PE',{minimumFractionDigits:1,maximumFractionDigits:1})+' %';
  const fmtFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):String(f||'');
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const permitido=()=>{
    try{
      if(typeof tienePermiso!=='function'||!tienePermiso('perdidasSoles'))return false;
      if(typeof esMantCompartido==='function'&&state&&state.user&&esMantCompartido(state.user))return false;
      return true;
    }catch(_){return false;}
  };

  /* =========================================================
     VALORES ECONÓMICOS (Firestore) Y VIGENCIA
     ========================================================= */
  const DOCS={margenes:{},costos:{},general:{}};
  const LISTO={margenes:false,costos:false,general:false};
  let errorCfg='';
  let desubs=[];

  function vigente(tabla,clave,fecha){
    const e=tabla&&tabla.valores&&tabla.valores[clave];
    if(!e||!e.v)return null;
    let mejor=null;
    Object.keys(e.v).sort().forEach(d=>{
      if(d<=fecha){const x=e.v[d];if(x&&x.valor!==null&&x.valor!==''&&Number.isFinite(Number(x.valor)))mejor={desde:d,valor:Number(x.valor)};}
    });
    return mejor;
  }
  const claveMargen=p=>normKey(p.pkey);
  const claveCosto=(linea,comp)=>normKey(linea)+'--'+normKey(comp);
  const provDefecto=()=>({
    margenDe:p=>vigente(DOCS.margenes,claveMargen(p),p.fecha),
    costoDe:(linea,comp,fecha)=>vigente(DOCS.costos,claveCosto(linea,comp),fecha)
  });

  function escuchar(){
    if(desubs.length||typeof db==='undefined'||!permitido())return;
    errorCfg='';
    DOCS_ECO.forEach(n=>{
      try{
        desubs.push(db.collection(COL).doc(n).onSnapshot(snap=>{
          DOCS[n]=snap.exists?(snap.data()||{}):{};LISTO[n]=true;errorCfg='';refrescar();
        },e=>{errorCfg='No se pudieron leer los valores económicos: '+((e&&e.message)||e);LISTO[n]=true;refrescar();}));
      }catch(e){errorCfg=String((e&&e.message)||e);}
    });
  }
  function detener(){
    desubs.forEach(f=>{try{f();}catch(_){/* ya cerrada */}});
    desubs=[];DOCS_ECO.forEach(n=>{DOCS[n]={};LISTO[n]=false;});
  }

  /* =========================================================
     MOTOR DE PÉRDIDAS (puro: se prueba sin pantalla)
     ========================================================= */
  const etiquetaParte=p=>A().nombreLinea(p.linea)+' · '+A().etiquetaProd(p.marca,p.pres);
  function calcularImpacto(partes,prov){
    const T={potencialU:0,paradasU:0,velU:0,paradasS:0,velS:0,mermaS:0,incumplS:0,planMin:0,npMin:0,horasEf:0};
    const faltan={velocidad:new Map(),margen:new Map(),costo:new Map()};
    const supuestos=new Map();
    const eventos=[],porMotivo=new Map(),porLinea=new Map(),porTurno=new Map(),mermaComp=new Map();
    let minItems=0,minEstimados=0;
    const suma=(m,k,etq,soles,min,estimada)=>{const o=m.get(k)||{clave:k,etiqueta:etq,soles:0,min:0,estimadaMin:0};o.soles+=soles;o.min+=min;if(estimada)o.estimadaMin+=min;m.set(k,o);};

    partes.forEach(p=>{
      const etq=etiquetaParte(p);
      const actividad=p.producido>0||p.npMin>0||p.programado>0||p.planMin>0;
      /* mermas: cada componente × su costo unitario vigente (independiente de la velocidad y del margen) */
      Object.keys(p.mermas||{}).forEach(c=>{
        const q=c==='Polietileno'?num(p.mermas[c].peso):num(p.mermas[c].unidades);
        if(!(q>0))return;
        const o=mermaComp.get(c)||{comp:c,unidad:c==='Polietileno'?'kg':'unid.',cantidad:0,cantidadSinCosto:0,soles:0};
        const co=prov.costoDe(p.linea,c,p.fecha);
        o.cantidad+=q;
        if(!co){o.cantidadSinCosto+=q;faltan.costo.set(p.linea+'|'+c,{linea:p.linea,comp:c,etiqueta:A().nombreLinea(p.linea)+' · '+c});}
        else{
          const s=q*co.valor;o.soles+=s;T.mermaS+=s;
          supuestos.set('c|'+p.linea+'|'+c+'|'+co.desde,{tipo:'Costo de insumo',etiqueta:A().nombreLinea(p.linea)+' · '+c,valor:co.valor,unidad:'S/ por '+o.unidad,desde:co.desde});
        }
        mermaComp.set(c,o);
      });
      if(!actividad)return;
      const m=prov.margenDe(p);
      if(!m)faltan.margen.set(p.pkey,{pkey:p.pkey,etiqueta:A().etiquetaProd(p.marca,p.pres)});
      else supuestos.set('m|'+p.pkey+'|'+m.desde,{tipo:'Margen por unidad',etiqueta:A().etiquetaProd(p.marca,p.pres),valor:m.valor,unidad:'S/ por unidad',desde:m.desde});
      if(m&&p.progUnit&&p.programado>0)T.incumplS+=Math.max(p.programado-p.producido,0)*m.valor;
      if(!(p.vel>0)){
        if(p.planMin>0||p.availMin>0||p.producido>0)faltan.velocidad.set(p.linea+'|'+p.pkey,{etiqueta:etq});
        return;
      }
      supuestos.set('v|'+p.linea+'|'+p.pkey,{tipo:'Velocidad estándar',etiqueta:etq,valor:p.vel,unidad:'UND/h',desde:''});
      if(!(p.planMin>0||p.availMin>0))return;
      const hEf=p.availMin/60;
      const potencial=p.planMin/60*p.vel;
      const paradasU=p.npMin/60*p.vel;
      const velU=Math.max(p.vel*hEf-p.producido,0);                 // (velocidad estándar − ratio) × horas efectivas, nunca negativa
      T.potencialU+=potencial;T.paradasU+=paradasU;T.velU+=velU;T.planMin+=p.planMin;T.npMin+=p.npMin;T.horasEf+=hEf;
      if(!m)return;                                                 // sin margen no se calcula la pérdida en soles
      T.paradasS+=paradasU*m.valor;T.velS+=velU*m.valor;
      let items=(p.paradas||[]).filter(i=>num(i.minutos)>0);
      const tot=items.reduce((s,i)=>s+num(i.minutos),0);
      if(p.npMin>0){
        items=tot>0?items.map(i=>({motivo:i.motivo,minutos:num(i.minutos)*p.npMin/tot,estimada:!!i.estimada})):[{motivo:'Sin motivo',minutos:p.npMin,estimada:true}];
        items.forEach(i=>{
          const monto=i.minutos/60*p.vel*m.valor;
          minItems+=i.minutos;if(i.estimada)minEstimados+=i.minutos;
          eventos.push({fecha:p.fecha,linea:p.linea,grupo:p.grupo,motivo:i.motivo||'Sin motivo',monto,min:i.minutos,estimada:!!i.estimada,producto:etq});
          suma(porMotivo,i.motivo||'Sin motivo',i.motivo||'Sin motivo',monto,i.minutos,i.estimada);
          suma(porLinea,p.linea,A().nombreLinea(p.linea),monto,i.minutos,i.estimada);
          suma(porTurno,p.grupo,A().etiquetaGrupo(p.grupo),monto,i.minutos,i.estimada);
        });
      }
    });
    const orden=m=>[...m.values()].sort((a,b)=>b.soles-a.soles);
    const total=T.paradasS+T.velS+T.mermaS;
    return {T,total,paradasS:T.paradasS,velS:T.velS,mermaS:T.mermaS,incumplS:T.incumplS,
      faltan:{velocidad:[...faltan.velocidad.values()],margen:[...faltan.margen.values()],costo:[...faltan.costo.values()]},
      supuestos:[...supuestos.values()].sort((a,b)=>a.tipo.localeCompare(b.tipo,'es')||a.etiqueta.localeCompare(b.etiqueta,'es')),
      eventos:eventos.sort((a,b)=>b.monto-a.monto),top5:eventos.slice(0,5),
      porMotivo:orden(porMotivo),porLinea:orden(porLinea),porTurno:orden(porTurno),
      mermaComp:[...mermaComp.values()].sort((a,b)=>b.soles-a.soles||b.cantidad-a.cantidad),
      estimadaPct:minItems>0?minEstimados/minItems*100:0,
      hayFaltantes:faltan.velocidad.size+faltan.margen.size+faltan.costo.size>0};
  }

  /* =========================================================
     PERIODOS, FILTROS Y ACUMULADO DEL MES
     ========================================================= */
  const G={modo:'mes',desde:'',hasta:'',linea:'',turno:'',marca:'',pres:'',vistaAnterior:false};
  const addDias=(f,n)=>A().addDias(f,n);
  function periodo(){
    const hoy=A().hoyOp();
    if(G.modo==='hoy')return {desde:hoy,hasta:hoy,etiqueta:'hoy '+fmtFecha(hoy)};
    if(G.modo==='7')return {desde:addDias(hoy,-6),hasta:hoy,etiqueta:'últimos 7 días'};
    if(G.modo==='30')return {desde:addDias(hoy,-29),hasta:hoy,etiqueta:'últimos 30 días'};
    if(G.modo==='rango'&&A().fechaOk(G.desde)&&A().fechaOk(G.hasta)&&G.hasta>=G.desde)return {desde:G.desde,hasta:G.hasta,etiqueta:'del '+fmtFecha(G.desde)+' al '+fmtFecha(G.hasta)};
    return {desde:hoy.slice(0,8)+'01',hasta:hoy,etiqueta:'mes en curso'};
  }
  const filtro=()=>({turno:G.turno,marca:G.marca,pres:G.pres});
  function resultadoRango(desde,hasta,prov){
    const rec=A().recolectar(desde,hasta,{linea:G.linea,motivosSistema:true});
    return {rec,res:calcularImpacto(A().filtrarPartes(rec.partes,filtro()),prov)};
  }
  function panelMes(prov){
    const hoy=A().hoyOp(),y=Number(hoy.slice(0,4)),mo=Number(hoy.slice(5,7)),dia=Number(hoy.slice(8,10));
    const ini=hoy.slice(0,8)+'01',diasMes=new Date(y,mo,0).getDate();
    const pm=new Date(y,mo-2,1),pIni=pm.getFullYear()+'-'+String(pm.getMonth()+1).padStart(2,'0')+'-01';
    const diasPrev=new Date(pm.getFullYear(),pm.getMonth()+1,0).getDate();
    const pFin=pIni.slice(0,8)+String(diasPrev).padStart(2,'0');
    const pParcial=pIni.slice(0,8)+String(Math.min(dia,diasPrev)).padStart(2,'0');
    const act=resultadoRango(ini,hoy,prov).res;
    const prevParcial=resultadoRango(pIni,pParcial,prov).res;
    const prevCompleto=resultadoRango(pIni,pFin,prov).res;
    const meta=num((DOCS.general||{}).metaPerdidaMes);
    const proyeccion=dia>0?act.total/dia*diasMes:0;
    return {ini,hoy,dia,diasMes,acumulado:act.total,proyeccion,prevParcial:prevParcial.total,prevCompleto:prevCompleto.total,
      meta,parcial:act.hayFaltantes||prevParcial.hayFaltantes||prevCompleto.hayFaltantes,
      usoMeta:meta>0?act.total/meta*100:null,proyMeta:meta>0?proyeccion/meta*100:null};
  }
  function calcularTodo(){
    const prov=provDefecto(),per=periodo();
    const r=resultadoRango(per.desde,per.hasta,prov);
    return {per,rec:r.rec,res:r.res,mes:panelMes(prov)};
  }

  /* =========================================================
     INTERFAZ
     ========================================================= */
  function estilos(){
    if(document.getElementById('ie-css'))return;
    const s=document.createElement('style');s.id='ie-css';
    s.textContent=`
      .ie{max-width:1320px;font-size:13px;color:#2E3A46}
      .ie-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:0 0 8px}
      .ie h2{margin:0;font-size:22px;color:#2E3A46}.ie-sub{color:#6B7784;font-size:12px}
      .ie-ctl{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .ie-ctl select,.ie-ctl input[type=date]{padding:5px 8px;border:1px solid #d8e2e8;border-radius:8px;font-size:12px;background:#fff}
      .ie-btn{border:1px solid #d8e2e8;background:#fff;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;color:#073f68}
      .ie-btn.on{background:#073f68;color:#fff;border-color:#073f68}
      .ie-aviso{background:#FFF7ED;border:1px solid #FCE3C0;color:#8A5A1E;border-radius:10px;padding:9px 12px;margin:8px 0;font-size:12px}
      .ie-aviso ul{margin:4px 0 0;padding-left:18px}
      .ie-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:8px 0}
      .ie-k{background:#fff;border:1px solid #dce5ea;border-radius:10px;padding:12px 14px}
      .ie-k span{display:block;font-size:11px;text-transform:uppercase;color:#71828d;font-weight:700}
      .ie-k b{display:block;font-size:24px;color:#17384d;margin:3px 0}.ie-k.rojo b{color:#C4472B}.ie-k small{display:block;color:#6B7784;font-size:11px}
      .ie-k.aparte{background:#f7fafc;border-style:dashed}
      .ie-box{background:#fff;border:1px solid #dce5ea;border-radius:10px;padding:12px 14px;margin:10px 0}
      .ie-box h4{margin:0 0 8px;font-size:14px;color:#073f68}
      .ie-t{width:100%;border-collapse:collapse;font-size:12px}.ie-t th{font-weight:600;color:#6B7784;text-align:right;padding:5px 6px;border-bottom:1px solid #e6ebef}
      .ie-t td{padding:5px 6px;border-bottom:1px solid #eef1f4;text-align:right}.ie-t th:first-child,.ie-t td:first-child{text-align:left}
      .ie-bar-h{display:inline-block;height:9px;border-radius:2px;background:#C4472B;vertical-align:middle}
      .ie-est{display:inline-block;margin-left:6px;padding:0 6px;border-radius:8px;background:#fff1d6;color:#8A5A1E;font-size:10px}
      .ie-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px}
      .ie-prog{height:12px;border-radius:6px;background:#eef1f4;position:relative;overflow:hidden;margin:6px 0}
      .ie-prog i{position:absolute;left:0;top:0;bottom:0;background:#2e8b57}.ie-prog.alerta i{background:#d89216}.ie-prog.excede i{background:#C4472B}
      .ie-nota{font-size:11px;color:#6B7784}
      @media(max-width:600px){.ie-kpis{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(s);
  }
  const barra=(v,max,color)=>'<span class="ie-bar-h" style="width:'+Math.max(2,max>0?Math.round(v/max*120):0)+'px'+(color?';background:'+color:'')+'"></span>';
  const etqEst=o=>o.estimadaMin>0?'<span class="ie-est" title="El motivo se dedujo del texto del registro (no viene de la bitácora)">clasificación estimada'+(o.estimadaMin<o.min*0.999?' parcial':'')+'</span>':'';

  function htmlFaltan(res){
    const f=res.faltan,filas=[];
    const lst=(arr,fn)=>arr.slice(0,6).map(fn).join(', ')+(arr.length>6?' y '+(arr.length-6)+' más':'');
    if(f.velocidad.length)filas.push('<b>Velocidad estándar:</b> '+esc(lst(f.velocidad,x=>x.etiqueta))+' — no se calcula su cascada.');
    if(f.margen.length)filas.push('<b>Margen por unidad (o sin vigencia a esa fecha):</b> '+esc(lst(f.margen,x=>x.etiqueta))+' — no se calcula su pérdida en soles.');
    if(f.costo.length)filas.push('<b>Costo de insumo:</b> '+esc(lst(f.costo,x=>x.etiqueta))+' — su merma no se valoriza.');
    if(!filas.length)return '';
    return '<div class="ie-aviso"><b>Faltan datos para calcular</b> (no se asume cero)<ul>'+filas.map(x=>'<li>'+x+'</li>').join('')+'</ul>'+
      (puedeEditar()?'<button type="button" class="ie-btn" data-ie-valores>Completar valores</button>':'')+'</div>';
  }
  const puedeEditar=()=>permitido();

  function htmlKpis(R){
    const res=R.res;
    return '<div class="ie-kpis">'+
      '<div class="ie-k rojo"><span>Pérdida total</span><b>'+fmtS(res.total)+'</b><small>Paradas + velocidad reducida + mermas'+(res.hayFaltantes?' · parcial, faltan datos':'')+'</small></div>'+
      '<div class="ie-k"><span>Paradas no programadas</span><b>'+fmtS(res.paradasS)+'</b><small>'+fmtN(res.T.paradasU)+' unidades · '+fmtN(res.T.npMin)+' min</small></div>'+
      '<div class="ie-k"><span>Velocidad reducida</span><b>'+fmtS(res.velS)+'</b><small>'+fmtN(res.T.velU)+' unidades</small></div>'+
      '<div class="ie-k"><span>Mermas</span><b>'+fmtS(res.mermaS)+'</b><small>componente × costo unitario</small></div>'+
      '<div class="ie-k aparte"><span>Incumplimiento del plan</span><b>'+fmtS(res.incumplS)+'</b><small>(programado − producido) × margen · <i>no se suma al total</i>, es otra forma de ver la misma brecha</small></div></div>';
  }
  function htmlCascada(res){
    const T=res.T,max=T.potencialU||1;
    const fila=(n,u,s,c)=>'<tr><td>'+n+'</td><td>'+(u==null?'—':fmtN(u))+'</td><td>'+(s==null?'—':fmtS(s))+'</td><td style="text-align:left">'+barra(u==null?0:u,max,c)+'</td></tr>';
    const producida=T.potencialU-T.paradasU-T.velU;
    return '<div class="ie-box"><h4>Cascada de pérdidas</h4><table class="ie-t"><thead><tr><th>Concepto</th><th>Unidades</th><th>Soles</th><th></th></tr></thead><tbody>'+
      fila('Producción potencial (planificado × velocidad estándar)',T.potencialU,null,'#888780')+
      fila('− Paradas no programadas',T.paradasU,res.paradasS,'#E24B4A')+
      fila('− Velocidad reducida',T.velU,res.velS,'#BA7517')+
      fila('= Producción que quedó',producida,null,'#2e8b57')+
      '<tr><td>− Mermas (cada componente en su unidad)</td><td>—</td><td>'+fmtS(res.mermaS)+'</td><td></td></tr>'+
      '<tr><td><b>Pérdida total</b></td><td></td><td><b>'+fmtS(res.total)+'</b></td><td></td></tr></tbody></table>'+
      '<div class="ie-nota">Horas efectivas '+fmtN(T.horasEf)+' h · tiempo planificado '+fmtN(T.planMin)+' min. Sin horas extras ni costos de personal.</div></div>';
  }
  function htmlMes(M){
    const cls=M.meta>0&&M.proyeccion>M.meta?'excede':(M.meta>0&&M.usoMeta>=80?'alerta':'');
    const pct=M.meta>0?Math.min(100,M.acumulado/M.meta*100):0;
    const dif=M.prevParcial>0?(M.acumulado-M.prevParcial)/M.prevParcial*100:null;
    return '<div class="ie-box"><h4>Mes en curso</h4><div class="ie-kpis">'+
      '<div class="ie-k"><span>Acumulado del mes</span><b>'+fmtS(M.acumulado)+'</b><small>del '+fmtFecha(M.ini)+' al '+fmtFecha(M.hoy)+'</small></div>'+
      '<div class="ie-k"><span>Proyección a fin de mes</span><b>'+fmtS(M.proyeccion)+'</b><small>acumulado ÷ '+M.dia+' días × '+M.diasMes+' días del mes</small></div>'+
      '<div class="ie-k"><span>Mismo punto del mes anterior</span><b>'+fmtS(M.prevParcial)+'</b><small>'+(dif==null?'sin comparación':(dif>0?'▲ ':'▼ ')+fmtP(Math.abs(dif))+' respecto a este mes')+'</small></div>'+
      '<div class="ie-k"><span>Mes anterior completo</span><b>'+fmtS(M.prevCompleto)+'</b><small>total del mes</small></div></div>'+
      (M.meta>0?'<div>Meta máxima de pérdida: <b>'+fmtS(M.meta)+'</b> · acumulado '+fmtP(M.usoMeta)+' · proyección '+fmtP(M.proyMeta)+(M.proyeccion>M.meta?' <b style="color:#C4472B">(supera la meta)</b>':'')+
        '</div><div class="ie-prog '+cls+'"><i style="width:'+pct+'%"></i></div>':'<div class="ie-nota">Sin meta máxima configurada.'+(puedeEditar()?' Configúrala en «Valores y supuestos».':'')+'</div>')+
      (M.parcial?'<div class="ie-nota">Cifras parciales: faltan datos para calcular algunos productos o componentes.</div>':'')+'</div>';
  }
  function htmlPareto(titulo,filas,tipoEst){
    if(!filas.length)return '<div class="ie-box"><h4>'+titulo+'</h4><div class="ie-nota">Sin paradas valorizadas en el periodo.</div></div>';
    const max=filas[0].soles||1;
    return '<div class="ie-box"><h4>'+titulo+'</h4><table class="ie-t"><thead><tr><th></th><th>Soles</th><th>Min</th><th></th></tr></thead><tbody>'+
      filas.slice(0,12).map(f=>'<tr><td>'+esc(f.etiqueta)+(tipoEst?etqEst(f):'')+'</td><td>'+fmtS(f.soles)+'</td><td>'+fmtN(f.min)+'</td><td style="text-align:left">'+barra(f.soles,max)+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function htmlTop5(res){
    if(!res.top5.length)return '<div class="ie-box"><h4>Los cinco eventos más caros</h4><div class="ie-nota">Sin paradas valorizadas en el periodo.</div></div>';
    return '<div class="ie-box"><h4>Los cinco eventos más caros del periodo</h4><table class="ie-t"><thead><tr><th>Fecha</th><th>Línea</th><th>Motivo</th><th>Min</th><th>Monto</th></tr></thead><tbody>'+
      res.top5.map(e=>'<tr><td>'+fmtFecha(e.fecha)+' · '+A().etiquetaGrupo(e.grupo)+'</td><td>'+esc(A().nombreLinea(e.linea))+'</td><td style="text-align:left">'+esc(e.motivo)+(e.estimada?'<span class="ie-est">estimada</span>':'')+'</td><td>'+fmtN(e.min)+'</td><td><b>'+fmtS(e.monto)+'</b></td></tr>').join('')+'</tbody></table></div>';
  }
  function htmlMermas(res){
    if(!res.mermaComp.length)return '<div class="ie-box"><h4>Mermas por componente</h4><div class="ie-nota">Sin mermas registradas en el periodo.</div></div>';
    return '<div class="ie-box"><h4>Mermas por componente</h4><table class="ie-t"><thead><tr><th>Componente</th><th>Cantidad</th><th>Unidad</th><th>Soles</th></tr></thead><tbody>'+
      res.mermaComp.map(m=>'<tr><td>'+esc(m.comp)+'</td><td>'+(m.unidad==='kg'?m.cantidad.toLocaleString('es-PE',{maximumFractionDigits:1}):fmtN(m.cantidad))+'</td><td>'+m.unidad+'</td><td>'+(m.cantidadSinCosto>=m.cantidad?'<i>falta costo</i>':fmtS(m.soles)+(m.cantidadSinCosto>0?' <span class="ie-est">parcial</span>':''))+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function htmlSupuestos(res){
    if(!res.supuestos.length)return '<div class="ie-box"><h4>Supuestos del cálculo</h4><div class="ie-nota">No hay valores usados todavía en este periodo.</div></div>';
    return '<div class="ie-box"><h4>Supuestos del cálculo</h4><table class="ie-t"><thead><tr><th>Concepto</th><th>Producto / componente</th><th>Valor</th><th>Vigente desde</th></tr></thead><tbody>'+
      res.supuestos.map(s=>'<tr><td>'+s.tipo+'</td><td style="text-align:left">'+esc(s.etiqueta)+'</td><td>'+(s.unidad==='UND/h'?fmtN(s.valor)+' UND/h':fmtS(s.valor)+' <span class="ie-nota">'+esc(s.unidad.replace('S/ ',''))+'</span>')+'</td><td>'+(s.desde?fmtFecha(s.desde):'tabla de velocidades')+'</td></tr>').join('')+'</tbody></table>'+
      '<div class="ie-nota">Cada evento usa el valor vigente en su fecha; al cambiar un valor se conserva el anterior.</div></div>';
  }
  function opcionesFiltros(R){
    const I=A(),marcas=[...new Set([...I.MARCAS_FIJAS,...R.rec.marcas])];
    if(G.marca&&!marcas.includes(G.marca))marcas.push(G.marca);
    const grupo=(t,titulo)=>{const l=marcas.filter(k=>I.tipoMarca(k)===t).sort((a,b)=>a.localeCompare(b,'es'));return l.length?'<optgroup label="'+titulo+'">'+l.map(k=>'<option value="'+esc(k)+'"'+(G.marca===k?' selected':'')+'>'+esc(k)+'</option>').join('')+'</optgroup>':'';};
    const cats=I.ORDEN_PRES.concat([...R.rec.cats].filter(c=>!I.ORDEN_PRES.includes(c)));
    let lineas=[];try{lineas=(typeof lineasConsultables==='function'?lineasConsultables():LINES);}catch(_){lineas=[];}
    return '<select data-ie-f="linea" aria-label="Línea"><option value="">Toda la planta</option>'+lineas.map(l=>'<option value="'+esc(l.key)+'"'+(G.linea===l.key?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select>'+
      '<select data-ie-f="turno" aria-label="Turno"><option value="">Todos los turnos</option><option value="DIA"'+(G.turno==='DIA'?' selected':'')+'>Día</option><option value="NOCHE"'+(G.turno==='NOCHE'?' selected':'')+'>Noche</option></select>'+
      '<select data-ie-f="marca" aria-label="Marca"><option value="">Todas las marcas</option>'+grupo('regular','Regulares')+grupo('gas','Con gas')+grupo('sabor','Saborizadas')+'</select>'+
      '<select data-ie-f="pres" aria-label="Presentación"><option value="">Todas las presentaciones</option>'+cats.map(k=>'<option value="'+esc(k)+'"'+(G.pres===k?' selected':'')+'>'+esc(k)+'</option>').join('')+'</select>';
  }
  function htmlPantalla(R){
    const botones=[['hoy','Hoy'],['7','7 días'],['30','30 días'],['mes','Mes en curso'],['rango','Rango']];
    const per=R.per;
    return '<div class="ie" id="impacto-eco-view"><div class="ie-bar"><div><h2>Impacto económico</h2><div class="ie-sub">Cascada de pérdidas · '+esc(per.etiqueta)+(R.rec.hayVivo?' · hoy en vivo desde el semáforo':'')+'</div></div>'+
      '<div class="ie-ctl">'+botones.map(([k,t])=>'<button type="button" class="ie-btn'+(G.modo===k?' on':'')+'" data-ie-modo="'+k+'">'+t+'</button>').join('')+
      (G.modo==='rango'?'<input type="date" data-ie-fecha="desde" value="'+esc(per.desde)+'"> <input type="date" data-ie-fecha="hasta" value="'+esc(per.hasta)+'">':'')+'</div></div>'+
      '<div class="ie-bar"><div class="ie-ctl">'+opcionesFiltros(R)+'</div><div class="ie-ctl">'+
      '<button type="button" class="ie-btn" data-ie-valores>Valores y supuestos</button><button type="button" class="ie-btn" data-ie-excel>Exportar Excel</button>'+
      '<button type="button" class="ie-btn" data-ie-anterior title="Cálculo con precio por línea (versión previa)">Ver cálculo anterior</button></div></div>'+
      htmlFaltan(R.res)+htmlKpis(R)+htmlCascada(R.res)+htmlMes(R.mes)+
      '<div class="ie-grid">'+htmlPareto('Pareto en soles · por motivo de parada',R.res.porMotivo,true)+htmlPareto('Pareto en soles · por línea',R.res.porLinea,true)+htmlPareto('Pareto en soles · por turno',R.res.porTurno,true)+'</div>'+
      htmlTop5(R.res)+htmlMermas(R.res)+htmlSupuestos(R.res)+
      (R.res.estimadaPct>0?'<div class="ie-nota">'+fmtP(R.res.estimadaPct)+' de los minutos de parada tiene clasificación estimada (se dedujo del texto del registro; las paradas con motivo de la bitácora no se estiman).</div>':'')+'</div>';
  }

  let ultimo=null,pendiente=false;
  function render(main){
    if(!main)return;
    escuchar();
    estilos();
    if(typeof _recordsReady!=='undefined'&&!_recordsReady){main.innerHTML='<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando datos...</div></div>';return;}
    if(!DOCS_ECO.every(n=>LISTO[n])){main.innerHTML='<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando valores económicos...</div></div>';return;}
    try{
      ultimo=calcularTodo();
      main.innerHTML=(errorCfg?'<div class="ie-aviso">'+esc(errorCfg)+'</div>':'')+htmlPantalla(ultimo);
    }catch(e){
      console.warn('Impacto económico:',e&&e.message||e);
      main.innerHTML='<div class="panel"><div class="ie-aviso">No se pudo calcular el impacto económico: '+esc((e&&e.message)||e)+'</div></div>';
    }
  }
  let temporizador=null;
  function refrescar(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      try{
        if(typeof state==='undefined'||!state.user||state.currentTab!=='perdidas'||G.vistaAnterior)return;
        if(!permitido())return;
        render(document.getElementById('main'));
      }catch(e){console.warn('Impacto económico:',e&&e.message||e);}
    },350);
  }

  /* =========================================================
     EDITOR DE VALORES: margen por producto, costo por componente y meta mensual
     ========================================================= */
  function filasEditor(){
    const I=A(),hoy=I.hoyOp();
    const per=periodo();
    const rec=I.recolectar(addDias(hoy,-60)<per.desde?addDias(hoy,-60):per.desde,hoy,{linea:''});
    const prods=new Map(),comps=new Map();
    rec.partes.forEach(p=>{
      if(!prods.has(p.pkey))prods.set(p.pkey,{pkey:p.pkey,etiqueta:I.etiquetaProd(p.marca,p.pres),marcaN:p.marcaN});
      Object.keys(p.mermas||{}).forEach(c=>comps.set(p.linea+'|'+c,{linea:p.linea,comp:c}));
    });
    try{ // componentes definidos por línea aunque todavía no tengan merma
      (typeof LINES!=='undefined'?LINES:[]).forEach(l=>{
        const items=typeof obtenerItemsMerma==='function'?obtenerItemsMerma(l.key):[];
        items.forEach(it=>{const c=I.componenteMerma(it);comps.set(l.key+'|'+c,{linea:l.key,comp:c});});
      });
    }catch(_){/* sin catálogo */}
    Object.keys(DOCS.margenes.valores||{}).forEach(k=>{const e=DOCS.margenes.valores[k];if(![...prods.values()].some(p=>normKey(p.pkey)===k))prods.set('k:'+k,{pkey:'k:'+k,clave:k,etiqueta:e.etiqueta||k});});
    Object.keys(DOCS.costos.valores||{}).forEach(k=>{const e=DOCS.costos.valores[k];if(![...comps.values()].some(c=>claveCosto(c.linea,c.comp)===k))comps.set('k:'+k,{clave:k,etiqueta:e.etiqueta||k});});
    return {prods:[...prods.values()].sort((a,b)=>a.etiqueta.localeCompare(b.etiqueta,'es')),
      comps:[...comps.values()].map(c=>Object.assign({etiqueta:c.etiqueta||(I.nombreLinea(c.linea)+' · '+c.comp)},c)).sort((a,b)=>a.etiqueta.localeCompare(b.etiqueta,'es')),hoy};
  }
  function abrirEditor(){
    if(!puedeEditar()){alert('No tienes permiso para editar los valores económicos.');return;}
    const E=filasEditor();
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10060;padding:16px;';
    const hist=(tabla,clave)=>{
      const e=tabla.valores&&tabla.valores[clave];if(!e||!e.v)return {act:'sin valor',tit:''};
      const ds=Object.keys(e.v).sort(),v=vigente(tabla,clave,E.hoy);
      return {act:v?fmtS(v.valor)+' desde '+fmtFecha(v.desde):'aún no vigente',tit:ds.map(d=>fmtFecha(d)+': '+fmtS(e.v[d].valor)).join(' · ')};
    };
    const fila=(tipo,clave,etq)=>{
      const h=hist(tipo==='m'?DOCS.margenes:DOCS.costos,clave);
      return '<tr><td>'+esc(etq)+'</td><td title="'+esc(h.tit)+'">'+esc(h.act)+'</td><td><input type="number" step="0.001" min="0" data-eco="'+tipo+'" data-clave="'+esc(clave)+'" data-etq="'+esc(etq)+'" placeholder="nuevo" style="width:90px"></td><td><input type="date" data-eco-desde value="'+E.hoy+'" style="width:130px"></td></tr>';
    };
    fondo.innerHTML='<div class="modal" style="max-width:760px;width:100%;max-height:90vh;overflow:auto;background:#fff;border-radius:12px;padding:16px">'+
      '<h3 style="margin:0 0 6px">Valores y supuestos</h3><p class="small-muted" style="margin:0 0 10px">Escribe solo lo que cambia. Cada valor nuevo se guarda con su fecha de vigencia y el anterior se conserva: cada evento se calcula con el valor vigente en su fecha. Se ve en todos los dispositivos en segundos.</p>'+
      '<h4 style="margin:8px 0 4px">Margen por unidad (S/) por producto</h4><table style="width:100%;font-size:13px"><thead><tr><th align="left">Producto</th><th align="left">Vigente hoy</th><th align="left">Nuevo (S/)</th><th align="left">Vigente desde</th></tr></thead><tbody>'+E.prods.map(p=>fila('m',p.clave||normKey(p.pkey),p.etiqueta)).join('')+'</tbody></table>'+
      '<h4 style="margin:12px 0 4px">Costo unitario de insumos (S/) — polietileno por kg, el resto por unidad</h4><table style="width:100%;font-size:13px"><thead><tr><th align="left">Línea · componente</th><th align="left">Vigente hoy</th><th align="left">Nuevo (S/)</th><th align="left">Vigente desde</th></tr></thead><tbody>'+E.comps.map(c=>fila('c',c.clave||claveCosto(c.linea,c.comp),c.etiqueta)).join('')+'</tbody></table>'+
      '<h4 style="margin:12px 0 4px">Meta máxima de pérdida mensual (S/)</h4><input type="number" step="1" min="0" data-eco-meta value="'+(num((DOCS.general||{}).metaPerdidaMes)||'')+'" data-orig="'+(num((DOCS.general||{}).metaPerdidaMes)||'')+'" placeholder="sin meta" style="width:140px">'+
      '<div data-eco-error style="color:#c62828;font-size:12px;min-height:16px;margin-top:6px"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="btn btn-ghost" data-eco-x>Cancelar</button><button type="button" class="btn btn-primary" data-eco-ok>Guardar</button></div></div>';
    document.body.appendChild(fondo);
    const err=t=>{const e=fondo.querySelector('[data-eco-error]');if(e)e.textContent=t;};
    fondo.querySelector('[data-eco-x]').onclick=()=>fondo.remove();
    fondo.querySelector('[data-eco-ok]').onclick=async()=>{
      const filas=[...fondo.querySelectorAll('[data-eco]')];
      const cambios={m:{},c:{}};let hay=false;
      for(const el of filas){
        const v=String(el.value||'').trim();if(v==='')continue;
        const n=Number(v);
        if(!Number.isFinite(n)||n<0){err('Cada valor debe ser un número mayor o igual que 0.');return;}
        const desde=(el.parentNode&&el.parentNode.nextSibling&&el.parentNode.nextSibling.querySelector?el.parentNode.nextSibling.querySelector('[data-eco-desde]'):null)||fondo.querySelector('[data-eco-desde]');
        const fecha=(desde&&desde.value)||E.hoy;
        if(!A().fechaOk(fecha)){err('Indica una fecha de vigencia válida.');return;}
        (cambios[el.getAttribute('data-eco')][el.getAttribute('data-clave')]=cambios[el.getAttribute('data-eco')][el.getAttribute('data-clave')]||{etq:el.getAttribute('data-etq'),v:{}}).v[fecha]=n;
        hay=true;
      }
      const metaEl=fondo.querySelector('[data-eco-meta]'),metaTxt=String(metaEl.value||'').trim();
      let metaNueva=null;
      if(metaTxt!==String(metaEl.getAttribute('data-orig')||'')){
        const n=Number(metaTxt);
        if(metaTxt===''||!Number.isFinite(n)||n<0){err('La meta máxima debe ser un número mayor o igual que 0.');return;}
        metaNueva=n;hay=true;
      }
      if(!hay){fondo.remove();return;}
      if(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false){err('Sin conexión: no se guardó. Inténtalo cuando vuelva la conexión.');return;}
      err('Guardando…');
      try{await guardarValores(cambios,metaNueva);fondo.remove();}
      catch(e){err('No se pudo guardar (¿sin conexión o sin permiso?): '+((e&&e.message)||e));}
    };
  }
  /* Guarda solo lo que cambió: set con merge anidado (nunca el documento entero con datos en memoria). */
  async function guardarValores(cambios,metaNueva){
    const por=(state.user&&state.user.username)||'',en=ahoraMs();
    const armar=c=>{const valores={};Object.keys(c).forEach(k=>{const v={};Object.keys(c[k].v).forEach(d=>{v[d]={valor:c[k].v[d],por,en};});valores[k]={etiqueta:c[k].etq,v};});return valores;};
    const escribir=async(nombre,datos)=>{
      const ref=db.collection(COL).doc(nombre);
      await db.runTransaction(async tx=>{await tx.get(ref);tx.set(ref,Object.assign({actualizadoPor:por,actualizadoEn:en},datos),{merge:true});});
    };
    if(Object.keys(cambios.m).length)await escribir('margenes',{valores:armar(cambios.m)});
    if(Object.keys(cambios.c).length)await escribir('costos',{valores:armar(cambios.c)});
    if(metaNueva!==null)await escribir('general',{metaPerdidaMes:metaNueva});
  }

  /* =========================================================
     EXCEL: cascada, Pareto, eventos, mermas, supuestos y faltantes
     ========================================================= */
  function construirLibro(ExcelJS,R){
    const wb=new ExcelJS.Workbook();wb.creator=(state.user&&(state.user.nombre||state.user.username))||'GLACIAL';wb.created=new Date();
    const res=R.res,per=R.per;
    const hoja=(nombre,cols,filas,anchos)=>{
      const ws=wb.addWorksheet(nombre);
      ws.addRow(['Impacto económico · '+per.etiqueta+(G.linea?' · '+A().nombreLinea(G.linea):'')+(G.turno?' · turno '+A().etiquetaGrupo(G.turno):'')+(G.marca?' · '+G.marca:'')+(G.pres?' · '+G.pres:'')]).font={bold:true,size:14};
      ws.addRow(['Generado '+new Date(ahoraMs()).toLocaleString('es-PE')+' · Sin horas extras ni costos de personal']);
      ws.addRow([]);
      const h=ws.addRow(cols);h.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E79'}};c.alignment={horizontal:'center',wrapText:true};});
      filas.forEach(f=>ws.addRow(f));
      (anchos||[]).forEach((w,i)=>ws.getColumn(i+1).width=w);
      return ws;
    };
    const r2=n=>+num(n).toFixed(2);
    const T=res.T;
    hoja('Cascada',['Concepto','Unidades','Soles'],[
      ['Producción potencial (planificado × velocidad estándar)',Math.round(T.potencialU),''],
      ['Pérdida por paradas no programadas',Math.round(T.paradasU),r2(res.paradasS)],
      ['Pérdida por velocidad reducida',Math.round(T.velU),r2(res.velS)],
      ['Pérdida por mermas (componente × costo)','',r2(res.mermaS)],
      ['PÉRDIDA TOTAL','',r2(res.total)],
      ['Incumplimiento del plan (no se suma al total)','',r2(res.incumplS)],
      ['Parcial por falta de datos',res.hayFaltantes?'Sí':'No','']],[62,16,16]);
    const pareto=[];
    [['Motivo',res.porMotivo],['Línea',res.porLinea],['Turno',res.porTurno]].forEach(([t,fs])=>fs.forEach(f=>pareto.push([t,f.etiqueta,r2(f.soles),Math.round(f.min),f.estimadaMin>0?'clasificación estimada':''])));
    hoja('Pareto',['Agrupado por','Clave','Soles','Minutos','Observación'],pareto,[16,40,14,12,24]);
    hoja('Eventos más caros',['Fecha','Turno','Línea','Motivo','Minutos','Monto S/','Producto','Observación'],res.eventos.slice(0,50).map(e=>[fmtFecha(e.fecha),A().etiquetaGrupo(e.grupo),A().nombreLinea(e.linea),e.motivo,Math.round(e.min),r2(e.monto),e.producto,e.estimada?'clasificación estimada':'']),[12,10,12,34,10,12,36,22]);
    hoja('Mermas',['Componente','Cantidad','Unidad','Soles','Observación'],res.mermaComp.map(m=>[m.comp,r2(m.cantidad),m.unidad,m.cantidadSinCosto>=m.cantidad?'':r2(m.soles),m.cantidadSinCosto>=m.cantidad?'falta costo':(m.cantidadSinCosto>0?'parcial: falta costo en parte':'')]),[24,14,10,14,30]);
    hoja('Supuestos',['Concepto','Producto / componente','Valor','Unidad','Vigente desde'],res.supuestos.map(s=>[s.tipo,s.etiqueta,s.valor,s.unidad,s.desde?fmtFecha(s.desde):'tabla de velocidades']),[22,40,14,18,16]);
    const f=res.faltan,fa=[];
    f.velocidad.forEach(x=>fa.push(['Velocidad estándar',x.etiqueta]));f.margen.forEach(x=>fa.push(['Margen por unidad',x.etiqueta]));f.costo.forEach(x=>fa.push(['Costo de insumo',x.etiqueta]));
    hoja('Faltan datos',['Falta','Producto / componente'],fa.length?fa:[['Sin faltantes','']],[24,50]);
    const m=R.mes;
    hoja('Mes en curso',['Concepto','Soles'],[['Acumulado del mes',r2(m.acumulado)],['Proyección a fin de mes',r2(m.proyeccion)],['Mismo punto del mes anterior',r2(m.prevParcial)],['Mes anterior completo',r2(m.prevCompleto)],['Meta máxima de pérdida',m.meta>0?r2(m.meta):'sin meta']],[34,16]);
    return wb;
  }
  async function exportar(){
    try{
      const R=ultimo||calcularTodo();
      const ExcelJS=typeof cargarScriptExterno==='function'?await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS'):window.ExcelJS;
      if(!ExcelJS)throw new Error('ExcelJS no está disponible.');
      const wb=construirLibro(ExcelJS,R);
      const buf=await wb.xlsx.writeBuffer();
      const blob=new Blob([buf],{type:typeof XL_MIME!=='undefined'?XL_MIME:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const nombre='Impacto_economico_'+R.per.desde+'_'+R.per.hasta+'.xlsx';
      if(typeof descargarArchivo==='function')descargarArchivo(blob,nombre);
    }catch(e){alert('No se pudo generar el Excel de impacto económico. Verifica tu conexión e inténtalo nuevamente.');console.warn(e);}
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click',e=>{
    const v=e.target&&e.target.closest&&e.target.closest('#impacto-eco-view');
    if(!v)return;
    const modo=e.target.closest('[data-ie-modo]');
    if(modo){
      G.modo=modo.getAttribute('data-ie-modo');
      if(G.modo==='rango'&&!A().fechaOk(G.desde)){const h=A().hoyOp();G.hasta=h;G.desde=addDias(h,-6);}
      render(document.getElementById('main'));return;
    }
    if(e.target.closest('[data-ie-valores]')){abrirEditor();return;}
    if(e.target.closest('[data-ie-excel]')){exportar();return;}
    if(e.target.closest('[data-ie-anterior]')){G.vistaAnterior=true;renderPerdidasSoles(document.getElementById('main'));}
  });
  document.addEventListener('click',e=>{
    if(e.target&&e.target.closest&&e.target.closest('[data-ie-nuevo]')){G.vistaAnterior=false;renderPerdidasSoles(document.getElementById('main'));}
  });
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.closest||!t.closest('#impacto-eco-view'))return;
    const f=t.getAttribute('data-ie-f');
    if(f){G[f]=t.value;render(document.getElementById('main'));return;}
    const fe=t.getAttribute('data-ie-fecha');
    if(fe){G[fe]=t.value;if(A().fechaOk(G.desde)&&A().fechaOk(G.hasta)){if(G.hasta<G.desde){if(fe==='desde')G.hasta=G.desde;else G.desde=G.hasta;}render(document.getElementById('main'));}}
  });

  /* ---------- ganchos: pantalla, tiempo real y cierre de escuchas ---------- */
  if(typeof renderPerdidasSoles==='function'){
    const anterior=renderPerdidasSoles;
    renderPerdidasSoles=function(main){
      if(!permitido()||G.vistaAnterior){
        const r=anterior.apply(this,arguments);
        if(G.vistaAnterior&&main&&permitido()&&!/data-ie-nuevo/.test(main.innerHTML||'')){
          main.innerHTML='<div style="margin:0 0 8px"><button type="button" class="ie-btn" data-ie-nuevo>← Volver al impacto económico nuevo</button></div>'+main.innerHTML;
        }
        return r;
      }
      return render(main);
    };
    window.renderPerdidasSoles=renderPerdidasSoles;
  }
  ['onProgramacionesUpdated','onPaletasUpdated'].forEach(nombre=>{
    const anterior=globalThis[nombre];
    if(typeof anterior!=='function')return;
    globalThis[nombre]=function(){const r=anterior.apply(this,arguments);refrescar();return r;};
  });
  setInterval(()=>{
    if(typeof state==='undefined'||!state.user)return;
    if(state.currentTab==='perdidas'&&document.getElementById('impacto-eco-view'))refrescar();       // el reloj del semáforo avanza
  },60000);
  if(typeof renderMain==='function'){
    const anterior=renderMain;
    renderMain=function(){
      if(desubs.length&&(typeof state==='undefined'||state.currentTab!=='perdidas')){detener();G.vistaAnterior=false;}   // salió de la pantalla: deja de leer
      return anterior.apply(this,arguments);
    };
    window.renderMain=renderMain;
  }
  if(typeof handleLogout==='function'){
    const anterior=handleLogout;
    handleLogout=function(){const r=anterior.apply(this,arguments);detener();return r;};
    window.handleLogout=handleLogout;
  }

  window.glacialImpactoEconomico={calcularImpacto,vigente,provDefecto,calcularTodo,construirLibro,guardarValores,panelMes,periodo,render,
    abrirEditor,estado:G,docs:DOCS,listo:LISTO,claveMargen,claveCosto,normKey,permitido,detener,escuchar};
})();
