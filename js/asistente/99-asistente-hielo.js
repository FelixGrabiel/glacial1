/* =============================================================
   ASISTENTE DE PRODUCCIÓN · PESTAÑA HIELO (25/11/2026) · docs/asistente/asistente-hielo.md
   Lo que el Asistente necesita de Hielo para el turno elegido arriba (fecha + MAÑANA/INTERMEDIO o NOCHE), por producto (Cubos, Premium, Vasos):
   · Estado de los reportes (en registro / finalizado / sin reporte), supervisor y horario.
   · Producción: bolsas (o vasos) y kilos por presentación y marca; programado vs producido.
   · Consumo de empaques: bolsas por la BOLSA USADA (Tottus envasado en bolsa Glacial gasta bolsa Glacial) + bolsas de merma.
   · Mermas (ítem, marca, cantidad) y paradas.
   · Vista previa del Excel del Reporte diario de Hielo (el mismo libro que descarga Hielo, 99-hielo-reporte-diario.js) y su descarga.
   Solo lectura: los datos son los del Reporte Hielo (97-hielo.js, glacialHieloDatos). No escribe nada.
   ============================================================= */
(function(){
  'use strict';
  const UI=()=>window.glacialAsistenteUI,H=()=>window.glacialHieloDatos,N=()=>window.glacialHieloNucleo,RD=()=>window.glacialHieloReporte;
  const PRODS=['CUBOS','PREMIUM','VASOS'];
  const num=v=>{const n=Number(String(v===undefined||v===null?'':v).replace(',','.'));return Number.isFinite(n)?n:0;};
  const texto=v=>v===undefined||v===null?'':String(v).trim();
  const r2=v=>Math.round(num(v)*100)/100;
  const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  let enganchado=false;

  /* ---------- datos ---------- */
  function asegurar(){
    const d=H();if(!d)return false;
    try{d.escuchar();}catch(_){/* sin conexión: se muestra lo que haya */}
    if(!enganchado&&typeof d.alCambiar==='function'){
      enganchado=true;
      d.alCambiar(()=>{const u=UI();if(u&&typeof state!=='undefined'&&state.currentTab==='asistente'&&u.AP.tab==='hielo'&&!document.querySelector('.ap input:focus,.ap select:focus,#modal-root .modal,.vx-fondo'))u.pintar();});
    }
    return true;
  }
  const turnosDe=b=>b==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO'];
  const productoDe=r=>N()&&typeof N().productoDe==='function'?N().productoDe(r):'CUBOS';
  function delTurno(fecha,bloque,prod){
    const d=H();if(!d)return [];
    return (d.cache.reportes||[]).filter(r=>r&&r.fecha===fecha&&turnosDe(bloque).includes(r.turno)&&productoDe(r)===prod);
  }
  function programasDe(fecha,bloque,prod){
    const d=H();if(!d)return [];
    return (d.cache.programacion||[]).filter(p=>p&&p.fecha===fecha&&turnosDe(bloque).includes(p.turno)&&productoDe(p)===prod);
  }
  /** Resumen de un producto en el turno: lo que muestra la pestaña (puro sobre la lista de reportes). */
  function resumen(rs,ps,prod){
    const n=N(),P=(n&&n.PRODUCTOS&&n.PRODUCTOS[prod])||{unidad:'bolsas',metrica:'kg'};
    const enUnidades=P.metrica==='unidades';
    const kg=p=>n?n.kgDe(p):0;
    const t=n?n.totales(rs):{porPres:{},porMarca:[],bolsas:0,paradasMin:0,merma:[]};
    const presentaciones=Object.keys(t.porPres).filter(p=>t.porPres[p]>0).sort((a,b)=>(n?n.kgNominal(b)-n.kgNominal(a):0)||a.localeCompare(b))
      .map(p=>({presentacion:p,cantidad:t.porPres[p],kg:r2(t.porPres[p]*kg(p))}));
    const kgTotal=r2(presentaciones.reduce((s,x)=>s+x.kg,0));
    // Consumo de empaques: por la bolsa (o vaso) realmente usada; las bolsas de merma se suman a la marca de la merma.
    const emp=new Map();
    rs.forEach(r=>(r.produccion||[]).forEach(p=>{const b=Math.max(0,Math.round(num(p.bolsas)));if(!b)return;
      const bolsa=texto(p.bolsa)||texto(p.marca),k=bolsa+'|'+texto(p.presentacion);
      const a=emp.get(k)||{bolsa,presentacion:texto(p.presentacion),usadas:0,merma:0,otrasMarcas:[]};a.usadas+=b;
      if(texto(p.bolsa)&&texto(p.bolsa)!==texto(p.marca)&&!a.otrasMarcas.includes(texto(p.marca)))a.otrasMarcas.push(texto(p.marca));emp.set(k,a);}));
    const mermaEmpaque=(t.merma||[]).filter(m=>/bolsa|vaso/i.test(m.item)&&String(m.unidad).toUpperCase()==='UND');
    // La merma no dice presentación: va en su propia fila de esa bolsa (no se adivina si era de 3 kg o de 1.5 kg).
    mermaEmpaque.forEach(m=>{const bolsa=texto(m.marca)||'Sin marca',k=bolsa+'|';
      const a=emp.get(k)||{bolsa,presentacion:'',usadas:0,merma:0,otrasMarcas:[]};a.merma+=num(m.cantidad);emp.set(k,a);});
    const empaques=[...emp.values()].map(a=>Object.assign(a,{total:a.usadas+a.merma})).sort((a,b)=>a.bolsa.localeCompare(b.bolsa,'es')||(n?n.kgNominal(b.presentacion)-n.kgNominal(a.presentacion):0));
    const av=n?n.avance(rs,ps):{programado:0,producido:0,cumplimiento:null};
    const estado=!rs.length?'SIN_REPORTE':rs.every(r=>r.estado==='FINALIZADO')?'FINALIZADO':'EN_REGISTRO';
    return {producto:prod,nombre:P.nombre||prod,unidad:P.unidad||'bolsas',enUnidades,estado,reportes:rs,presentaciones,kgTotal,cantidad:t.bolsas,porMarca:t.porMarca||[],
      empaques,mermas:t.merma||[],paradasMin:t.paradasMin||0,programado:av.programado,cumplimiento:av.cumplimiento,
      paradas:rs.flatMap(r=>(r.paradas||[]).filter(p=>num(p.minutos)>0).map(p=>({turno:r.turno,equipo:texto(p.equipo),motivo:texto(p.motivo),minutos:num(p.minutos),nota:texto(p.nota)}))),
      observaciones:rs.filter(r=>texto(r.observaciones)).map(r=>r.turno+': '+texto(r.observaciones))};
  }

  /* ---------- Excel (el mismo del Reporte diario de Hielo) ---------- */
  async function libro(prod){
    const u=UI(),d=H(),n=N(),rd=RD();
    if(!d||!n||!rd)throw new Error('El módulo de Hielo no está cargado.');
    const AP=u.AP,vista=AP.bloque==='NOCHE'?'NOCHE':'DIA';
    const m=rd.modelo({fecha:AP.fecha,turno:vista,producto:prod,dias:14,reportes:d.cache.reportes,cfg:d.config(prod),
      catalogo:(n.PRODUCTOS[prod]&&n.PRODUCTOS[prod].catalogo)||(typeof PRODUCTOS_HIELO!=='undefined'?PRODUCTOS_HIELO:[])});
    const ExcelJS=typeof cargarScriptExterno==='function'?await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS'):window.ExcelJS;
    if(!ExcelJS)throw new Error('No se pudo cargar la librería de Excel.');
    const imgs={};
    try{const g=rd.graficos(m);g.mapa=rd.graficoMapa(m,1200);Object.keys(g).forEach(k=>{imgs[k]={data:g[k].toDataURL('image/png').split(',')[1],w:g[k].width/2,h:g[k].height/2};});}catch(_){/* sin gráficas (p. ej. sin canvas): el libro sale igual */}
    const nombre='Reporte-diario-Hielo'+(prod==='CUBOS'?'':'-'+prod.toLowerCase())+'-'+AP.fecha+(vista==='NOCHE'?'-noche':'-dia')+'.xlsx';
    return {wb:rd.construirExcel(ExcelJS,m,imgs),m,nombre,vista};
  }
  async function bajar(wb,nombre){
    const buf=await wb.xlsx.writeBuffer(),blob=new Blob([buf],{type:XLSX_MIME});
    if(typeof window.descargarArchivo==='function'){window.descargarArchivo(blob,nombre);return;}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  }
  window.apHieloVista=async prod=>{
    try{
      const {wb,m,nombre,vista}=await libro(prod);
      if(!window.glacialVistaExcel){await bajar(wb,nombre);return;}
      window.glacialVistaExcel.abrir(wb,{titulo:'Reporte diario de Hielo · '+m.subtitulo+' · '+(vista==='NOCHE'?'turno noche ':'turno día ')+UI().AP.fecha.split('-').reverse().join('/'),nombre,
        notas:'El mismo Excel que descarga el módulo Hielo (Reporte diario).',alDescargar:()=>bajar(wb,nombre)});
    }catch(e){alert('No se pudo abrir la vista previa: '+((e&&e.message)||e));}
  };
  window.apHieloExcel=async prod=>{try{const {wb,nombre}=await libro(prod);await bajar(wb,nombre);}catch(e){alert('No se pudo generar el Excel: '+((e&&e.message)||e));}};
  window.apHieloIr=()=>{if(typeof window.goReporteHielo==='function')window.goReporteHielo('CUBOS');};

  /* ---------- pantalla ---------- */
  const EST={FINALIZADO:['Finalizado','verde'],EN_REGISTRO:['En registro','ambar'],SIN_REPORTE:['Sin reporte','gris']};
  function html(){
    const u=UI();if(!u)return '';
    const {esc,fmt,tarjeta,tabla,pill,pie,vacio,kpi,AP}=u;
    if(!asegurar())return pie('El módulo de Hielo no está disponible en esta versión.','aviso');
    const d=H();
    if(!d.cache.listo.reportes)return tarjeta('Hielo',vacio('Cargando los reportes de Hielo…'));
    const res=PRODS.map(p=>resumen(delTurno(AP.fecha,AP.bloque,p),programasDe(AP.fecha,AP.bloque,p),p));
    const con=res.filter(x=>x.reportes.length);
    const cubos=res[0];
    const k=kpi?(kpi('cajas','azul','Hielo en cubos',fmt(cubos.kgTotal)+' <em>kg</em>',fmt(cubos.cantidad)+' bolsas'+(cubos.cumplimiento!==null?' · '+Math.round(cubos.cumplimiento*100)+' % del programado':''))+
      kpi('cajas','celeste','Premium',fmt(res[1].kgTotal)+' <em>kg</em>',fmt(res[1].cantidad)+' bolsas')+kpi('cajas','verde','Vasos',fmt(res[2].cantidad)+' <em>vasos</em>','≈ '+fmt(res[2].kgTotal)+' kg')+
      kpi('alerta','naranja','Mermas de Hielo',res.reduce((s,x)=>s+x.mermas.length,0)+' <em>registros</em>',res.reduce((s,x)=>s+x.paradasMin,0)+' min de paradas')):'';
    const turnoTxt=AP.bloque==='NOCHE'?'Turno noche':'Mañana + Intermedio';
    const bloques=res.map(x=>{
      const unidad=x.unidad,U=unidad.charAt(0).toUpperCase()+unidad.slice(1);
      const acciones=`<span class="ap-acc-in"><button type="button" class="ap-btn ap-btn-s" onclick="apHieloVista('${x.producto}')" ${x.reportes.length?'':'disabled'}>Vista previa Excel</button><button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apHieloExcel('${x.producto}')" ${x.reportes.length?'':'disabled'}>Descargar Excel</button></span>`;
      if(!x.reportes.length)return tarjeta(esc(x.nombre)+' '+pill('Sin reporte','gris'),vacio('No hay reporte de '+x.nombre.toLowerCase()+' en este turno.'),{icono:'cajas',accion:acciones});
      const rep=x.reportes.map(r=>`<tr><td data-label="Turno"><b>${esc(r.turno)}</b></td><td data-label="Estado">${pill(EST[r.estado==='FINALIZADO'?'FINALIZADO':'EN_REGISTRO'][0],EST[r.estado==='FINALIZADO'?'FINALIZADO':'EN_REGISTRO'][1])}</td>
        <td data-label="Supervisor">${esc(r.supervisor||'—')}</td><td data-label="Horario">${esc((r.horaInicio||'—')+' – '+(r.horaFin||'—'))}</td><td data-label="Personas" class="ap-num">${r.personas?fmt(r.personas):'—'}</td></tr>`).join('');
      const pres=x.presentaciones.map(p=>`<tr><td data-label="Presentación"><b>${esc(p.presentacion)}</b></td><td data-label="${U}" class="ap-num">${fmt(p.cantidad)}</td><td data-label="Kg" class="ap-num">${fmt(p.kg)}</td></tr>`).join('')+
        `<tr><td><b>Total</b></td><td class="ap-num"><b>${fmt(x.cantidad)}</b></td><td class="ap-num"><b>${fmt(x.kgTotal)}</b></td></tr>`;
      const marcas=x.porMarca.filter(m=>m.bolsas>0).map(m=>`<tr><td data-label="Marca">${esc(m.marca)}</td><td data-label="Presentación">${esc(m.presentacion)}</td><td data-label="${U}" class="ap-num">${fmt(m.bolsas)}</td></tr>`).join('');
      const emp=x.empaques.map(e=>`<tr><td data-label="${x.producto==='VASOS'?'Vaso':'Bolsa'}"><b>${esc(e.bolsa)}</b>${e.otrasMarcas.length?`<small class="ap-mut ap-blk">también para ${esc(e.otrasMarcas.join(', '))}</small>`:''}</td><td data-label="Presentación">${e.presentacion?esc(e.presentacion):'<small class="ap-mut">merma (sin presentación)</small>'}</td>
        <td data-label="En producto" class="ap-num">${fmt(e.usadas)}</td><td data-label="Merma" class="ap-num">${e.merma?fmt(e.merma):'—'}</td><td data-label="Total usadas" class="ap-num"><b>${fmt(e.total)}</b></td></tr>`).join('');
      const mer=x.mermas.length?tabla(['Ítem','Marca','#Cantidad'],x.mermas.map(m=>`<tr><td data-label="Ítem">${esc(m.item)}</td><td data-label="Marca">${esc(m.marca||'—')}</td><td data-label="Cantidad" class="ap-num">${fmt(m.cantidad)} ${esc(m.unidad)}</td></tr>`).join('')):vacio('Sin merma registrada.');
      const par=x.paradas.length?tabla(['Turno','Equipo / motivo','#Min'],x.paradas.map(p=>`<tr><td data-label="Turno">${esc(p.turno)}</td><td data-label="Equipo / motivo">${esc([p.equipo,p.motivo].filter(Boolean).join(' – '))}${p.nota?`<small class="ap-mut ap-blk">${esc(p.nota)}</small>`:''}</td><td data-label="Min" class="ap-num">${fmt(p.minutos)}</td></tr>`).join('')):vacio('Sin paradas.');
      return tarjeta(esc(x.nombre)+' '+pill(EST[x.estado][0],EST[x.estado][1]),
        tabla(['Turno','Estado','Supervisor','Horario','#Personas'],rep)+
        `<div class="ap-grid-2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px;margin-top:12px">
          <div><h4 class="ap-h4-obs">Producción</h4>${tabla(['Presentación','#'+U,'#Kg'],pres)}${x.programado>0?`<small class="ap-mut">Programado: ${fmt(x.programado)} ${esc(unidad)} · cumplimiento ${Math.round(num(x.cumplimiento)*100)} %</small>`:''}</div>
          <div><h4 class="ap-h4-obs">Por marca</h4>${tabla(['Marca','Presentación','#'+U],marcas)}</div>
          <div><h4 class="ap-h4-obs">Consumo de ${x.producto==='VASOS'?'vasos':'bolsas'} (por ${x.producto==='VASOS'?'vaso':'bolsa'} usada)</h4>${tabla([x.producto==='VASOS'?'Vaso':'Bolsa','Presentación','#En producto','#Merma','#Total usadas'],emp)}</div>
          <div><h4 class="ap-h4-obs">Mermas</h4>${mer}<h4 class="ap-h4-obs">Paradas</h4>${par}</div></div>`+
        (x.observaciones.length?pie('Observaciones: '+esc(x.observaciones.join(' · '))):''),{icono:'cajas',accion:acciones});
    }).join('');
    return `<div class="ap-tit-acc"><h2 class="ap-h2">Hielo · ${esc(turnoTxt)}</h2><button type="button" class="ap-btn ap-btn-o" onclick="apHieloIr()">Abrir Reporte Hielo</button></div>
      ${k?`<div class="ap-kpis ap-kpis-4">${k}</div>`:''}
      ${!con.length?pie('No hay reportes de Hielo en este turno. Cambia la fecha o el turno arriba.','aviso'):''}
      ${bloques}
      ${pie('Solo lectura: los datos vienen del Reporte Hielo. El consumo de bolsas cuenta la bolsa realmente usada (si una marca se envasó en otra bolsa) más las bolsas de merma. Los kilos usan el peso real de cada bolsa (Configuración de Hielo).')}`;
  }

  const API={html,resumen,libro,asegurar,delTurno};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof window!=='undefined')window.glacialAsistenteHielo=API;
})();
