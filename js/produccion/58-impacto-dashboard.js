/* =============================================================
   IMPACTO ECONÓMICO · DASHBOARD INTERACTIVO (Gerencia, Jefatura y vista operativa)

   Un único estado de filtros (57-impacto-estado.js) gobierna KPI, 10 gráficos, tabla y detalle. Un clic o toque en un gráfico agrega o
   quita ese valor del filtro (se acumulan; el mismo gráfico muestra todas sus barras y resalta las elegidas). Los datos se cargan una vez
   por periodo (56-impacto-resultados.js); los clics solo recalculan en memoria y actualizan los gráficos existentes (no se destruyen).
   El análisis bajo cada gráfico sale de 59-impacto-analisis.js con la misma vista filtrada que se dibuja.

   Qué ve cada rol:
     · Gerencia (rol Gerente/Gerente General): soles, valores unitarios, faltantes con acceso a configurarlos.
     · Jefatura: soles y unidades de los resultados que publica Gerencia; sin pestaña ni acceso a valores unitarios.
     · Los demás: la misma pantalla en minutos y unidades, sin ninguna cifra en soles.
   Cargar después de 56-impacto-resultados.js, 57-impacto-estado.js y 59-impacto-analisis.js.
   ============================================================= */
(function(){
  'use strict';

  const E=()=>window.GlacialImpactoEstado;
  const AN=()=>window.GlacialImpactoAnalisis;
  const R=()=>window.glacialImpactoResultados;
  const A=()=>window.glacialReporteIndicadores;
  const eco=()=>window.glacialEconomico;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const nf=(n,d)=>num(n).toLocaleString('es-PE',{minimumFractionDigits:d||0,maximumFractionDigits:d==null?0:d});
  const fS=v=>'S/ '+nf(v,Math.abs(num(v))>=1000?0:2);
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const corto=(t,n)=>{t=String(t==null?'':t);return t.length>n?t.slice(0,n-1)+'…':t;};
  const fFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))?f.slice(8,10)+'/'+f.slice(5,7):String(f||'');

  /* ---------- tarjetas (gráficos) ---------- */
  const CARDS=[
    {id:'evolucion',pane:'resumen',t:'Evolución de la pérdida',dim:'dia'},
    {id:'linea',pane:'resumen',t:'Pérdida por línea',dim:'linea'},
    {id:'causa',pane:'resumen',t:'Pareto de causas',dim:'causa'},
    {id:'turno',pane:'resumen',t:'Pérdida por turno',dim:'turno'},
    {id:'acumulada',pane:'resumen',t:'Pérdida acumulada',dim:null},
    {id:'maquina',pane:'perdidas',t:'Top máquinas con mayor pérdida',dim:'maquina'},
    {id:'marca',pane:'perdidas',t:'Pérdida por marca',dim:'marca'},
    {id:'pres',pane:'perdidas',t:'Pérdida por presentación',dim:'pres'},
    {id:'tipo',pane:'perdidas',t:'Pérdida por tipo',dim:'tipo'},
    {id:'scatter',pane:'perdidas',t:'Minutos de parada vs. pérdida',dim:'causa'}
  ];
  const FN_ANALISIS={evolucion:'evolucion',linea:'linea',causa:'pareto',turno:'turno',acumulada:'acumulada',maquina:'maquina',marca:'marca',pres:'pres',tipo:'tipo',scatter:'dispersion'};
  const COLOR={evolucion:'#c0392b',linea:'#2d7fc0',causa:'#e07b39',turno:'#2e8b57',acumulada:'#8e5bb5',maquina:'#b3382b',marca:'#3aa5a5',pres:'#c9a227',tipo:'#5b6dd6',scatter:'#2d7fc0'};

  /* ---------- estado del módulo ---------- */
  const S={estado:null,tab:'resumen',datos:null,vista:null,info:null,charts:{},cargando:false,error:'',orden:'impacto',detalle:null,main:null,econ:false,gerencia:false,jefatura:false,borrador:null,ultimaCarga:0};
  const viva=()=>{const el=document.getElementById('impacto-dash');return !!(el&&S.main&&S.main.contains(el));};

  /* ---------- hex → rgba ---------- */
  const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')';};

  const CSS=`
    .id{max-width:1240px;margin:0 auto;padding:4px 2px 28px;color:#1d2b36}
    .id h2{margin:0;color:#003b5c}.id h4{margin:0;color:#003b5c;font-size:15px}
    .id-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px}
    .id-sub{font-size:12px;color:#5a6b78}
    .id-btn{border:1px solid #cfdbe3;background:#fff;border-radius:8px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;min-height:40px;color:#1d2b36}
    .id-btn.on{background:#003b5c;border-color:#003b5c;color:#fff}.id-btn.p{background:#2d7fc0;border-color:#2d7fc0;color:#fff}
    .id-btn:focus-visible,.id-chip:focus-visible,.id-link:focus-visible{outline:3px solid #8ec5ee;outline-offset:1px}
    .id-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
    .id-filtros{background:#fff;border:1px solid #dce3e8;border-radius:10px;padding:8px 12px;margin:8px 0}
    .id-filtros summary{cursor:pointer;font-weight:700;color:#003b5c;min-height:30px;display:flex;align-items:center}
    .id-fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:8px 0}
    .id-fgrid label{display:flex;flex-direction:column;font-size:12px;color:#5a6b78;gap:3px}
    .id select,.id input[type=date]{padding:8px;border:1px solid #cfdbe3;border-radius:7px;font:inherit;min-height:40px;min-width:0;background:#fff;color:#1d2b36}
    .id-per{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}
    .id-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0;min-height:4px}
    .id-chip{border:1px solid #2d7fc0;background:#e8f2fb;color:#154a73;border-radius:16px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer;min-height:34px}
    .id-link{border:0;background:none;color:#2d7fc0;font:inherit;font-weight:600;cursor:pointer;padding:6px 4px;min-height:34px}
    .id-aviso{background:#fff4d6;border:1px solid #ecd48b;border-radius:10px;padding:10px 14px;margin:8px 0;color:#6d5410;font-size:13px}
    .id-reserva{background:#eef3f7;border:1px solid #d3dfe8;border-radius:10px;padding:10px 14px;margin:8px 0;color:#3d5365;font-size:13px}
    .id-foco{background:#eaf4ee;border:1px solid #bcdcc8;border-radius:10px;padding:10px 14px;margin:8px 0;font-size:14px}
    .id-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:10px 0}
    .id-k{background:#fff;border:1px solid #dce3e8;border-radius:10px;padding:12px;min-width:0}
    .id-k span{display:block;font-size:12px;color:#5a6b78}.id-k b{display:block;font-size:22px;color:#003b5c;margin-top:2px;overflow-wrap:anywhere}.id-k small{color:#5a6b78;display:block}
    .id-k.rojo b{color:#b3382b}.id-up{color:#b3382b;font-weight:700}.id-down{color:#2e8b57;font-weight:700}
    .id-sem{display:inline-block;border-radius:10px;padding:1px 9px;font-size:12px;font-weight:700;margin-top:3px}
    .id-sem.fav{background:#dff3e6;color:#1f6b3d}.id-sem.ate{background:#fff1d6;color:#8a5a1e}.id-sem.cri{background:#fadbd8;color:#a02b20}
    .id-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:8px}
    .id-card{background:#fff;border:1px solid #dce3e8;border-radius:10px;padding:12px;min-width:0}
    .id-card header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
    .id-card.ancha{grid-column:1/-1}
    .id-cv{position:relative;height:270px}
    .id-an{margin-top:8px;border-top:1px solid #edf1f4;padding-top:8px;font-size:13px;line-height:1.45}
    .id-an p{margin:4px 0}.id-an-h{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5a6b78}
    .id-an .vacio{color:#5a6b78}
    .id-t{width:100%;border-collapse:collapse;font-size:13px}
    .id-t th{text-align:right;padding:6px 8px;background:#eef3f7;color:#3d5365;font-size:12px;white-space:nowrap}
    .id-t td{padding:6px 8px;border-bottom:1px solid #edf1f4;text-align:right;font-variant-numeric:tabular-nums}
    .id-t th.l,.id-t td.l{text-align:left}.id-t tr[data-id-fila]{cursor:pointer}.id-t tr[data-id-fila]:hover td{background:#f2f8fd}
    .id-scroll{overflow-x:auto}
    .id-sv{display:inline-block;padding:0 6px;border-radius:8px;background:#fff1d6;color:#8a5a1e;font-size:11px}
    .id-modal{position:fixed;inset:0;background:rgba(10,25,38,.55);z-index:10060;display:flex;align-items:center;justify-content:center;padding:12px}
    .id-modal>div{background:#fff;border-radius:12px;max-width:1000px;width:100%;max-height:92vh;overflow:auto;padding:14px}
    .id-modal-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
    .id-mig{font-size:13px;margin:6px 0;display:flex;gap:4px;flex-wrap:wrap;align-items:center}
    .id-cargando{padding:18px;text-align:center;color:#5a6b78}
    @media(max-width:900px){.id-grid{grid-template-columns:1fr}}
    @media(max-width:640px){.id-kpis{grid-template-columns:1fr 1fr}.id-k b{font-size:18px}.id-cv{height:240px}.id-btn{padding:8px 10px}}
  `;
  const estilos=()=>{if(document.getElementById('id-css'))return;const s=document.createElement('style');s.id='id-css';s.textContent=CSS;document.head.appendChild(s);};

  /* =========================================================
     ESQUELETO (se crea una vez; después solo se actualizan sus partes)
     ========================================================= */
  const cardHtml=c=>'<section class="id-card" data-card="'+c.id+'"><header><h4 id="idt-'+c.id+'"></h4><button type="button" class="id-link" data-id-detalle="'+c.id+'">Ver detalle →</button></header>'+
    '<div class="id-cv"><canvas id="idc-'+c.id+'" role="img" aria-label="'+esc(c.t)+'"></canvas></div><div class="id-an" id="ida-'+c.id+'" aria-live="polite"></div></section>';
  function esqueleto(){
    const abierto=window.innerWidth>=700?' open':'';
    const tabs=[['resumen','Resumen ejecutivo'],['perdidas','Análisis de pérdidas']].concat(S.gerencia?[['valores','Valores unitarios']]:[]);
    return '<div class="id" id="impacto-dash">'+
      '<div class="id-head"><div><h2 id="id-titulo">Impacto económico</h2><div class="id-sub" id="id-sub"></div></div><div><button type="button" class="id-btn" data-id-excel>Excel ↓</button></div></div>'+
      '<div id="id-reserva"></div>'+
      '<div class="id-tabs" role="tablist">'+tabs.map(([k,t])=>'<button type="button" role="tab" class="id-btn" data-id-tab="'+k+'">'+t+'</button>').join('')+'</div>'+
      '<details class="id-filtros"'+abierto+'><summary>Filtros</summary>'+
        '<div class="id-per" id="id-per"></div>'+
        '<div class="id-fgrid" id="id-fgrid"></div>'+
        '<div class="id-per"><button type="button" class="id-btn p" data-id-aplicar>Aplicar</button><button type="button" class="id-btn" data-id-limpiar-todo>Limpiar filtros</button></div></details>'+
      '<div class="id-chips" id="id-chips"></div><div id="id-avisos"></div><div id="id-foco"></div>'+
      '<div class="id-kpis" id="id-kpis"></div>'+
      '<div data-pane="resumen"><div class="id-grid">'+CARDS.filter(c=>c.pane==='resumen').map((c,i)=>cardHtml(c).replace('class="id-card"','class="id-card'+(i===0?' ancha':'')+'"')).join('')+'</div></div>'+
      '<div data-pane="perdidas" hidden><div class="id-grid">'+CARDS.filter(c=>c.pane==='perdidas').map(cardHtml).join('')+'</div></div>'+
      '<div data-pane="valores" hidden id="id-valores"></div>'+
      '<div id="id-tabla-wrap" style="margin-top:14px"></div><div id="id-modal"></div></div>';
  }

  /* =========================================================
     CARGA DE DATOS (una vez por periodo, no por clic)
     ========================================================= */
  function recargar(){
    if(!viva()||!E()||!R())return;
    const hoy=A().hoyOp(),per=E().resolverRango(S.estado.rango,hoy),prev=E().periodoAnterior(per);
    const desde=prev.desde<per.desde?prev.desde:per.desde;
    S.cargando=true;S.error='';
    const cd=document.getElementById('id-kpis');
    if(cd&&!S.vista)cd.innerHTML='<div class="id-cargando" style="grid-column:1/-1">Calculando…</div>';
    R().cargar(desde,per.hasta,(filas,info)=>{
      if(!viva())return;
      try{
        const todas=E().normalizarFilas(filas);
        S.datos={filas:todas.filter(f=>f.fecha>=per.desde&&f.fecha<=per.hasta),filasPrev:todas.filter(f=>f.fecha>=prev.desde&&f.fecha<=prev.hasta),per,perPrev:prev,hoy};
        S.info=info;S.cargando=false;S.ultimaCarga=Date.now();
        pintar();
      }catch(e){S.cargando=false;S.error=(e&&e.message)||String(e);console.warn('Impacto:',e);pintarError();}
    });
  }
  function pintarError(){const k=document.getElementById('id-avisos');if(k)k.innerHTML='<div class="id-aviso">No se pudo calcular el impacto: '+esc(S.error)+'</div>';}

  /* =========================================================
     PINTADO
     ========================================================= */
  const med=x=>S.econ?num(x.s):num(x.min);
  const fmtM=v=>S.econ?fS(v):nf(v)+' min';
  function pintar(){
    if(!viva()||!S.datos)return;
    S.vista=E().calcularVista(S.estado,S.datos,{economico:S.econ});
    const v=S.vista;
    document.getElementById('id-titulo').textContent=S.econ?'Impacto económico':'Impacto operativo';
    document.getElementById('id-sub').textContent='Paradas, velocidad reducida y mermas · '+v.per.etiqueta+(S.info&&S.info.ultimo&&S.info.modo==='jef'?' · publicado por Gerencia '+new Date(S.info.ultimo).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'');
    document.getElementById('id-reserva').innerHTML=S.econ?'':'<div class="id-reserva">Los valores económicos están reservados a Gerencia y Jefatura autorizada.</div>';
    pintarTabs();pintarFiltros();pintarChips();pintarAvisos();pintarFoco();pintarKpis();pintarTarjetas();pintarTabla();pintarValores();
    if(S.detalle)pintarDetalle();
  }
  function pintarTabs(){
    document.querySelectorAll('#impacto-dash [data-id-tab]').forEach(b=>{const on=b.getAttribute('data-id-tab')===S.tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');});
    document.querySelectorAll('#impacto-dash [data-pane]').forEach(p=>{p.hidden=p.getAttribute('data-pane')!==S.tab;});
  }

  /* ----- filtros ----- */
  const OPC=[['linea','Línea'],['marca','Marca'],['pres','Presentación'],['maquina','Máquina'],['causa','Causa'],['turno','Turno']];
  function pintarFiltros(){
    const est=S.estado,r=est.rango;
    const per=document.getElementById('id-per');
    const botones=[['hoy','Hoy'],['7','7 días'],['30','30 días'],['mes','Mes actual'],['rango','Rango']];
    const b=S.borrador||(S.borrador={modo:r.modo,desde:r.desde,hasta:r.hasta});
    const sigPer=JSON.stringify(b)+est.rango.modo;
    if(per.getAttribute('data-sig')!==sigPer){
      per.setAttribute('data-sig',sigPer);
      per.innerHTML=botones.map(([k,t])=>'<button type="button" class="id-btn'+(b.modo===k?' on':'')+'" data-id-modo="'+k+'">'+t+'</button>').join('')+
        (b.modo==='rango'?'<input type="date" data-id-fecha="desde" value="'+esc(b.desde||S.datos.per.desde)+'" aria-label="Desde"> <input type="date" data-id-fecha="hasta" value="'+esc(b.hasta||S.datos.per.hasta)+'" aria-label="Hasta">':'');
    }
    const grid=document.getElementById('id-fgrid');
    const opciones={};
    OPC.forEach(([d])=>{opciones[d]=new Set();});
    S.datos.filas.forEach(f=>OPC.forEach(([d])=>{const x=E().valorDim(f,d);if(x!=null)opciones[d].add(x);}));
    const sig=JSON.stringify(OPC.map(([d])=>[...opciones[d]].sort().concat(['|'],est.sel[d])));
    if(grid.getAttribute('data-sig')===sig)return;
    grid.setAttribute('data-sig',sig);
    grid.innerHTML=OPC.map(([d,t])=>{
      const lista=[...opciones[d]];
      est.sel[d].forEach(x=>{if(!lista.includes(x))lista.push(x);});
      if(d==='turno')lista.sort((a,b)=>E().ORDEN_TURNO.indexOf(a)-E().ORDEN_TURNO.indexOf(b));else lista.sort((a,b)=>String(a).localeCompare(String(b),'es'));
      const multi=est.sel[d].length>1;
      return '<label>'+t+'<select data-id-sel="'+d+'"><option value="">Todas</option>'+(multi?'<option value="__multi" selected disabled>Varias ('+est.sel[d].length+')</option>':'')+
        lista.map(x=>'<option value="'+esc(x)+'"'+(!multi&&est.sel[d][0]===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>';
    }).join('');
  }
  function pintarChips(){
    const ch=E().chips(S.estado);
    document.getElementById('id-chips').innerHTML=ch.length?ch.map((c,i)=>'<button type="button" class="id-chip" data-id-chip="'+i+'" aria-label="Quitar filtro '+esc(c.etq)+'">'+esc(c.etq)+' ×</button>').join('')+'<button type="button" class="id-link" data-id-limpiar-sel>Limpiar selección</button>':'';
  }

  /* ----- avisos de datos faltantes ----- */
  function pintarAvisos(){
    const v=S.vista,cont=document.getElementById('id-avisos');let h='';
    if(S.econ&&S.info&&S.info.modo==='jef'){
      if(R().estado.error)h+='<div class="id-aviso">'+esc(R().estado.error)+'</div>';
      else if(!R().estado.listo)h+='<div class="id-aviso">Cargando los resultados que publica Gerencia…</div>';
      else if(S.info.diasSinPublicar>0)h+='<div class="id-aviso">'+nf(S.info.diasSinPublicar)+' día(s) del periodo todavía no han sido publicados por Gerencia; el resultado puede estar incompleto.</div>';
    }
    if(S.econ&&v.sinValor>0){
      const tot=v.tabla.length,pct=tot?nf((tot-v.sinValor)/tot*100,1):'0';
      if(S.gerencia){
        const p=v.faltantes.productos.slice(0,5).map(x=>x.linea+' · '+x.marca+' · '+x.pres),i=v.faltantes.insumos.slice(0,5).map(x=>x.linea+' · '+x.comp);
        h+='<div class="id-aviso"><b>Hay '+nf(v.sinValor)+' evento(s) sin valor unitario configurado</b> (no se asumen S/ 0, no están en el total).'+
          (p.length?'<br>Productos: '+esc(p.join('; '))+(v.faltantes.productos.length>5?' y '+(v.faltantes.productos.length-5)+' más':''):'')+
          (i.length?'<br>Insumos: '+esc(i.join('; '))+(v.faltantes.insumos.length>5?' y '+(v.faltantes.insumos.length-5)+' más':''):'')+
          ' <button type="button" class="id-link" data-id-valores>Configurar valores →</button></div>';
      }else h+='<div class="id-aviso"><b>Cobertura de valorización: '+pct+' %.</b> '+nf(v.sinValor)+' de '+nf(tot)+' evento(s) no tienen valor configurado por Gerencia y no están incluidos en los soles.</div>';
    }
    cont.innerHTML=h;
  }
  function pintarFoco(){
    const f=AN().foco(S.vista);
    document.getElementById('id-foco').innerHTML=f?'<div class="id-foco">'+esc(f.analisis)+(f.hallazgo?' '+esc(f.hallazgo):'')+'</div>':'';
  }

  /* ----- KPI ----- */
  function semaforo(v){
    if(!S.econ||v.per.modo!=='mes')return '';
    const meta=num(R().meta());if(!(meta>0))return '<div class="id-k"><span>Meta mensual</span><b>—</b><small>Sin meta configurada: no se evalúa semáforo.</small></div>';
    const uso=v.contexto.totalSinFiltros.s/meta*100;
    const est=uso>100?['cri','Crítico']:uso>=80?['ate','Atención']:['fav','Favorable'];
    return '<div class="id-k"><span>Meta mensual ('+fS(meta)+')</span><b>'+nf(uso,1)+' %</b><span class="id-sem '+est[0]+'">'+est[1]+'</span><small>Umbrales: Atención desde 80 %, Crítico al superar la meta. Se calcula con el mes completo, sin filtros.</small></div>';
  }
  function pintarKpis(){
    const v=S.vista,t=v.kpis.total,var_=v.kpis.variacion;
    const k=(tit,val,sub,cls)=>'<div class="id-k'+(cls?' '+cls:'')+'"><span>'+tit+'</span><b>'+val+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</div>';
    const va=var_&&var_.pct!=null?'<span class="'+(var_.pct>0?'id-up':'id-down')+'">'+(var_.pct>0?'▲ ':var_.pct<0?'▼ ':'')+nf(Math.abs(var_.pct),1)+' %</span>':null;
    const vs='vs. '+(v.perPrev?esc(v.perPrev.etiqueta):'periodo anterior');
    const comp=va?va+' '+vs:(var_?'Sin base de comparación '+vs:'');
    const nota=S.econ&&v.sinValor>0?'No incluye '+nf(v.sinValor)+' evento(s) sin valor':'';
    const cards=[];
    if(S.econ)cards.push(k('Pérdida total',fS(t.s),comp+(nota?'<br>'+nota:''),'rojo'),k('Unidades perdidas',nf(t.u),''),k('Minutos perdidos',nf(t.min),'en '+nf(t.n)+' parada(s)'));
    else cards.push(k('Minutos perdidos',nf(t.min),comp,'rojo'),k('Unidades perdidas',nf(t.u),''),k('Paradas',nf(t.n),'no programadas'));
    const tl=v.kpis.topLinea,tc=v.kpis.topCausa;
    cards.push(k('Línea de mayor impacto',tl?esc(tl.k):'—',tl?fmtM(med(tl)):''),k('Principal causa',tc?esc(corto(tc.k,34)):'—',tc?fmtM(med(tc)):''));
    cards.push(k('Variación del periodo',va||'—',var_?'Se compara con el '+(v.perPrev?esc(v.perPrev.etiqueta):'periodo anterior'):'No hay datos del periodo anterior'));
    document.getElementById('id-kpis').innerHTML=cards.join('')+semaforo(v);
  }

  /* ----- gráficos ----- */
  const seleccionado=(dim,x)=>S.estado.sel[dim].includes(x);
  const hay=dim=>S.estado.sel[dim].length>0;
  const colores=(dim,etqs,hex)=>etqs.map(x=>(!dim||!hay(dim)||seleccionado(dim,x))?hex:rgba(hex,0.22));
  const bordes=(dim,etqs,hex)=>etqs.map(x=>(dim&&seleccionado(dim,x))?'#0b2a40':rgba(hex,0));
  const topN=(lista,dim,n)=>{const t=lista.slice(0,n);if(dim)lista.forEach(x=>{if(seleccionado(dim,x.k)&&!t.includes(x))t.push(x);});return t;};
  function alternar(dim,valor){if(!dim||valor==null)return;E().alternar(S.estado,dim,valor);pintar();}
  const ejeValor=()=>({beginAtZero:true,ticks:{callback:v=>S.econ?'S/ '+nf(v):nf(v)}});

  function opcionesBase(dim,horizontal,extra){
    return Object.assign({
      responsive:true,maintainAspectRatio:false,animation:false,
      interaction:{mode:'nearest',axis:horizontal?'y':'x',intersect:false},
      plugins:{legend:{display:false},tooltip:{}},
      onClick:(ev,els,ch)=>{if(!els.length||!dim)return;const e0=els[0];const lab=ch.$etqs?ch.$etqs[e0.index]:ch.data.labels[e0.index];alternar(dim,lab);}
    },extra||{});
  }
  function asegurarGrafico(id,config){
    const cv=document.getElementById('idc-'+id);
    if(!cv||typeof Chart==='undefined')return null;
    let ch=S.charts[id];
    if(!ch||ch.canvas!==cv){
      if(ch)try{ch.destroy();}catch(_){/* ya destruido */}
      ch=S.charts[id]=new Chart(cv.getContext('2d'),config);
    }else{
      ch.data=config.data;ch.options=config.options;ch.update('none');
    }
    return ch;
  }
  function graficoRanking(card,lista,{horizontal,top}){
    const dim=card.dim,datos=topN(lista,dim,top||10),etqs=datos.map(x=>x.k),hex=COLOR[card.id];
    const total=lista.reduce((a,x)=>a+med(x),0);
    const config={type:'bar',data:{labels:etqs.map(x=>corto(x,24)),datasets:[{label:S.econ?'Soles':'Minutos',data:datos.map(med),backgroundColor:colores(dim,etqs,hex),borderColor:bordes(dim,etqs,hex),borderWidth:2,borderRadius:3}]},
      options:opcionesBase(dim,horizontal,{indexAxis:horizontal?'y':'x',scales:horizontal?{x:ejeValor()}:{y:ejeValor()},plugins:{legend:{display:false},tooltip:{callbacks:{
        title:it=>etqs[it[0].dataIndex],
        label:it=>{const x=datos[it.dataIndex],p=total>0?' · '+nf(med(x)/total*100,1)+' %':'';return fmtM(med(x))+p;},
        afterLabel:it=>{const x=datos[it.dataIndex];return nf(x.u)+' unidades · '+nf(x.min)+' min'+(x.n?' · '+nf(x.n)+' evento(s)':'');}}}}})};
    const ch=asegurarGrafico(card.id,config);if(ch)ch.$etqs=etqs;
  }
  function graficoPareto(card,lista){
    const dim='causa',datos=topN(lista,dim,10),etqs=datos.map(x=>x.k),total=lista.reduce((a,x)=>a+med(x),0);
    let ac=0;const acum=lista.map(x=>{ac+=med(x);return total>0?ac/total*100:0;});
    const acumVis=datos.map(x=>acum[lista.indexOf(x)]);
    const config={type:'bar',data:{labels:etqs.map(x=>corto(x,18)),datasets:[
      {type:'bar',label:S.econ?'Soles':'Minutos',data:datos.map(med),backgroundColor:colores(dim,etqs,COLOR.causa),borderColor:bordes(dim,etqs,COLOR.causa),borderWidth:2,yAxisID:'y',order:2},
      {type:'line',label:'% acumulado',data:acumVis,borderColor:'#1d2b36',backgroundColor:'#1d2b36',pointRadius:3,tension:0.2,yAxisID:'y2',order:1}]},
      options:opcionesBase(dim,false,{scales:{y:ejeValor(),y2:{position:'right',min:0,max:100,grid:{drawOnChartArea:false},ticks:{callback:v=>v+' %'}}},plugins:{legend:{display:true,position:'bottom'},tooltip:{callbacks:{
        title:it=>etqs[it[0].dataIndex],
        label:it=>it.dataset.type==='line'?'Acumulado: '+nf(it.parsed.y,1)+' %':fmtM(med(datos[it.dataIndex]))+(total>0?' · '+nf(med(datos[it.dataIndex])/total*100,1)+' %':'')}}}})};
    const ch=asegurarGrafico(card.id,config);if(ch)ch.$etqs=etqs;
  }
  function graficoEvolucion(card,v){
    const ev=v.series.evolucion,porDia=ev.unidad==='día',etqs=ev.claves;
    const labels=etqs.map(x=>porDia?fFecha(x):x);
    const ds=[{type:'bar',label:'Actual',data:ev.valores,backgroundColor:colores(porDia?'dia':null,etqs,COLOR.evolucion),borderColor:bordes(porDia?'dia':null,etqs,COLOR.evolucion),borderWidth:2,order:3}];
    if(ev.previo&&ev.previo.some(x=>x>0))ds.push({type:'line',label:'Periodo anterior',data:ev.previo,borderColor:'#7a8a99',borderDash:[6,4],pointRadius:0,tension:0.2,order:2});
    if(ev.tendencia.ok&&ev.valores.length>=4)ds.push({type:'line',label:'Tendencia',data:ev.tendencia.puntos,borderColor:'#1d2b36',borderDash:[2,3],pointRadius:0,order:1});
    const config={type:'bar',data:{labels,datasets:ds},options:opcionesBase(null,false,{scales:{y:ejeValor()},plugins:{legend:{display:true,position:'bottom'},tooltip:{callbacks:{
      title:it=>porDia?fFecha(etqs[it[0].dataIndex]):etqs[it[0].dataIndex],label:it=>it.dataset.label+': '+fmtM(it.parsed.y)}}},
      onClick:(e,els,ch)=>{if(!els.length||!porDia)return;alternar('dia',etqs[els[0].index]);}})};
    asegurarGrafico(card.id,config);
  }
  function graficoAcumulada(card,v){
    const ac=v.series.acumulada,porDia=v.series.evolucion.unidad==='día';
    const config={type:'line',data:{labels:ac.claves.map(x=>porDia?fFecha(x):x),datasets:[{label:'Acumulado',data:ac.valores,borderColor:COLOR.acumulada,backgroundColor:rgba(COLOR.acumulada,0.15),fill:true,pointRadius:2,tension:0.15}]},
      options:opcionesBase(null,false,{scales:{y:ejeValor()},plugins:{legend:{display:false},tooltip:{callbacks:{label:it=>'Acumulado: '+fmtM(it.parsed.y)}}},onClick:()=>{}})};
    asegurarGrafico(card.id,config);
  }
  function graficoDispersion(card,v){
    const pts=v.series.scatter,hex=COLOR.scatter;
    const config={type:'scatter',data:{datasets:[{label:'Paradas',data:pts.map(p=>({x:p.x,y:p.y})),backgroundColor:pts.map(p=>(!hay('causa')||seleccionado('causa',p.fila.causa))?rgba(hex,0.75):rgba(hex,0.18)),pointRadius:5,pointHoverRadius:8}]},
      options:opcionesBase('causa',false,{scales:{x:{title:{display:true,text:'Minutos de parada'},beginAtZero:true},y:{title:{display:true,text:S.econ?'Pérdida (S/)':'Unidades perdidas'},beginAtZero:true}},
        plugins:{legend:{display:false},tooltip:{callbacks:{label:it=>{const p=pts[it.dataIndex];if(!p)return '';const f=p.fila;return [corto(f.causa,40)+(f.maquina&&f.maquina!=='Sin clasificar'?' · '+f.maquina:''),fFecha(f.fecha)+' · '+nf(f.min)+' min · '+(S.econ?fS(f.s):nf(f.u)+' und')];}}}},
        interaction:{mode:'nearest',intersect:true},
        onClick:(e,els)=>{if(!els.length)return;const p=pts[els[0].index];if(p)alternar('causa',p.fila.causa);}})};
    asegurarGrafico(card.id,config);
  }
  function pintarTarjetas(){
    const v=S.vista,unidad=S.econ?' (S/)':' (minutos)';
    CARDS.forEach(c=>{
      const t=document.getElementById('idt-'+c.id);if(t)t.textContent=c.t+(c.id==='scatter'?(S.econ?' (S/)':' (unidades)'):unidad);
      const an=document.getElementById('ida-'+c.id);
      const r=AN()[FN_ANALISIS[c.id]](v);
      if(an)an.innerHTML=htmlAn(r);
      if(c.pane!==S.tab)return;
      if(typeof Chart==='undefined'){return;}
      switch(c.id){
        case 'evolucion':graficoEvolucion(c,v);break;
        case 'linea':graficoRanking(c,v.series.linea,{horizontal:true,top:8});break;
        case 'causa':graficoPareto(c,v.series.causa);break;
        case 'turno':graficoRanking(c,v.series.turno,{horizontal:false,top:6});break;
        case 'acumulada':graficoAcumulada(c,v);break;
        case 'maquina':graficoRanking(c,v.series.maquina,{horizontal:true,top:8});break;
        case 'marca':graficoRanking(c,v.series.marca,{horizontal:true,top:8});break;
        case 'pres':graficoRanking(c,v.series.pres,{horizontal:true,top:8});break;
        case 'tipo':graficoRanking(c,v.series.tipo,{horizontal:true,top:4});break;
        case 'scatter':graficoDispersion(c,v);break;
      }
    });
    Object.keys(S.charts).forEach(id=>{const c=S.charts[id];if(c&&c.canvas&&c.canvas.offsetParent)try{c.resize();}catch(_){/* oculto */}});
  }
  function htmlAn(r){
    if(!r)return '';
    if(r.estado==='sin_datos')return '<p class="vacio">'+esc(r.analisis)+'</p>';
    return '<div class="id-an-h">Análisis automático</div><p>'+esc(r.analisis)+'</p>'+(r.hallazgo?'<p><b>Hallazgo:</b> '+esc(r.hallazgo)+'</p>':'')+(r.atencion?'<p><b>Atención:</b> '+esc(r.atencion)+'</p>':'');
  }

  /* ----- tabla de eventos de mayor impacto ----- */
  const clave={impacto:f=>S.econ?(f.s==null?-1:f.s):f.min,duracion:f=>f.min,unidades:f=>f.u};
  function filasEvento(lista){
    const g=clave[S.orden]||clave.impacto;
    return lista.slice().sort((a,b)=>g(b)-g(a)||String(a.id).localeCompare(String(b.id)));
  }
  const tipoTxt=f=>E().TIPOS[f.tipo]||f.tipo;
  function tablaEventos(lista,{limite}){
    const filas=filasEvento(lista).slice(0,limite);
    if(!filas.length)return '<div class="id-sub">No hay eventos con los filtros seleccionados.</div>';
    return '<div class="id-scroll"><table class="id-t"><thead><tr><th class="l">Fecha</th><th class="l">Hora</th><th class="l">Turno</th><th class="l">Línea</th><th class="l">Marca</th><th class="l">Presentación</th><th class="l">Máquina</th><th class="l">Causa</th><th class="l">Tipo</th><th>Min</th><th>Unid.</th>'+(S.econ?'<th>Pérdida</th>':'')+'</tr></thead><tbody>'+
      filas.map(f=>'<tr><td class="l">'+fFecha(f.fecha)+'</td><td class="l">'+esc(f.hora||'—')+'</td><td class="l">'+esc(f.turno)+'</td><td class="l">'+esc(f.linea)+'</td><td class="l">'+esc(f.marca)+'</td><td class="l">'+esc(f.pres)+'</td><td class="l">'+esc(f.tipo==='P'?(f.maquina||'Sin clasificar'):'—')+'</td><td class="l">'+esc(corto(f.causa,44))+(f.est?' <span class="id-sv" title="El motivo se dedujo del texto del registro">estimado</span>':'')+'</td><td class="l">'+esc(tipoTxt(f))+'</td><td>'+nf(f.min)+'</td><td>'+nf(f.u)+'</td>'+
        (S.econ?'<td>'+(f.s==null?'<span class="id-sv">Sin valor</span>':fS(f.s))+'</td>':'')+'</tr>').join('')+'</tbody></table></div>';
  }
  function pintarTabla(){
    const w=document.getElementById('id-tabla-wrap');if(!w)return;
    const ord=[['impacto',S.econ?'Mayor pérdida':'Mayor tiempo'],['duracion','Mayor duración'],['unidades','Mayores unidades']];
    w.innerHTML='<section class="id-card"><header><h4>Eventos de mayor impacto</h4><div style="display:flex;gap:6px;flex-wrap:wrap">'+ord.map(([k,t])=>'<button type="button" class="id-btn'+(S.orden===k?' on':'')+'" data-id-orden="'+k+'">'+t+'</button>').join('')+'</div></header>'+
      tablaEventos(S.vista.tabla,{limite:15})+'<div class="id-sub" style="margin-top:6px">Se muestran los 15 principales de '+nf(S.vista.tabla.length)+' evento(s) con los filtros actuales. «Ver detalle» de cada gráfico lista todos.</div></section>';
  }

  /* ----- pestaña Valores unitarios (solo Gerencia) ----- */
  function pintarValores(){
    const w=document.getElementById('id-valores');if(!w||!S.gerencia)return;
    const v=S.vista,f=v.faltantes;
    w.innerHTML='<section class="id-card"><header><h4>Valores unitarios</h4></header><p style="font-size:14px">Los valores unitarios (margen por producto, costo de insumos y meta mensual) solo los ven y editan Gerencia. Jefatura recibe los resultados ya calculados, sin estos valores.</p>'+
      '<p><button type="button" class="id-btn p" data-id-valores>Abrir valores unitarios</button></p>'+
      '<h4 style="margin-top:12px">Productos sin valor en el periodo</h4>'+(f.productos.length?'<ul>'+f.productos.map(x=>'<li>'+esc(x.linea+' · '+x.marca+' · '+x.pres)+'</li>').join('')+'</ul>':'<div class="id-sub">Todos los productos con actividad tienen valor.</div>')+
      '<h4 style="margin-top:12px">Insumos sin costo en el periodo</h4>'+(f.insumos.length?'<ul>'+f.insumos.map(x=>'<li>'+esc(x.linea+' · '+x.comp)+'</li>').join('')+'</ul>':'<div class="id-sub">Todas las mermas tienen costo.</div>')+'</section>';
  }

  /* =========================================================
     DETALLE POR GRÁFICO (modal, con drill-down en memoria)
     ========================================================= */
  const CADENA_A=['linea','maquina','causa','evento'],CADENA_B=['linea','marca','pres','evento'];
  function abrirDetalle(id){
    const card=CARDS.find(c=>c.id===id);if(!card)return;
    const cadena=(card.dim==='marca'||card.dim==='pres')?CADENA_B:CADENA_A;
    const ini=Math.max(0,cadena.indexOf(card.dim));
    S.detalle={id,cadena,ini,ruta:[]};
    pintarDetalle();
  }
  function pintarDetalle(){
    const d=S.detalle,m=document.getElementById('id-modal');if(!m)return;
    if(!d){m.innerHTML='';return;}
    const card=CARDS.find(c=>c.id===d.id),sel={};E().DIMS.forEach(x=>{sel[x]=[];});
    d.ruta.forEach(r=>{sel[r.dim].push(r.valor);});
    const filas=E().filtrar(S.vista.tabla,sel);
    const nivel=d.ini+d.ruta.length,dimNivel=d.cadena[nivel]||'evento';
    const mig='<div class="id-mig"><button type="button" class="id-link" data-id-mig="-1">Planta</button>'+d.ruta.map((r,i)=>' › <button type="button" class="id-link" data-id-mig="'+i+'">'+esc(r.valor)+'</button>').join('')+'</div>';
    let cuerpo;
    if(dimNivel==='evento')cuerpo=tablaEventos(filas,{limite:200});
    else{
      const g=E().agrupar(filas,dimNivel,S.econ,dimNivel==='maquina'?'P':null),total=g.reduce((a,x)=>a+med(x),0);
      cuerpo=g.length?'<div class="id-scroll"><table class="id-t"><thead><tr><th class="l">'+esc(E().ETQ_DIM[dimNivel])+'</th>'+(S.econ?'<th>Pérdida</th>':'')+'<th>Minutos</th><th>Unidades</th><th>Eventos</th><th>%</th></tr></thead><tbody>'+
        g.map(x=>'<tr data-id-fila="'+esc(x.k)+'"><td class="l">'+esc(x.k)+'</td>'+(S.econ?'<td>'+fS(x.s)+(x.sinValor?' <span class="id-sv">'+x.sinValor+' sin valor</span>':'')+'</td>':'')+'<td>'+nf(x.min)+'</td><td>'+nf(x.u)+'</td><td>'+nf(x.n)+'</td><td>'+(total>0?nf(med(x)/total*100,1)+' %':'—')+'</td></tr>').join('')+'</tbody></table></div><div class="id-sub" style="margin-top:6px">Toca una fila para bajar un nivel.</div>':'<div class="id-sub">No hay datos en este nivel.</div>';
    }
    m.innerHTML='<div class="id-modal" data-id-cerrar-fondo><div role="dialog" aria-modal="true" aria-label="Detalle de '+esc(card.t)+'"><div class="id-modal-h"><h4>Detalle · '+esc(card.t)+'</h4><div><button type="button" class="id-btn" data-id-aplicar-ruta>Usar como filtro</button> <button type="button" class="id-btn" data-id-cerrar>Cerrar</button></div></div>'+mig+cuerpo+'</div></div>';
  }
  function cerrarDetalle(){S.detalle=null;const m=document.getElementById('id-modal');if(m)m.innerHTML='';}

  /* =========================================================
     EVENTOS (delegados en el documento, una sola vez)
     ========================================================= */
  function aplicarBorrador(){
    const b=S.borrador||{};
    const r=S.estado.rango;
    r.modo=b.modo||r.modo;
    if(b.modo==='rango'){
      if(E().fechaOk(b.desde)&&E().fechaOk(b.hasta)&&b.hasta>=b.desde){r.desde=b.desde;r.hasta=b.hasta;}
      else{alert('El rango de fechas no es válido: la fecha inicial debe ser anterior o igual a la final.');return;}
    }
    document.querySelectorAll('#impacto-dash [data-id-sel]').forEach(s=>{if(s.value==='__multi')return;E().fijar(S.estado,s.getAttribute('data-id-sel'),s.value?[s.value]:[]);});
    S.borrador={modo:r.modo,desde:r.desde,hasta:r.hasta};
    document.getElementById('id-per').removeAttribute('data-sig');document.getElementById('id-fgrid').removeAttribute('data-sig');
    recargar();
  }
  document.addEventListener('click',ev=>{
    const raiz=ev.target&&ev.target.closest&&ev.target.closest('#impacto-dash');
    if(!raiz)return;
    const t=ev.target;
    const q=a=>t.closest('['+a+']');
    let x;
    if((x=q('data-id-tab'))){S.tab=x.getAttribute('data-id-tab');pintar();return;}
    if((x=q('data-id-modo'))){
      const k=x.getAttribute('data-id-modo');
      S.borrador=S.borrador||{};S.borrador.modo=k;
      if(k==='rango'&&!E().fechaOk(S.borrador.desde)){const h=A().hoyOp();S.borrador.hasta=h;S.borrador.desde=E().addDias(h,-6);}
      if(k!=='rango'){S.estado.rango={modo:k,desde:'',hasta:''};S.borrador={modo:k,desde:'',hasta:''};recargar();}
      document.getElementById('id-per').removeAttribute('data-sig');pintarFiltros();return;
    }
    if(q('data-id-aplicar')){aplicarBorrador();return;}
    if(q('data-id-limpiar-todo')){E().limpiarTodo(S.estado);S.borrador={modo:'mes',desde:'',hasta:''};document.getElementById('id-per').removeAttribute('data-sig');document.getElementById('id-fgrid').removeAttribute('data-sig');recargar();return;}
    if(q('data-id-limpiar-sel')){E().limpiarSeleccion(S.estado);document.getElementById('id-fgrid').removeAttribute('data-sig');pintar();return;}
    if((x=q('data-id-chip'))){const c=E().chips(S.estado)[Number(x.getAttribute('data-id-chip'))];if(c){E().quitar(S.estado,c.dim,c.valor);pintar();}return;}
    if((x=q('data-id-orden'))){S.orden=x.getAttribute('data-id-orden');pintarTabla();return;}
    if((x=q('data-id-detalle'))){abrirDetalle(x.getAttribute('data-id-detalle'));return;}
    if(q('data-id-valores')){if(eco()&&eco().esGerencia())eco().abrirPantalla();return;}
    if(q('data-id-excel')){if(window.glacialImpactoExcel&&S.vista)window.glacialImpactoExcel.exportar({vista:S.vista,estado:S.estado,econ:S.econ,gerencia:S.gerencia,jefatura:S.jefatura});return;}
    if(q('data-id-cerrar')||(t.hasAttribute&&t.hasAttribute('data-id-cerrar-fondo'))){cerrarDetalle();return;}
    if((x=q('data-id-mig'))){const i=Number(x.getAttribute('data-id-mig'));S.detalle.ruta=S.detalle.ruta.slice(0,i+1);pintarDetalle();return;}
    if((x=q('data-id-fila'))&&S.detalle){
      const dimN=S.detalle.cadena[S.detalle.ini+S.detalle.ruta.length];
      if(dimN&&dimN!=='evento'){S.detalle.ruta.push({dim:dimN,valor:x.getAttribute('data-id-fila')});pintarDetalle();}
      return;
    }
    if(q('data-id-aplicar-ruta')&&S.detalle){
      S.detalle.ruta.forEach(r=>{if(!S.estado.sel[r.dim].includes(r.valor))E().alternar(S.estado,r.dim,r.valor);});
      cerrarDetalle();document.getElementById('id-fgrid').removeAttribute('data-sig');pintar();return;
    }
  });
  document.addEventListener('change',ev=>{
    const t=ev.target;if(!t||!t.closest||!t.closest('#impacto-dash'))return;
    const f=t.getAttribute&&t.getAttribute('data-id-fecha');
    if(f){S.borrador=S.borrador||{};S.borrador[f]=t.value;}
  });
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&S.detalle)cerrarDetalle();});

  /* =========================================================
     ENTRADA Y TIEMPO REAL
     ========================================================= */
  function destruirGraficos(){Object.keys(S.charts).forEach(k=>{try{S.charts[k].destroy();}catch(_){/* ya destruido */}});S.charts={};}
  function render(main){
    if(!main)return;
    estilos();
    const acc=eco();
    if(!acc||!acc.accesoListo()){main.innerHTML='<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando permisos...</div></div>';return;}
    if(typeof _recordsReady!=='undefined'&&!_recordsReady){main.innerHTML='<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando datos...</div></div>';return;}
    if(!E()||!AN()||!R()){main.innerHTML='<div class="empty-state"><h4>No se pudo cargar Impacto económico</h4><p>Faltan archivos del módulo (56 a 59 de js/produccion).</p></div>';return;}
    S.gerencia=acc.esGerencia();S.jefatura=acc.esJefatura();S.econ=S.gerencia||S.jefatura;
    if(!S.estado)S.estado=E().crearEstado();
    if(S.tab==='valores'&&!S.gerencia)S.tab='resumen';
    destruirGraficos();
    S.main=main;S.vista=null;S.datos=null;S.detalle=null;S.borrador={modo:S.estado.rango.modo,desde:S.estado.rango.desde,hasta:S.estado.rango.hasta};
    main.innerHTML=esqueleto();
    recargar();
  }
  let tRep=null;
  function refrescar(){
    clearTimeout(tRep);
    tRep=setTimeout(()=>{
      try{
        if(typeof state==='undefined'||!state.user||state.currentTab!=='perdidas')return;
        const main=document.getElementById('main');
        if(!main)return;
        if(!viva()){if(/Cargando/.test(main.textContent||''))render(main);return;}
        const n=eco()?(eco().esGerencia()?'g':eco().esJefatura()?'j':'o'):'';
        if(n!==(S.gerencia?'g':S.jefatura?'j':'o')){render(main);return;}   // cambió el rol: se vuelve a armar
        recargar();
      }catch(e){console.warn('Impacto:',e&&e.message||e);}
    },400);
  }
  if(R())R().alCambiarDatos(refrescar);
  if(eco())eco().alCambiar(refrescar);
  setInterval(()=>{if(typeof state!=='undefined'&&state.user&&state.currentTab==='perdidas'&&viva()&&!S.detalle)refrescar();},60000);
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{destruirGraficos();S.estado=null;S.datos=null;S.vista=null;S.info=null;S.main=null;S.tab='resumen';S.detalle=null;});

  window.glacialImpactoDashboard={render,refrescar,estado:S,alternar,abrirDetalle};
})();
