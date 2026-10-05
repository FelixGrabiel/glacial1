/* =========================================================
   REPORTES · PARTE B · IMPACTO ECONÓMICO (cascada de pérdidas en unidades y en soles)

   Reemplaza el contenido de la pantalla «Impacto Económico» (renderPerdidasSoles). La vista anterior (precio por línea,
   solo paradas) sigue disponible con el enlace «Ver cálculo anterior» y no se modificó.

   ACCESO (por rol, ver 55-valores-economicos.js): los valores unitarios y los soles con detalle son EXCLUSIVOS de Gerencia
   (rol Gerente General o Gerente). Este archivo solo calcula con lo que ese módulo le entrega: en el navegador de
   cualquiera que no sea Gerencia no existe ninguna escucha hacia los valores, así que no hay nada que calcular ni que ocultar.
   Para los demás usuarios la pantalla muestra el aviso de que los valores económicos están reservados.

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

   FIRESTORE: valoresUnitarios (margen por línea + marca + presentación, costo por insumo, meta) y su historial; ver 55-valores-economicos.js.
   Cargar después de 49-resumen-indicadores.js.
   ========================================================= */
(function(){
  'use strict';

  const eco=()=>window.glacialEconomico;
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
  /* Detalle económico completo: solo Gerencia (por UID). */
  const permitido=()=>{
    try{
      if(typeof esMantCompartido==='function'&&state&&state.user&&esMantCompartido(state.user))return false;
      return !!(eco()&&eco().esGerencia());
    }catch(_){return false;}
  };

  /* =========================================================
     VALORES ECONÓMICOS (Firestore) Y VIGENCIA
     ========================================================= */
  /* Los valores llegan de 55-valores-economicos.js y solo existen en el navegador de Gerencia. */
  const DOCS={get margenes(){return eco().docs().margenes;},get costos(){return eco().docs().costos;},get general(){return eco().docs().general;}};

  function vigente(tabla,clave,fecha){
    const e=tabla&&tabla.valores&&tabla.valores[clave];
    if(!e||!e.v)return null;
    let mejor=null;
    Object.keys(e.v).sort().forEach(d=>{
      if(d<=fecha){const x=e.v[d];if(x&&x.valor!==null&&x.valor!==''&&Number.isFinite(Number(x.valor)))mejor={desde:d,valor:Number(x.valor)};}
    });
    return mejor;
  }
  const claveMargen=p=>eco().claveProducto(p.linea,p.marcaN,p.cat);   // línea + marca + presentación
  const claveCosto=(linea,comp)=>normKey(linea)+'--'+normKey(comp);
  const provDefecto=()=>({
    margenDe:p=>vigente(DOCS.margenes,claveMargen(p),p.fecha),
    costoDe:(linea,comp,fecha)=>vigente(DOCS.costos,claveCosto(linea,comp),fecha)
  });

  /* =========================================================
     MOTOR DE PÉRDIDAS (puro: se prueba sin pantalla)
     ========================================================= */
  const NOMBRES_LINEA={PET1:'PET 1',PET2:'PET 2',B7L:'Bidones 7 L',C20L:'Cajas 20 L',B20L:'Bidones 20 L',B10L:'Bidones 10 L'};
  const UNIDAD_LINEA={PET1:'botellas',PET2:'botellas',B7L:'bidones',B10L:'bidones',B20L:'bidones',C20L:'cajas'};
  const lineaReal=p=>(p.linea==='B7L'&&/(^|[^0-9])(10000\s*ml|10\s*l)/i.test(norm(p.pres)))?'B10L':p.linea;
  const nombreImp=k=>NOMBRES_LINEA[k]||A().nombreLinea(k);
  const etiquetaParte=p=>nombreImp(lineaReal(p))+' · '+A().etiquetaProd(p.marca,p.pres);
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
      if(!m)faltan.margen.set(claveMargen(p),{linea:p.linea,etiqueta:A().nombreLinea(p.linea)+' · '+A().etiquetaProd(p.marca,p.pres)});
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
          eventos.push({fecha:p.fecha,linea:lineaReal(p),grupo:p.grupo,motivo:i.motivo||'Sin motivo',monto,min:i.minutos,estimada:!!i.estimada,producto:etq});
          suma(porMotivo,i.motivo||'Sin motivo',i.motivo||'Sin motivo',monto,i.minutos,i.estimada);
          suma(porLinea,lineaReal(p),nombreImp(lineaReal(p))+' ('+(UNIDAD_LINEA[lineaReal(p)]||'unidades')+')',monto,i.minutos,i.estimada);
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
  const G={modo:'mes',desde:'',hasta:'',linea:'',turno:'',marca:'',pres:'',pareto:'motivo'};
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
      .ie{--ink:#2E3A46;--soft:#6B7784;--line:#E6EBEF;--rojo:#C4472B;max-width:1320px;font-size:13px;color:var(--ink)}
      .ie-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line)}
      .ie-title{display:flex;align-items:center;gap:12px}
      .ie-badge{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;background:#FDEDE8;color:var(--rojo);font-size:20px;flex-shrink:0}
      .ie-eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--rojo);font-weight:600;margin-bottom:4px}
      .ie h2{margin:0;font-size:24px;font-weight:600;color:var(--ink)}.ie-sub{color:var(--soft);font-size:12px;margin-top:4px}
      .ie-filtros{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 12px}
      .ie-filtros select,.ie-filtros input[type=date],.ie-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 12px;font-size:13px;color:var(--soft);cursor:pointer}
      .ie-btn.on{background:var(--ink);color:#fff;border-color:var(--ink)}
      .ie-aviso{background:#FFF7ED;border:1px solid #FCE3C0;color:#8A5A1E;border-radius:10px;padding:10px 14px;margin:0 0 14px;font-size:13px}
      .ie-aviso ul{margin:4px 0 0;padding-left:18px}
      .ie-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:0 0 18px}
      .ie-k{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px}
      .ie-k span{display:block;font-size:12px;color:var(--soft);margin-bottom:6px}
      .ie-k b{display:block;font-size:26px;font-weight:700;color:var(--ink)}.ie-k.rojo b{color:var(--rojo)}.ie-k small{display:block;color:var(--soft);font-size:12px;margin-top:4px}
      .ie-box{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 16px}
      .ie-box h4{margin:0 0 10px;font-size:15px;color:var(--ink)}
      .ie-t{width:100%;border-collapse:collapse;font-size:13px}.ie-t th{font-weight:500;color:var(--soft);text-align:right;padding:8px 10px;border-bottom:1px solid var(--line)}
      .ie-t td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:right;color:var(--ink)}.ie-t th:first-child,.ie-t td:first-child{text-align:left}
      .ie-t td.falta{color:#C4472B}.ie-t tr.total td{font-weight:700}
      .ie-bar-h{display:inline-block;height:10px;border-radius:3px;background:#C4472B;vertical-align:middle}
      .ie-est{display:inline-block;margin-left:6px;padding:0 6px;border-radius:8px;background:#fff1d6;color:#8A5A1E;font-size:10px}
      .ie-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px}
      .ie-tabs{display:flex;gap:6px;margin:0 0 8px}.ie-tabs .ie-btn{padding:4px 10px;font-size:12px}
      .ie-prog{height:12px;border-radius:6px;background:#eef1f4;position:relative;overflow:hidden;margin:8px 0}
      .ie-prog i{position:absolute;left:0;top:0;bottom:0;background:#2e8b57}.ie-prog.alerta i{background:#d89216}.ie-prog.excede i{background:#C4472B}
      .ie-nota{font-size:12px;color:var(--soft);margin-top:8px}
      @media(max-width:600px){.ie-kpis{grid-template-columns:1fr}.ie-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }
  const barra=(v,max,color)=>'<span class="ie-bar-h" style="width:'+Math.max(2,max>0?Math.round(v/max*120):0)+'px'+(color?';background:'+color:'')+'"></span>';
  const etqEst=o=>o.estimadaMin>0?'<span class="ie-est" title="El motivo se dedujo del texto del registro (no viene de la bitácora)">clasificación estimada'+(o.estimadaMin<o.min*0.999?' parcial':'')+'</span>':'';

  function htmlFaltan(res){
    const f=res.faltan,filas=[];
    const lst=(arr,fn)=>arr.slice(0,6).map(fn).join(', ')+(arr.length>6?' y '+(arr.length-6)+' más':'');
    if(f.velocidad.length)filas.push('<b>Velocidad estándar:</b> '+esc(lst(f.velocidad,x=>x.etiqueta))+' — no se calcula su cascada.');
    if(f.margen.length)filas.push('<b>Productos sin valor unitario configurado</b> (línea · marca · presentación; o sin vigencia a esa fecha): '+esc(lst(f.margen,x=>x.etiqueta))+' — no se calcula su pérdida en soles (no se asume S/ 0).');
    if(f.costo.length)filas.push('<b>Costo de insumo:</b> '+esc(lst(f.costo,x=>x.etiqueta))+' — su merma no se valoriza.');
    if(!filas.length)return '';
    return '<div class="ie-aviso"><b>Faltan datos para calcular</b> (no se asume cero)<ul>'+filas.map(x=>'<li>'+x+'</li>').join('')+'</ul>'+
      (puedeEditar()?'<button type="button" class="ie-btn" data-ie-valores>Valores unitarios</button>':'')+'</div>';
  }
  const puedeEditar=()=>permitido();

  function htmlKpis(R){
    const M=R.mes,dif=M.prevParcial>0?(M.acumulado-M.prevParcial)/M.prevParcial*100:null;
    const sobre=M.meta>0&&M.proyeccion>M.meta;
    return '<div class="ie-kpis">'+
      '<div class="ie-k rojo"><span>Pérdida total del mes</span><b>'+fmtS(M.acumulado)+'</b><small>'+(M.meta>0?'Meta máxima '+fmtS(M.meta)+' · '+fmtN(M.usoMeta)+' %':'Sin meta máxima configurada'+(puedeEditar()?' (Valores y supuestos)':''))+(M.parcial?' · parcial, faltan datos':'')+'</small></div>'+
      '<div class="ie-k"><span>Proyección a fin de mes</span><b>'+fmtS(M.proyeccion)+'</b><small>'+(M.meta>0?(sobre?'Supera la meta en '+fmtS(M.proyeccion-M.meta):'Dentro de la meta ('+fmtS(M.meta-M.proyeccion)+' de margen)'):'Acumulado ÷ '+M.dia+' días × '+M.diasMes+' días')+'</small></div>'+
      '<div class="ie-k"><span>Mes anterior</span><b>'+fmtS(M.prevCompleto)+'</b><small>'+(dif==null?'Sin comparación':(dif>0?'▲ ':'▼ ')+fmtP(Math.abs(dif))+' '+(dif>0?'más':'menos')+' en este punto del mes ('+fmtS(M.prevParcial)+')')+'</small></div></div>'+
      (M.meta>0?'<div class="ie-prog '+(sobre?'excede':(M.usoMeta>=80?'alerta':''))+'" title="Acumulado frente a la meta máxima"><i style="width:'+Math.min(100,M.usoMeta)+'%"></i></div>':'');
  }
  function htmlCascada(res,per){
    const T=res.T,max=T.potencialU||1;
    const fila=(n,u,s,c,cls)=>'<tr'+(cls?' class="'+cls+'"':'')+'><td>'+n+'</td><td>'+(u==null?'—':fmtN(u))+'</td><td>'+(s==null?'—':fmtS(s))+'</td><td style="text-align:left">'+barra(u==null?0:u,max,c)+'</td></tr>';
    const ratio=T.horasEf>0?(T.potencialU-T.paradasU-T.velU)/T.horasEf:null,vel=T.horasEf>0?(T.potencialU-T.paradasU)/T.horasEf:null;
    return '<div class="ie-box"><h4>Cascada de pérdidas · '+esc(per.etiqueta)+'</h4><table class="ie-t"><thead><tr><th>Concepto</th><th>Unidades</th><th>Soles</th><th></th></tr></thead><tbody>'+
      fila('Producción potencial (planificado × velocidad estándar)',T.potencialU,null,'#888780')+
      fila('Paradas no programadas ('+fmtN(T.npMin)+' min)',T.paradasU,res.paradasS,'#E24B4A')+
      fila('Velocidad reducida'+(ratio!=null&&vel!=null?' ('+fmtN(ratio)+' vs '+fmtN(vel)+' UND/h)':''),T.velU,res.velS,'#BA7517')+
      fila('Mermas (cada componente × su costo)',null,res.mermaS,'#D4537E')+
      fila('Pérdida total',null,res.total,'','total')+'</tbody></table>'+
      '<div class="ie-nota">Aparte: incumplimiento del plan (programado − producido) × margen = <b>'+fmtS(res.incumplS)+'</b> · <i>no se suma al total</i>, es otra forma de ver la misma brecha. Horas efectivas '+fmtN(T.horasEf)+' h · tiempo planificado '+fmtN(T.planMin)+' min · sin horas extras ni costos de personal.</div></div>';
  }
  function htmlPareto(res){
    const tabs=[['motivo','Por motivo',res.porMotivo],['linea','Por línea',res.porLinea],['turno','Por turno',res.porTurno]];
    const act=tabs.find(t=>t[0]===G.pareto)||tabs[0],filas=act[2];
    const cab='<div class="ie-tabs">'+tabs.map(t=>'<button type="button" class="ie-btn'+(t[0]===act[0]?' on':'')+'" data-ie-pareto="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>';
    if(!filas.length)return '<div class="ie-box"><h4>Pareto en soles</h4>'+cab+'<div class="ie-nota">Sin paradas valorizadas en el periodo.</div></div>';
    const max=filas[0].soles||1;
    return '<div class="ie-box"><h4>Pareto en soles</h4>'+cab+'<table class="ie-t"><thead><tr><th>'+act[1].replace('Por ','')+'</th><th>Soles</th><th>Min</th><th></th></tr></thead><tbody>'+
      filas.slice(0,12).map(f=>'<tr><td>'+esc(f.etiqueta)+etqEst(f)+'</td><td>'+fmtS(f.soles)+'</td><td>'+fmtN(f.min)+'</td><td style="text-align:left">'+barra(f.soles,max)+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function htmlTop5(res){
    if(!res.top5.length)return '<div class="ie-box"><h4>Los cinco eventos más caros</h4><div class="ie-nota">Sin paradas valorizadas en el periodo.</div></div>';
    return '<div class="ie-box"><h4>Los cinco eventos más caros del periodo</h4><table class="ie-t"><thead><tr><th>Fecha</th><th>Línea</th><th>Motivo</th><th>Min</th><th>Monto</th></tr></thead><tbody>'+
      res.top5.map(e=>'<tr><td>'+fmtFecha(e.fecha)+' · '+A().etiquetaGrupo(e.grupo)+'</td><td>'+esc(nombreImp(e.linea))+'</td><td style="text-align:left">'+esc(e.motivo)+(e.estimada?'<span class="ie-est">estimada</span>':'')+'</td><td>'+fmtN(e.min)+'</td><td><b>'+fmtS(e.monto)+'</b></td></tr>').join('')+'</tbody></table></div>';
  }
  function htmlMermas(res){
    if(!res.mermaComp.length)return '<div class="ie-box"><h4>Mermas por componente</h4><div class="ie-nota">Sin mermas registradas en el periodo.</div></div>';
    return '<div class="ie-box"><h4>Mermas por componente</h4><table class="ie-t"><thead><tr><th>Componente</th><th>Cantidad</th><th>Unidad</th><th>Soles</th></tr></thead><tbody>'+
      res.mermaComp.map(m=>'<tr><td>'+esc(m.comp)+'</td><td>'+(m.unidad==='kg'?m.cantidad.toLocaleString('es-PE',{maximumFractionDigits:1}):fmtN(m.cantidad))+'</td><td>'+m.unidad+'</td><td>'+(m.cantidadSinCosto>=m.cantidad?'<i>falta costo</i>':fmtS(m.soles)+(m.cantidadSinCosto>0?' <span class="ie-est">parcial</span>':''))+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function htmlSupuestos(R){
    const res=R.res,hasta=R.per.hasta,porProd=new Map();
    R.rec.partes.forEach(p=>{
      if(!(p.producido>0||p.npMin>0||p.programado>0))return;
      const k=p.pkey,o=porProd.get(k)||{etq:A().etiquetaProd(p.marca,p.pres),vel:0,p};
      if(p.vel>0)o.vel=p.vel;porProd.set(k,o);
    });
    const filas=[...porProd.values()].sort((a,b)=>a.etq.localeCompare(b.etq,'es'));
    const prod=filas.length?'<table class="ie-t"><thead><tr><th>Producto</th><th>Vel. estándar</th><th>Margen/und</th><th>Vigente desde</th></tr></thead><tbody>'+filas.map(o=>{
      const m=vigente(DOCS.margenes,claveMargen(o.p),hasta);
      return '<tr><td>'+esc(o.etq)+'</td><td'+(o.vel>0?'>'+fmtN(o.vel)+' UND/h':' class="falta">falta')+'</td><td'+(m?'>'+fmtS(m.valor):' class="falta">falta')+'</td><td>'+(m?fmtFecha(m.desde):'—')+'</td></tr>';
    }).join('')+'</tbody></table>':'<div class="ie-nota">No hay productos con actividad en este periodo.</div>';
    const cs=res.supuestos.filter(s=>s.tipo==='Costo de insumo');
    const costos=cs.length?'<h4 style="margin:14px 0 8px">Costo de insumos por componente</h4><table class="ie-t"><thead><tr><th>Línea · componente</th><th>Costo unitario</th><th>Vigente desde</th></tr></thead><tbody>'+cs.map(c=>'<tr><td>'+esc(c.etiqueta)+'</td><td>'+fmtS(c.valor)+' <span class="ie-nota">'+esc(c.unidad.replace('S/ ',''))+'</span></td><td>'+fmtFecha(c.desde)+'</td></tr>').join('')+'</tbody></table>':'';
    return '<div class="ie-box"><h4>Supuestos del cálculo</h4>'+prod+costos+'<div class="ie-nota">Al cambiar un valor se conserva el anterior; cada evento usa el vigente en su fecha. Sin horas extras ni costos de personal (eso va en RRHH).</div></div>';
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
    const botones=[['hoy','Día'],['7','Semana'],['mes','Mes'],['rango','Rango']];
    const per=R.per;
    return '<div class="ie" id="impacto-eco-view"><div class="ie-head"><div class="ie-title"><div class="ie-badge">📉</div><div><div class="ie-eyebrow">Solo Gerencia</div><h2>Impacto económico</h2>'+
      '<div class="ie-sub">Pérdidas por paradas, velocidad reducida y mermas · '+esc(per.etiqueta)+(R.rec.hayVivo?' · hoy en vivo desde el semáforo':'')+'</div></div></div>'+
      '<div class="ie-filtros">'+botones.map(([k,t])=>'<button type="button" class="ie-btn'+(G.modo===k?' on':'')+'" data-ie-modo="'+k+'">'+t+'</button>').join('')+
      (G.modo==='rango'?'<input type="date" data-ie-fecha="desde" value="'+esc(per.desde)+'"> <input type="date" data-ie-fecha="hasta" value="'+esc(per.hasta)+'">':'')+'</div></div>'+
      '<div class="ie-filtros">'+opcionesFiltros(R)+
      '<button type="button" class="ie-btn" data-ie-excel>Excel ↓</button><button type="button" class="ie-btn" data-ie-valores>Valores unitarios</button></div>'+
      htmlFaltan(R.res)+htmlKpis(R)+htmlCascada(R.res,per)+
      '<div class="ie-grid">'+htmlPareto(R.res)+htmlTop5(R.res)+'</div>'+
      htmlMermas(R.res)+htmlSupuestos(R)+
      (R.res.estimadaPct>0?'<div class="ie-nota">'+fmtP(R.res.estimadaPct)+' de los minutos de parada tiene clasificación estimada (se dedujo del texto del registro; las paradas con motivo de la bitácora no se estiman).</div>':'')+'</div>';
  }

  let ultimo=null,pendiente=false;
  function render(main){
    if(!main)return;
    estilos();
    if(!permitido()){main.innerHTML=htmlReservado();return;}
    if(typeof _recordsReady!=='undefined'&&!_recordsReady){main.innerHTML='<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando datos...</div></div>';return;}
    if(!eco().listo()){main.innerHTML='<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando valores económicos...</div></div>';return;}
    try{
      ultimo=calcularTodo();
      main.innerHTML=(eco().error()?'<div class="ie-aviso">'+esc(eco().error())+'</div>':'')+htmlPantalla(ultimo);
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
        if(typeof state==='undefined'||!state.user||state.currentTab!=='perdidas')return;
        if(!permitido())return;
        render(document.getElementById('main'));
      }catch(e){console.warn('Impacto económico:',e&&e.message||e);}
    },350);
  }

  /* La edición de valores vive en 55-valores-economicos.js (pantalla «Valores unitarios», solo Gerencia). */
  function abrirEditor(){if(eco())eco().abrirPantalla();}

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
    const pt=e.target.closest('[data-ie-pareto]');
    if(pt){G.pareto=pt.getAttribute('data-ie-pareto');render(document.getElementById('main'));return;}
    if(e.target.closest('[data-ie-valores]')){abrirEditor();return;}
    if(e.target.closest('[data-ie-excel]')){exportar();return;}
  });
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.closest||!t.closest('#impacto-eco-view'))return;
    const f=t.getAttribute('data-ie-f');
    if(f){G[f]=t.value;render(document.getElementById('main'));return;}
    const fe=t.getAttribute('data-ie-fecha');
    if(fe){G[fe]=t.value;if(A().fechaOk(G.desde)&&A().fechaOk(G.hasta)){if(G.hasta<G.desde){if(fe==='desde')G.hasta=G.desde;else G.desde=G.hasta;}render(document.getElementById('main'));}}
  });

  /* ---------- pantalla y tiempo real ---------- */
  function htmlReservado(){
    const acc=eco();
    if(!acc||!acc.accesoListo())return '<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando permisos...</div></div>';
    return '<div class="ie"><div class="ie-head"><div class="ie-title"><div class="ie-badge">📉</div><div><h2>Impacto económico</h2></div></div></div>'+
      '<div class="ie-aviso">Los valores económicos están reservados a Gerencia y Jefatura autorizada.</div></div>';
  }
  window.renderPerdidasSoles=function(main){
    if(!main)return;
    return permitido()?render(main):(estilos(),main.innerHTML=htmlReservado());
  };
  if(eco())eco().alCambiar(()=>{try{if(typeof state!=='undefined'&&state.user&&state.currentTab==='perdidas')refrescar();}catch(_){/* informativo */}});
  ['onProgramacionesUpdated','onPaletasUpdated'].forEach(nombre=>{
    const anterior=globalThis[nombre];
    if(typeof anterior!=='function')return;
    globalThis[nombre]=function(){const r=anterior.apply(this,arguments);refrescar();return r;};
  });
  setInterval(()=>{
    if(typeof state==='undefined'||!state.user)return;
    if(state.currentTab==='perdidas'&&document.getElementById('impacto-eco-view'))refrescar();       // el reloj del semáforo avanza
  },60000);

  window.glacialImpactoEconomico={nombreImp,lineaReal,calcularImpacto,vigente,provDefecto,calcularTodo,construirLibro,panelMes,periodo,render,
    estado:G,claveMargen,claveCosto,normKey,permitido};
})();
