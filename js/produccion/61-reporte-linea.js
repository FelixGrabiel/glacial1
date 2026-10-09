/* =============================================================
   GLACIAL · REPORTE DE PRODUCCIÓN POR LÍNEA (PET1, PET2, B7L, C20L, B20L)
   -------------------------------------------------------------
   Un solo MODELO de datos por línea, fecha, bloque y corte, que se CONGELA dentro del snapshot de Avance/Cierre
   (linea.reporte) cuando se genera. Pantalla, PNG, texto y Excel leen ese mismo snapshot: abrir o exportar un histórico no
   consulta la hora actual ni recalcula con datos posteriores.

   modelo(l, ctx)   → objeto serializable (sin undefined) con: encabezado, resumen, marcas, indicadores, porHora, paradas,
                      insumos, acciones, personal/horas hombre y la versión del reporte.
   dibujar(modelo)  → canvas de 1080 px de ancho (altura según el contenido) con la plantilla aprobada. Es texto y gráficos
                      dibujados con datos: no se genera con IA de imágenes.

   Reglas: ratio = producción ÷ horas efectivas del mismo corte (snapshot); pendiente = máx(0, programado − producido) y el
   excedente va aparte; las paradas mostradas son las descontadas en el cálculo; Calidad no se mide (no hay base) →
   «Sin datos suficientes»; OEE = disponibilidad × rendimiento (definición del sistema); metas = las configuradas; «—» = sin
   registro; los factores de merma NO son recetas de consumo; sin importes económicos.
   Cargar DESPUÉS de 29-avance-produccion.js.
   ============================================================= */
(function instalarReporteLinea(){
  'use strict';
  const VERSION_REPORTE=1;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const esNum=v=>typeof v==='number'&&Number.isFinite(v);
  const fmt=v=>Math.round(num(v)).toLocaleString('es-PE');
  const hhmm=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  const fechaBonita=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):String(f||'');
  const limpio=o=>JSON.parse(JSON.stringify(o,(k,v)=>v===undefined?null:v));
  const UNIDAD_PROD={C20L:'cajas',B20L:'bidones',B7L:'bidones'};
  const unidadProd=l=>UNIDAD_PROD[l]||'botellas';

  /* =========================================================
     MODELO
     ========================================================= */
  function porHora(l,fecha,bloque){
    const svc=window.glacialProduccionPaletasAlCorte;
    const ini=num(l.inicioMs),fin=num(l.corteMs);
    if(typeof svc!=='function'||!(ini>0)||!(fin>ini))return null;
    const turnos=bloque==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO'];
    const prods=(l.productos||[]).filter(p=>p.marca&&p.presentacion);
    const acum=t=>prods.reduce((a,p)=>{const r=svc(l.linea,fecha,turnos,p.marca,p.presentacion,t);return {valor:a.valor+r.valor,registros:a.registros+r.registros};},{valor:0,registros:0});
    const total=acum(fin);
    if(!total.registros)return null;           // sin registros horarios de Paletas
    const cortes=[ini];
    const d=new Date(ini);d.setMinutes(0,0,0);
    for(let t=d.getTime()+3600000;t<fin;t+=3600000)if(t>ini)cortes.push(t);
    cortes.push(fin);
    const intervalos=[];let previo=acum(ini);
    for(let i=0;i<cortes.length-1;i++){
      const sig=acum(cortes[i+1]);
      const nReg=sig.registros-previo.registros;
      const delta=sig.valor-previo.valor;
      intervalos.push({desdeMs:cortes[i],hastaMs:cortes[i+1],produccion:nReg>0?Math.max(0,delta):null,registros:nReg,ajuste:nReg>0&&delta<0});
      previo=sig;
    }
    return {intervalos,totalPaletas:total.valor,fuente:'PALETAS'};
  }

  function indicadores(l){
    const transc=num(l.minutosTranscurridos),pDesc=num(l.minutosParadasProgramadasDesc),npDesc=num(l.minutosParadasNoProgramadasDesc);
    const plan=GlacialIndicadores.tiempoPlanificadoMin(transc,pDesc);
    const disp=transc>0?GlacialIndicadores.disponibilidad(plan,npDesc):null;
    // Velocidad estándar ponderada por el tiempo que ocupó cada producto (producción ÷ velocidad); sin velocidad no hay rendimiento.
    let rend=null,velOk=false;
    const prods=(l.productos||[]).filter(p=>num(p.produccion)>0);
    if(esNum(l.ratio)&&prods.length&&typeof window.glacialVelocidadEstandar==='function'){
      const vels=prods.map(p=>window.glacialVelocidadEstandar(l.linea,p.presentacion,p.marca));
      if(vels.every(v=>v>0)){
        const tiempoH=prods.reduce((s,p,i)=>s+num(p.produccion)/vels[i],0);
        const velPond=tiempoH>0?prods.reduce((s,p)=>s+num(p.produccion),0)/tiempoH:0;
        rend=GlacialIndicadores.rendimiento(l.ratio,velPond);velOk=rend!==null;
      }
    }
    const oee=GlacialIndicadores.oee(disp,rend);
    const metas=typeof window.glacialMetasIndicadores==='function'?window.glacialMetasIndicadores():GlacialIndicadores.METAS_INICIALES;
    const col=(n,v)=>GlacialIndicadores.colorIndicador(n,v,metas);
    return {
      disponibilidad:{valor:disp,nivel:col('disponibilidad',disp)},
      rendimiento:{valor:rend,nivel:col('ratio',rend),aRevisar:GlacialIndicadores.rendimientoARevisar(rend),sinVelocidad:!velOk},
      calidad:{valor:null,texto:'Sin datos suficientes'},
      oee:{valor:oee,nivel:col('oee',oee)}
    };
  }

  function paradasModelo(l){
    const lista=(l.paradas||[]).filter(p=>num(p.minutos)>0);
    const porMotivo=new Map();
    lista.forEach(p=>{
      const k=String(p.descripcion||'').trim().toLowerCase();
      const o=porMotivo.get(k)||{motivo:String(p.descripcion||'').trim(),minutos:0,tipo:p.tipo};
      o.minutos+=num(p.minutos);porMotivo.set(k,o);
    });
    const motivos=[...porMotivo.values()].sort((a,b)=>b.minutos-a.minutos);
    const prog=num(l.minutosParadasProgramadasDesc),np=num(l.minutosParadasNoProgramadasDesc);
    return {programadas:prog,noProgramadas:np,total:prog+np,documentalMin:num(l.totalParadas),
      motivos:motivos.slice(0,4),motivosOtros:Math.max(0,motivos.length-4),
      difiere:Math.abs(num(l.totalParadas)-(prog+np))>=0.5};
  }

  /* Insumos y mermas con el catálogo REAL de la línea. Consumo = lo calculado en el registro (marcado «est.»); merma = lo
     capturado. «—» = sin registro (no hay confirmación de cero). */
  function insumosModelo(l,ctx){
    const items=typeof obtenerItemsMerma==='function'?obtenerItemsMerma(l.linea):[];
    const corte=num(l.corteMs);
    const filas=new Map();
    items.forEach(n=>filas.set(n,{insumo:n,consumo:null,consumoUnidad:'',consumoEstimado:false,merma:null,mermaPeso:null,unidad:/^polietileno/i.test(n)?'kg':'UND',pct:null}));
    const insumosSum={polietilenoKg:0,stretchFilmKg:0,planchasCarton:0,cajasPreformas:0};
    let producidoUnd=num(l.produccionTotal);
    (typeof avRegistros==='function'?avRegistros():[]).filter(r=>r.linea===l.linea).forEach(r=>{
      (typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach(q=>{
        if(corte&&q&&q.horaInicio&&avHoraMs(ctx.fecha,q.horaInicio,ctx.turno)>corte)return;   // cuadros posteriores al corte no entran
        (q.mermas||[]).forEach(m=>{
          const f=filas.get(m.item);if(!f)return;
          const u=num(m.unidades),p=num(m.peso);
          if(f.unidad==='kg'){if(p>0)f.merma=(f.merma||0)+p;}
          else{
            if(u>0)f.merma=(f.merma||0)+u;
            if(l.linea==='C20L'&&p>0)f.mermaPeso=(f.mermaPeso||0)+p;
          }
        });
        const ins=q.insumos||{};
        Object.keys(insumosSum).forEach(k=>{insumosSum[k]+=num(ins[k]);});
      });
    });
    const out=[];
    filas.forEach(f=>{
      if(f.unidad==='UND'&&f.merma!==null&&producidoUnd>0&&l.linea!=='C20L')f.pct=f.merma/producidoUnd*100;
      if(f.unidad==='UND'&&f.merma!==null&&producidoUnd>0&&l.linea==='C20L')f.pct=f.merma/producidoUnd*100;
      if(/^polietileno/i.test(f.insumo)&&insumosSum.polietilenoKg>0){f.consumo=insumosSum.polietilenoKg;f.consumoUnidad='kg';f.consumoEstimado=true;}
      out.push(f);
    });
    if(insumosSum.stretchFilmKg>0)out.push({insumo:'Stretch film',consumo:insumosSum.stretchFilmKg,consumoUnidad:'kg',consumoEstimado:true,merma:null,mermaPeso:null,unidad:'kg',pct:null});
    if(insumosSum.planchasCarton>0)out.push({insumo:'Planchas de cartón',consumo:insumosSum.planchasCarton,consumoUnidad:'UND',consumoEstimado:true,merma:null,mermaPeso:null,unidad:'UND',pct:null});
    return out;
  }

  function accionesModelo(l,pend,paradas){
    const a=[];
    if(pend>0)a.push({area:'Pendiente de producción',accion:'Evaluar '+fmt(pend)+' '+unidadProd(l.linea)+' pendientes',responsable:'Planificación',estado:'Por validar'});
    if(paradas.motivos.length&&paradas.noProgramadas>0){
      const m=paradas.motivos.find(x=>x.tipo==='NO_PROGRAMADA')||paradas.motivos[0];
      a.push({area:'Paradas',accion:'Revisar la parada «'+m.motivo+'» ('+fmt(m.minutos)+' min)',responsable:'Por asignar',estado:'Por validar'});
    }
    if(l.paradasExcedenTiempo)a.push({area:'Paradas',accion:'Las paradas registradas superan el tiempo transcurrido: corregirlas',responsable:'Supervisor',estado:'Por validar'});
    if(l.personalEstado==='PENDIENTE')a.push({area:'Personal',accion:'Confirmar la distribución de personal de la línea',responsable:'Supervisor',estado:'Por validar'});
    return a;
  }

  /* l = línea del snapshot ya calculada; ctx = {tipo, relevo, supervisor, fecha, turno, horaCorte, id} */
  function modelo(l,ctx){
    const programado=num(l.programado),producido=num(l.produccionTotal);
    const pend=Math.max(0,programado-producido),exc=Math.max(0,producido-programado);
    const par=paradasModelo(l);
    const marcasMapa=new Map();
    (l.productos||[]).filter(p=>num(p.produccion)>0).forEach(p=>{
      const k=p.marca+'|'+p.presentacion;
      const o=marcasMapa.get(k)||{marca:p.marca,presentacion:p.etiqueta||p.presentacion,produccion:0};
      o.produccion+=num(p.produccion);marcasMapa.set(k,o);
    });
    const marcas=[...marcasMapa.values()];
    const bloque=ctx.turno==='NOCHE'?'NOCHE':'DÍA';
    const horas=l.horasHombre||null;
    return limpio({
      version:VERSION_REPORTE,linea:l.linea,nombre:l.nombre,
      encabezado:{fecha:ctx.fecha,bloque,estado:ctx.tipo==='CIERRE'&&!ctx.relevo?'CERRADO':'PARCIAL',inicio:l.inicio||'',
        corte:l.corte||ctx.horaCorte||'',fin:ctx.tipo==='CIERRE'?(l.fin||l.corte||''):'',supervisor:ctx.supervisor||'',tipo:ctx.tipo,idSnapshot:ctx.id||''},
      resumen:{programado,producido,pendiente:pend,excedente:exc,cumplimiento:programado>0?producido/programado*100:null,
        ratio:esNum(l.ratio)?l.ratio:null,unidadRatio:l.unidadRatio,unidad:unidadProd(l.linea),
        minutosEfectivos:num(l.minutosEfectivos),minutosTranscurridos:num(l.minutosTranscurridos),paradasMin:par.total,
        personal:l.personalEstado==='PENDIENTE'?null:(l.personal===undefined?null:l.personal),personalEstado:l.personalEstado||'LEGADO',
        horasHombre:horas?{horas:horas.horas,estado:horas.estado,cobertura:horas.cobertura}:null},
      marcas,
      indicadores:indicadores(l),
      porHora:porHora(l,ctx.fecha,bloque),
      paradas:par,
      insumos:insumosModelo(l,ctx),
      acciones:accionesModelo(l,pend,par)
    });
  }

  /* =========================================================
     DIBUJO (canvas 1080 px)
     ========================================================= */
  const C={navy:'#003B5C',azul:'#005B96',celeste:'#E4F1FA',celeste2:'#D3E7F5',borde:'#C6DAEA',texto:'#172B3A',gris:'#667784',
    verde:'#1F7A44',verdeFondo:'#1E8A4C',ambar:'#C98200',ambarFondo:'#FCE9B2',rojo:'#B3261E',blanco:'#FFFFFF'};
  const W=1080,PAD=18,IW=W-PAD*2,RES_H=290;
  const NIVEL={verde:C.verde,ambar:C.ambar,roja:C.rojo,gris:C.texto};

  function fuente(x,tam,peso){x.font=(peso||'400')+' '+tam+'px Arial, Helvetica, sans-serif';}
  function rr(x,px,py,w,h,r){x.beginPath();x.moveTo(px+r,py);x.arcTo(px+w,py,px+w,py+h,r);x.arcTo(px+w,py+h,px,py+h,r);x.arcTo(px,py+h,px,py,r);x.arcTo(px,py,px+w,py,r);x.closePath();}
  function texto(x,t,px,py,o){
    o=o||{};fuente(x,o.tam||16,o.peso);x.fillStyle=o.color||C.texto;x.textAlign=o.align||'left';x.textBaseline='alphabetic';
    let s=String(t==null?'':t);
    if(o.max){let tam=o.tam||16;while(x.measureText(s).width>o.max&&tam>(o.min||Math.max(11,(o.tam||16)-3))){tam--;fuente(x,tam,o.peso);}
      if(x.measureText(s).width>o.max){while(s.length>1&&x.measureText(s+'…').width>o.max)s=s.slice(0,-1);s+='…';}}
    x.fillText(s,px,py);
  }
  /* Icono en círculo: formas simples y consistentes. */
  function icono(x,tipo,cx,cy,r,colorFondo){
    x.fillStyle=colorFondo||C.celeste2;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();
    x.strokeStyle=C.azul;x.fillStyle=C.azul;x.lineWidth=2.4;x.lineCap='round';x.lineJoin='round';
    const s=r*0.5;
    x.beginPath();
    switch(tipo){
      case 'lista':rr(x,cx-s*0.8,cy-s,s*1.6,s*2,3);x.stroke();for(let i=-1;i<=1;i++){x.beginPath();x.moveTo(cx-s*0.4,cy+i*s*0.55);x.lineTo(cx+s*0.4,cy+i*s*0.55);x.stroke();}break;
      case 'caja':rr(x,cx-s,cy-s*0.6,s*2,s*1.6,3);x.stroke();x.beginPath();x.moveTo(cx-s,cy-s*0.6);x.lineTo(cx-s*0.6,cy-s);x.lineTo(cx+s*0.6,cy-s);x.lineTo(cx+s,cy-s*0.6);x.stroke();break;
      case 'reloj':x.arc(cx,cy,s,0,Math.PI*2);x.stroke();x.beginPath();x.moveTo(cx,cy-s*0.6);x.lineTo(cx,cy);x.lineTo(cx+s*0.5,cy+s*0.3);x.stroke();break;
      case 'meta':x.arc(cx,cy,s,0,Math.PI*2);x.stroke();x.beginPath();x.arc(cx,cy,s*0.55,0,Math.PI*2);x.stroke();x.beginPath();x.arc(cx,cy,s*0.15,0,Math.PI*2);x.fill();break;
      case 'barras':[[-0.8,0.2],[-0.1,-0.4],[0.6,-1]].forEach(([dx,top])=>{x.fillRect(cx+dx*s-s*0.22,cy+s*top,s*0.45,s-s*top);});break;
      case 'reloj-arena':x.moveTo(cx-s*0.7,cy-s);x.lineTo(cx+s*0.7,cy-s);x.lineTo(cx,cy);x.lineTo(cx+s*0.7,cy+s);x.lineTo(cx-s*0.7,cy+s);x.lineTo(cx,cy);x.closePath();x.stroke();break;
      case 'pausa':x.fillRect(cx-s*0.7,cy-s*0.8,s*0.5,s*1.6);x.fillRect(cx+s*0.2,cy-s*0.8,s*0.5,s*1.6);break;
      case 'personas':x.arc(cx-s*0.4,cy-s*0.3,s*0.35,0,Math.PI*2);x.fill();x.beginPath();x.arc(cx+s*0.5,cy-s*0.2,s*0.3,0,Math.PI*2);x.fill();x.beginPath();x.arc(cx-s*0.4,cy+s*1.1,s*0.8,Math.PI,0);x.fill();x.beginPath();x.arc(cx+s*0.5,cy+s*1.0,s*0.65,Math.PI,0);x.fill();break;
      case 'persona':x.arc(cx,cy-s*0.4,s*0.45,0,Math.PI*2);x.fill();x.beginPath();x.arc(cx,cy+s*1.0,s*0.9,Math.PI,0);x.fill();break;
      case 'engranaje':x.arc(cx,cy,s*0.7,0,Math.PI*2);x.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;x.beginPath();x.moveTo(cx+Math.cos(a)*s*0.7,cy+Math.sin(a)*s*0.7);x.lineTo(cx+Math.cos(a)*s*1.05,cy+Math.sin(a)*s*1.05);x.stroke();}break;
      case 'escudo':x.moveTo(cx,cy-s);x.lineTo(cx+s*0.9,cy-s*0.5);x.lineTo(cx+s*0.8,cy+s*0.3);x.lineTo(cx,cy+s);x.lineTo(cx-s*0.8,cy+s*0.3);x.lineTo(cx-s*0.9,cy-s*0.5);x.closePath();x.stroke();break;
      default:x.arc(cx,cy,s*0.3,0,Math.PI*2);x.fill();
    }
  }
  function cabeceraSeccion(x,titulo,px,py,w){
    x.fillStyle=C.navy;rr(x,px,py,w,38,8);x.fill();
    texto(x,titulo,px+16,py+26,{tam:17,peso:'700',color:C.blanco});
    return py+38;
  }
  function panel(x,px,py,w,h){x.fillStyle=C.blanco;x.strokeStyle=C.borde;x.lineWidth=1.2;rr(x,px,py,w,h,10);x.fill();x.stroke();}
  function tarjeta(x,px,py,w,h,ic,etq,valor,unidad,color,nota){
    x.fillStyle=C.blanco;x.strokeStyle=C.borde;x.lineWidth=1.2;rr(x,px,py,w,h,12);x.fill();x.stroke();
    icono(x,ic,px+44,py+h/2,26);
        texto(x,etq,px+84,py+30,{tam:16,peso:'600',color:C.texto,max:w-96});
    if(nota)texto(x,nota,px+w-12,py+22,{tam:13,peso:'800',color:C.verde,align:'right',max:w*0.5});
    fuente(x,38,'800');
    const v=String(valor);const vw=x.measureText(v).width;
    texto(x,v,px+84,py+h-20,{tam:38,peso:'800',color:color||C.navy,max:w-96-(unidad?70:0),min:20});
    if(unidad){fuente(x,38,'800');const real=Math.min(vw,w-96-70);texto(x,unidad,px+84+real+8,py+h-20,{tam:18,peso:'600',color:C.gris,max:68});}
  }
  function mapaLogo(){
    return new Promise(resolve=>{
      try{
        if(typeof Image==='undefined'||typeof document==='undefined')return resolve(null);
        const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src='img/logo_glacial.png';
      }catch(_){resolve(null);}
    });
  }
  function logoBlanco(im){
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');
    g.drawImage(im,0,0);g.globalCompositeOperation='source-in';g.fillStyle='#FFFFFF';g.fillRect(0,0,c.width,c.height);return c;
  }

  /* Altura de cada bloque (se calcula antes de crear el canvas para no recortar filas). */
  function medidas(m){
    const filasMarca=Math.max(1,m.marcas.length);
    const hMarca=38+10+38+filasMarca*38+40+10;
    const hInd=38+10+2*92+10+10;
    const hArriba=Math.max(hMarca,hInd);
    const nPar=m.paradas.motivos.length+(m.paradas.motivosOtros?1:0);
    const hPar=38+10+3*34+10+(nPar?34+nPar*32:34)+(m.paradas.difiere?24:0)+10;
    const hHora=300;
    const hMedio=Math.max(hHora,hPar);
    const nIns=Math.max(1,m.insumos.length);
    const hIns=38+10+36+nIns*36+34+10;
    const nAcc=Math.max(1,m.acciones.length);
    const hAcc=38+10+36+nAcc*44+10;
    return {hArriba,hMedio,hIns,hAcc,total:150+14+RES_H+14+hArriba+14+hMedio+14+hIns+14+hAcc+14+46};
  }

  async function dibujar(m,opc){
    opc=opc||{};
    const ms=medidas(m),H=ms.total;
    const escala=opc.escala||1;
    const canvas=(opc.crearCanvas||(()=>document.createElement('canvas')))();
    canvas.width=W*escala;canvas.height=H*escala;
    const x=canvas.getContext('2d');x.scale(escala,escala);
    x.fillStyle=C.blanco;x.fillRect(0,0,W,H);
    const logo=opc.sinLogo?null:await mapaLogo();
    const e=m.encabezado,r=m.resumen,u=r.unidad;
    let y=0;

    /* --- 1) encabezado --- */
    x.fillStyle=C.navy;rr(x,PAD,10,IW,140,12);x.fill();
    if(logo){const b=logoBlanco(logo),hh=96,ww=logo.width*hh/logo.height;x.drawImage(b,PAD+22,32,ww,hh);}
    else texto(x,'GLACIAL',PAD+24,92,{tam:46,peso:'800',color:C.blanco});
    x.strokeStyle='rgba(255,255,255,.45)';x.lineWidth=2;x.beginPath();x.moveTo(PAD+250,34);x.lineTo(PAD+250,126);x.stroke();
    texto(x,'REPORTE DE PRODUCCIÓN',PAD+274,66,{tam:25,peso:'600',color:C.blanco,max:360});
    texto(x,m.nombre||m.linea,PAD+274,124,{tam:60,peso:'800',color:C.blanco,max:360,min:36});
    const rx=W-PAD-22;
    texto(x,fechaBonita(e.fecha)+' · '+GlacialIndicadores.nombreBloque(e.bloque,'reporte'),rx,50,{tam:23,peso:'700',color:C.blanco,align:'right',max:420});
    const cerrado=e.estado==='CERRADO';
    x.fillStyle=cerrado?C.verdeFondo:C.ambar;rr(x,rx-160,62,160,36,8);x.fill();
    texto(x,cerrado?'CERRADO':'PARCIAL',rx-80,87,{tam:19,peso:'800',color:C.blanco,align:'center'});
    texto(x,'Inicio '+(e.inicio||'—')+' · '+(cerrado&&e.fin?'Fin '+e.fin:'Corte '+(e.corte||'—'))+' · Supervisor: '+(e.supervisor||'—'),rx,128,{tam:16,color:'#DCEBF5',align:'right',max:470});
    y=150+14;

    /* --- 2) resumen del turno --- */
    x.fillStyle=C.celeste;rr(x,PAD,y,IW,RES_H,12);x.fill();
    texto(x,'RESUMEN DEL TURNO',PAD+16,y+32,{tam:22,peso:'800',color:C.navy});
    const cw=(IW-32-24)/3,ty=y+46;
    const cum=r.cumplimiento;
    const colCum=cum===null?C.navy:(cum>=95?C.verde:cum>=85?C.ambar:C.rojo);
    tarjeta(x,PAD+16,ty,cw,84,'lista','Programado',fmt(r.programado),u);
    tarjeta(x,PAD+16+cw+12,ty,cw,84,'caja','Producido',fmt(r.producido),u);
    tarjeta(x,PAD+16+(cw+12)*2,ty,cw,84,'reloj-arena','Pendiente',fmt(r.pendiente),u,r.pendiente>0?C.ambar:C.navy,r.excedente>0?'Excedente +'+fmt(r.excedente):'');
    tarjeta(x,PAD+16,ty+96,cw,84,'meta','Cumplimiento',cum===null?'—':Math.round(cum)+'%','',colCum);
    tarjeta(x,PAD+16+cw+12,ty+96,cw,84,'barras','Ratio real',esNum(r.ratio)?fmt(r.ratio):'—',esNum(r.ratio)?r.unidadRatio:'');
    tarjeta(x,PAD+16+(cw+12)*2,ty+96,cw,84,'reloj','Tiempo efectivo',r.minutosEfectivos>0?(Math.round(r.minutosEfectivos/6)/10).toLocaleString('es-PE')+' h':'—','');
    /* franja */
    const fy=ty+190;x.fillStyle=C.celeste2;rr(x,PAD+16,fy,IW-32,40,8);x.fill();
    const hh=r.horasHombre;
    const hhTxt=!hh||hh.horas===null||hh.estado==='SIN_DATOS'?'Pendiente de confirmar':(Math.round(hh.horas*10)/10).toLocaleString('es-PE')+' h-h'+(hh.estado==='PARCIAL'?' (parcial)':'');
    const persTxt=r.personalEstado==='PENDIENTE'?'Pendiente de confirmar':(r.personal===null?'—':fmt(r.personal));
    const datos=[['Tiempo transcurrido',(Math.round(r.minutosTranscurridos/6)/10).toLocaleString('es-PE')+' h'],['Paradas',(Math.round(r.paradasMin/6)/10).toLocaleString('es-PE')+' h'],['Personal',persTxt],['Horas hombre',hhTxt]];
    const sw=(IW-32)/4;
    datos.forEach(([a,b],i)=>{
      const px=PAD+16+sw*i+sw/2;
      fuente(x,16,'700');const an=x.measureText(a+': ').width;
      x.textAlign='left';
      const tot=an+(()=>{fuente(x,16,'800');return x.measureText(b).width;})();
      const maxW=sw-14;const esc2=tot>maxW?maxW/tot:1;
      x.save();x.translate(px-(tot*esc2)/2,fy+26);x.scale(esc2,1);
      fuente(x,16,'600');x.fillStyle=C.texto;x.fillText(a+': ',0,0);fuente(x,16,'800');x.fillStyle=C.navy;x.fillText(b,an,0);x.restore();
      if(i<3){x.strokeStyle=C.borde;x.lineWidth=1.2;x.beginPath();x.moveTo(PAD+16+sw*(i+1),fy+8);x.lineTo(PAD+16+sw*(i+1),fy+32);x.stroke();}
    });
    y+=RES_H+14;

    /* --- 3) producción por marca | indicadores --- */
    const wL=Math.round(IW*0.52),wR=IW-wL-14,xR=PAD+wL+14;
    panel(x,PAD,y,wL,ms.hArriba);panel(x,xR,y,wR,ms.hArriba);
    let cy=cabeceraSeccion(x,'PRODUCCIÓN POR MARCA',PAD,y,wL)+10;
    x.fillStyle=C.celeste;x.fillRect(PAD+10,cy,wL-20,38);
    [['Marca',PAD+22,'left'],['Presentación',PAD+wL*0.38,'left'],['Producción',PAD+wL-22,'right']].forEach(([t,px,al])=>texto(x,t,px,cy+25,{tam:15,peso:'700',color:C.navy,align:al}));
    cy+=38;
    if(!m.marcas.length){texto(x,'Sin producción registrada',PAD+22,cy+25,{tam:15,color:C.gris});cy+=38;}
    m.marcas.forEach(k=>{
      texto(x,k.marca,PAD+22,cy+25,{tam:15,peso:'700',max:wL*0.34-10});
      texto(x,k.presentacion,PAD+wL*0.38,cy+25,{tam:15,max:wL*0.3});
      texto(x,fmt(k.produccion),PAD+wL-22,cy+25,{tam:16,peso:'700',align:'right'});
      x.strokeStyle=C.borde;x.beginPath();x.moveTo(PAD+10,cy+38);x.lineTo(PAD+wL-10,cy+38);x.stroke();cy+=38;
    });
    x.fillStyle=C.celeste2;x.fillRect(PAD+10,cy,wL-20,40);
    texto(x,'TOTAL',PAD+22,cy+27,{tam:16,peso:'800',color:C.navy});
    texto(x,fmt(r.producido)+' '+u,PAD+wL-22,cy+27,{tam:17,peso:'800',color:C.navy,align:'right'});

    cy=cabeceraSeccion(x,'INDICADORES',xR,y,wR)+10;
    const iw=(wR-20-12)/2;
    const ind=m.indicadores;
    const pct=v=>esNum(v)?(Math.round(v*1000)/10).toLocaleString('es-PE')+'%':null;
    const tIn=(px,py,ic,etq,valor,nivel,nota)=>{
      x.fillStyle=C.blanco;x.strokeStyle=C.borde;x.lineWidth=1.2;rr(x,px,py,iw,92,10);x.fill();x.stroke();
      icono(x,ic,px+34,py+46,22);
      texto(x,etq,px+66,py+28,{tam:14,peso:'600',max:iw-74});
            if(valor.length>8&&valor.indexOf(' ')>0){const p=valor.split(' ');texto(x,p[0]+' '+p[1],px+66,py+56,{tam:17,peso:'800',color:NIVEL[nivel]||C.navy,max:iw-74,min:12});texto(x,p.slice(2).join(' ')||'',px+66,py+74,{tam:17,peso:'800',color:NIVEL[nivel]||C.navy,max:iw-74,min:12});}
      else texto(x,valor,px+66,py+68,{tam:32,peso:'800',color:NIVEL[nivel]||C.navy,max:iw-74,min:14});
      if(nota)texto(x,nota,px+66,py+86,{tam:10,color:C.gris,max:iw-74});
    };
    tIn(xR+10,cy,'engranaje','Disponibilidad',pct(ind.disponibilidad.valor)||'Sin datos suficientes',ind.disponibilidad.nivel);
    tIn(xR+10+iw+12,cy,'barras','Rendimiento',pct(ind.rendimiento.valor)||'Sin datos suficientes',ind.rendimiento.nivel,ind.rendimiento.sinVelocidad?'sin velocidad estándar':(ind.rendimiento.aRevisar?'revisar velocidad':''));
    tIn(xR+10,cy+104,'escudo','Calidad',ind.calidad.texto,'gris','no se mide');
    tIn(xR+10+iw+12,cy+104,'barras','OEE',pct(ind.oee.valor)||'Sin datos suficientes',ind.oee.nivel,'disp. × rend.');
    y+=ms.hArriba+14;

    /* --- 4) producción por hora | paradas --- */
    panel(x,PAD,y,wL,ms.hMedio);panel(x,xR,y,wR,ms.hMedio);
    cy=cabeceraSeccion(x,'PRODUCCIÓN POR HORA',PAD,y,wL);
    const gx=PAD+54,gy=cy+22,gw=wL-78,gh=ms.hMedio-38-22-56;
    const ph=m.porHora;
    if(!ph||!ph.intervalos.length){
      texto(x,'Sin registros horarios de Paletas',PAD+wL/2,cy+gh/2+30,{tam:16,color:C.gris,align:'center'});
    }else{
      const vals=ph.intervalos.map(i=>i.produccion===null?0:i.produccion),mx=Math.max(1,...vals);
      x.strokeStyle=C.borde;x.lineWidth=1;[0,0.5,1].forEach(f=>{const yy=gy+gh-gh*f;x.beginPath();x.moveTo(gx,yy);x.lineTo(gx+gw,yy);x.stroke();texto(x,fmt(mx*f),gx-6,yy+4,{tam:11,color:C.gris,align:'right'});});
      const n=ph.intervalos.length,bw=gw/n;
      ph.intervalos.forEach((i,k)=>{
        const bx=gx+bw*k+bw*0.15,ww=bw*0.7;
        if(i.produccion===null){texto(x,'—',bx+ww/2,gy+gh-6,{tam:13,color:C.gris,align:'center'});}
        else{const bh=gh*i.produccion/mx;x.fillStyle=C.azul;rr(x,bx,gy+gh-bh,ww,Math.max(bh,2),3);x.fill();
          if(n<=12)texto(x,fmt(i.produccion),bx+ww/2,gy+gh-bh-5,{tam:11,peso:'700',color:C.navy,align:'center'});}
        texto(x,hhmm(i.desdeMs),bx+ww/2,gy+gh+18,{tam:11,color:C.gris,align:'center'});
      });
      texto(x,'Producción por intervalo (UND) · — = sin registro'+(ph.totalPaletas!==r.producido?' · Paletas '+fmt(ph.totalPaletas)+' de '+fmt(r.producido)+' (el total usa otra fuente)':''),PAD+wL/2,y+ms.hMedio-14,{tam:11,color:C.gris,align:'center',max:wL-24});
    }

    cy=cabeceraSeccion(x,'PARADAS DEL TURNO',xR,y,wR)+10;
    const pd=m.paradas;
    [['Programadas',pd.programadas],['No programadas',pd.noProgramadas]].forEach(([t,v])=>{
      texto(x,t,xR+16,cy+23,{tam:15});texto(x,fmt(v)+' min',xR+wR-16,cy+23,{tam:15,align:'right'});
      x.strokeStyle=C.borde;x.beginPath();x.moveTo(xR+10,cy+34);x.lineTo(xR+wR-10,cy+34);x.stroke();cy+=34;
    });
    x.fillStyle=C.celeste2;x.fillRect(xR+10,cy,wR-20,34);
    texto(x,'TOTAL',xR+16,cy+23,{tam:15,peso:'800',color:C.navy});texto(x,fmt(pd.total)+' min',xR+wR-16,cy+23,{tam:15,peso:'800',color:C.navy,align:'right'});cy+=34+10;
    if(pd.difiere){texto(x,'Suma listada '+fmt(pd.documentalMin)+' min (solapes/estándar ajustan lo descontado)',xR+16,cy+8,{tam:11,color:C.gris,max:wR-32});cy+=24;}
    x.fillStyle=C.celeste;x.fillRect(xR+10,cy,wR-20,34);texto(x,'Principales motivos',xR+16,cy+23,{tam:15,peso:'700',color:C.navy});cy+=34;
    if(!pd.motivos.length){texto(x,'Sin paradas registradas',xR+16,cy+23,{tam:15,color:C.gris});}
    pd.motivos.forEach(mo=>{
      texto(x,mo.motivo,xR+16,cy+22,{tam:14,max:wR-120});texto(x,fmt(mo.minutos)+' min',xR+wR-16,cy+22,{tam:14,align:'right'});
      x.strokeStyle=C.borde;x.beginPath();x.moveTo(xR+10,cy+32);x.lineTo(xR+wR-10,cy+32);x.stroke();cy+=32;
    });
    if(pd.motivosOtros)texto(x,'+ '+pd.motivosOtros+' motivo(s) más',xR+16,cy+22,{tam:13,color:C.gris});
    y+=ms.hMedio+14;

    /* --- 5) insumos y mermas --- */
    panel(x,PAD,y,IW,ms.hIns);
    cy=cabeceraSeccion(x,'INSUMOS Y MERMAS',PAD,y,IW)+10;
    const cols=[PAD+22,PAD+IW*0.40,PAD+IW*0.66,PAD+IW-22];
    x.fillStyle=C.celeste;x.fillRect(PAD+10,cy,IW-20,36);
    [['Insumo','left',cols[0]],['Consumo','center',(cols[1]+cols[2])/2-60],['Merma','center',(cols[2]+cols[3])/2-20],['Unidad','right',cols[3]]].forEach(([t,al,px])=>texto(x,t,px,cy+24,{tam:14,peso:'700',color:C.navy,align:al}));
    cy+=36;
    if(!m.insumos.length){texto(x,'Sin insumos en el catálogo de la línea',PAD+22,cy+24,{tam:14,color:C.gris});cy+=36;}
    m.insumos.forEach(f=>{
      texto(x,f.insumo,cols[0],cy+24,{tam:14,max:IW*0.34});
      const cons=f.consumo===null?'—':fmt(f.consumo)+(f.consumoUnidad?' '+f.consumoUnidad:'')+(f.consumoEstimado?' (est.)':'');
      texto(x,cons,(cols[1]+cols[2])/2-60,cy+24,{tam:14,align:'center',color:f.consumo===null?C.gris:C.texto});
      let me='—';
      if(f.merma!==null)me=(f.unidad==='kg'?(Math.round(f.merma*100)/100).toLocaleString('es-PE'):fmt(f.merma))+(f.pct!==null?' ('+(Math.round(f.pct*100)/100).toLocaleString('es-PE')+'%)':'')+(f.mermaPeso!==null?' · '+(Math.round(f.mermaPeso*100)/100).toLocaleString('es-PE')+' kg':'');
      texto(x,me,(cols[2]+cols[3])/2-20,cy+24,{tam:14,align:'center',color:f.merma===null?C.gris:C.texto,max:IW*0.3});
      texto(x,f.unidad,cols[3],cy+24,{tam:14,align:'right'});
      x.strokeStyle=C.borde;x.beginPath();x.moveTo(PAD+10,cy+36);x.lineTo(PAD+IW-10,cy+36);x.stroke();cy+=36;
    });
    texto(x,'— Sin registro · % de merma sobre la producción de la línea (UND) · est. = calculado en el registro · peso en kg = calculado con el factor de la línea',PAD+22,cy+22,{tam:11,color:C.gris,max:IW-44});
    y+=ms.hIns+14;

    /* --- 6) acciones --- */
    panel(x,PAD,y,IW,ms.hAcc);
    cy=cabeceraSeccion(x,'ACCIONES PARA EL SIGUIENTE TURNO',PAD,y,IW)+10;
    x.fillStyle=C.celeste;x.fillRect(PAD+10,cy,IW-20,36);
    const ac=[PAD+22,PAD+IW*0.30,PAD+IW*0.70,PAD+IW-90];
    [['Área',ac[0],'left'],['Acción',ac[1],'left'],['Responsable',ac[2],'left'],['Estado',ac[3],'center']].forEach(([t,px,al])=>texto(x,t,px,cy+24,{tam:14,peso:'700',color:C.navy,align:al}));
    cy+=36;
    if(!m.acciones.length){texto(x,'Sin acciones identificadas con los datos del reporte',PAD+22,cy+28,{tam:14,color:C.gris});cy+=44;}
    m.acciones.forEach(a=>{
      texto(x,a.area,ac[0],cy+28,{tam:14,max:IW*0.27});
      texto(x,a.accion,ac[1],cy+28,{tam:14,max:IW*0.39});
      texto(x,a.responsable,ac[2],cy+28,{tam:14,max:IW*0.2});
      x.fillStyle=C.ambarFondo;rr(x,ac[3]-52,cy+10,104,28,14);x.fill();texto(x,a.estado,ac[3],cy+29,{tam:13,peso:'700',color:'#7A5200',align:'center'});
      x.strokeStyle=C.borde;x.beginPath();x.moveTo(PAD+10,cy+44);x.lineTo(PAD+IW-10,cy+44);x.stroke();cy+=44;
    });
    y+=ms.hAcc+14;

    /* --- 7) pie --- */
    texto(x,'GLACIAL · '+fechaBonita(e.fecha)+' · '+GlacialIndicadores.nombreBloque(e.bloque,'reporte','titulo')+' · '+(e.tipo==='CIERRE'?(cerrado?'Cierre':'Relevo'):'Avance')+' al corte '+(e.corte||'—')+' · Reporte '+String(e.idSnapshot||'').split('|').slice(-1)[0]+' v'+m.version,W/2,y+22,{tam:12,color:C.gris,align:'center',max:IW});
    return canvas;
  }

  window.glacialReporteLinea={VERSION_REPORTE,modelo,dibujar,medidas,porHora,indicadores,insumosModelo,accionesModelo};
})();
