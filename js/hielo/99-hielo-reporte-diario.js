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
    o=o||{};const N=nucleo(),cfg=Object.assign({},N&&N.DEFECTO,o.cfg||{}),fecha=o.fecha,fNoche=sumar(fecha,-1);
    const reps=(o.reportes||[]).filter(Boolean);
    const peso=p=>{const v=num((cfg.pesos||{})[p]);if(v>0)return v;const d=num(((N&&N.DEFECTO)||{}).pesos&&N.DEFECTO.pesos[p]);return d>0?d:(N?N.kgNominal(p):0);};
    const porPaleta=p=>{const v=num((cfg.bolsasPorPaleta||{})[p]);return v>0?v:0;};
    const cap=num(cfg.capacidadTurnoKg)>0?num(cfg.capacidadTurnoKg):0;
    const de=(f,turnos)=>reps.filter(r=>r.fecha===f&&turnos.includes(r.turno));
    const kgDe=lista=>r2(lista.reduce((s,r)=>s+(r.produccion||[]).reduce((t,p)=>t+Math.max(0,Math.round(num(p.bolsas)))*peso(texto(p.presentacion)),0),0));
    const catalogo=(o.catalogo&&o.catalogo.length?o.catalogo:[]).map(x=>[texto(x[0]),texto(x[1])]);
    const claves=new Set(catalogo.map(x=>x[0]+'|'+x[1]));
    // Filas: el catálogo de la planta (mismo orden que el Excel) y, al final, lo producido que no esté en el catálogo.
    const extras=[];
    reps.filter(r=>(r.fecha===fNoche&&r.turno==='NOCHE')||(r.fecha===fecha&&['DÍA','INTERMEDIO'].includes(r.turno))).forEach(r=>(r.produccion||[]).forEach(p=>{
      const k=texto(p.marca)+'|'+texto(p.presentacion);if(texto(p.marca)&&texto(p.presentacion)&&!claves.has(k)){claves.add(k);extras.push([texto(p.marca),texto(p.presentacion)]);}
    }));
    const pares=catalogo.concat(extras);
    const etiqueta=(m,p)=>m.toUpperCase()+' ('+p.replace(/\s+/g,'').toUpperCase()+')';

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
      const celda=(m,p)=>{const x=mapa.get(m+'|'+p);if(!x)return {bolsas:0,horas:null,paletas:null,lote:'',vence:'',kg:0};
        const pal=porPaleta(p);return {bolsas:x.bolsas,horas:x.horas>0?r2(x.horas):null,paletas:pal>0?r2(x.bolsas/pal):null,lote:x.lotes.join(' / '),vence:x.vence.join(' / '),kg:r2(x.bolsas*peso(p))};};
      const porPres=new Map();
      mapa.forEach((x,k)=>{const p=k.split('|')[1];const a=porPres.get(p)||{bolsas:0,kg:0};a.bolsas+=x.bolsas;a.kg=r2(a.kg+x.bolsas*peso(p));porPres.set(p,a);});
      const bolsas=[...mapa.values()].reduce((s,x)=>s+x.bolsas,0),kg=kgDe(lista);
      const sup=[...new Set(lista.map(r=>texto(r.supervisor)).filter(Boolean))];
      const ini=lista.map(r=>texto(r.horaInicio)).filter(Boolean).sort(),fin=lista.map(r=>texto(r.horaFin)).filter(Boolean).sort();
      const i0=ini[0]||'',f0=fin.length?fin[fin.length-1]:'';
      let jornada=null;if(minutosDe(i0)!==null&&minutosDe(f0)!==null){jornada=r2(((minutosDe(f0)-minutosDe(i0)+1440)%1440)/60);}
      const estado=!lista.length?'SIN_REPORTE':lista.every(r=>r.estado==='FINALIZADO')?'FINALIZADO':'EN_REGISTRO';
      return {clave,nombre,fecha:f,fechaTxt:dmy(f),estado,reportes:lista.length,bolsas,kg,eficiencia:cap>0&&lista.length?r2(kg/cap*100):null,
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
    const inicio=sumar(fNoche,-diaSemana(fNoche));
    const dias=DIAS.map((nombre,i)=>{
      const tn=sumar(inicio,i),td=sumar(tn,1),ln=de(tn,['NOCHE']),ld=de(td,['DÍA','INTERMEDIO']);
      const kn=kgDe(ln),kd=kgDe(ld);
      return {nombre,fechaTN:tn,fechaTD:td,kgTN:kn,kgTD:kd,total:r2(kn+kd),hayTN:ln.length>0,hayTD:ld.length>0,hayDatos:ln.length>0||ld.length>0,actual:tn===fNoche};
    });
    const conDatos=dias.filter(d=>d.hayDatos);
    const totalSemana=r2(dias.reduce((s,d)=>s+d.total,0));
    // Paradas con minutos registrados, por motivo (Pareto).
    const pm=new Map();noche.paradas.concat(dia.paradas).forEach(p=>{const a=pm.get(p.motivo)||{motivo:p.motivo,minutos:0,eventos:0};a.minutos+=p.minutos;a.eventos++;pm.set(p.motivo,a);});
    const paradas=[...pm.values()].sort((a,b)=>b.minutos-a.minutos);
    return {fecha,fNoche,fechaLarga:fechaLarga(fecha),semanaNum:semanaISO(fecha),titulo:'REPORTE DIARIO DE PRODUCCIÓN',subtitulo:'HIELO EN CUBOS',
      capacidad:cap,pesos:Object.fromEntries(presLista.map(p=>[p,peso(p)])),noche,dia,filas,presentaciones,
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
    ws.columns=[{width:26}].concat(Array.from({length:12},(_,i)=>({width:[9,9,10,12,13,12][i%6]})));
    const celda=(ref,v,o)=>{o=o||{};const c=ws.getCell(ref);c.value=v;if(o.fmt)c.numFmt=o.fmt;c.font={name:'Arial',size:o.size||10,bold:!!o.bold,color:o.color?{argb:o.color}:undefined,italic:!!o.italic};
      if(o.fill)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:o.fill}};c.alignment={horizontal:o.align||'center',vertical:'middle',wrapText:!!o.wrap};if(o.borde!==false)c.border=borde;return c;};
    const unir=(rango,v,o)=>{ws.mergeCells(rango);return celda(rango.split(':')[0],v,o);};
    unir('A1:M1',m.titulo,{size:18,bold:true,borde:false});ws.getRow(1).height=30;
    unir('A2:M2',m.subtitulo,{size:12,bold:true,borde:false});
    unir('A3:M3',m.fechaLarga.charAt(0).toUpperCase()+m.fechaLarga.slice(1),{size:10,bold:true,align:'right',borde:false});
    // Totales
    celda('A5','TURNO NOCHE',{bold:true,align:'left',color:'FFC00000'});unir('B5:C5',m.noche.kg,{fmt:'#,##0.00',bold:true,color:'FFC00000'});celda('D5','KG',{align:'left'});
    celda('A6','TURNO DÍA',{bold:true,align:'left',color:'FFC00000'});unir('B6:C6',m.dia.kg,{fmt:'#,##0.00',bold:true,color:'FFC00000'});celda('D6','KG',{align:'left'});
    celda('A7','TOTAL SEMANA',{bold:true,align:'left',color:'FF2E7D32'});unir('B7:C7',m.totalSemanaKg,{fmt:'#,##0.00',bold:true,color:'FF2E7D32'});celda('D7','KG',{align:'left'});
    celda('F5','SEMANA',{bold:true});celda('G5',m.semanaNum,{bold:true});
    celda('F6','CAPACIDAD / TURNO',{bold:true,size:9});unir('G6:H6',m.capacidad||null,{fmt:'#,##0',size:9});
    // Personal
    celda('A9','REPORTE DE PERSONAL',{bold:true,fill:BLANCO});
    [['NOCHE',m.noche,'B','G',GRIS],['DÍA',m.dia,'H','M',CELESTE]].forEach(([n,t,a,b,col])=>{
      unir(a+'9:'+b+'9','TURNO '+n+' · '+(t.fechaTxt||''),{bold:true,fill:col});
      unir(a+'10:'+b+'10','Ingreso '+(t.ingreso||'—')+' · Salida '+(t.salida||'—')+(t.jornadaH!==null?' · Jornada '+t.jornadaH.toFixed(2)+' h':''),{fill:col});
      unir(a+'11:'+b+'11','Supervisor: '+(t.supervisor||'—'),{fill:col});});
    celda('A10','INGRESO / SALIDA',{align:'left'});celda('A11','RESPONSABLE',{align:'left'});
    // Tabla por marca
    celda('A13','REPORTE POR MARCA',{bold:true,fill:BLANCO});
    unir('B13:G13','NOCHE · '+DIAS[diaSemana(m.fNoche)]+' '+m.noche.fechaTxt,{bold:true,fill:GRIS});
    unir('H13:M13','DÍA · '+DIAS[diaSemana(m.fecha)]+' '+m.dia.fechaTxt,{bold:true,fill:CELESTE});
    const cab=['BOLSAS','TIEMPO (H)','N° PALETAS','LOTE','F. VENCIMIENTO','PESO (KG)'];
    celda('A14','PRESENTACIÓN',{bold:true,align:'left'});
    cab.forEach((t,i)=>{celda(String.fromCharCode(66+i)+'14',t,{bold:true,fill:GRIS,size:9,wrap:true});celda(String.fromCharCode(72+i)+'14',t,{bold:true,fill:CELESTE,size:9,wrap:true});});
    let f=15;
    const col=(ini,i)=>String.fromCharCode(ini+i)+f;
    m.filas.forEach((fi,k)=>{
      celda('A'+f,(k+1)+'  '+fi.etiqueta,{align:'left'});
      [[66,fi.noche],[72,fi.dia]].forEach(([ini,c])=>{
        const vacio=!c.bolsas;
        celda(col(ini,0),vacio?null:c.bolsas,{fmt:'#,##0',bold:true});celda(col(ini,1),c.horas,{fmt:'0.00'});celda(col(ini,2),c.paletas,{fmt:'0.00'});
        celda(col(ini,3),c.lote||null);celda(col(ini,4),c.vence||null);celda(col(ini,5),vacio?null:c.kg,{fmt:'#,##0.00',bold:true});
      });
      f++;
    });
    celda('A'+f,'TOTAL',{bold:true,align:'left',fill:'FFF2F2F2'});
    [[66,m.noche],[72,m.dia]].forEach(([ini,t])=>{
      celda(col(ini,0),t.bolsas||null,{fmt:'#,##0',bold:true,fill:'FFF2F2F2'});celda(col(ini,1),null,{fill:'FFF2F2F2'});
      celda(col(ini,2),r2(m.filas.reduce((s,x)=>s+(((ini===66?x.noche:x.dia).paletas)||0),0))||null,{fmt:'0.00',bold:true,fill:'FFF2F2F2'});
      celda(col(ini,3),null,{fill:'FFF2F2F2'});celda(col(ini,4),null,{fill:'FFF2F2F2'});celda(col(ini,5),t.kg||null,{fmt:'#,##0.00',bold:true,fill:'FFF2F2F2'});
    });
    const filaTotal=f;f+=2;
    // Gráficas (imágenes) en 2 × 2
    const pos=[['capacidad',0,0],['presentacion',6,0],['semana',0,1],['paradas',6,1]];
    const alto=16;let hayImg=false;
    pos.forEach(([k,c,r])=>{
      if(!imgs[k])return;hayImg=true;
      const id=wb.addImage({base64:imgs[k],extension:'png'});
      ws.addImage(id,{tl:{col:c===0?0:6.15,row:f-1+r*alto},ext:{width:c===0?640:600,height:alto*20-6}});
    });
    if(hayImg)f+=alto*2+1;
    // Observaciones y firmas
    celda('A'+f,'OBSERVACIONES:',{bold:true,align:'left',borde:false});
    unir('B'+f+':M'+f,[m.noche.observaciones&&('NOCHE: '+m.noche.observaciones.replace(/\n/g,' · ')),m.dia.observaciones&&('DÍA: '+m.dia.observaciones.replace(/\n/g,' · '))].filter(Boolean).join('\n')||'—',{align:'left',wrap:true,borde:false});
    ws.getRow(f).height=Math.max(30,15*Math.ceil(((m.noche.observaciones+m.dia.observaciones).length||1)/120));
    f+=3;
    ['Líder de línea','Encargados de máquinas de HIELO',m.noche.supervisor||m.dia.supervisor?('Supervisor(a) de Producción · '+[m.noche.supervisor,m.dia.supervisor].filter(Boolean).join(' / ')):'Supervisor(a) de Producción'].forEach((t,i)=>{
      const rango=['A'+f+':C'+f,'E'+f+':H'+f,'J'+f+':M'+f][i];ws.mergeCells(rango);const c=ws.getCell(rango.split(':')[0]);c.value=t;c.font={name:'Arial',size:9,italic:true};c.alignment={horizontal:'center'};c.border={top:{style:'thin'}};});
    // ---- Hoja 2: resumen y semana
    const w2=wb.addWorksheet('Resumen y semana',{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9},views:[{showGridLines:false}]});
    w2.columns=[{width:30}].concat(Array.from({length:14},()=>({width:12})));
    const c2=(ref,v,o)=>{o=o||{};const c=w2.getCell(ref);c.value=v;if(o.fmt)c.numFmt=o.fmt;c.font={name:'Arial',size:o.size||10,bold:!!o.bold};if(o.fill)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:o.fill}};c.alignment={horizontal:o.align||'center',vertical:'middle'};c.border=borde;return c;};
    const u2=(rango,v,o)=>{w2.mergeCells(rango);return c2(rango.split(':')[0],v,o);};
    c2('A1','PRODUCCIÓN – PRESENTACIÓN',{bold:true,align:'left'});
    u2('B1:C1','NOCHE · BOLSAS / PESO (KG)',{bold:true,fill:GRIS,size:9});u2('D1:E1','DÍA · BOLSAS / PESO (KG)',{bold:true,fill:CELESTE,size:9});
    m.presentaciones.forEach((p,i)=>{const r=2+i;c2('A'+r,'PRESENTACIÓN '+etiquetaPres(p.presentacion),{align:'left'});
      c2('B'+r,p.noche.bolsas||null,{fmt:'#,##0'});c2('C'+r,p.noche.kg||null,{fmt:'#,##0.00'});c2('D'+r,p.dia.bolsas||null,{fmt:'#,##0'});c2('E'+r,p.dia.kg||null,{fmt:'#,##0.00'});});
    let r=2+m.presentaciones.length;
    c2('A'+r,'PRODUCCIÓN POR TURNO (KG)',{bold:true,align:'left'});u2('B'+r+':C'+r,m.noche.kg,{fmt:'#,##0.00',bold:true,fill:GRIS});u2('D'+r+':E'+r,m.dia.kg,{fmt:'#,##0.00',bold:true,fill:CELESTE});r++;
    c2('A'+r,'EFICIENCIA REAL (%)',{bold:true,align:'left'});u2('B'+r+':C'+r,m.noche.eficiencia,{fmt:'0.00',bold:true,fill:GRIS});u2('D'+r+':E'+r,m.dia.eficiencia,{fmt:'0.00',bold:true,fill:CELESTE});r++;
    c2('A'+r,'PRODUCCIÓN TOTAL (KG)',{bold:true,align:'left'});u2('B'+r+':E'+r,m.totalDiaKg,{fmt:'#,##0.00',bold:true,fill:'FFF8CBAD'});r++;
    c2('A'+r,'CAPACIDAD POR TURNO (KG)',{align:'left',size:9});u2('B'+r+':E'+r,m.capacidad||null,{fmt:'#,##0',size:9});r+=2;
    // Semana
    const base=r;c2('A'+r,'SEMANA '+m.semanaNum+' · '+dmyLargo(m.semana.inicio)+' al '+dmyLargo(m.semana.fin),{bold:true,align:'left',size:9});
    m.semana.dias.forEach((d,i)=>{const a=String.fromCharCode(66+i*2),b=String.fromCharCode(67+i*2);u2(a+r+':'+b+r,d.nombre.toUpperCase(),{bold:true,fill:d.actual?'FFFFE699':'FFF2F2F2'});
      c2(a+(r+1),'TN',{bold:true,fill:GRIS,size:9});c2(b+(r+1),'TD',{bold:true,fill:CELESTE,size:9});
      c2(a+(r+2),dmy(d.fechaTN),{size:9});c2(b+(r+2),dmy(d.fechaTD),{size:9});
      c2(a+(r+3),d.hayTN?d.kgTN:null,{fmt:'#,##0.00'});c2(b+(r+3),d.hayTD?d.kgTD:null,{fmt:'#,##0.00'});
      u2(a+(r+4)+':'+b+(r+4),d.hayDatos?d.total:null,{fmt:'#,##0.00',bold:true,fill:'FFFFF2CC'});});
    c2('A'+(r+1),'',{});c2('A'+(r+2),'',{});c2('A'+(r+3),'PRODUCCIÓN TURNO (KG)',{align:'left'});c2('A'+(r+4),'PRODUCCIÓN TOTAL TURNOS (KG)',{align:'left',bold:true});
    r+=6;c2('A'+r,'PRODUCCIÓN TOTAL SEMANA (KG)',{bold:true,align:'left'});u2('B'+r+':C'+r,m.totalSemanaKg,{fmt:'#,##0.00',bold:true,fill:'FF0A2745'}).font={name:'Arial',size:10,bold:true,color:{argb:BLANCO}};
    return wb;
  }

  /** «3 kg» → «3.0 KG», «1.5 kg» → «1.5 KG» (como la hoja de la planta). */
  function etiquetaPres(p){const N=nucleo(),n=N?N.kgNominal(p):0;return n>0?n.toFixed(1)+' KG':String(p).toUpperCase();}
  const API={modelo,construirExcel,semanaISO,sumar,diaSemana,fechaLarga,dmy,formato,DIAS};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof window==='undefined'||!window.document)return;
  raiz.glacialHieloReporte=API;

  /* ------------------------------------------------------------------ gráficas (canvas) e imagen PNG */
  const COL={noche:'#2a78d6',dia:'#eb6834',ink:'#0e2233',mut:'#587087',grid:'#e3eaf0',pista:'#eef3f7',cap:'#0e2233',ok:'#157a3b',mal:'#c62828',fondo:'#ffffff',neutro:'#9fb0bd'};
  const FUENTE='Arial, Helvetica, sans-serif';
  function lienzo(w,h){const c=document.createElement('canvas'),k=2;c.width=w*k;c.height=h*k;c.style.width='100%';c.style.maxWidth=w+'px';c.style.height='auto';const x=c.getContext('2d');x.scale(k,k);x.fillStyle=COL.fondo;x.fillRect(0,0,w,h);x.textBaseline='alphabetic';return {c,x,w,h};}
  const txt=(x,t,px,py,o)=>{o=o||{};x.font=(o.peso||'400')+' '+(o.size||12)+'px '+FUENTE;x.fillStyle=o.color||COL.ink;x.textAlign=o.align||'left';x.fillText(String(t),px,py);};
  const nice=v=>{const p=Math.pow(10,Math.floor(Math.log10(v||1))),r=v/p;return ([1,1.2,1.6,2,2.4,3,4,5,6,8,10].find(q=>r<=q+1e-9)||10)*p;};
  const titulo=(L,t,sub)=>{txt(L.x,t,14,24,{size:15,peso:'700'});if(sub)txt(L.x,sub,14,41,{size:11,color:COL.mut});};
  const leyenda=(L,items,y)=>{let px=14;items.forEach(([c,t])=>{L.x.fillStyle=c;L.x.fillRect(px,y-9,11,11);txt(L.x,t,px+16,y,{size:11,color:COL.mut});L.x.font='11px '+FUENTE;px+=16+L.x.measureText(t).width+16;});};

  /** Producción vs capacidad por turno (reemplaza «Producción por turno» y «Eficiencia general»: se ve cuánto falta para llenar el turno). */
  function graficoCapacidad(m){
    const L=lienzo(600,230),X=L.x;titulo(L,'Producción vs capacidad por turno','La marca vertical es la capacidad de un turno; el % es la eficiencia.');
    const izq=64,der=24,ancho=L.w-izq-der,max=Math.max(m.capacidad,m.noche.kg,m.dia.kg,1)*1.04,esc=v=>izq+ancho*v/max;
    [['Noche',m.noche,COL.noche,92],['Día',m.dia,COL.dia,150]].forEach(([n,t,col,y])=>{
      txt(X,n,izq-10,y+17,{align:'right',size:13,peso:'700'});X.fillStyle=COL.pista;X.fillRect(izq,y,m.capacidad?esc(m.capacidad)-izq:ancho,26);
      X.fillStyle=col;X.fillRect(izq,y,Math.max(0,esc(t.kg)-izq),26);
      const etiqueta=formato(t.kg,2)+' kg'+(t.eficiencia!==null?'  ·  '+t.eficiencia.toFixed(2)+' %':'');
      const dentro=esc(t.kg)-izq>200;txt(X,etiqueta,dentro?esc(t.kg)-8:esc(t.kg)+8,y+18,{align:dentro?'right':'left',size:12,peso:'700',color:dentro?'#ffffff':COL.ink});});
    if(m.capacidad){const cx=esc(m.capacidad);X.strokeStyle=COL.cap;X.lineWidth=2;X.beginPath();X.moveTo(cx,78);X.lineTo(cx,190);X.stroke();txt(X,'Capacidad '+formato(m.capacidad)+' kg',cx,70,{align:'right',size:11,peso:'700'});}
    X.strokeStyle=COL.grid;X.lineWidth=1;X.beginPath();X.moveTo(izq,196);X.lineTo(izq+ancho,196);X.stroke();
    for(let i=0;i<=4;i++){const v=max*i/4/1.04;txt(X,formato(v),esc(v),212,{align:'center',size:10,color:COL.mut});}
    return L.c;
  }
  /** Kilos por presentación y turno (barras agrupadas con el valor en cada barra). */
  function graficoPresentacion(m){
    const L=lienzo(600,230),X=L.x;titulo(L,'Kilos por presentación','Con los kg reales por bolsa.');leyenda(L,[[COL.noche,'Noche'],[COL.dia,'Día']],56);
    const lista=m.presentaciones.filter(p=>p.noche.bolsas||p.dia.bolsas||['3 kg','1.5 kg'].includes(p.presentacion));
    const izq=52,der=14,top=74,base=196,ancho=L.w-izq-der,alto=base-top,max=nice(Math.max(1,...lista.flatMap(p=>[p.noche.kg,p.dia.kg]))*1.12);
    for(let i=0;i<=4;i++){const v=max*i/4,y=base-alto*i/4;X.strokeStyle=COL.grid;X.beginPath();X.moveTo(izq,y);X.lineTo(izq+ancho,y);X.stroke();txt(X,formato(v),izq-6,y+4,{align:'right',size:10,color:COL.mut});}
    const g=ancho/Math.max(1,lista.length),bw=Math.min(54,g/3);
    lista.forEach((p,i)=>{const cx=izq+g*(i+.5);[[p.noche,COL.noche,-bw-2],[p.dia,COL.dia,2]].forEach(([t,col,dx])=>{
      const h=alto*t.kg/max;if(t.kg>0){X.fillStyle=col;X.fillRect(cx+dx,base-h,bw,h);txt(X,formato(t.kg,0),cx+dx+bw/2,base-h-5,{align:'center',size:11,peso:'700'});}else txt(X,'—',cx+dx+bw/2,base-4,{align:'center',size:11,color:COL.mut});});
      txt(X,'Presentación '+p.presentacion,cx,base+18,{align:'center',size:11,color:COL.mut});});
    return L.c;
  }
  /** Producción de la semana: una columna por día (noche + día siguiente) con el promedio. */
  function graficoSemana(m){
    const L=lienzo(600,250),X=L.x;titulo(L,'Producción de la semana (kg)','Cada columna: la noche de ese día más el día siguiente.');leyenda(L,[[COL.noche,'Noche'],[COL.dia,'Día'],[COL.cap,'Promedio']],56);
    const izq=56,der=14,top=76,base=206,ancho=L.w-izq-der,alto=base-top,max=nice(Math.max(1,...m.semana.dias.map(d=>d.total),m.semana.promedio)*1.12);
    for(let i=0;i<=4;i++){const v=max*i/4,y=base-alto*i/4;X.strokeStyle=COL.grid;X.beginPath();X.moveTo(izq,y);X.lineTo(izq+ancho,y);X.stroke();txt(X,formato(v),izq-6,y+4,{align:'right',size:10,color:COL.mut});}
    const g=ancho/7,bw=Math.min(40,g-14);
    m.semana.dias.forEach((d,i)=>{const cx=izq+g*(i+.5),x0=cx-bw/2;
      if(d.hayDatos){const hn=alto*d.kgTN/max,hd=alto*d.kgTD/max;X.fillStyle=COL.noche;X.fillRect(x0,base-hn,bw,hn);X.fillStyle=COL.dia;X.fillRect(x0,base-hn-hd,bw,hd);
        txt(X,formato(d.total,0),cx,base-hn-hd-6,{align:'center',size:10.5,peso:'700'});}
      else{X.setLineDash([3,3]);X.strokeStyle=COL.neutro;X.strokeRect(x0,base-24,bw,24);X.setLineDash([]);txt(X,'—',cx,base-8,{align:'center',size:11,color:COL.mut});}
      txt(X,d.nombre.slice(0,3),cx,base+16,{align:'center',size:11,peso:d.actual?'700':'400',color:d.actual?COL.ink:COL.mut});txt(X,dmy(d.fechaTN).slice(0,5),cx,base+30,{align:'center',size:9.5,color:COL.mut});});
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
  const GRAFICOS={capacidad:graficoCapacidad,presentacion:graficoPresentacion,semana:graficoSemana,paradas:graficoParadas};
  function graficos(m){const o={};Object.keys(GRAFICOS).forEach(k=>{o[k]=GRAFICOS[k](m);});return o;}
  /** Imagen única para WhatsApp: cabecera, kilos y eficiencia por turno, y las 4 gráficas. */
  function imagen(m){
    const g=graficos(m),W=1240,pad=20,cw=(W-pad*3)/2,ch=cw*(230/600),h4=cw*(250/600);
    const obs=[m.noche.observaciones&&('NOCHE: '+m.noche.observaciones.replace(/\n/g,' · ')),m.dia.observaciones&&('DÍA: '+m.dia.observaciones.replace(/\n/g,' · '))].filter(Boolean).join('   ')||'Sin observaciones.';
    // Las observaciones se parten en líneas ANTES de dimensionar la imagen (así nunca se cortan).
    const medidor=lienzo(10,10).x;medidor.font='13px '+FUENTE;const lineas=[];let acum='';
    obs.split(' ').forEach(p=>{if(acum&&medidor.measureText(acum+' '+p).width>W-pad*2){lineas.push(acum);acum=p;}else acum=(acum+' '+p).trim();});lineas.push(acum);
    const alto=216+ch+pad+Math.max(ch,h4)+pad+34+lineas.length*19+pad;const L=lienzo(W,Math.ceil(alto)),X=L.x;
    X.fillStyle='#0a2745';X.fillRect(0,0,W,96);txt(X,m.titulo,pad,40,{size:28,peso:'700',color:'#ffffff'});txt(X,m.subtitulo+' · '+m.fechaLarga.replace(/^./,s=>s.toUpperCase())+' · Semana '+m.semanaNum,pad,70,{size:15,color:'#8fc4ec'});
    const cajas=[['NOCHE '+m.noche.fechaTxt,formato(m.noche.kg,2)+' kg',m.noche.eficiencia!==null?'Eficiencia '+m.noche.eficiencia.toFixed(2)+' %':'Sin reporte',COL.noche],
      ['DÍA '+m.dia.fechaTxt,formato(m.dia.kg,2)+' kg',m.dia.eficiencia!==null?'Eficiencia '+m.dia.eficiencia.toFixed(2)+' %':'Sin reporte',COL.dia],
      ['TOTAL DEL DÍA',formato(m.totalDiaKg,2)+' kg','Noche + día','#0a2745'],['TOTAL SEMANA '+m.semanaNum,formato(m.totalSemanaKg,2)+' kg',m.semana.dias.filter(d=>d.hayDatos).length+' de 7 días con datos','#157a3b']];
    const bw=(W-pad*5)/4;cajas.forEach(([a,b,c,col],i)=>{const x0=pad+i*(bw+pad);X.fillStyle='#f4f8fb';X.fillRect(x0,110,bw,86);X.fillStyle=col;X.fillRect(x0,110,6,86);txt(X,a,x0+18,134,{size:12,peso:'700',color:COL.mut});txt(X,b,x0+18,166,{size:24,peso:'700'});txt(X,c,x0+18,187,{size:12,color:COL.mut});});
    let y=216;X.drawImage(g.capacidad,pad,y,cw,ch);X.drawImage(g.presentacion,pad*2+cw,y,cw,ch);y+=ch+pad;X.drawImage(g.semana,pad,y,cw,h4);X.drawImage(g.paradas,pad*2+cw,y,cw,ch);y+=Math.max(ch,h4)+pad;
    txt(X,'OBSERVACIONES',pad,y+14,{size:12,peso:'700',color:COL.mut});lineas.forEach((l,i)=>txt(X,l,pad,y+34+i*19,{size:13}));
    return L.c;
  }
  API.graficos=graficos;API.graficoCapacidad=graficoCapacidad;API.graficoPresentacion=graficoPresentacion;API.graficoSemana=graficoSemana;API.graficoParadas=graficoParadas;API.imagen=imagen;
})(typeof window!=='undefined'?window:globalThis);
