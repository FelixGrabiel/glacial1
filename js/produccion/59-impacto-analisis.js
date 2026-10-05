/* =========================================================
   IMPACTO ECONÓMICO · ANÁLISIS AUTOMÁTICO (puro: se prueba sin pantalla)

   Cada función recibe la VISTA calculada por GlacialImpactoEstado.calcularVista (la misma que dibuja los gráficos) y devuelve
   {estado:'ok'|'sin_datos', analisis, hallazgo, atencion, datos}. Los textos se arman con los datos reales y con condiciones
   matemáticas: una afirmación solo aparece si es verdadera para los datos filtrados (por ejemplo, «impacto por minuto superior al
   promedio» solo si el cociente de esa máquina es mayor que el del conjunto). No se afirma causalidad.
   Nunca devuelve NaN ni Infinity: las divisiones pasan por div() y, si algo no se puede calcular, se omite la frase o se devuelve
   el aviso de información insuficiente.
   Sin DOM y sin Firestore: también se carga desde Node (tests/impacto-analisis.test.js).
   ========================================================= */
(function(raiz){
  'use strict';

  const SIN_DATOS='No hay suficiente información para generar una interpretación confiable con los filtros seleccionados.';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const div=(a,b)=>(Number.isFinite(a)&&Number.isFinite(b)&&b>0)?a/b:null;
  const nf=(n,d)=>num(n).toLocaleString('es-PE',{minimumFractionDigits:d||0,maximumFractionDigits:d==null?0:d});
  const pct=(a,b)=>{const r=div(a,b);return r==null?null:nf(r*100,1)+' %';};
  const fmtFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))?f.slice(8,10)+'/'+f.slice(5,7):String(f||'');

  /* Formateo según el modo: soles (Gerencia/Jefatura) o minutos (los demás). */
  function fmt(vista){
    return vista.econ
      ?{m:v=>'S/ '+nf(v,v>=1000?0:2),u:'S/',med:'pérdida',medidaClave:'s'}
      :{m:v=>nf(v)+' min',u:'min',med:'tiempo perdido',medidaClave:'min'};
  }
  const medida=(vista,x)=>vista.econ?num(x.s):num(x.min);

  const limpio=(r)=>{
    const t=[r.analisis,r.hallazgo,r.atencion].filter(Boolean).join(' ');
    if(/NaN|Infinity|undefined|null/.test(t))return {estado:'sin_datos',analisis:SIN_DATOS,hallazgo:null,atencion:null,datos:null};
    return r;
  };
  const sinDatos=()=>({estado:'sin_datos',analisis:SIN_DATOS,hallazgo:null,atencion:null,datos:null});
  const ok=(analisis,hallazgo,atencion,datos)=>limpio({estado:'ok',analisis,hallazgo:hallazgo||null,atencion:atencion||null,datos:datos||null});
  /* Frase de alcance: qué filtros están activos (que no sean la propia dimensión del gráfico). */
  function alcance(vista,dim){
    const ch=((vista.contexto&&vista.contexto.chips)||[]).filter(c=>c.dim!==dim);
    return ch.length?'Con '+ch.map(c=>c.etq).join(' + ')+': ':'';
  }
  const totalMed=(vista,lista)=>lista.reduce((a,x)=>a+medida(vista,x),0);

  /* ---------- 1. Evolución ---------- */
  function evolucion(vista){
    const F=fmt(vista),ev=vista.series.evolucion,vals=ev.valores;
    const total=vals.reduce((a,b)=>a+b,0);
    if(!vista.hayDatos||!(total>0)||vals.length<1)return sinDatos();
    let texto,hallazgo=null,atencion=null;
    const v=vista.kpis.variacion,per=vista.perPrev?vista.perPrev.etiqueta:'';
    if(v&&v.pct!=null&&Math.abs(v.pct)>=0.05){
      texto='Con los filtros actuales, la '+F.med+' '+(v.pct<0?'disminuyó':'aumentó')+' '+nf(Math.abs(v.pct),1)+' % respecto al '+per+': '+F.m(vista.kpis.total[F.medidaClave])+' frente a '+F.m(vista.kpis.previo[F.medidaClave])+'.';
    }else if(v&&v.pct!=null){
      texto='La '+F.med+' se mantiene prácticamente igual que en el '+per+' ('+F.m(vista.kpis.total[F.medidaClave])+' frente a '+F.m(vista.kpis.previo[F.medidaClave])+').';
    }else{
      texto='La '+F.med+' del periodo es '+F.m(total)+'. No hay datos comparables del periodo anterior para calcular la variación.';
    }
    const idxMax=vals.indexOf(Math.max(...vals));
    const conDatos=vals.filter(x=>x>0).length;
    const clave=ev.claves[idxMax];
    hallazgo=(ev.unidad==='hora'?'La franja de las '+clave:'El '+fmtFecha(clave))+' presentó la mayor '+F.med+' del periodo con '+F.m(vals[idxMax])+' ('+(pct(vals[idxMax],total)||'—')+' del total).';
    if(vals.length>=4&&conDatos>=3&&ev.tendencia.ok){
      const media=total/vals.length,cambio=div(ev.tendencia.pendiente*(vals.length-1),media);
      if(cambio!=null){
        if(cambio>0.15)atencion='La línea de tendencia es ascendente: sube alrededor de '+nf(cambio*100,0)+' % a lo largo del periodo respecto al promedio.';
        else if(cambio<-0.15)atencion='La línea de tendencia es descendente: baja alrededor de '+nf(Math.abs(cambio)*100,0)+' % a lo largo del periodo respecto al promedio.';
        else atencion='La tendencia es estable: no hay una subida ni una bajada marcada dentro del periodo.';
      }
      const positivos=vals.filter(x=>x>0);
      if(positivos.length>=2){
        const minimo=Math.min(...positivos),ix=vals.indexOf(minimo);
        atencion=(atencion?atencion+' ':'')+'El menor valor no nulo fue '+F.m(minimo)+' ('+(ev.unidad==='hora'?ev.claves[ix]:fmtFecha(ev.claves[ix]))+').';
      }
    }
    return ok(alcance(vista,'dia')+texto,hallazgo,atencion);
  }

  /* ---------- ranking genérico (línea, marca, presentación, turno, tipo) ---------- */
  function ranking(vista,lista,dim,nombreDim,extra){
    const F=fmt(vista),total=totalMed(vista,lista);
    if(!vista.hayDatos||!lista.length||!(total>0))return sinDatos();
    const a=lista[0],ma=medida(vista,a),sh=pct(ma,total);
    let analisis=alcance(vista,dim)+a.k+' registra el mayor impacto de '+nombreDim+' del periodo con '+F.m(ma)+(sh?', equivalente al '+sh+' del total':'')+'.';
    let atencion=null;
    if(lista.length>=2){
      const b=lista[1],mb=medida(vista,b);
      if(ma>mb)atencion=a.k+' supera a '+b.k+' en '+F.m(ma-mb)+'.';
      else if(ma===mb)atencion=a.k+' y '+b.k+' tienen el mismo impacto.';
    }else atencion='Solo hay un elemento con datos con los filtros actuales.';
    const hallazgo=extra?extra(a,lista,total):null;
    return ok(analisis,hallazgo,atencion);
  }
  const linea=v=>ranking(v,v.series.linea,'linea','línea');
  const marca=v=>ranking(v,v.series.marca,'marca','marca');
  const pres=v=>ranking(v,v.series.pres,'pres','presentación');
  const tipo=v=>ranking(v,v.series.tipo,'tipo','tipo de pérdida',(a,l,t)=>l.length>1?'Reparto: '+l.map(x=>x.k+' '+(pct(medida(v,x),t)||'—')).join(' · ')+'.':null);
  function turno(v){
    const l=v.series.turno,F=fmt(v);
    const r=ranking(v,l,'turno','turno',(a,lista,t)=>{
      const datos=lista.map(x=>x.k+': '+F.m(medida(v,x))+' ('+(pct(medida(v,x),t)||'—')+') · '+nf(x.u)+' und · '+nf(x.min)+' min');
      return datos.join(' | ');
    });
    if(r.estado==='ok'&&l.some(x=>x.k==='DÍA / INTERMEDIO'))r.atencion=(r.atencion?r.atencion+' ':'')+'Algunos eventos del registro no distinguen Día de Intermedio y se muestran juntos.';
    return r;
  }

  /* ---------- 3. Pareto de causas ---------- */
  function pareto(vista){
    const F=fmt(vista),l=vista.series.causa,total=totalMed(vista,l);
    if(!vista.hayDatos||!l.length||!(total>0))return sinDatos();
    const a=l[0],top3=l.slice(0,3),s3=totalMed(vista,top3);
    let analisis=alcance(vista,'causa')+a.k+' representa la principal causa del periodo con '+F.m(medida(vista,a))+' ('+(pct(medida(vista,a),total)||'—')+').';
    let hallazgo=null,atencion=null;
    if(l.length>=3)hallazgo='Las tres principales causas concentran el '+(pct(s3,total)||'—')+' de la '+F.med+'.';
    else if(l.length===2)hallazgo='Las dos causas registradas concentran el 100 % de la '+F.med+'.';
    if(l.length>=3){
      let acum=0,n80=0;for(const x of l){acum+=medida(vista,x);n80++;if(acum/total>=0.8)break;}
      atencion='Se necesitan '+n80+' de '+l.length+' causas para llegar al 80 % de la '+F.med+'; son las que concentran el mayor potencial de reducción dentro de los datos del periodo.';
    }
    return ok(analisis,hallazgo,atencion);
  }

  /* ---------- 4. Máquinas ---------- */
  function maquina(vista){
    const F=fmt(vista),l=vista.series.maquina;
    const filasP=vista.tabla.filter(f=>f.tipo==='P');
    const totalP=totalMed(vista,l),minP=l.reduce((a,x)=>a+x.min,0);
    if(!vista.hayDatos||!l.length||!(totalP>0))return sinDatos();
    const clas=l.filter(x=>x.k!=='Sin clasificar');
    const sin=l.find(x=>x.k==='Sin clasificar');
    let analisis,hallazgo=null,atencion=null;
    if(clas.length){
      const a=clas[0];
      analisis=alcance(vista,'maquina')+a.k+' presenta el mayor impacto entre las máquinas identificadas con '+F.m(medida(vista,a))+'.';
      hallazgo='Datos: '+nf(a.n)+(a.n===1?' evento · ':' eventos · ')+nf(a.min)+' min · '+nf(a.u)+' unidades perdidas.';
      const rA=div(medida(vista,a),a.min),rT=div(totalP,minP);
      if(rA!=null&&rT!=null&&rA>rT*1.0000001)atencion='Su impacto por minuto ('+F.m(rA)+'/min) es superior al promedio de las paradas del periodo ('+F.m(rT)+'/min).';
    }else{
      analisis=alcance(vista,'maquina')+'Ninguna parada del periodo nombra una máquina conocida: todas quedan sin clasificar.';
    }
    if(sin&&sin.n>0){
      const causas=new Map();
      filasP.filter(f=>(f.maquina||'Sin clasificar')==='Sin clasificar').forEach(f=>causas.set(f.causa,(causas.get(f.causa)||0)+medida(vista,f)));
      const top=[...causas.entries()].sort((x,y)=>y[1]-x[1]).slice(0,3).map(([k,v])=>k+' ('+F.m(v)+')');
      atencion=(atencion?atencion+' ':'')+'El '+(pct(medida(vista,sin),totalP)||'—')+' de la '+F.med+' de las paradas ('+nf(sin.n)+(sin.n===1?' evento':' eventos')+') no tiene máquina identificada en el registro. Causas registradas en ese grupo: '+top.join(', ')+'.';
    }
    return ok(analisis,hallazgo,atencion);
  }

  /* ---------- 9. Minutos vs pérdida ---------- */
  function dispersion(vista){
    const F=fmt(vista),p=vista.series.scatter;
    if(!vista.hayDatos||p.length<2)return sinDatos();
    const masLarga=p.reduce((a,b)=>b.x>a.x?b:a),masCara=p.reduce((a,b)=>b.y>a.y?b:a);
    const desc=e=>(e.fila.maquina&&e.fila.maquina!=='Sin clasificar'?e.fila.maquina+' · ':'')+e.fila.causa+' ('+nf(e.x)+' min → '+(vista.econ?F.m(e.y):nf(e.y)+' und')+')';
    const yTxt=e=>vista.econ?F.m(e.y):nf(e.y)+' und';
    let analisis='Se comparan '+nf(p.length)+' paradas: la de mayor duración fue '+desc(masLarga)+' y la de mayor '+(vista.econ?'pérdida':'cantidad de unidades perdidas')+' fue '+desc(masCara)+'.';
    let hallazgo=null,atencion=null;
    // inversión: una parada más larga con menos pérdida que otra más corta
    let par=null;
    p.forEach(a=>p.forEach(b=>{if(a.x>b.x&&a.y<b.y){const d=b.y-a.y;if(!par||d>par.d)par={largo:a,corto:b,d};}}));
    if(par){
      hallazgo='Una parada de '+nf(par.corto.x)+' min ('+par.corto.fila.causa+') generó '+yTxt(par.corto)+', mientras que otra de '+nf(par.largo.x)+' min ('+par.largo.fila.causa+') generó '+yTxt(par.largo)+'.';
      atencion='Conclusión: la duración de una parada no determina por sí sola su prioridad '+(vista.econ?'económica':'en unidades perdidas')+' en este conjunto de datos.';
    }else if(masLarga.id===masCara.id)atencion='En este conjunto, la parada más larga también es la de mayor '+(vista.econ?'pérdida':'impacto en unidades')+'.';
    const ys=p.map(e=>e.y).sort((a,b)=>a-b);
    if(ys.length>=8){
      const q=f=>ys[Math.min(ys.length-1,Math.floor(f*(ys.length-1)))];
      const q1=q(0.25),q3=q(0.75),lim=q3+1.5*(q3-q1);
      const atip=p.filter(e=>e.y>lim);
      if(atip.length&&q3>q1)atencion=(atencion?atencion+' ':'')+'Hay '+atip.length+' evento(s) atípico(s) con '+(vista.econ?'pérdida':'unidades')+' muy superior al resto.';
    }
    return ok(alcance(vista,null)+analisis,hallazgo,atencion);
  }

  /* ---------- 10. Pérdida acumulada ---------- */
  function acumulada(vista){
    const F=fmt(vista),ac=vista.series.acumulada,n=ac.valores.length;
    if(!vista.hayDatos||n<2)return sinDatos();
    const total=ac.valores[n-1];
    if(!(total>0))return sinDatos();
    const i50=ac.valores.findIndex(v=>v>=total*0.5);
    const prom=div(total,n);
    return ok(alcance(vista,'dia')+'La '+F.med+' acumulada del periodo llega a '+F.m(total)+', con un promedio de '+F.m(prom||0)+' por '+(vista.series.evolucion.unidad==='hora'?'franja horaria':'día')+'.',
      i50>=0?'Se alcanzó el 50 % del total el '+(vista.series.evolucion.unidad==='hora'?'a las '+ac.claves[i50]:fmtFecha(ac.claves[i50]))+' ('+nf(i50+1)+' de '+nf(n)+' '+(vista.series.evolucion.unidad==='hora'?'franjas':'días')+').':null,null);
  }

  /* ---------- foco de la selección actual (debajo de los KPI) ---------- */
  function foco(vista){
    const F=fmt(vista),c=vista.contexto;
    if(!c||!c.chips.length)return null;
    const act=vista.kpis.total[F.medidaClave];
    if(!vista.hayDatos||!(act>0))return {estado:'sin_datos',analisis:SIN_DATOS};
    const nombres=c.chips.map(x=>x.valor).join(' + ');
    const padre=c.totalPadre?c.totalPadre[F.medidaClave]:null;
    const baseTxt=c.chips.length>1?'de '+c.chips.slice(0,-1).map(x=>x.valor).join(' + '):'del periodo completo';
    const sh=pct(act,padre),shTotal=pct(act,c.totalSinFiltros[F.medidaClave]);
    const ultimo=c.chips[c.chips.length-1];
    let t='Con '+nombres+' la '+F.med+' es '+F.m(act)+(sh?', equivalente al '+sh+' del impacto '+baseTxt:'')+'.';
    if(c.chips.length>1&&shTotal)t+=' Frente al total sin filtros: '+shTotal+'.';
    return limpio({estado:'ok',analisis:t,hallazgo:ultimo.dim==='turno'?'Durante el turno '+ultimo.valor+' se concentró '+F.m(act)+'.':null,atencion:null});
  }

  const API={SIN_DATOS,evolucion,linea,pareto,maquina,marca,pres,turno,tipo,dispersion,acumulada,foco,alcance,fmt,div,pct};
  raiz.GlacialImpactoAnalisis=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
