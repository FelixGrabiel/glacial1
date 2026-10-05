/* =============================================================
   IMPACTO ECONÓMICO · VISTAS PARA JEFATURA Y PARA LOS DEMÁS USUARIOS (Etapa 3)

   Gerencia ve la pantalla completa (50-impacto-economico.js). Aquí están las otras dos:
     · JEFATURA (Jefe de Producción, Jefe de Operaciones, Jefatura): resultados en S/ y la parte operativa. NUNCA recibe un valor
       unitario: su navegador no lee valoresUnitarios (permission-denied); lee solo resultadosEconomicos, que ya traen los soles
       calculados y agregados (por día, línea, motivo, turno y componente de merma), sin valores unitarios ni detalle por producto.
     · LOS DEMÁS (Administrador, supervisores…): solo la parte operativa (unidades, minutos, cantidad de paradas, rankings y
       gráficos), sin ninguna cifra económica.

   ARQUITECTURA (sin backend): el navegador de Gerencia, que es el único que tiene los valores, calcula los soles con el mismo motor
   de 50-impacto-economico.js y los publica en resultadosEconomicos/{AAAA-MM-DD} (más resultadosEconomicos/meta). Las reglas de
   Firestore dejan escribir solo a Gerencia y leer a Gerencia y Jefatura. Límite: si ningún dispositivo de Gerencia está abierto, los
   resultados de Jefatura se quedan en la última publicación (la pantalla muestra «actualizado a las…»). Con Cloud Functions (plan Blaze)
   este cálculo pasaría al servidor.
   Para que Jefatura no deduzca el valor unitario dividiendo soles entre unidades, la parte económica NO muestra unidades ni minutos junto a
   los soles, y los soles publicados son agregados (nunca por producto).
   Cargar después de 55-valores-economicos.js.
   ============================================================= */
(function(){
  'use strict';

  const COL='resultadosEconomicos';
  const A=()=>window.glacialReporteIndicadores;
  const eco=()=>window.glacialEconomico;
  const IE=()=>window.glacialImpactoEconomico;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtN=n=>Math.round(num(n)).toLocaleString('es-PE');
  const fmtS=n=>'S/ '+num(n).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtP=n=>n==null?'—':num(n).toLocaleString('es-PE',{minimumFractionDigits:1,maximumFractionDigits:1})+' %';
  const fmtFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):String(f||'');
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const r2=n=>Math.round(num(n)*100)/100;
  const NOMBRES_LINEA={PET1:'PET 1',PET2:'PET 2',B7L:'Bidones 7 L',C20L:'Cajas 20 L',B20L:'Bidones 20 L',B10L:'Bidones 10 L'};
  const nombreLinea=k=>NOMBRES_LINEA[k]||A().nombreLinea(k);
  const lineaReal=p=>(IE()&&IE().lineaReal)?IE().lineaReal(p):p.linea;

  /* =========================================================
     1) PUBLICACIÓN (solo el navegador de Gerencia)
     ========================================================= */
  const hashes=new Map();
  let ultimaCompleta=0,publicando=false,temporizador=null,cierreResultados=null;
  const resumenDia=(fecha,res)=>({
    fecha,v:1,
    totales:{paradasS:r2(res.paradasS),velS:r2(res.velS),mermaS:r2(res.mermaS),total:r2(res.total),incumplS:r2(res.incumplS)},
    porLinea:res.porLinea.map(f=>({k:f.clave,s:r2(f.soles)})),
    porMotivo:res.porMotivo.map(f=>({k:f.etiqueta,s:r2(f.soles)})),
    porTurno:res.porTurno.map(f=>({k:f.clave,s:r2(f.soles)})),
    mermaComp:res.mermaComp.map(m=>({k:m.comp,s:r2(m.soles)})),
    faltan:{productos:res.faltan.margen.length,insumos:res.faltan.costo.length,velocidades:res.faltan.velocidad.length}
  });
  const dias=(desde,hasta)=>{const o=[];for(let d=desde;d<=hasta;d=A().addDias(d,1))o.push(d);return o;};
  async function publicar(completa){
    if(publicando)return;
    try{
      if(!eco()||!eco().esGerencia()||!eco().listo()||!IE()||typeof _recordsReady==='undefined'||!_recordsReady||typeof db==='undefined')return;
      const uid=(typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid)||'';
      if(!uid)return;
      publicando=true;
      const hoy=A().hoyOp();
      const primero=hoy.slice(0,8)+'01';
      const d=new Date(Number(hoy.slice(0,4)),Number(hoy.slice(5,7))-2,1);
      const desde=completa?(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01'):A().addDias(hoy,-1);
      const prov=IE().provDefecto();
      const escrituras=[];
      dias(desde<primero&&!completa?primero:desde,hoy).forEach(f=>{
        const rec=A().recolectar(f,f,{linea:'',motivosSistema:true});
        const doc=resumenDia(f,IE().calcularImpacto(rec.partes,prov));
        const h=JSON.stringify(doc);
        if(hashes.get(f)!==h)escrituras.push([f,doc,h]);
      });
      const meta=num((eco().docs().general||{}).metaPerdidaMes);
      const hm='meta:'+meta;
      if(hashes.get('meta')!==hm)escrituras.push(['meta',{fecha:'9999-12-31',v:1,metaPerdidaMes:meta},hm]);
      for(const [id,doc,h] of escrituras){
        await db.collection(COL).doc(id).set(Object.assign({},doc,{generadoPorUid:uid,generadoEn:firebase.firestore.FieldValue.serverTimestamp()}));
        hashes.set(id,h);
      }
      if(completa)ultimaCompleta=ahoraMs();
    }catch(e){console.warn('Resultados económicos: no se pudieron publicar:',e&&e.message||e);}
    finally{publicando=false;}
  }
  const programar=()=>{
    if(temporizador)return;
    publicar(true);
    temporizador=setInterval(()=>{publicar(ahoraMs()-ultimaCompleta>3600000);},60000);
  };
  const detenerPublicacion=()=>{if(temporizador)clearInterval(temporizador);temporizador=null;hashes.clear();ultimaCompleta=0;};

  /* =========================================================
     2) LECTURA (solo el navegador de Jefatura)
     ========================================================= */
  const RES={dias:new Map(),meta:0,listo:false,error:'',ultimo:0};
  function cerrarResultados(){
    if(cierreResultados){try{cierreResultados();}catch(_){/* ya cerrada */}}
    cierreResultados=null;RES.dias.clear();RES.meta=0;RES.listo=false;RES.error='';RES.ultimo=0;
  }
  function abrirResultados(){
    if(cierreResultados||typeof db==='undefined')return;
    cierreResultados=db.collection(COL).orderBy('fecha','desc').limit(150).onSnapshot(snap=>{
      RES.dias.clear();
      snap.docs.forEach(d=>{
        const x=d.data();
        if(d.id==='meta'){RES.meta=num(x.metaPerdidaMes);return;}
        RES.dias.set(d.id,x);
        const ms=x.generadoEn&&x.generadoEn.toMillis?x.generadoEn.toMillis():0;
        if(ms>RES.ultimo)RES.ultimo=ms;
      });
      RES.listo=true;RES.error='';repintar();
    },e=>{RES.error='No se pudieron leer los resultados económicos: '+((e&&e.message)||e);RES.listo=true;repintar();});
  }
  function alCambiarNivel(){
    const n=eco()?eco().nivel():null;
    if(n==='gerencia'){cerrarResultados();programar();}
    else if(n==='jefatura'){detenerPublicacion();abrirResultados();}
    else{detenerPublicacion();cerrarResultados();}
    repintar();
  }
  let nivelPrevio=null;
  if(eco())eco().alCambiar(()=>{
    const n=eco().nivel();
    if(n==='gerencia'&&eco().listo())publicar(true);       // llegó un valor nuevo: se recalcula y se publica
    if(nivelPrevio!==n){nivelPrevio=n;alCambiarNivel();}
  });
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detenerPublicacion();cerrarResultados();nivelPrevio=null;});

  /* =========================================================
     3) PARTE OPERATIVA (sin ninguna cifra económica)
     ========================================================= */
  function calcularOperativo(partes){
    const T={potencialU:0,paradasU:0,velU:0,planMin:0,npMin:0,horasEf:0,nParadas:0};
    const porMotivo=new Map(),porLinea=new Map(),porTurno=new Map(),faltaVel=new Map();
    const suma=(m,k,etq,min,und,n,est)=>{const o=m.get(k)||{k,etq,min:0,und:0,n:0,estMin:0};o.min+=min;o.und+=und;o.n+=n;if(est)o.estMin+=min;m.set(k,o);};
    partes.forEach(p=>{
      const actividad=p.producido>0||p.npMin>0||p.programado>0||p.planMin>0;
      if(!actividad)return;
      if(!(p.vel>0)){if(p.planMin>0||p.availMin>0||p.producido>0)faltaVel.set(p.linea+'|'+p.pkey,nombreLinea(lineaReal(p))+' · '+A().etiquetaProd(p.marca,p.pres));return;}
      if(!(p.planMin>0||p.availMin>0))return;
      const hEf=p.availMin/60;
      T.potencialU+=p.planMin/60*p.vel;
      T.paradasU+=p.npMin/60*p.vel;
      T.velU+=Math.max(p.vel*hEf-p.producido,0);
      T.planMin+=p.planMin;T.npMin+=p.npMin;T.horasEf+=hEf;
      let items=(p.paradas||[]).filter(i=>num(i.minutos)>0);
      const tot=items.reduce((s,i)=>s+num(i.minutos),0);
      if(p.npMin>0){
        items=tot>0?items.map(i=>({motivo:i.motivo,minutos:num(i.minutos)*p.npMin/tot,estimada:!!i.estimada})):[{motivo:'Sin motivo',minutos:p.npMin,estimada:true}];
        items.forEach(i=>{
          const und=i.minutos/60*p.vel,mot=i.motivo||'Sin motivo';
          T.nParadas++;
          suma(porMotivo,mot,mot,i.minutos,und,1,i.estimada);
          suma(porLinea,lineaReal(p),nombreLinea(lineaReal(p)),i.minutos,und,1,i.estimada);
          suma(porTurno,p.grupo,A().etiquetaGrupo(p.grupo),i.minutos,und,1,i.estimada);
        });
      }
    });
    const orden=m=>[...m.values()].sort((a,b)=>b.min-a.min);
    return {T,porMotivo:orden(porMotivo),porLinea:orden(porLinea),porTurno:orden(porTurno),faltaVel:[...faltaVel.values()]};
  }

  /* =========================================================
     4) ESTADO, PERIODO Y PANTALLA
     ========================================================= */
  const G={modo:'mes',desde:'',hasta:'',linea:'',turno:'',pareto:'motivo'};
  function periodo(){
    const hoy=A().hoyOp();
    if(G.modo==='hoy')return {desde:hoy,hasta:hoy,etiqueta:'hoy '+fmtFecha(hoy)};
    if(G.modo==='7')return {desde:A().addDias(hoy,-6),hasta:hoy,etiqueta:'últimos 7 días'};
    if(G.modo==='30')return {desde:A().addDias(hoy,-29),hasta:hoy,etiqueta:'últimos 30 días'};
    if(G.modo==='rango'&&A().fechaOk(G.desde)&&A().fechaOk(G.hasta)&&G.hasta>=G.desde)return {desde:G.desde,hasta:G.hasta,etiqueta:'del '+fmtFecha(G.desde)+' al '+fmtFecha(G.hasta)};
    return {desde:hoy.slice(0,8)+'01',hasta:hoy,etiqueta:'mes en curso'};
  }
  /* Suma de los resultados diarios publicados dentro de un rango. */
  function sumarResultados(desde,hasta){
    const o={total:0,paradasS:0,velS:0,mermaS:0,incumplS:0,porLinea:new Map(),porMotivo:new Map(),porTurno:new Map(),mermaComp:new Map(),faltan:{productos:0,insumos:0,velocidades:0},dias:0};
    const add=(m,k,s,etq)=>{const x=m.get(k)||{k,etq:etq||k,s:0};x.s+=num(s);m.set(k,x);};
    RES.dias.forEach((x,f)=>{
      if(f<desde||f>hasta)return;
      o.dias++;
      const t=x.totales||{};o.total+=num(t.total);o.paradasS+=num(t.paradasS);o.velS+=num(t.velS);o.mermaS+=num(t.mermaS);o.incumplS+=num(t.incumplS);
      (x.porLinea||[]).forEach(e=>{if(!G.linea||e.k===G.linea)add(o.porLinea,e.k,e.s,nombreLinea(e.k));});
      (x.porMotivo||[]).forEach(e=>add(o.porMotivo,e.k,e.s));
      (x.porTurno||[]).forEach(e=>add(o.porTurno,e.k,e.s,A().etiquetaGrupo(e.k)));
      (x.mermaComp||[]).forEach(e=>add(o.mermaComp,e.k,e.s));
      ['productos','insumos','velocidades'].forEach(k=>{o.faltan[k]=Math.max(o.faltan[k],num((x.faltan||{})[k]));});
    });
    const ord=m=>[...m.values()].sort((a,b)=>b.s-a.s);
    o.listas={motivo:ord(o.porMotivo),linea:ord(o.porLinea),turno:ord(o.porTurno)};o.merma=ord(o.mermaComp);
    return o;
  }
  const barra=(v,max)=>'<span class="ir-bar" style="width:'+Math.max(2,max>0?Math.round(v/max*100):0)+'%"></span>';

  const CSS=`
    .ir{max-width:1100px;margin:0 auto;padding:4px 2px 24px}
    .ir h2{margin:0;color:#003b5c}.ir h4{margin:0 0 8px;color:#003b5c}
    .ir-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px}
    .ir-sub{font-size:12px;color:#5a6b78}
    .ir-barra{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
    .ir-btn{border:1px solid #cfdbe3;background:#fff;border-radius:8px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;min-height:38px}
    .ir-btn.on{background:#003b5c;border-color:#003b5c;color:#fff}
    .ir input,.ir select{padding:8px;border:1px solid #cfdbe3;border-radius:7px;font:inherit;min-height:38px}
    .ir-aviso{background:#fff4d6;border:1px solid #ecd48b;border-radius:10px;padding:12px 14px;margin:10px 0;color:#6d5410}
    .ir-reserva{background:#eef3f7;border:1px solid #d3dfe8;border-radius:10px;padding:12px 14px;margin:10px 0;color:#3d5365}
    .ir-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:10px 0}
    .ir-k{background:#fff;border:1px solid #dce3e8;border-radius:10px;padding:12px}
    .ir-k span{display:block;font-size:12px;color:#5a6b78}.ir-k b{display:block;font-size:22px;color:#003b5c;margin-top:2px}.ir-k small{color:#5a6b78}
    .ir-k.rojo b{color:#b3382b}
    .ir-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}
    .ir-box{background:#fff;border:1px solid #dce3e8;border-radius:10px;padding:12px;min-width:0}
    .ir-t{width:100%;border-collapse:collapse;font-size:13px}
    .ir-t th{text-align:right;padding:6px 8px;background:#eef3f7;color:#3d5365;font-size:12px}.ir-t th:first-child,.ir-t td:first-child{text-align:left}
    .ir-t td{padding:6px 8px;border-bottom:1px solid #edf1f4;text-align:right;font-variant-numeric:tabular-nums}
    .ir-scroll{overflow-x:auto}
    .ir-bar{display:inline-block;height:9px;border-radius:3px;background:#2d7fc0;vertical-align:middle;max-width:100%}
    .ir-bar.s{background:#b3382b}
    .ir-celda-barra{width:34%;min-width:80px;text-align:left!important}
    .ir-est{display:inline-block;margin-left:6px;padding:0 6px;border-radius:8px;background:#fff1d6;color:#8a5a1e;font-size:10px}
    .ir-prog{height:12px;border-radius:6px;background:#eef1f4;position:relative;overflow:hidden;margin:8px 0}
    .ir-prog i{position:absolute;left:0;top:0;bottom:0;background:#2e8b57}.ir-prog.alerta i{background:#d89216}.ir-prog.excede i{background:#b3382b}
    @media(max-width:640px){.ir-grid{grid-template-columns:1fr}.ir-kpis{grid-template-columns:1fr 1fr}.ir-k b{font-size:18px}.ir-celda-barra{display:none}}
  `;
  const estilos=()=>{if(document.getElementById('ir-css'))return;const s=document.createElement('style');s.id='ir-css';s.textContent=CSS;document.head.appendChild(s);};

  function htmlControles(nivel){
    const per=periodo();
    const botones=[['hoy','Día'],['7','Semana'],['mes','Mes'],['rango','Rango']];
    const lineas=(typeof LINES!=='undefined'?LINES:[]);
    return '<div class="ir-barra">'+botones.map(([k,t])=>'<button type="button" class="ir-btn'+(G.modo===k?' on':'')+'" data-ir-modo="'+k+'">'+t+'</button>').join('')+
      (G.modo==='rango'?'<input type="date" data-ir-fecha="desde" value="'+esc(per.desde)+'"> <input type="date" data-ir-fecha="hasta" value="'+esc(per.hasta)+'">':'')+
      '<select data-ir-f="linea" aria-label="Línea"><option value="">Todas las líneas</option>'+lineas.map(l=>'<option value="'+esc(l.key)+'"'+(G.linea===l.key?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select>'+
      '<span style="flex:1"></span><button type="button" class="ir-btn" data-ir-excel>Excel ↓</button></div>';
  }
  function tablaOperativa(titulo,filas,etq){
    if(!filas.length)return '<div class="ir-box"><h4>'+titulo+'</h4><div class="ir-sub">Sin paradas no programadas en el periodo.</div></div>';
    const max=filas[0].min||1;
    return '<div class="ir-box"><h4>'+titulo+'</h4><div class="ir-scroll"><table class="ir-t"><thead><tr><th>'+etq+'</th><th>Minutos</th><th>Unidades</th><th>Paradas</th><th></th></tr></thead><tbody>'+
      filas.slice(0,12).map(f=>'<tr><td>'+esc(f.etq)+(f.estMin>0?'<span class="ir-est" title="El motivo se dedujo del texto del registro">estimado</span>':'')+'</td><td>'+fmtN(f.min)+'</td><td>'+fmtN(f.und)+'</td><td>'+fmtN(f.n)+'</td><td class="ir-celda-barra">'+barra(f.min,max)+'</td></tr>').join('')+'</tbody></table></div></div>';
  }
  function htmlOperativo(op,per){
    const T=op.T;
    const alertas=op.faltaVel.length?'<div class="ir-aviso"><b>Falta la velocidad estándar</b> de: '+esc(op.faltaVel.slice(0,6).join(', '))+(op.faltaVel.length>6?' y '+(op.faltaVel.length-6)+' más':'')+'. No se calcula su pérdida de producción.</div>':'';
    return alertas+'<div class="ir-kpis">'+
      '<div class="ir-k"><span>Minutos perdidos por paradas no programadas</span><b>'+fmtN(T.npMin)+'</b><small>de '+fmtN(T.planMin)+' min planificados</small></div>'+
      '<div class="ir-k"><span>Unidades perdidas por paradas</span><b>'+fmtN(T.paradasU)+'</b><small>producción potencial '+fmtN(T.potencialU)+'</small></div>'+
      '<div class="ir-k"><span>Unidades perdidas por velocidad reducida</span><b>'+fmtN(T.velU)+'</b><small>por debajo de la velocidad estándar</small></div>'+
      '<div class="ir-k"><span>Cantidad de paradas</span><b>'+fmtN(T.nParadas)+'</b><small>'+esc(per.etiqueta)+'</small></div></div>'+
      '<div class="ir-grid">'+tablaOperativa('Ranking por motivo de parada',op.porMotivo,'Motivo')+tablaOperativa('Ranking por línea',op.porLinea,'Línea')+tablaOperativa('Por turno',op.porTurno,'Turno')+'</div>';
  }
  function htmlEconomico(per){
    if(!RES.listo)return '<div class="ir-box"><div class="ir-sub">Cargando resultados económicos...</div></div>';
    if(RES.error)return '<div class="ir-aviso">'+esc(RES.error)+'</div>';
    const S=sumarResultados(per.desde,per.hasta);
    const hoy=A().hoyOp(),ini=hoy.slice(0,8)+'01',dia=Number(hoy.slice(8,10)),diasMes=new Date(Number(hoy.slice(0,4)),Number(hoy.slice(5,7)),0).getDate();
    const mes=sumarResultados(ini,hoy);
    const pm=new Date(Number(hoy.slice(0,4)),Number(hoy.slice(5,7))-2,1);
    const pIni=pm.getFullYear()+'-'+String(pm.getMonth()+1).padStart(2,'0')+'-01',pFin=pIni.slice(0,8)+String(new Date(pm.getFullYear(),pm.getMonth()+1,0).getDate()).padStart(2,'0');
    const mesPrev=sumarResultados(pIni,pFin);
    const proy=dia>0?mes.total/dia*diasMes:0,meta=RES.meta,uso=meta>0?mes.total/meta*100:null,sobre=meta>0&&proy>meta;
    const act=RES.ultimo?new Date(RES.ultimo).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
    const falta=Math.max(S.faltan.productos,S.faltan.insumos)>0?'<div class="ir-aviso"><b>Resultado parcial:</b> hay productos o insumos sin valor unitario configurado, así que su pérdida no está incluida (no se asume cero).</div>':'';
    const lista=S.listas[G.pareto]||S.listas.motivo;
    const tabs=[['motivo','Por motivo'],['linea','Por línea'],['turno','Por turno']];
    const max=(lista[0]&&lista[0].s)||1;
    return '<div class="ir-sub" style="margin:6px 0">Resultados publicados por Gerencia · actualizado '+esc(act)+'</div>'+falta+
      '<div class="ir-kpis"><div class="ir-k rojo"><span>Pérdida total del periodo</span><b>'+fmtS(S.total)+'</b><small>'+esc(per.etiqueta)+'</small></div>'+
      '<div class="ir-k rojo"><span>Pérdida total del mes</span><b>'+fmtS(mes.total)+'</b><small>'+(meta>0?'Meta máxima '+fmtS(meta)+' · '+fmtP(uso):'Sin meta máxima configurada')+'</small></div>'+
      '<div class="ir-k"><span>Proyección a fin de mes</span><b>'+fmtS(proy)+'</b><small>'+(meta>0?(sobre?'Supera la meta en '+fmtS(proy-meta):'Dentro de la meta'):'—')+'</small></div>'+
      '<div class="ir-k"><span>Mes anterior</span><b>'+fmtS(mesPrev.total)+'</b><small>'+(mesPrev.dias?mesPrev.dias+' días publicados':'Sin datos publicados')+'</small></div></div>'+
      (meta>0?'<div class="ir-prog '+(sobre?'excede':(uso>=80?'alerta':''))+'" title="Acumulado frente a la meta"><i style="width:'+Math.min(100,uso)+'%"></i></div>':'')+
      '<div class="ir-grid"><div class="ir-box"><h4>Cascada de pérdidas (S/)</h4><table class="ir-t"><tbody>'+
        '<tr><td>Paradas no programadas</td><td>'+fmtS(S.paradasS)+'</td></tr><tr><td>Velocidad reducida</td><td>'+fmtS(S.velS)+'</td></tr><tr><td>Mermas</td><td>'+fmtS(S.mermaS)+'</td></tr>'+
        '<tr><td><b>Pérdida total</b></td><td><b>'+fmtS(S.total)+'</b></td></tr><tr><td style="color:#5a6b78">Incumplimiento del plan (no se suma)</td><td style="color:#5a6b78">'+fmtS(S.incumplS)+'</td></tr></tbody></table></div>'+
      '<div class="ir-box"><h4>Ranking económico</h4><div class="ir-barra" style="margin:0 0 6px">'+tabs.map(([k,t])=>'<button type="button" class="ir-btn'+(G.pareto===k?' on':'')+'" data-ir-pareto="'+k+'">'+t+'</button>').join('')+'</div>'+
        (lista.length?'<div class="ir-scroll"><table class="ir-t"><thead><tr><th>'+(tabs.find(t=>t[0]===G.pareto)||tabs[0])[1].replace('Por ','')+'</th><th>Soles</th><th></th></tr></thead><tbody>'+lista.slice(0,12).map(f=>'<tr><td>'+esc(f.etq)+'</td><td>'+fmtS(f.s)+'</td><td class="ir-celda-barra">'+'<span class="ir-bar s" style="width:'+Math.max(2,Math.round(f.s/max*100))+'%"></span></td></tr>').join('')+'</tbody></table></div>':'<div class="ir-sub">Sin pérdidas valorizadas en el periodo.</div>')+'</div>'+
      '<div class="ir-box"><h4>Mermas por componente (S/)</h4>'+(S.merma.length?'<table class="ir-t"><tbody>'+S.merma.map(m=>'<tr><td>'+esc(m.etq)+'</td><td>'+fmtS(m.s)+'</td></tr>').join('')+'</tbody></table>':'<div class="ir-sub">Sin mermas valorizadas en el periodo.</div>')+'</div></div>';
  }

  let ultimoRender={nivel:null,per:null,op:null,S:null};
  function render(main){
    if(!main)return;
    estilos();
    const acc=eco();
    if(!acc||!acc.accesoListo()){main.innerHTML='<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando permisos...</div></div>';return;}
    if(typeof _recordsReady!=='undefined'&&!_recordsReady){main.innerHTML='<div class="panel"><div class="small-muted" style="padding:20px 0;text-align:center">Cargando datos...</div></div>';return;}
    const nivel=acc.esJefatura()?'jefatura':'otros';
    try{
      const per=periodo();
      const rec=A().recolectar(per.desde,per.hasta,{linea:G.linea,motivosSistema:true});
      const op=calcularOperativo(A().filtrarPartes(rec.partes,{turno:G.turno,marca:'',pres:''}));
      ultimoRender={nivel,per,op};
      main.innerHTML='<div class="ir" id="impacto-res-view"><div class="ir-head"><div><h2>'+(nivel==='jefatura'?'Impacto económico':'Impacto operativo')+'</h2>'+
        '<div class="ir-sub">Paradas, velocidad reducida y mermas · '+esc(per.etiqueta)+(rec.hayVivo?' · hoy en vivo desde el semáforo':'')+'</div></div></div>'+
        (nivel==='otros'?'<div class="ir-reserva">Los valores económicos están reservados a Gerencia y Jefatura autorizada.</div>':'')+
        htmlControles(nivel)+
        (nivel==='jefatura'?'<h3 style="margin:14px 0 4px;color:#003b5c">Resultado económico</h3>'+htmlEconomico(per)+'<h3 style="margin:18px 0 4px;color:#003b5c">Parte operativa</h3>':'')+
        htmlOperativo(op,per)+'</div>';
    }catch(e){
      console.warn('Impacto:',e&&e.message||e);
      main.innerHTML='<div class="panel"><div class="ir-aviso">No se pudo calcular el impacto: '+esc((e&&e.message)||e)+'</div></div>';
    }
  }
  let tRep=null;
  function repintar(){
    clearTimeout(tRep);
    tRep=setTimeout(()=>{
      try{
        if(typeof state==='undefined'||!state.user||state.currentTab!=='perdidas')return;
        if(eco()&&eco().esGerencia())return;       // Gerencia usa 50-impacto-economico.js
        const main=document.getElementById('main');
        if(main&&document.getElementById('impacto-res-view')||(main&&/Cargando/.test(main.textContent||'')))render(main);
      }catch(e){console.warn('Impacto:',e&&e.message||e);}
    },300);
  }
  setInterval(()=>{if(typeof state!=='undefined'&&state.user&&state.currentTab==='perdidas'&&document.getElementById('impacto-res-view'))repintar();},60000);

  /* ---------- eventos ---------- */
  document.addEventListener('click',e=>{
    const v=e.target&&e.target.closest&&e.target.closest('#impacto-res-view');
    if(!v)return;
    const modo=e.target.closest('[data-ir-modo]');
    if(modo){G.modo=modo.getAttribute('data-ir-modo');if(G.modo==='rango'&&!A().fechaOk(G.desde)){const h=A().hoyOp();G.hasta=h;G.desde=A().addDias(h,-6);}render(document.getElementById('main'));return;}
    const p=e.target.closest('[data-ir-pareto]');
    if(p){G.pareto=p.getAttribute('data-ir-pareto');render(document.getElementById('main'));return;}
    if(e.target.closest('[data-ir-excel]'))exportar();
  });
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.closest||!t.closest('#impacto-res-view'))return;
    const f=t.getAttribute('data-ir-f');
    if(f){G[f]=t.value;render(document.getElementById('main'));return;}
    const fe=t.getAttribute('data-ir-fecha');
    if(fe){G[fe]=t.value;if(A().fechaOk(G.desde)&&A().fechaOk(G.hasta)){if(G.hasta<G.desde){if(fe==='desde')G.hasta=G.desde;else G.desde=G.hasta;}render(document.getElementById('main'));}}
  });

  /* ---------- Excel: operativo para todos; resultado económico solo si es Jefatura ---------- */
  async function exportar(){
    try{
      const R=ultimoRender;if(!R.per||!R.op)return;
      const ExcelJS=typeof cargarScriptExterno==='function'?await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS'):window.ExcelJS;
      if(!ExcelJS)throw new Error('ExcelJS no está disponible.');
      const wb=new ExcelJS.Workbook();wb.creator=(state.user&&(state.user.nombre||state.user.username))||'GLACIAL';wb.created=new Date();
      const hoja=(nombre,cols,filas,anchos)=>{
        const ws=wb.addWorksheet(nombre);
        ws.addRow([(R.nivel==='jefatura'?'Impacto económico · ':'Impacto operativo · ')+R.per.etiqueta+(G.linea?' · '+nombreLinea(G.linea):'')]);
        ws.addRow([]);
        const h=ws.addRow(cols);h.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E79'}};});
        filas.forEach(f=>ws.addRow(f));(anchos||[]).forEach((w,i)=>ws.getColumn(i+1).width=w);return ws;
      };
      const T=R.op.T;
      hoja('Resumen operativo',['Concepto','Valor'],[['Minutos perdidos por paradas no programadas',Math.round(T.npMin)],['Minutos planificados',Math.round(T.planMin)],['Unidades perdidas por paradas',Math.round(T.paradasU)],['Unidades perdidas por velocidad reducida',Math.round(T.velU)],['Cantidad de paradas',T.nParadas]],[52,16]);
      [['Por motivo',R.op.porMotivo],['Por línea',R.op.porLinea],['Por turno',R.op.porTurno]].forEach(([n,fs])=>hoja('Ranking '+n.toLowerCase(),[n.replace('Por ',''),'Minutos','Unidades','Paradas'],fs.map(f=>[f.etq,Math.round(f.min),Math.round(f.und),f.n]),[40,12,12,12]));
      if(R.nivel==='jefatura'){
        const S=sumarResultados(R.per.desde,R.per.hasta);
        hoja('Resultado económico',['Concepto','Soles'],[['Paradas no programadas',r2(S.paradasS)],['Velocidad reducida',r2(S.velS)],['Mermas',r2(S.mermaS)],['PÉRDIDA TOTAL',r2(S.total)],['Incumplimiento del plan (no se suma)',r2(S.incumplS)]],[44,16]);
        hoja('Ranking económico',['Agrupado por','Clave','Soles'],[].concat(S.listas.motivo.map(f=>['Motivo',f.etq,r2(f.s)]),S.listas.linea.map(f=>['Línea',f.etq,r2(f.s)]),S.listas.turno.map(f=>['Turno',f.etq,r2(f.s)]),S.merma.map(f=>['Merma',f.etq,r2(f.s)])),[16,40,14]);
      }
      const buf=await wb.xlsx.writeBuffer();
      const blob=new Blob([buf],{type:typeof XL_MIME!=='undefined'?XL_MIME:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      if(typeof descargarArchivo==='function')descargarArchivo(blob,(R.nivel==='jefatura'?'Impacto_economico_':'Impacto_operativo_')+R.per.desde+'_'+R.per.hasta+'.xlsx');
    }catch(e){alert('No se pudo generar el Excel. Verifica tu conexión e inténtalo nuevamente.');console.warn(e);}
  }

  window.glacialImpactoResultados={render,refrescar:repintar,calcularOperativo,resumenDia,sumarResultados,estado:RES,publicar,estadoFiltro:G};
  // Si el nivel ya estaba resuelto cuando se cargó este archivo, se arranca de inmediato.
  if(eco()&&eco().accesoListo()){nivelPrevio=eco().nivel();alCambiarNivel();}
})();
