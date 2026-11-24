/* =====================================================================================================================
   GLACIAL · REPORTE HIELO · REPORTE DIARIO DE PRODUCCIÓN (mismo formato que el Excel de la planta) · docs/hielo/reporte-diario.md
   · Un «día de producción» = la NOCHE de la víspera (21:00 → 07:00) + el DÍA de la fecha (+ Intermedio), como en el Excel de la planta.
   · Kilos REALES: bolsas × kg reales por bolsa (3 kg → 3.25, 1.5 kg → 1.75; Configuración). Eficiencia = kg del turno ÷ capacidad del turno.
   · N.º de paletas = bolsas ÷ bolsas por paleta (3 kg → 300, 1.5 kg → 600; Configuración).
   · La semana va de domingo a sábado; cada columna lleva la noche de ese día y el día siguiente (domingo = noche 15/11 + día 16/11).
   Parte PURA (modelo y Excel, se prueba con node) + parte de pantalla (gráficas en canvas e imagen PNG para WhatsApp).
   ===================================================================================================================== */
(function(raiz){
  'use strict';
  const DIAS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const num=v=>{const n=Number(String(v===undefined||v===null?'':v).replace(',','.'));return Number.isFinite(n)?n:0;};
  const texto=v=>v===undefined||v===null?'':String(v).trim();
  const r2=v=>Math.round((Number(v)||0)*100)/100;
  const esFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const ms=f=>{const [y,m,d]=f.split('-').map(Number);return Date.UTC(y,m-1,d);};
  const aFecha=t=>{const d=new Date(t);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');};   // en UTC: sin zona horaria
  const sumar=(f,n)=>aFecha(ms(f)+n*86400000);
  const diaSemana=f=>new Date(ms(f)).getUTCDay();                 // 0 = domingo
  const dmy=f=>esFecha(f)?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(2,4):'';
  const dmyLargo=f=>esFecha(f)?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):'';
  const fechaLarga=f=>esFecha(f)?DIAS[diaSemana(f)].toLowerCase()+', '+Number(f.slice(8,10))+' de '+MESES[Number(f.slice(5,7))-1]+' de '+f.slice(0,4):'';
  /** Semana ISO (la «47» del reporte de la planta para el 19/11/2026). */
  function semanaISO(f){
    const d=new Date(ms(f));const dia=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dia+3);
    const primero=new Date(Date.UTC(d.getUTCFullYear(),0,4));
    return 1+Math.round(((d-primero)/86400000-3+((primero.getUTCDay()+6)%7))/7);
  }
  const nucleo=()=>raiz.glacialHieloNucleo||(typeof require==='function'?require('./97-hielo.js'):null);
  const formato=(n,d)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d||0,maximumFractionDigits:d===undefined?0:d});
  const minutosDe=h=>{const m=/^(\d{2}):(\d{2})$/.exec(texto(h));return m?Number(m[1])*60+Number(m[2]):null;};

  /* ------------------------------------------------------------------ modelo (puro) */
  /** o = {fecha:'YYYY-MM-DD' (el DÍA), reportes:[hieloReportes], cfg:{pesos,bolsasPorPaleta,capacidadTurnoKg,presentaciones}, catalogo:[[marca,presentación]…]} */
  function modelo(o){
    o=o||{};const N=nucleo(),cfg=Object.assign({},N&&N.DEFECTO,o.cfg||{});
    const prodId=N&&N.PRODUCTOS&&N.PRODUCTOS[o.producto]?o.producto:'CUBOS',PROD=(N&&N.PRODUCTOS&&N.PRODUCTOS[prodId])||{id:'CUBOS',titulo:'HIELO EN CUBOS',unidad:'bolsas',una:'bolsa',metrica:'kg',unidadesPorJaba:0,presentaciones:[]};
    const enUnidades=PROD.metrica==='unidades';       // Vasos: lo que se mide son los vasos (no los kg)
    // Vista: AMBOS (día de producción: noche + día), NOCHE o DIA (solo ese turno; la fecha es la del propio turno).
    const vista=o.turno==='NOCHE'||o.turno==='DIA'?o.turno:'AMBOS',fecha=vista==='NOCHE'?sumar(o.fecha,1):o.fecha,fNoche=sumar(fecha,-1),ref=vista==='NOCHE'?fNoche:fecha;
    const reps=(o.reportes||[]).filter(Boolean).filter(r=>(N&&N.productoDe?N.productoDe(r):'CUBOS')===prodId).filter(r=>vista==='AMBOS'||(vista==='NOCHE'?r.turno==='NOCHE':r.turno!=='NOCHE'));
    const pesoReal=p=>{const v=num((cfg.pesos||{})[p]);if(v>0)return v;const f=num((PROD.pesos||{})[p]);if(f>0)return f;const d=num(((N&&N.DEFECTO)||{}).pesos&&N.DEFECTO.pesos[p]);return d>0?d:(N?N.kgNominal(p):0);};
    const peso=p=>enUnidades?1:pesoReal(p);      // peso de la medida principal del reporte: kg por bolsa, o 1 por vaso
    const porPaleta=p=>{const v=num((cfg.bolsasPorPaleta||{})[p]);return v>0?v:0;};
    const cap=!enUnidades&&num(cfg.capacidadTurnoKg)>0?num(cfg.capacidadTurnoKg):0;
    const porJaba=num(cfg.unidadesPorJaba)>0?num(cfg.unidadesPorJaba):num(PROD.unidadesPorJaba);
    const de=(f,turnos)=>reps.filter(r=>r.fecha===f&&turnos.includes(r.turno));
    const kgDe=lista=>r2(lista.reduce((s,r)=>s+(r.produccion||[]).reduce((t,p)=>t+Math.max(0,Math.round(num(p.bolsas)))*peso(texto(p.presentacion)),0),0));
    const kgRealDe=lista=>r2(lista.reduce((s,r)=>s+(r.produccion||[]).reduce((t,p)=>t+Math.max(0,Math.round(num(p.bolsas)))*pesoReal(texto(p.presentacion)),0),0));
    const catalogo=(o.catalogo&&o.catalogo.length?o.catalogo:[]).map(x=>[texto(x[0]),texto(x[1])]);
    const claves=new Set(catalogo.map(x=>x[0]+'|'+x[1]));
    // Filas: el catálogo de la planta (mismo orden que el Excel) y, al final, lo producido que no esté en el catálogo.
    const extras=[];
    reps.filter(r=>(r.fecha===fNoche&&r.turno==='NOCHE')||(r.fecha===fecha&&['DÍA','INTERMEDIO'].includes(r.turno))).forEach(r=>(r.produccion||[]).forEach(p=>{
      const k=texto(p.marca)+'|'+texto(p.presentacion);if(texto(p.marca)&&texto(p.presentacion)&&!claves.has(k)){claves.add(k);extras.push([texto(p.marca),texto(p.presentacion)]);}
    }));
    const pares=catalogo.concat(extras);
    const etiqueta=(m,p)=>prodId==='VASOS'?m.toUpperCase():m.toUpperCase()+' ('+p.replace(/\s+/g,'').toUpperCase()+')';

    function turno(clave,nombre,lista,f){
      const mapa=new Map();
      lista.forEach(r=>(r.produccion||[]).forEach(p=>{
        const b=Math.max(0,Math.round(num(p.bolsas)));if(!b)return;
        const k=texto(p.marca)+'|'+texto(p.presentacion);
        const x=mapa.get(k)||{bolsas:0,lotes:[],horas:0,vence:[]};
        x.bolsas+=b;if(texto(p.lote)&&!x.lotes.includes(texto(p.lote)))x.lotes.push(texto(p.lote));
        if(num(p.horas)>0)x.horas+=num(p.horas);if(texto(p.vence)&&!x.vence.includes(texto(p.vence)))x.vence.push(texto(p.vence));
        mapa.set(k,x);
      }));
      const celda=(m,p)=>{const x=mapa.get(m+'|'+p);if(!x)return {bolsas:0,horas:null,paletas:null,jabas:null,lote:'',vence:'',kg:0,pesoKg:0};
        const pal=porPaleta(p);return {bolsas:x.bolsas,horas:x.horas>0?r2(x.horas):null,paletas:pal>0?r2(x.bolsas/pal):null,jabas:porJaba>0?r2(x.bolsas/porJaba):null,lote:x.lotes.join(' / '),vence:x.vence.join(' / '),kg:r2(x.bolsas*peso(p)),pesoKg:r2(x.bolsas*pesoReal(p))};};
      const porPres=new Map();
      mapa.forEach((x,k)=>{const p=k.split('|')[1];const a=porPres.get(p)||{bolsas:0,kg:0,pesoKg:0};a.bolsas+=x.bolsas;a.kg=r2(a.kg+x.bolsas*peso(p));a.pesoKg=r2(a.pesoKg+x.bolsas*pesoReal(p));porPres.set(p,a);});
      const bolsas=[...mapa.values()].reduce((s,x)=>s+x.bolsas,0),kg=kgDe(lista),pesoKg=kgRealDe(lista);
      const sup=[...new Set(lista.map(r=>texto(r.supervisor)).filter(Boolean))];
      const ini=lista.map(r=>texto(r.horaInicio)).filter(Boolean).sort(),fin=lista.map(r=>texto(r.horaFin)).filter(Boolean).sort();
      const i0=ini[0]||'',f0=fin.length?fin[fin.length-1]:'';
      let jornada=null;if(minutosDe(i0)!==null&&minutosDe(f0)!==null){jornada=r2(((minutosDe(f0)-minutosDe(i0)+1440)%1440)/60);}
      const estado=!lista.length?'SIN_REPORTE':lista.every(r=>r.estado==='FINALIZADO')?'FINALIZADO':'EN_REGISTRO';
      return {clave,nombre,fecha:f,fechaTxt:dmy(f),estado,reportes:lista.length,bolsas,kg,pesoKg,jabas:porJaba>0?r2(bolsas/porJaba):null,personas:lista.reduce((s,r)=>Math.max(s,num(r.personas)),0)||null,personal:[...new Set(lista.flatMap(r=>Array.isArray(r.personal)?r.personal:[]))],eficiencia:cap>0&&lista.length?r2(kg/cap*100):null,
        porPresentacion:Object.fromEntries(porPres),supervisor:sup.join(', '),ingreso:i0,salida:f0,jornadaH:jornada,
        observaciones:lista.filter(r=>texto(r.observaciones)).map(r=>texto(r.observaciones)).join('\n'),
        paradas:lista.flatMap(r=>(r.paradas||[]).map(p=>({turno:r.turno,motivo:texto(p.motivo)||'Sin motivo',equipo:texto(p.equipo),minutos:Math.max(0,num(p.minutos)),nota:texto(p.nota)}))).filter(p=>p.minutos>0),celda};
    }
    const noche=turno('NOCHE','NOCHE',de(fNoche,['NOCHE']),fNoche);
    const dia=turno('DIA','DÍA',de(fecha,['DÍA','INTERMEDIO']),fecha);
    const filas=pares.map(([m,p])=>({marca:m,presentacion:p,etiqueta:etiqueta(m,p),noche:noche.celda(m,p),dia:dia.celda(m,p)}));
    // Presentaciones del resumen: las configuradas más las producidas, de mayor a menor.
    const presLista=[...new Set((cfg.presentaciones||[]).concat(Object.keys(noche.porPresentacion),Object.keys(dia.porPresentacion)))]
      .sort((a,b)=>(N?N.kgNominal(b)-N.kgNominal(a):0)||a.localeCompare(b));
    const presentaciones=presLista.map(p=>({presentacion:p,noche:noche.porPresentacion[p]||{bolsas:0,kg:0},dia:dia.porPresentacion[p]||{bolsas:0,kg:0}}));
    // Semana de domingo a sábado: cada columna = noche del día + día siguiente.
    const inicio=vista==='DIA'?sumar(fecha,-diaSemana(fecha)):sumar(fNoche,-diaSemana(fNoche));
    const dias=DIAS.map((nombre,i)=>{
      const tn=sumar(inicio,vista==='DIA'?i-1:i),td=sumar(tn,1),ln=de(tn,['NOCHE']),ld=de(td,['DÍA','INTERMEDIO']);
      const kn=kgDe(ln),kd=kgDe(ld);
      return {nombre,fechaTN:tn,fechaTD:td,kgTN:kn,kgTD:kd,total:r2(kn+kd),hayTN:ln.length>0,hayTD:ld.length>0,hayDatos:ln.length>0||ld.length>0,fechaMostrar:vista==='DIA'?td:tn,actual:vista==='DIA'?td===fecha:tn===fNoche};
    });
    const conDatos=dias.filter(d=>d.hayDatos);
    const totalSemana=r2(dias.reduce((s,d)=>s+d.total,0));
    // Paradas con minutos registrados, por motivo (Pareto).
    const pm=new Map();noche.paradas.concat(dia.paradas).forEach(p=>{const a=pm.get(p.motivo)||{motivo:p.motivo,minutos:0,eventos:0};a.minutos+=p.minutos;a.eventos++;pm.set(p.motivo,a);});
    const paradas=[...pm.values()].sort((a,b)=>b.minutos-a.minutos);
    /* ---- Tendencias (gráficas 5 a 7) ---- */
    const dias2=[7,14,21].includes(Number(o.dias))?Number(o.dias):14,desde=sumar(ref,-(dias2-1));
    // Carta de control: un punto por día de producción (noche + día siguiente) con ambos turnos reportados, últimos 30 días. Los límites salen de los días ya
    // FINALIZADOS (método de rango móvil: promedio ± 2.66 × rango móvil medio) y solo se calculan con 8 o más.
    const puntos=[];
    for(let i=29;i>=0;i--){
      const tn=sumar(fNoche,-i),td=sumar(tn,1),ln=de(tn,['NOCHE']),ld=de(td,['DÍA','INTERMEDIO']);
      if(vista==='AMBOS'?(!ln.length||!ld.length):!(ln.length||ld.length))continue;
      puntos.push({fechaTN:tn,fechaTD:td,fechaMostrar:vista==='DIA'?td:tn,kg:r2(kgDe(ln)+kgDe(ld)),provisional:![...ln,...ld].every(r=>r.estado==='FINALIZADO')});
    }
    const base=puntos.filter(p=>!p.provisional),control={puntos,completos:base.length,suficiente:base.length>=8,mu:0,ucl:0,lcl:0,fuera:[],racha:null};
    if(base.length>=2){
      const x=base.map(p=>p.kg),mu=x.reduce((a,b)=>a+b,0)/x.length,mr=x.slice(1).map((v,i)=>Math.abs(v-x[i])),mrb=mr.reduce((a,b)=>a+b,0)/mr.length;
      control.mu=r2(mu);control.ucl=r2(mu+2.66*mrb);control.lcl=r2(Math.max(0,mu-2.66*mrb));
      if(control.suficiente){
        control.fuera=puntos.filter(p=>p.kg>control.ucl||p.kg<control.lcl).map(p=>p.fechaTN);
        // Racha: 7 o más días seguidos (los últimos) del mismo lado del promedio.
        let n=0,lado=0;for(let i=base.length-1;i>=0;i--){const l=base[i].kg>mu?1:base[i].kg<mu?-1:0;if(!l||(lado&&l!==lado))break;lado=l;n++;}
        if(n>=7)control.racha={n,lado:lado>0?'encima':'debajo'};
      }
    }
    // Mezcla por marca: kilos reales del período (los últimos 7, 14 o 21 días hasta la fecha del reporte), 3 kg y 1.5 kg por separado.
    const enPeriodo=reps.filter(r=>r.fecha>=desde&&r.fecha<=ref),mm=new Map();
    enPeriodo.forEach(r=>(r.produccion||[]).forEach(p=>{
      const b=Math.max(0,Math.round(num(p.bolsas))),mk=texto(p.marca),pr=texto(p.presentacion);if(!b||!mk)return;
      const a=mm.get(mk)||{marca:mk,bolsas:0,kgPorPres:{}};a.bolsas+=b;a.kgPorPres[pr]=r2((a.kgPorPres[pr]||0)+b*peso(pr));mm.set(mk,a);}));
    const marcas=[...mm.values()].map(a=>Object.assign(a,{kg:r2(Object.values(a.kgPorPres).reduce((s,v)=>s+v,0))})).sort((a,b)=>b.kg-a.kg);
    const presPeriodo=[...new Set(marcas.flatMap(a=>Object.keys(a.kgPorPres)))].sort((a,b)=>(N?N.kgNominal(b)-N.kgNominal(a):0)||a.localeCompare(b));
    const kgPeriodo=r2(marcas.reduce((s,a)=>s+a.kg,0));marcas.forEach(a=>{a.pct=kgPeriodo>0?r2(a.kg/kgPeriodo*100):0;});
    // Mapa de calor: una celda por fecha y turno (Día incluye Intermedio); null = sin reporte.
    const fechasMapa=Array.from({length:dias2},(_,i)=>sumar(desde,i));
    const celdaMapa=(f,ts)=>{const l=de(f,ts);return l.length?kgDe(l):null;};
    const mapa={fechas:fechasMapa,dia:fechasMapa.map(f=>celdaMapa(f,['DÍA','INTERMEDIO'])),noche:fechasMapa.map(f=>celdaMapa(f,['NOCHE']))};
    const paresMapa=fechasMapa.filter((f,i)=>mapa.dia[i]>0&&mapa.noche[i]>0);
    mapa.nochePorEncima=paresMapa.filter(f=>{const i=fechasMapa.indexOf(f);return mapa.noche[i]>mapa.dia[i];}).length;mapa.diasConAmbos=paresMapa.length;
    return {fecha,fNoche,fechaLarga:fechaLarga(ref),semanaNum:semanaISO(ref),titulo:'REPORTE DIARIO DE PRODUCCIÓN',subtitulo:PROD.titulo+(vista==='NOCHE'?' · TURNO NOCHE':vista==='DIA'?' · TURNO DÍA':''),vista,
      periodo:{dias:dias2,desde,hasta:ref},control,marcas,presPeriodo,kgPeriodo,mapa,
      producto:prodId,unidad:PROD.unidad,una:PROD.una,unidadMetrica:enUnidades?PROD.unidad:'kg',enUnidades,extra:prodId==='CUBOS'?'paletas':(porJaba>0?'jabas':null),porJaba,
      capacidad:cap,pesos:Object.fromEntries(presLista.map(p=>[p,pesoReal(p)])),noche,dia,filas,presentaciones,
      totalDiaKg:r2(noche.kg+dia.kg),totalSemanaKg:totalSemana,
      semana:{inicio,fin:sumar(inicio,6),dias,promedio:conDatos.length?r2(conDatos.reduce((s,d)=>s+d.total,0)/conDatos.length):0},
      paradas,paradasMin:paradas.reduce((s,p)=>s+p.minutos,0),
      hayDatos:noche.reportes+dia.reportes>0};
  }

  /* ------------------------------------------------------------------ Excel (puro: recibe ExcelJS) */
  const AZUL='FF0A2745',GRIS='FFD9D9D9',CELESTE='FFBDD7EE',NARANJA='FFFCE4D6',BLANCO='FFFFFFFF';
  const borde={top:{style:'thin',color:{argb:'FF9AA7B2'}},left:{style:'thin',color:{argb:'FF9AA7B2'}},bottom:{style:'thin',color:{argb:'FF9AA7B2'}},right:{style:'thin',color:{argb:'FF9AA7B2'}}};
  /** imgs = {capacidad, presentacion, semana, paradas}: data URL PNG (o null: se omiten las gráficas, p. ej. en las pruebas). */
  function construirExcel(ExcelJS,m,imgs){
    imgs=imgs||{};
    const wb=new ExcelJS.Workbook();wb.creator='GLACIAL';wb.created=new Date();
    const ws=wb.addWorksheet('Reporte diario',{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9},views:[{showGridLines:false}]});
    // Columnas de cada turno: unidades, tiempo, [paletas | jabas], lote, vencimiento y peso (Cubos: paletas · Vasos: jabas · Premium: sin esa columna).
    const extraNom=m.extra==='paletas'?'N° PALETAS':m.extra==='jabas'?'N° JABAS':null,uMay=m.unidadMetrica.toUpperCase();
    const cab=[String(m.unidad).toUpperCase(),'TIEMPO (H)'].concat(extraNom?[extraNom]:[],['LOTE','F. VENCIMIENTO','PESO (KG)']);
    const nb=cab.length,Lc=n=>String.fromCharCode(64+n),cNo=2,cDi=2+nb,ult=1+2*nb;      // cNo/cDi: primera columna del bloque de la noche y del día; ult: última columna
    const anchos=[9,9].concat(extraNom?[10]:[],[12,13,12]);
    ws.columns=[{width:26}].concat(Array.from({length:2*nb},(_,i)=>({width:anchos[i%nb]})));
    const celda=(ref,v,o)=>{o=o||{};const c=ws.getCell(ref);c.value=v;if(o.fmt)c.numFmt=o.fmt;c.font={name:'Arial',size:o.size||10,bold:!!o.bold,color:o.color?{argb:o.color}:undefined,italic:!!o.italic};
      if(o.fill)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:o.fill}};c.alignment={horizontal:o.align||'center',vertical:'middle',wrapText:!!o.wrap};if(o.borde!==false)c.border=borde;return c;};
    const unir=(rango,v,o)=>{ws.mergeCells(rango);return celda(rango.split(':')[0],v,o);};
    unir('A1:'+Lc(ult)+'1',m.titulo,{size:18,bold:true,borde:false});ws.getRow(1).height=30;
    unir('A2:'+Lc(ult)+'2',m.subtitulo,{size:12,bold:true,borde:false});
    unir('A3:'+Lc(ult)+'3',m.fechaLarga.charAt(0).toUpperCase()+m.fechaLarga.slice(1),{size:10,bold:true,align:'right',borde:false});
    // Totales
    celda('A5','TURNO NOCHE',{bold:true,align:'left',color:'FFC00000'});unir('B5:C5',m.vista==='DIA'?null:m.noche.kg,{fmt:'#,##0.00',bold:true,color:'FFC00000'});celda('D5',uMay,{align:'left'});
    celda('A6','TURNO DÍA',{bold:true,align:'left',color:'FFC00000'});unir('B6:C6',m.vista==='NOCHE'?null:m.dia.kg,{fmt:'#,##0.00',bold:true,color:'FFC00000'});celda('D6',uMay,{align:'left'});
    celda('A7',m.vista==='AMBOS'?'TOTAL SEMANA':'SEMANA (SOLO '+(m.vista==='NOCHE'?'NOCHE':'DÍA')+')',{bold:true,align:'left',color:'FF2E7D32'});unir('B7:C7',m.totalSemanaKg,{fmt:'#,##0.00',bold:true,color:'FF2E7D32'});celda('D7',uMay,{align:'left'});
    celda('F5','SEMANA',{bold:true});celda('G5',m.semanaNum,{bold:true});
    if(m.capacidad){celda('F6','CAPACIDAD / TURNO',{bold:true,size:9});unir('G6:H6',m.capacidad,{fmt:'#,##0',size:9});}
    // Personal
    celda('A9','REPORTE DE PERSONAL',{bold:true,fill:BLANCO});
    [['NOCHE',m.noche,Lc(cNo),Lc(cDi-1),GRIS],['DÍA',m.dia,Lc(cDi),Lc(ult),CELESTE]].forEach(([n,t,a,b,col])=>{
      const fuera=(n==='NOCHE'&&m.vista==='DIA')||(n==='DÍA'&&m.vista==='NOCHE');
      unir(a+'9:'+b+'9',fuera?'TURNO '+n+' · NO INCLUIDO EN ESTE REPORTE':'TURNO '+n+' · '+(t.fechaTxt||''),{bold:true,fill:col});
      unir(a+'10:'+b+'10',fuera?'':'Ingreso '+(t.ingreso||'—')+' · Salida '+(t.salida||'—')+(t.jornadaH!==null?' · Jornada '+t.jornadaH.toFixed(2)+' h':''),{fill:col});
      unir(a+'11:'+b+'11',fuera?'':'Supervisor: '+(t.supervisor||'—')+(t.personas?' · Personas: '+t.personas:''),{fill:col});});
    celda('A10','INGRESO / SALIDA',{align:'left'});celda('A11','RESPONSABLE / PERSONAS',{align:'left'});
    // Tabla por marca
    celda('A13','REPORTE POR MARCA',{bold:true,fill:BLANCO});
    unir(Lc(cNo)+'13:'+Lc(cDi-1)+'13',m.vista==='DIA'?'NOCHE · NO INCLUIDO':'NOCHE · '+DIAS[diaSemana(m.fNoche)]+' '+m.noche.fechaTxt,{bold:true,fill:GRIS});
    unir(Lc(cDi)+'13:'+Lc(ult)+'13',m.vista==='NOCHE'?'DÍA · NO INCLUIDO':'DÍA · '+DIAS[diaSemana(m.fecha)]+' '+m.dia.fechaTxt,{bold:true,fill:CELESTE});
    celda('A14',m.producto==='VASOS'?'MARCA':'PRESENTACIÓN',{bold:true,align:'left'});
    cab.forEach((t,i)=>{celda(Lc(cNo+i)+'14',t,{bold:true,fill:GRIS,size:9,wrap:true});celda(Lc(cDi+i)+'14',t,{bold:true,fill:CELESTE,size:9,wrap:true});});
    let f=15;
    const valorExtra=c=>m.extra==='paletas'?c.paletas:c.jabas;
    const fmtCol=['#,##0','0.00'].concat(extraNom?['0.00']:[],[null,null,'#,##0.00']);
    m.filas.forEach((fi,k)=>{
      celda('A'+f,(k+1)+'  '+fi.etiqueta,{align:'left'});
      [[cNo,fi.noche],[cDi,fi.dia]].forEach(([ini,c])=>{
        const vacio=!c.bolsas,v=[vacio?null:c.bolsas,c.horas].concat(extraNom?[valorExtra(c)]:[],[c.lote||null,c.vence||null,vacio?null:c.pesoKg]);
        v.forEach((x,i)=>celda(Lc(ini+i)+f,x,{fmt:fmtCol[i]||undefined,bold:i===0||i===nb-1}));
      });
      f++;
    });
    celda('A'+f,'TOTAL',{bold:true,align:'left',fill:'FFF2F2F2'});
    [[cNo,m.noche,'noche'],[cDi,m.dia,'dia']].forEach(([ini,t,k])=>{
      const v=[t.bolsas||null,null].concat(extraNom?[r2(m.filas.reduce((s,x)=>s+((valorExtra(x[k]))||0),0))||null]:[],[null,null,t.pesoKg||null]);
      v.forEach((x,i)=>celda(Lc(ini+i)+f,x,{fmt:fmtCol[i]||undefined,bold:x!==null,fill:'FFF2F2F2'}));
    });
    const filaTotal=f;f+=2;
    // Gráficas (imágenes) en 2 × 2
    const colDer=nb===6?6.15:5.2;
    const pos=[['capacidad',0,0],['presentacion',colDer,0],['semana',0,1],['paradas',colDer,1],['control',0,2],['marcas',colDer,2],['mapa',0,3]];
    const alto=17;let hayImg=false,filasImg=0;
    pos.forEach(([k,c,r])=>{
      const im=imgs[k];if(!im)return;hayImg=true;filasImg=Math.max(filasImg,r+1);
      const datos=typeof im==='string'?im:im.data,ancho=k==='mapa'?1250:(c===0?640:600),altoPx=(typeof im==='object'&&im.w&&im.h)?Math.round(ancho*im.h/im.w):alto*20-6;
      const id=wb.addImage({base64:datos,extension:'png'});
      ws.addImage(id,{tl:{col:c,row:f-1+r*alto},ext:{width:ancho,height:Math.min(altoPx,alto*20-6)}});
    });
    if(hayImg)f+=filasImg*alto+1;
    // Observaciones, merma y firmas
    celda('A'+f,'OBSERVACIONES:',{bold:true,align:'left',borde:false});
    unir('B'+f+':'+Lc(ult)+f,[m.noche.observaciones&&('NOCHE: '+m.noche.observaciones.replace(/\n/g,' · ')),m.dia.observaciones&&('DÍA: '+m.dia.observaciones.replace(/\n/g,' · '))].filter(Boolean).join('\n')||'—',{align:'left',wrap:true,borde:false});
    ws.getRow(f).height=Math.max(30,15*Math.ceil(((m.noche.observaciones+m.dia.observaciones).length||1)/120));
    f+=3;
    ['Líder de línea','Encargados de máquinas de HIELO',m.noche.supervisor||m.dia.supervisor?('Supervisor(a) de Producción · '+[m.noche.supervisor,m.dia.supervisor].filter(Boolean).join(' / ')):'Supervisor(a) de Producción'].forEach((t,i)=>{
      const rango=['A'+f+':C'+f,'E'+f+':H'+f,Lc(nb===6?ult-3:ult-2)+f+':'+Lc(ult)+f][i];ws.mergeCells(rango);const c=ws.getCell(rango.split(':')[0]);c.value=t;c.font={name:'Arial',size:9,italic:true};c.alignment={horizontal:'center'};c.border={top:{style:'thin'}};});
    // ---- Hoja 2: resumen y semana
    const w2=wb.addWorksheet('Resumen y semana',{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9},views:[{showGridLines:false}]});
    w2.columns=[{width:30}].concat(Array.from({length:14},()=>({width:12})));
    const c2=(ref,v,o)=>{o=o||{};const c=w2.getCell(ref);c.value=v;if(o.fmt)c.numFmt=o.fmt;c.font={name:'Arial',size:o.size||10,bold:!!o.bold};if(o.fill)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:o.fill}};c.alignment={horizontal:o.align||'center',vertical:'middle'};c.border=borde;return c;};
    const u2=(rango,v,o)=>{w2.mergeCells(rango);return c2(rango.split(':')[0],v,o);};
    const UN=String(m.unidad).toUpperCase();
    c2('A1','PRODUCCIÓN – '+(m.producto==='VASOS'?'MARCA':'PRESENTACIÓN'),{bold:true,align:'left'});
    u2('B1:C1','NOCHE · '+UN+' / PESO (KG)',{bold:true,fill:GRIS,size:9});u2('D1:E1','DÍA · '+UN+' / PESO (KG)',{bold:true,fill:CELESTE,size:9});
    // Vasos: una fila por marca; Cubos y Premium: una fila por presentación.
    const filasRes=m.producto==='VASOS'?m.filas.filter(x=>x.noche.bolsas||x.dia.bolsas).map(x=>({nombre:x.marca.toUpperCase(),noche:{bolsas:x.noche.bolsas,pesoKg:x.noche.pesoKg},dia:{bolsas:x.dia.bolsas,pesoKg:x.dia.pesoKg}}))
      :m.presentaciones.map(p=>({nombre:'PRESENTACIÓN '+etiquetaPres(p.presentacion),noche:{bolsas:p.noche.bolsas,pesoKg:p.noche.pesoKg},dia:{bolsas:p.dia.bolsas,pesoKg:p.dia.pesoKg}}));
    filasRes.forEach((p,i)=>{const r=2+i;c2('A'+r,p.nombre,{align:'left'});
      c2('B'+r,p.noche.bolsas||null,{fmt:'#,##0'});c2('C'+r,p.noche.pesoKg||null,{fmt:'#,##0.00'});c2('D'+r,p.dia.bolsas||null,{fmt:'#,##0'});c2('E'+r,p.dia.pesoKg||null,{fmt:'#,##0.00'});});
    let r=2+filasRes.length;
    c2('A'+r,'PRODUCCIÓN POR TURNO ('+uMay+')',{bold:true,align:'left'});u2('B'+r+':C'+r,m.noche.kg,{fmt:'#,##0.00',bold:true,fill:GRIS});u2('D'+r+':E'+r,m.dia.kg,{fmt:'#,##0.00',bold:true,fill:CELESTE});r++;
    if(m.capacidad){c2('A'+r,'EFICIENCIA REAL (%)',{bold:true,align:'left'});u2('B'+r+':C'+r,m.noche.eficiencia,{fmt:'0.00',bold:true,fill:GRIS});u2('D'+r+':E'+r,m.dia.eficiencia,{fmt:'0.00',bold:true,fill:CELESTE});r++;}
    c2('A'+r,'PRODUCCIÓN TOTAL ('+uMay+')',{bold:true,align:'left'});u2('B'+r+':E'+r,m.totalDiaKg,{fmt:'#,##0.00',bold:true,fill:'FFF8CBAD'});r++;
    if(m.enUnidades){c2('A'+r,'PESO TOTAL (KG)',{align:'left',size:9});u2('B'+r+':E'+r,r2(m.noche.pesoKg+m.dia.pesoKg),{fmt:'#,##0.00',size:9});r++;}
    if(m.capacidad){c2('A'+r,'CAPACIDAD POR TURNO (KG)',{align:'left',size:9});u2('B'+r+':E'+r,m.capacidad,{fmt:'#,##0',size:9});r++;}
    r++;
    // Personal (nombres) por turno
    const nom=(t,k)=>(t.personal&&t.personal[k])||null;
    c2('A'+r,'PERSONAL'+((m.noche.personas||m.dia.personas)?' (N.º: '+(m.noche.personas||'—')+' noche · '+(m.dia.personas||'—')+' día)':''),{bold:true,align:'left'});
    u2('B'+r+':C'+r,'NOCHE',{bold:true,fill:GRIS,size:9});u2('D'+r+':E'+r,'DÍA',{bold:true,fill:CELESTE,size:9});r++;
    for(let k=0;k<5;k++){c2('A'+r,(k+1)+'.-',{align:'left',size:9});u2('B'+r+':C'+r,nom(m.noche,k),{fill:GRIS,size:9,align:'left'});u2('D'+r+':E'+r,nom(m.dia,k),{fill:CELESTE,size:9,align:'left'});r++;}
    r++;
    // Semana
    const base=r;c2('A'+r,'SEMANA '+m.semanaNum+' · '+dmyLargo(m.semana.inicio)+' al '+dmyLargo(m.semana.fin),{bold:true,align:'left',size:9});
    m.semana.dias.forEach((d,i)=>{const a=String.fromCharCode(66+i*2),b=String.fromCharCode(67+i*2);u2(a+r+':'+b+r,d.nombre.toUpperCase(),{bold:true,fill:d.actual?'FFFFE699':'FFF2F2F2'});
      c2(a+(r+1),'TN',{bold:true,fill:GRIS,size:9});c2(b+(r+1),'TD',{bold:true,fill:CELESTE,size:9});
      c2(a+(r+2),dmy(d.fechaTN),{size:9});c2(b+(r+2),dmy(d.fechaTD),{size:9});
      c2(a+(r+3),d.hayTN?d.kgTN:null,{fmt:'#,##0.00'});c2(b+(r+3),d.hayTD?d.kgTD:null,{fmt:'#,##0.00'});
      u2(a+(r+4)+':'+b+(r+4),d.hayDatos?d.total:null,{fmt:'#,##0.00',bold:true,fill:'FFFFF2CC'});});
    c2('A'+(r+1),'',{});c2('A'+(r+2),'',{});c2('A'+(r+3),'PRODUCCIÓN TURNO ('+uMay+')',{align:'left'});c2('A'+(r+4),'PRODUCCIÓN TOTAL TURNOS ('+uMay+')',{align:'left',bold:true});
    r+=6;c2('A'+r,'PRODUCCIÓN TOTAL SEMANA ('+uMay+')',{bold:true,align:'left'});u2('B'+r+':C'+r,m.totalSemanaKg,{fmt:'#,##0.00',bold:true,fill:'FF0A2745'}).font={name:'Arial',size:10,bold:true,color:{argb:BLANCO}};
    return wb;
  }

  /** «3 kg» → «3.0 KG», «1.5 kg» → «1.5 KG» (como la hoja de la planta). */
  function etiquetaPres(p){const N=nucleo(),n=N?N.kgNominal(p):0;return n>0?n.toFixed(1)+' KG':String(p).toUpperCase();}
  /** Mensaje corto para acompañar el archivo en WhatsApp (negritas de WhatsApp con *). */
  function resumenTexto(m){
    const kg=v=>formato(v,2)+' kg',efi=t=>t.eficiencia!==null?' ('+t.eficiencia.toFixed(2)+' %)':'';
    const l=['*'+m.titulo+'*',m.subtitulo,m.fechaLarga.charAt(0).toUpperCase()+m.fechaLarga.slice(1)+' · Semana '+m.semanaNum,''];
    if(m.vista!=='DIA')l.push('Noche '+m.noche.fechaTxt+': '+(m.noche.reportes?kg(m.noche.kg)+efi(m.noche):'sin reporte'));
    if(m.vista!=='NOCHE')l.push('Día '+m.dia.fechaTxt+': '+(m.dia.reportes?kg(m.dia.kg)+efi(m.dia):'sin reporte'));
    if(m.vista==='AMBOS')l.push('*Total del día: '+kg(m.totalDiaKg)+'*');
    l.push('Semana '+m.semanaNum+(m.vista==='AMBOS'?'':' (solo '+(m.vista==='NOCHE'?'noche':'día')+')')+': '+kg(m.totalSemanaKg));
    const obs=[m.noche.observaciones,m.dia.observaciones].filter(Boolean).join(' · ').replace(/\s+/g,' ').trim();
    if(obs)l.push('','Obs.: '+(obs.length>280?obs.slice(0,277)+'…':obs));
    return l.join('\n');
  }
  /* ------------------------------------------------------------------ Resumen de planta (todos los productos de hielo) */
  const PLANTA_PRODUCTOS=['CUBOS','PREMIUM','VASOS'];
  /** Resumen de toda la planta de hielo: kg reales de Cubos, Premium y Vasos (y los vasos) del día de producción (noche + día), de la semana y del período.
   *  o = {fecha, reportes (de todos los productos), dias (7 | 14 | 21)}. Los kg salen de bolsas (o vasos) × kg reales de cada presentación. */
  function modeloPlanta(o){
    o=o||{};const N=nucleo(),fecha=o.fecha,fNoche=sumar(fecha,-1),reps=(o.reportes||[]).filter(Boolean);
    const prodDe=r=>(N&&N.productoDe?N.productoDe(r):'CUBOS'),info=id=>(N&&N.PRODUCTOS&&N.PRODUCTOS[id])||{nombre:id,corto:id,unidad:'bolsas',unidadesPorJaba:0};
    const kgReal=l=>r2(l.reduce((s,r)=>s+(r.produccion||[]).reduce((t,p)=>t+Math.max(0,Math.round(num(p.bolsas)))*(N?N.kgDe(texto(p.presentacion)):0),0),0));
    const unid=l=>l.reduce((s,r)=>s+(r.produccion||[]).reduce((t,p)=>t+Math.max(0,Math.round(num(p.bolsas))),0),0);
    const de=(f,ts,id)=>reps.filter(r=>r.fecha===f&&ts.includes(r.turno)&&prodDe(r)===id);
    const NOCHE=['NOCHE'],DIA=['DÍA','INTERMEDIO'];
    const productos=PLANTA_PRODUCTOS.map(id=>{
      const P=info(id),ln=de(fNoche,NOCHE,id),ld=de(fecha,DIA,id);
      const n={reportes:ln.length,unidades:unid(ln),kg:kgReal(ln)},d={reportes:ld.length,unidades:unid(ld),kg:kgReal(ld)};
      return {id,nombre:P.nombre,corto:P.corto,unidad:P.unidad,noche:n,dia:d,totalKg:r2(n.kg+d.kg),totalUnidades:n.unidades+d.unidades,jabas:P.unidadesPorJaba?r2((n.unidades+d.unidades)/P.unidadesPorJaba):null,hayDatos:n.reportes+d.reportes>0};
    });
    const totalKg=r2(productos.reduce((s,p)=>s+p.totalKg,0)),nocheKg=r2(productos.reduce((s,p)=>s+p.noche.kg,0)),diaKg=r2(productos.reduce((s,p)=>s+p.dia.kg,0));
    const inicio=sumar(fNoche,-diaSemana(fNoche));
    const semana=DIAS.map((nombre,i)=>{const tn=sumar(inicio,i),td=sumar(tn,1);
      const porProd=Object.fromEntries(PLANTA_PRODUCTOS.map(id=>[id,r2(kgReal(de(tn,NOCHE,id))+kgReal(de(td,DIA,id)))]));
      const tot=r2(Object.values(porProd).reduce((a,b)=>a+b,0)),hay=PLANTA_PRODUCTOS.some(id=>de(tn,NOCHE,id).length||de(td,DIA,id).length);
      return {nombre,fechaTN:tn,fechaTD:td,porProd,total:tot,hayDatos:hay,actual:tn===fNoche};});
    const conDatos=semana.filter(d=>d.hayDatos);
    const dias2=[7,14,21].includes(Number(o.dias))?Number(o.dias):14,desde=sumar(fecha,-(dias2-1));
    const enPer=reps.filter(r=>r.fecha>=desde&&r.fecha<=fecha);
    const mezcla=PLANTA_PRODUCTOS.map(id=>{const l=enPer.filter(r=>prodDe(r)===id);return {id,nombre:info(id).nombre,kg:kgReal(l),unidades:unid(l),unidad:info(id).unidad};});
    const totalPer=r2(mezcla.reduce((s,x)=>s+x.kg,0));mezcla.forEach(x=>{x.pct=totalPer>0?r2(x.kg/totalPer*100):0;});
    const paradas=[...new Map(reps.filter(r=>(r.fecha===fNoche&&r.turno==='NOCHE')||(r.fecha===fecha&&DIA.includes(r.turno))).flatMap(r=>(r.paradas||[]).map(p=>({producto:prodDe(r),turno:r.turno,motivo:texto(p.motivo)||'Sin motivo',equipo:texto(p.equipo),minutos:Math.max(0,num(p.minutos))}))).filter(p=>p.minutos>0).map((p,i)=>[i,p])).values()];
    return {fecha,fNoche,fechaLarga:fechaLarga(fecha),semanaNum:semanaISO(fecha),productos,totalKg,nocheKg,diaKg,semana:{inicio,fin:sumar(inicio,6),dias:semana,total:r2(semana.reduce((s,d)=>s+d.total,0)),promedio:conDatos.length?r2(conDatos.reduce((s,d)=>s+d.total,0)/conDatos.length):0},
      periodo:{dias:dias2,desde,hasta:fecha},mezcla,totalPeriodo:totalPer,paradas,paradasMin:paradas.reduce((s,p)=>s+p.minutos,0),hayDatos:productos.some(p=>p.hayDatos)};
  }
  /** Mensaje corto del Resumen de planta para WhatsApp. */
  function resumenTextoPlanta(m){
    const l=['*RESUMEN DE PLANTA · HIELO*',m.fechaLarga.charAt(0).toUpperCase()+m.fechaLarga.slice(1)+' · Semana '+m.semanaNum,''];
    m.productos.forEach(p=>l.push(p.nombre+': '+(p.hayDatos?(p.id==='VASOS'?formato(p.totalUnidades)+' vasos ('+formato(p.totalKg,2)+' kg)':formato(p.totalKg,2)+' kg'):'sin reporte')));
    l.push('','*Total del día: '+formato(m.totalKg,2)+' kg*','Semana '+m.semanaNum+': '+formato(m.semana.total,2)+' kg');
    if(m.paradasMin)l.push('Paradas con minutos: '+formato(m.paradasMin)+' min');
    return l.join('\n');
  }
  const API={modelo,modeloPlanta,resumenTextoPlanta,construirExcel,resumenTexto,semanaISO,sumar,diaSemana,fechaLarga,dmy,formato,DIAS};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof window==='undefined'||!window.document)return;
  raiz.glacialHieloReporte=API;

  /* ------------------------------------------------------------------ gráficas (canvas) e imagen PNG */
  const COL={p3:'#6250d6',p15:'#b3a9ef',noche:'#2a78d6',dia:'#eb6834',ink:'#0e2233',mut:'#587087',grid:'#e3eaf0',pista:'#eef3f7',cap:'#0e2233',ok:'#157a3b',mal:'#c62828',fondo:'#ffffff',neutro:'#9fb0bd'};
  const FUENTE='Arial, Helvetica, sans-serif';
  function lienzo(w,h){const c=document.createElement('canvas'),k=2;c.width=w*k;c.height=h*k;c.style.width='100%';c.style.maxWidth=w+'px';c.style.height='auto';const x=c.getContext('2d');x.scale(k,k);x.fillStyle=COL.fondo;x.fillRect(0,0,w,h);x.textBaseline='alphabetic';return {c,x,w,h};}
  const txt=(x,t,px,py,o)=>{o=o||{};x.font=(o.peso||'400')+' '+(o.size||12)+'px '+FUENTE;x.fillStyle=o.color||COL.ink;x.textAlign=o.align||'left';x.fillText(String(t),px,py);};
  const nice=v=>{const p=Math.pow(10,Math.floor(Math.log10(v||1))),r=v/p;return ([1,1.2,1.6,2,2.4,3,4,5,6,8,10].find(q=>r<=q+1e-9)||10)*p;};
  const titulo=(L,t,sub)=>{txt(L.x,t,14,24,{size:15,peso:'700'});if(sub)txt(L.x,sub,14,41,{size:11,color:COL.mut});};
  const leyenda=(L,items,y)=>{let px=14;items.forEach(([c,t])=>{L.x.fillStyle=c;L.x.fillRect(px,y-9,11,11);txt(L.x,t,px+16,y,{size:11,color:COL.mut});L.x.font='11px '+FUENTE;px+=16+L.x.measureText(t).width+16;});};

  /** Producción vs capacidad por turno (reemplaza «Producción por turno» y «Eficiencia general»: se ve cuánto falta para llenar el turno). */
  function graficoCapacidad(m){
    const u=m.unidadMetrica,L=lienzo(600,230),X=L.x;titulo(L,m.capacidad?'Producción vs capacidad por turno':'Producción por turno ('+u+')',m.capacidad?'La marca vertical es la capacidad de un turno; el % es la eficiencia.':'Lo producido en cada turno.');
    const izq=64,der=24,ancho=L.w-izq-der,max=Math.max(m.capacidad,m.noche.kg,m.dia.kg,1)*1.04,esc=v=>izq+ancho*v/max;
    [['Noche',m.noche,COL.noche,92,m.vista!=='DIA'],['Día',m.dia,COL.dia,150,m.vista!=='NOCHE']].filter(x=>x[4]).forEach(([n,t,col,y0])=>{const y=m.vista==='AMBOS'?y0:112;
      txt(X,n,izq-10,y+17,{align:'right',size:13,peso:'700'});X.fillStyle=COL.pista;X.fillRect(izq,y,m.capacidad?esc(m.capacidad)-izq:ancho,26);
      X.fillStyle=col;X.fillRect(izq,y,Math.max(0,esc(t.kg)-izq),26);
      const etiqueta=formato(t.kg,m.enUnidades?0:2)+' '+u+(t.eficiencia!==null?'  ·  '+t.eficiencia.toFixed(2)+' %':'');
      const dentro=esc(t.kg)-izq>200;txt(X,etiqueta,dentro?esc(t.kg)-8:esc(t.kg)+8,y+18,{align:dentro?'right':'left',size:12,peso:'700',color:dentro?'#ffffff':COL.ink});});
    if(m.capacidad){const cx=esc(m.capacidad);X.strokeStyle=COL.cap;X.lineWidth=2;X.beginPath();X.moveTo(cx,78);X.lineTo(cx,190);X.stroke();txt(X,'Capacidad '+formato(m.capacidad)+' kg',cx,70,{align:'right',size:11,peso:'700'});}
    X.strokeStyle=COL.grid;X.lineWidth=1;X.beginPath();X.moveTo(izq,196);X.lineTo(izq+ancho,196);X.stroke();
    for(let i=0;i<=4;i++){const v=max*i/4/1.04;txt(X,formato(v),esc(v),212,{align:'center',size:10,color:COL.mut});}
    return L.c;
  }
  /** Cubos: kilos por presentación y turno · Premium: bolsas por presentación · Vasos: vasos por marca (barras agrupadas con el valor en cada barra). */
  function graficoPresentacion(m){
    const modo=m.producto==='VASOS'?'marca':m.producto==='PREMIUM'?'bolsas':'kg';
    const L=lienzo(600,230),X=L.x;titulo(L,modo==='marca'?'Vasos por marca':modo==='bolsas'?'Bolsas por presentación':'Kilos por presentación',modo==='kg'?'Con los kg reales por bolsa.':modo==='marca'?'Lo producido por cada marca en cada turno.':'Cantidad de bolsas de cada presentación.');
    leyenda(L,[[COL.noche,'Noche',m.vista!=='DIA'],[COL.dia,'Día',m.vista!=='NOCHE']].filter(x=>x[2]),56);
    const lista=modo==='marca'?m.filas.filter(f=>f.noche.bolsas||f.dia.bolsas).map(f=>({nombre:f.marca,n:f.noche.bolsas,d:f.dia.bolsas}))
      :m.presentaciones.filter(p=>p.noche.bolsas||p.dia.bolsas||(m.presentaciones.length<=2)).map(p=>({nombre:'Presentación '+p.presentacion,n:modo==='bolsas'?p.noche.bolsas:p.noche.kg,d:modo==='bolsas'?p.dia.bolsas:p.dia.kg}));
    const izq=52,der=14,top=74,base=196,ancho=L.w-izq-der,alto=base-top,max=nice(Math.max(1,...lista.flatMap(p=>[p.n,p.d]))*1.12);
    for(let i=0;i<=4;i++){const v=max*i/4,y=base-alto*i/4;X.strokeStyle=COL.grid;X.beginPath();X.moveTo(izq,y);X.lineTo(izq+ancho,y);X.stroke();txt(X,formato(v),izq-6,y+4,{align:'right',size:10,color:COL.mut});}
    if(!lista.length){txt(X,'Sin producción en este día.',L.w/2,140,{align:'center',size:13,color:COL.mut});return L.c;}
    const g=ancho/Math.max(1,lista.length),bw=Math.min(54,g/3);
    lista.forEach((p,i)=>{const cx=izq+g*(i+.5);[[p.n,COL.noche,-bw-2,m.vista!=='DIA'],[p.d,COL.dia,2,m.vista!=='NOCHE']].filter(x=>x[3]).forEach(([v,col,dx0])=>{const dx=m.vista==='AMBOS'?dx0:-bw/2;
      const h=alto*v/max;if(v>0){X.fillStyle=col;X.fillRect(cx+dx,base-h,bw,h);txt(X,formato(v,0),cx+dx+bw/2,base-h-5,{align:'center',size:11,peso:'700'});}else txt(X,'—',cx+dx+bw/2,base-4,{align:'center',size:11,color:COL.mut});});
      txt(X,p.nombre,cx,base+18,{align:'center',size:11,color:COL.mut});});
    return L.c;
  }
  /** Producción de la semana: una columna por día (noche + día siguiente) con el promedio. */
  function graficoSemana(m){
    const L=lienzo(600,250),X=L.x;titulo(L,'Producción de la semana ('+m.unidadMetrica+')',m.vista==='NOCHE'?'Cada columna: el turno noche de ese día.':m.vista==='DIA'?'Cada columna: el turno día de ese día.':'Cada columna: la noche de ese día más el día siguiente.');leyenda(L,[[COL.noche,'Noche',m.vista!=='DIA'],[COL.dia,'Día',m.vista!=='NOCHE'],[COL.cap,'Promedio',true]].filter(x=>x[2]),56);
    const izq=56,der=14,top=76,base=206,ancho=L.w-izq-der,alto=base-top,max=nice(Math.max(1,...m.semana.dias.map(d=>d.total),m.semana.promedio)*1.12);
    for(let i=0;i<=4;i++){const v=max*i/4,y=base-alto*i/4;X.strokeStyle=COL.grid;X.beginPath();X.moveTo(izq,y);X.lineTo(izq+ancho,y);X.stroke();txt(X,formato(v),izq-6,y+4,{align:'right',size:10,color:COL.mut});}
    const g=ancho/7,bw=Math.min(40,g-14);
    m.semana.dias.forEach((d,i)=>{const cx=izq+g*(i+.5),x0=cx-bw/2;
      if(d.hayDatos){const hn=alto*d.kgTN/max,hd=alto*d.kgTD/max;X.fillStyle=COL.noche;X.fillRect(x0,base-hn,bw,hn);X.fillStyle=COL.dia;X.fillRect(x0,base-hn-hd,bw,hd);
        txt(X,formato(d.total,0),cx,base-hn-hd-6,{align:'center',size:10.5,peso:'700'});}
      else{X.setLineDash([3,3]);X.strokeStyle=COL.neutro;X.strokeRect(x0,base-24,bw,24);X.setLineDash([]);txt(X,'—',cx,base-8,{align:'center',size:11,color:COL.mut});}
      txt(X,d.nombre.slice(0,3),cx,base+16,{align:'center',size:11,peso:d.actual?'700':'400',color:d.actual?COL.ink:COL.mut});txt(X,dmy(d.fechaMostrar).slice(0,5),cx,base+30,{align:'center',size:9.5,color:COL.mut});});
    if(m.semana.promedio>0){const y=base-alto*m.semana.promedio/max;X.setLineDash([6,4]);X.strokeStyle=COL.cap;X.lineWidth=1.6;X.beginPath();X.moveTo(izq,y);X.lineTo(izq+ancho,y);X.stroke();X.setLineDash([]);X.lineWidth=1;txt(X,'Prom. '+formato(m.semana.promedio),izq+ancho,y-5,{align:'right',size:10.5,peso:'700'});}
    return L.c;
  }
  /** Pareto de paradas por motivo (solo las que tienen minutos registrados). */
  function graficoParadas(m){
    const L=lienzo(600,230),X=L.x;titulo(L,'Paradas por motivo (minutos)','Solo las paradas con minutos registrados.');
    if(!m.paradas.length){txt(X,'Sin paradas con minutos registrados en este día.',L.w/2,130,{align:'center',size:13,color:COL.mut});txt(X,'Registra cada parada con su motivo y minutos para verla aquí.',L.w/2,152,{align:'center',size:11,color:COL.mut});return L.c;}
    const izq=130,der=150,top=60,fila=Math.min(34,160/m.paradas.length),ancho=L.w-izq-der-70,max=Math.max(...m.paradas.map(p=>p.minutos));let acum=0;const tot=m.paradasMin;
    m.paradas.slice(0,6).forEach((p,i)=>{acum+=p.minutos;const y=top+i*fila,w=ancho*p.minutos/max;txt(X,p.motivo,izq-8,y+fila/2+4,{align:'right',size:11.5});X.fillStyle=COL.dia;X.fillRect(izq,y+4,w,fila-10);
      txt(X,formato(p.minutos)+' min',izq+w+6,y+fila/2+4,{size:11.5,peso:'700'});txt(X,Math.round(p.minutos/tot*100)+'% · acum. '+Math.round(acum/tot*100)+'%',L.w-der+60,y+fila/2+4,{size:10,color:COL.mut});});
    return L.c;
  }
  /** Carta de control diaria: ¿el día fue normal o pasó algo real? Un punto por día de producción; límites por rango móvil. */
  function graficoControl(m){
    const c=m.control,L=lienzo(600,270),X=L.x;titulo(L,'Carta de control diaria ('+m.unidadMetrica+')',m.vista==='AMBOS'?'Cada punto: la noche más el día siguiente. Punto vacío: día aún no finalizado.':'Cada punto: un turno '+(m.vista==='NOCHE'?'noche':'día')+'. Punto vacío: turno aún no finalizado.');
    if(!c.puntos.length){txt(X,m.vista==='AMBOS'?'Todavía no hay días con noche y día reportados.':'Todavía no hay turnos reportados.',L.w/2,150,{align:'center',size:13,color:COL.mut});return L.c;}
    const izq=58,der=86,top=62,base=224,ancho=L.w-izq-der,alto=base-top;
    const mx=nice(Math.max(...c.puntos.map(p=>p.kg),c.suficiente?c.ucl:0)*1.06),n=c.puntos.length,px=i=>izq+ancho*(i+.5)/n,py=v=>base-alto*v/mx;
    for(let i=0;i<=4;i++){const v=mx*i/4,y=py(v);X.strokeStyle=COL.grid;X.beginPath();X.moveTo(izq,y);X.lineTo(izq+ancho,y);X.stroke();txt(X,m.enUnidades?formato(v,0):formato(v/1000,0)+' t',izq-6,y+4,{align:'right',size:10,color:COL.mut});}
    const raya=(v,col,et,dash)=>{X.setLineDash(dash||[]);X.strokeStyle=col;X.lineWidth=1.6;X.beginPath();X.moveTo(izq,py(v));X.lineTo(izq+ancho,py(v));X.stroke();X.setLineDash([]);X.lineWidth=1;txt(X,et+' '+formato(v),izq+ancho+6,py(v)+4,{size:10.5,color:col,peso:'700'});};
    if(c.completos>=2){raya(c.mu,'#7a8a98','Prom.');}
    if(c.suficiente){raya(c.ucl,COL.mal,'LCS',[5,4]);raya(c.lcl,COL.mal,'LCI',[5,4]);}
    X.strokeStyle=COL.noche;X.lineWidth=2;X.beginPath();c.puntos.forEach((p,i)=>{i?X.lineTo(px(i),py(p.kg)):X.moveTo(px(i),py(p.kg));});X.stroke();X.lineWidth=1;
    c.puntos.forEach((p,i)=>{const fuera=c.fuera.includes(p.fechaTN);X.beginPath();X.arc(px(i),py(p.kg),fuera?6:4.5,0,Math.PI*2);X.fillStyle=p.provisional?'#ffffff':(fuera?COL.mal:COL.noche);X.fill();X.lineWidth=2;X.strokeStyle=fuera?COL.mal:COL.noche;X.stroke();X.lineWidth=1;});
    const paso=Math.max(1,Math.ceil(n/12));c.puntos.forEach((p,i)=>{if(i%paso===0||i===n-1)txt(X,dmy(p.fechaMostrar).slice(0,5),px(i),base+16,{align:'center',size:10,color:COL.mut});});
    let msg='';if(!c.suficiente)msg='Faltan días completos para los límites: hay '+c.completos+' y se necesitan 8.';else if(c.racha)msg='Atención: '+c.racha.n+' días seguidos por '+c.racha.lado+' del promedio.';else if(c.fuera.length)msg=c.fuera.length+' día(s) fuera de los límites.';else msg='Todos los días dentro de los límites: variación normal.';
    txt(X,msg,izq,L.h-10,{size:11.5,peso:'700',color:(c.suficiente&&(c.racha||c.fuera.length))?COL.mal:COL.mut});
    return L.c;
  }
  /** Mezcla por marca: kilos reales del período, 3 kg y 1.5 kg apilados, con el % del total. */
  function graficoMarcas(m){
    const lista=m.marcas.slice(0,9),rh=29,L=lienzo(600,Math.max(150,78+lista.length*rh+26)),X=L.x;titulo(L,'Mezcla por marca ('+m.unidadMetrica+')','Últimos '+m.periodo.dias+' días hasta el '+dmy(m.periodo.hasta)+'.'+(m.vista==='AMBOS'?'':' Solo turno '+(m.vista==='NOCHE'?'noche':'día')+'.'));const PAL=[COL.p3,COL.p15,'#8e9cf5',COL.neutro],colPres=pr=>PAL[Math.max(0,(m.presPeriodo||[]).indexOf(pr))%PAL.length];
    leyenda(L,(m.presPeriodo&&m.presPeriodo.length?m.presPeriodo:['3 kg','1.5 kg']).map(pr=>[colPres(pr),m.unidad==='vasos'?'Vasos':cap1(m.unidad)+' de '+pr]),56);
    if(!lista.length){txt(X,'Sin producción en este período.',L.w/2,L.h/2+20,{align:'center',size:13,color:COL.mut});return L.c;}
    const izq=96,der=112,top=68,ancho=L.w-izq-der,mx=nice(Math.max(...lista.map(a=>a.kg))*1.2);
    lista.forEach((a,i)=>{const y=top+i*rh;txt(X,a.marca,izq-8,y+16,{align:'right',size:11.5});let x0=izq;
      Object.keys(a.kgPorPres).sort((p,q)=>(q.localeCompare(p,'es',{numeric:true}))).forEach(pr=>{const w=ancho*a.kgPorPres[pr]/mx;X.fillStyle=colPres(pr);X.fillRect(x0,y+2,w,rh-9);x0+=w;});
      txt(X,formato(a.kg)+' '+m.unidadMetrica,x0+6,y+16,{size:11,peso:'700'});txt(X,a.pct.toFixed(1)+' %',L.w-der+66,y+16,{align:'right',size:10.5,color:COL.mut});});
    return L.c;
  }
  /** Línea de abajo de la tarjeta de un turno: eficiencia si hay capacidad; si no, lo producido (vasos y jabas · bolsas) o «Sin reporte». */
  const subTurno=(m,t)=>t.eficiencia!==null?'Eficiencia '+t.eficiencia.toFixed(2)+' %':(t.reportes?(m.enUnidades?formato(t.pesoKg,2)+' kg'+(t.jabas!==null?' · '+t.jabas.toFixed(2)+' jabas':''):formato(t.bolsas)+' '+m.unidad+' · '+formato(t.pesoKg,2)+' kg'):'Sin reporte');
  const nucleoNominal=p=>{const N=nucleo();return N?N.kgNominal(p):0;};
  const cap1=t=>String(t||'').charAt(0).toUpperCase()+String(t||'').slice(1);
  /** Valor de la medida principal con su unidad: «11,450.25 kg» · «190 vasos». */
  const fU=(m,v,d)=>formato(v,d===undefined?(m.enUnidades?0:2):d)+' '+m.unidadMetrica;
  /** Mapa de calor día × turno: miles de kg por turno; más oscuro = más producción; punteado = sin reporte. */
  function graficoMapa(m,ancho){
    const w=ancho||600,k=m.mapa,n=k.fechas.length,izq=64,ch=44,top=64,nf=m.vista==='AMBOS'?2:1,L=lienzo(w,top+ch*nf+46),X=L.x;titulo(L,'Mapa de calor día × turno ('+(m.enUnidades?m.unidad:'miles de kg')+')','Del '+dmy(m.periodo.desde)+' al '+dmy(m.periodo.hasta)+'. Punteado: turno sin reporte.');
    const cw=(w-izq-14)/n,max=Math.max(1,...k.dia.filter(Boolean),...k.noche.filter(Boolean));
    [['Día',k.dia,m.vista!=='NOCHE'],['Noche',k.noche,m.vista!=='DIA']].filter(x=>x[2]).forEach(([nom,vals],j)=>{const y=top+j*ch;txt(X,nom,izq-10,y+ch/2+4,{align:'right',size:12,peso:'700'});
      vals.forEach((v,i)=>{const x=izq+i*cw+1.5,yy=y+1.5,ww=cw-3,hh=ch-3;
        if(!v){X.setLineDash([3,3]);X.strokeStyle='#c5d3de';X.strokeRect(x,yy,ww,hh);X.setLineDash([]);return;}
        const p=v/max,r=Math.round(230-(230-10)*p),g=Math.round(241-(241-95)*p),b=Math.round(248-(248-134)*p);X.fillStyle='rgb('+r+','+g+','+b+')';X.fillRect(x,yy,ww,hh);
        if(cw>=30)txt(X,m.enUnidades?String(Math.round(v)):(v/1000).toFixed(1),x+ww/2,yy+hh/2+4,{align:'center',size:11,peso:'700',color:p>.5?'#ffffff':COL.ink});});});
    const paso=Math.max(1,Math.ceil(n/14));k.fechas.forEach((f,i)=>{if(i%paso===0||i===n-1)txt(X,f.slice(8,10)+'/'+f.slice(5,7),izq+i*cw+cw/2,top+ch*nf+16,{align:'center',size:10,color:COL.mut});});
    txt(X,m.vista!=='AMBOS'?('Solo se muestra el turno '+(m.vista==='NOCHE'?'noche':'día')+'.'):k.diasConAmbos?('La noche produjo más que el día en '+k.nochePorEncima+' de '+k.diasConAmbos+' días con los dos turnos reportados.'):'Aún no hay días con los dos turnos reportados.',izq,top+ch*nf+36,{size:11,color:COL.mut});
    return L.c;
  }
  const GRAFICOS={capacidad:graficoCapacidad,presentacion:graficoPresentacion,semana:graficoSemana,paradas:graficoParadas,control:graficoControl,marcas:graficoMarcas,mapa:m=>graficoMapa(m,1200)};
  function graficos(m){const o={};Object.keys(GRAFICOS).forEach(k=>{o[k]=GRAFICOS[k](m);});return o;}
  function cajasSolo(m){
    const n=m.vista==='NOCHE',T=n?m.noche:m.dia,pal=r2(m.filas.reduce((s,x)=>s+(((n?x.noche:x.dia)[m.extra==='jabas'?'jabas':'paletas'])||0),0));
    return [['TURNO '+T.nombre+' '+T.fechaTxt,fU(m,T.kg),subTurno(m,T),n?COL.noche:COL.dia],
      [String(m.unidad).toUpperCase(),formato(T.bolsas),m.extra?formato(pal,2)+' '+m.extra:'Peso '+formato(T.pesoKg,2)+' kg','#0a2745'],
      ['JORNADA',T.jornadaH!==null?T.jornadaH.toFixed(2)+' h':'—',T.supervisor||'Sin responsable','#6250d6'],
      ['TOTAL SEMANA '+m.semanaNum,fU(m,m.totalSemanaKg),'Solo turno '+(n?'noche':'día')+' · '+m.semana.dias.filter(d=>d.hayDatos).length+' de 7 días','#157a3b']];
  }
  /** Tabla de las marcas producidas en el turno (o en cada turno): bolsas, peso, paletas y lote. Solo filas con producción. */
  function tablaMarcas(m,W,pad){
    const filas=m.filas.filter(f=>(m.vista!=='DIA'&&f.noche.bolsas>0)||(m.vista!=='NOCHE'&&f.dia.bolsas>0));
    const bl=[];if(m.vista!=='DIA')bl.push(['NOCHE',m.noche,'#d9d9d9','noche']);if(m.vista!=='NOCHE')bl.push(['DÍA',m.dia,'#bdd7ee','dia']);
    const rh=24,n=Math.max(1,filas.length),alto=84+n*rh+rh+12;
    const dibujar=(X,y)=>{
      txt(X,m.vista==='AMBOS'?'Marcas producidas por turno':'Marcas producidas en el turno '+(m.vista==='NOCHE'?'noche':'día'),pad,y+18,{size:15,peso:'700'});
      const ex=m.extra==='paletas'?'Paletas':m.extra==='jabas'?'Jabas':null,valEx=c=>m.extra==='paletas'?c.paletas:c.jabas;
      const wm=250,wb=(W-pad*2-wm)/bl.length,cols=[[cap1(m.unidad),.2,'r'],['Peso (kg)',.28,'r']].concat(ex?[[ex,.2,'r']]:[],[['Lote',ex?.32:.52,'l']]);
      const recorta=(t,w)=>{X.font='12px '+FUENTE;let r=String(t);while(r.length>1&&X.measureText(r).width>w){r=r.slice(0,-2);}return r===String(t)?r:r+'…';};
      const colX=(i,j)=>pad+wm+i*wb+cols.slice(0,j).reduce((a,c)=>a+c[1]*wb,0);
      X.fillStyle='#eef3f7';X.fillRect(pad,y+60,W-pad*2,24);txt(X,'Marca (presentación)',pad+8,y+77,{size:11.5,peso:'700',color:COL.mut});
      bl.forEach(([nom,t,col],i)=>{X.fillStyle=col;X.fillRect(pad+wm+i*wb,y+32,wb-4,26);txt(X,nom+' · '+t.fechaTxt,pad+wm+i*wb+8,y+50,{size:12.5,peso:'700'});
        cols.forEach(([c,f,al],j)=>{const x1=colX(i,j),w=f*wb;txt(X,c,al==='r'?x1+w-10:x1+8,y+77,{size:11.5,peso:'700',color:COL.mut,align:al==='r'?'right':'left'});});});
      if(!filas.length){txt(X,'Sin producción registrada.',pad+8,y+84+rh-7,{size:13,color:COL.mut});}
      filas.forEach((f,k)=>{const yy=y+84+k*rh;if(k%2){X.fillStyle='#f7fafc';X.fillRect(pad,yy,W-pad*2,rh);}
        txt(X,f.etiqueta,pad+8,yy+17,{size:12.5});
        bl.forEach(([nom,t,col,k2],i)=>{const c=k2==='noche'?f.noche:f.dia,v=[c.bolsas?formato(c.bolsas):'',c.bolsas?formato(c.pesoKg,2):''].concat(ex?[valEx(c)!==null&&c.bolsas?formato(valEx(c),2):'']:[],[c.lote||'']);
          cols.forEach(([,fr,al],j)=>{if(!v[j])return;const x1=colX(i,j),w=fr*wb;if(j===cols.length-1)txt(X,recorta(v[j],w-12),x1+8,yy+17,{size:12});else txt(X,v[j],x1+w-10,yy+17,{size:12.5,peso:j===1?'700':'400',align:'right'});});});});
      const yt=y+84+n*rh;X.strokeStyle=COL.ink;X.lineWidth=1.2;X.beginPath();X.moveTo(pad,yt);X.lineTo(W-pad,yt);X.stroke();X.lineWidth=1;
      txt(X,'TOTAL',pad+8,yt+17,{size:12.5,peso:'700'});
      bl.forEach(([nom,t,col,k2],i)=>{const pal=r2(m.filas.reduce((a,f)=>a+((valEx(k2==='noche'?f.noche:f.dia))||0),0)),v=[formato(t.bolsas),formato(t.pesoKg,2)].concat(ex?[pal?formato(pal,2):'']:[]);
        cols.slice(0,cols.length-1).forEach(([,fr],j)=>{if(v[j])txt(X,v[j],colX(i,j)+fr*wb-10,yt+17,{size:12.5,peso:'700',align:'right'});});});
    };
    return {alto,dibujar};
  }
  /** Imagen única para WhatsApp: cabecera, kilos y eficiencia por turno, y las 4 gráficas. */
  function imagen(m){
    const g=graficos(m),W=1240,pad=20,cw=(W-pad*3)/2,ch=cw*(230/600),h4=cw*(250/600);
    g.mapa=graficoMapa(m,1200);const hh=c=>cw*(c.height/c.width),hMapa=(W-pad*2)*(g.mapa.height/g.mapa.width);
    const obs=[m.noche.observaciones&&('NOCHE: '+m.noche.observaciones.replace(/\n/g,' · ')),m.dia.observaciones&&('DÍA: '+m.dia.observaciones.replace(/\n/g,' · '))].filter(Boolean).join('   ')||'Sin observaciones.';
    // Las observaciones se parten en líneas ANTES de dimensionar la imagen (así nunca se cortan).
    const medidor=lienzo(10,10).x;medidor.font='13px '+FUENTE;const lineas=[];let acum='';
    obs.split(' ').forEach(p=>{if(acum&&medidor.measureText(acum+' '+p).width>W-pad*2){lineas.push(acum);acum=p;}else acum=(acum+' '+p).trim();});lineas.push(acum);
    const tm=tablaMarcas(m,W,pad),alto=216+tm.alto+pad+ch+pad+Math.max(ch,h4)+pad+Math.max(hh(g.control),hh(g.marcas))+pad+hMapa+pad+34+lineas.length*19+pad;const L=lienzo(W,Math.ceil(alto)),X=L.x;
    X.fillStyle='#0a2745';X.fillRect(0,0,W,96);txt(X,m.titulo,pad,40,{size:28,peso:'700',color:'#ffffff'});txt(X,m.subtitulo+' · '+m.fechaLarga.replace(/^./,s=>s.toUpperCase())+' · Semana '+m.semanaNum,pad,70,{size:15,color:'#8fc4ec'});
    const cajas=m.vista!=='AMBOS'?cajasSolo(m):[['NOCHE '+m.noche.fechaTxt,fU(m,m.noche.kg),subTurno(m,m.noche),COL.noche],
      ['DÍA '+m.dia.fechaTxt,fU(m,m.dia.kg),subTurno(m,m.dia),COL.dia],
      ['TOTAL DEL DÍA',fU(m,m.totalDiaKg),'Noche + día','#0a2745'],['TOTAL SEMANA '+m.semanaNum,fU(m,m.totalSemanaKg),m.semana.dias.filter(d=>d.hayDatos).length+' de 7 días con datos','#157a3b']];
    const bw=(W-pad*5)/4;cajas.forEach(([a,b,c,col],i)=>{const x0=pad+i*(bw+pad);X.fillStyle='#f4f8fb';X.fillRect(x0,110,bw,86);X.fillStyle=col;X.fillRect(x0,110,6,86);txt(X,a,x0+18,134,{size:12,peso:'700',color:COL.mut});txt(X,b,x0+18,166,{size:24,peso:'700'});txt(X,c,x0+18,187,{size:12,color:COL.mut});});
    tm.dibujar(X,216);let y=216+tm.alto+pad;X.drawImage(g.capacidad,pad,y,cw,ch);X.drawImage(g.presentacion,pad*2+cw,y,cw,ch);y+=ch+pad;X.drawImage(g.semana,pad,y,cw,h4);X.drawImage(g.paradas,pad*2+cw,y,cw,ch);y+=Math.max(ch,h4)+pad;
    X.drawImage(g.control,pad,y,cw,hh(g.control));X.drawImage(g.marcas,pad*2+cw,y,cw,hh(g.marcas));y+=Math.max(hh(g.control),hh(g.marcas))+pad;
    X.drawImage(g.mapa,pad,y,W-pad*2,hMapa);y+=hMapa+pad;
    txt(X,'OBSERVACIONES',pad,y+14,{size:12,peso:'700',color:COL.mut});lineas.forEach((l,i)=>txt(X,l,pad,y+34+i*19,{size:13}));
    return L.c;
  }
  /* ------------------------------------------------------------------ Resumen de planta: gráficas e imagen */
  const COL_PROD={CUBOS:'#2a78d6',PREMIUM:'#6250d6',VASOS:'#1fa3a3'};
  const NOMBRE_PROD={CUBOS:'Cubos',PREMIUM:'Premium',VASOS:'Vasos'};
  /** Producción de la semana por producto (kg): una columna por día, apilada por producto, con el promedio. */
  function graficoPlantaSemana(m){
    const L=lienzo(600,260),X=L.x;titulo(L,'Producción de la semana por producto (kg)','Cada columna: la noche de ese día más el día siguiente.');leyenda(L,PLANTA_PRODUCTOS.map(id=>[COL_PROD[id],NOMBRE_PROD[id]]),56);
    const izq=56,der=14,top=76,base=210,ancho=L.w-izq-der,alto=base-top,dias=m.semana.dias,max=nice(Math.max(1,...dias.map(d=>d.total),m.semana.promedio)*1.12);
    for(let i=0;i<=4;i++){const v=max*i/4,y=base-alto*i/4;X.strokeStyle=COL.grid;X.beginPath();X.moveTo(izq,y);X.lineTo(izq+ancho,y);X.stroke();txt(X,formato(v),izq-6,y+4,{align:'right',size:10,color:COL.mut});}
    const g=ancho/7,bw=Math.min(40,g-14);
    dias.forEach((d,i)=>{const cx=izq+g*(i+.5),x0=cx-bw/2;let y=base;
      if(d.hayDatos){PLANTA_PRODUCTOS.forEach(id=>{const h=alto*d.porProd[id]/max;if(h>0){X.fillStyle=COL_PROD[id];X.fillRect(x0,y-h,bw,h);y-=h;}});txt(X,formato(d.total,0),cx,y-6,{align:'center',size:10.5,peso:'700'});}
      else{X.setLineDash([3,3]);X.strokeStyle=COL.neutro;X.strokeRect(x0,base-24,bw,24);X.setLineDash([]);txt(X,'—',cx,base-8,{align:'center',size:11,color:COL.mut});}
      txt(X,d.nombre.slice(0,3),cx,base+16,{align:'center',size:11,peso:d.actual?'700':'400',color:d.actual?COL.ink:COL.mut});txt(X,dmy(d.fechaTN).slice(0,5),cx,base+30,{align:'center',size:9.5,color:COL.mut});});
    if(m.semana.promedio>0){const y=base-alto*m.semana.promedio/max;X.setLineDash([6,4]);X.strokeStyle=COL.cap;X.lineWidth=1.6;X.beginPath();X.moveTo(izq,y);X.lineTo(izq+ancho,y);X.stroke();X.setLineDash([]);X.lineWidth=1;txt(X,'Prom. '+formato(m.semana.promedio),izq+ancho,y-5,{align:'right',size:10.5,peso:'700'});}
    return L.c;
  }
  /** Mezcla de la planta: kg de cada producto en el período, con su % del total. */
  function graficoPlantaMezcla(m){
    const L=lienzo(600,230),X=L.x;titulo(L,'Mezcla de la planta (kg)','Últimos '+m.periodo.dias+' días hasta el '+dmy(m.periodo.hasta)+'.');
    if(!(m.totalPeriodo>0)){txt(X,'Sin producción en este período.',L.w/2,130,{align:'center',size:13,color:COL.mut});return L.c;}
    const izq=96,der=140,top=64,rh=44,ancho=L.w-izq-der-70,mx=Math.max(...m.mezcla.map(x=>x.kg),1);
    m.mezcla.forEach((x,i)=>{const y=top+i*rh,w=ancho*x.kg/mx;txt(X,NOMBRE_PROD[x.id],izq-8,y+22,{align:'right',size:12.5});X.fillStyle=COL_PROD[x.id];X.fillRect(izq,y+6,Math.max(0,w),rh-18);
      txt(X,formato(x.kg)+' kg',izq+w+6,y+22,{size:11.5,peso:'700'});txt(X,x.pct.toFixed(1)+' %'+(x.id==='VASOS'?' · '+formato(x.unidades)+' vasos':''),L.w-der+10,y+22,{size:10.5,color:COL.mut});});
    return L.c;
  }
  function graficosPlanta(m){return {semana:graficoPlantaSemana(m),mezcla:graficoPlantaMezcla(m)};}
  /** Imagen del Resumen de planta (PNG para WhatsApp): cabecera, kg por producto, las dos gráficas y la tabla del día. */
  function imagenPlanta(m){
    const W=1240,pad=20,cw=(W-pad*3)/2,g=graficosPlanta(m),hh=c=>cw*(c.height/c.width);
    const alto=216+20+Math.max(hh(g.semana),hh(g.mezcla))+pad+70+m.productos.length*30+pad+(m.paradas.length?60+Math.min(6,m.paradas.length)*22:0)+pad;
    const L=lienzo(W,Math.ceil(alto)),X=L.x;
    X.fillStyle='#0a2745';X.fillRect(0,0,W,96);txt(X,'RESUMEN DE PLANTA · HIELO',pad,40,{size:28,peso:'700',color:'#ffffff'});txt(X,m.fechaLarga.replace(/^./,t=>t.toUpperCase())+' · Semana '+m.semanaNum,pad,70,{size:15,color:'#8fc4ec'});
    const cajas=[['TOTAL DEL DÍA',formato(m.totalKg,2)+' kg','Noche + día','#0a2745']].concat(m.productos.map(p=>[p.corto.toUpperCase()+' · NOCHE + DÍA',p.id==='VASOS'?formato(p.totalUnidades)+' vasos':formato(p.totalKg,2)+' kg',p.id==='VASOS'?formato(p.totalKg,2)+' kg · '+(p.jabas||0).toFixed(2)+' jabas':(p.hayDatos?'Noche '+formato(p.noche.kg,0)+' · Día '+formato(p.dia.kg,0):'Sin reporte'),COL_PROD[p.id]]));
    const bw=(W-pad*(cajas.length+1))/cajas.length;cajas.forEach(([a,b,c,col],i)=>{const x0=pad+i*(bw+pad);X.fillStyle='#f4f8fb';X.fillRect(x0,110,bw,86);X.fillStyle=col;X.fillRect(x0,110,6,86);txt(X,a,x0+18,134,{size:11.5,peso:'700',color:COL.mut});txt(X,b,x0+18,166,{size:22,peso:'700'});txt(X,c,x0+18,187,{size:12,color:COL.mut});});
    let y=216;X.drawImage(g.semana,pad,y,cw,hh(g.semana));X.drawImage(g.mezcla,pad*2+cw,y,cw,hh(g.mezcla));y+=Math.max(hh(g.semana),hh(g.mezcla))+pad;
    txt(X,'Producción del día de producción (kg reales)',pad,y+14,{size:14,peso:'700'});y+=26;
    const cols=[['Producto',0,'l'],['Noche',.32,'r'],['Día',.46,'r'],['Total',.6,'r'],['Semana',.74,'r']];X.fillStyle='#eef3f7';X.fillRect(pad,y,W-pad*2,26);
    cols.forEach(([c,f,al])=>txt(X,c,al==='r'?pad+(W-pad*2)*f+90:pad+8,y+18,{size:11.5,peso:'700',color:COL.mut,align:al==='r'?'right':'left'}));y+=26;
    m.productos.forEach(p=>{const sem=r2(m.semana.dias.reduce((s,d)=>s+d.porProd[p.id],0));txt(X,p.nombre,pad+8,y+19,{size:13});
      [formato(p.noche.kg,2),formato(p.dia.kg,2),formato(p.totalKg,2),formato(sem,2)].forEach((v,i)=>txt(X,v,pad+(W-pad*2)*cols[i+1][1]+90,y+19,{size:13,peso:i===2?'700':'400',align:'right'}));y+=30;});
    if(m.paradas.length){y+=pad;txt(X,'Paradas con minutos (todos los productos)',pad,y+14,{size:14,peso:'700'});y+=26;m.paradas.slice(0,6).forEach(p=>{txt(X,NOMBRE_PROD[p.producto]+' · '+p.turno+' · '+(p.equipo?p.equipo+' · ':'')+p.motivo+': '+formato(p.minutos)+' min',pad+8,y+16,{size:12.5});y+=22;});}
    return L.c;
  }
  API.graficosPlanta=graficosPlanta;API.imagenPlanta=imagenPlanta;API.graficoPlantaSemana=graficoPlantaSemana;API.graficoPlantaMezcla=graficoPlantaMezcla;
  API.graficos=graficos;API.graficoCapacidad=graficoCapacidad;API.graficoPresentacion=graficoPresentacion;API.graficoSemana=graficoSemana;API.graficoParadas=graficoParadas;API.graficoControl=graficoControl;API.graficoMarcas=graficoMarcas;API.graficoMapa=graficoMapa;API.imagen=imagen;
})(typeof window!=='undefined'?window:globalThis);
