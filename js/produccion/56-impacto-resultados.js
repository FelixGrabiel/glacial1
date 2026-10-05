/* =============================================================
   IMPACTO ECONÓMICO · FUENTE DE DATOS DEL DASHBOARD Y PUBLICACIÓN PARA JEFATURA

   Todos los roles dibujan el mismo dashboard (58-impacto-dashboard.js) sobre las mismas FILAS por evento
   {id, tipo P/V/M, fecha, hora, turno, linea, marca, pres, maquina, causa, min, u, s, est, falta}; lo que cambia es de dónde salen:
     · GERENCIA  → las calcula su navegador con los valores unitarios (50-impacto-economico.js + 55-valores-economicos.js).
     · JEFATURA  → las lee ya calculadas de resultadosEconomicos/{AAAA-MM-DD} (soles y unidades por evento, SIN valores unitarios).
                   Su navegador no lee valoresUnitarios (permission-denied).
     · LOS DEMÁS → las calculan sin valores (s = null): el dashboard sale en modo operativo, sin ninguna cifra en soles.
   ARQUITECTURA (sin backend): el navegador de Gerencia publica los días recientes (ventana de VENTANA días) al abrir la sesión, al
   cambiar un valor, cada minuto el día de hoy y cada hora toda la ventana; solo se escribe lo que cambió (huella por documento).
   Si ningún dispositivo de Gerencia está abierto, Jefatura ve la última publicación (la pantalla muestra la hora). Con Cloud
   Functions (plan Blaze) este cálculo pasaría al servidor.
   Aviso de diseño: las filas de Jefatura traen soles y unidades del mismo evento; dividir uno entre otro permite deducir el valor
   unitario. Es una decisión aceptada por el negocio (Jefatura ve las unidades), no un bloqueo técnico.
   Cargar después de 55-valores-economicos.js.
   ============================================================= */
(function(){
  'use strict';

  const COL='resultadosEconomicos';
  const VENTANA=70;                      // días que se publican hacia atrás
  const VERSION=2;
  const A=()=>window.glacialReporteIndicadores;
  const eco=()=>window.glacialEconomico;
  const IE=()=>window.glacialImpactoEconomico;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const r2=n=>Math.round(num(n)*100)/100;
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const dias=(desde,hasta)=>{const o=[];for(let d=desde;d<=hasta;d=A().addDias(d,1))o.push(d);return o;};
  const pausa=()=>new Promise(r=>setTimeout(r,0));

  /* ---------- aviso a la pantalla ---------- */
  const oyentes=[];
  const alCambiarDatos=f=>{if(typeof f==='function')oyentes.push(f);};
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(e){console.warn('Impacto:',e&&e.message||e);}});

  /* =========================================================
     1) FILAS POR DÍA (Gerencia y operativo: cálculo propio con caché)
     ========================================================= */
  const cache=new Map();
  const limpiarCache=()=>cache.clear();
  function filasCalculadas(fecha,modo){
    const k=modo+'|'+fecha,ahora=Date.now(),c=cache.get(k);
    const ttl=fecha>=A().hoyOp()?45000:600000;           // hoy cambia en vivo; los días cerrados casi no cambian
    if(c&&ahora-c.t<ttl)return c;
    const rec=A().recolectar(fecha,fecha,{linea:'',motivosSistema:true});
    const res=IE().calcularImpacto(rec.partes,modo==='eco'?IE().provDefecto():IE().provSinValores());
    const filas=res.filas.map(f=>Object.assign({},f,{lineaKey:f.linea,linea:IE().nombreImp(f.linea)}));
    const o={t:ahora,filas,faltan:{productos:res.faltan.margen.length,insumos:res.faltan.costo.length}};
    cache.set(k,o);
    return o;
  }

  /* =========================================================
     2) PUBLICACIÓN (solo el navegador de Gerencia)
     ========================================================= */
  const hashes=new Map();
  let ultimaCompleta=0,publicando=false,temporizador=null,cierreResultados=null;
  const compactar=f=>({t:f.tipo,h:f.hora||'',tu:f.turno,g:f.grupo,l:f.lineaKey,m:f.marca,p:f.pres,mq:f.maquina||'',c:f.causa,mi:r2(f.min),u:r2(f.u),s:f.s==null?null:r2(f.s),e:f.est?1:0,f:f.falta||null});
  const docDia=(fecha,c)=>({fecha,v:VERSION,filas:c.filas.map(compactar),faltan:c.faltan});
  async function publicar(completa){
    if(publicando)return;
    try{
      if(!eco()||!eco().esGerencia()||!eco().listo()||!IE()||typeof _recordsReady==='undefined'||!_recordsReady||typeof db==='undefined')return;
      const uid=(typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid)||'';
      if(!uid)return;
      publicando=true;
      const hoy=A().hoyOp();
      const desde=completa?A().addDias(hoy,-(VENTANA-1)):A().addDias(hoy,-1);
      let n=0;
      for(const f of dias(desde,hoy)){
        if(completa)cache.delete('eco|'+f);        // la publicación completa recalcula
        const c=filasCalculadas(f,'eco');
        const doc=docDia(f,c),h=JSON.stringify(doc);
        if(hashes.get(f)!==h&&(c.filas.length>0||hashes.has(f))){
          await db.collection(COL).doc(f).set(Object.assign({},doc,{generadoPorUid:uid,generadoEn:firebase.firestore.FieldValue.serverTimestamp()}));
          hashes.set(f,h);
        }else if(!hashes.has(f))hashes.set(f,h);
        if(++n%4===0)await pausa();
      }
      const meta=num((eco().docs().general||{}).metaPerdidaMes),hm='meta:'+meta;
      if(hashes.get('meta')!==hm){
        await db.collection(COL).doc('meta').set({fecha:'9999-12-31',v:VERSION,metaPerdidaMes:meta,generadoPorUid:uid,generadoEn:firebase.firestore.FieldValue.serverTimestamp()});
        hashes.set('meta',hm);
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
     3) LECTURA (solo el navegador de Jefatura)
     ========================================================= */
  const RES={dias:new Map(),meta:0,listo:false,error:'',ultimo:0};
  function cerrarResultados(){
    if(cierreResultados){try{cierreResultados();}catch(_){/* ya cerrada */}}
    cierreResultados=null;RES.dias.clear();RES.meta=0;RES.listo=false;RES.error='';RES.ultimo=0;
  }
  function abrirResultados(){
    if(cierreResultados||typeof db==='undefined')return;
    cierreResultados=db.collection(COL).orderBy('fecha','desc').limit(150).onSnapshot(snap=>{
      RES.dias.clear();RES.ultimo=0;
      snap.docs.forEach(d=>{
        const x=d.data();
        if(d.id==='meta'){RES.meta=num(x.metaPerdidaMes);return;}
        if(!Array.isArray(x.filas))return;               // documentos de la versión anterior (sin eventos): se ignoran
        RES.dias.set(d.id,x);
        const ms=x.generadoEn&&x.generadoEn.toMillis?x.generadoEn.toMillis():0;
        if(ms>RES.ultimo)RES.ultimo=ms;
      });
      RES.listo=true;RES.error='';avisar();
    },e=>{RES.error='No se pudieron leer los resultados económicos: '+((e&&e.message)||e);RES.listo=true;avisar();});
  }
  const expandir=(x,fecha)=>(x.filas||[]).map((f,i)=>({
    id:fecha+'|j|'+i,tipo:f.t,fecha,hora:f.h||'',turno:f.tu,grupo:f.g,lineaKey:f.l,linea:IE().nombreImp(f.l),marca:f.m,pres:f.p,maquina:f.mq||'',causa:f.c,
    min:num(f.mi),u:num(f.u),s:f.s==null?null:num(f.s),est:!!f.e,falta:f.f||null
  }));

  /* =========================================================
     4) API DE CARGA PARA EL DASHBOARD
     ========================================================= */
  let ticket=0;
  const modoDe=()=>eco().esGerencia()?'eco':eco().esJefatura()?'jef':'op';
  /* cargar(desde,hasta,cb): cb(filas, info). Calcula por tandas para no congelar la pantalla; una carga nueva anula la anterior. */
  function cargar(desde,hasta,cb){
    const modo=modoDe(),lista=dias(desde,hasta),id=++ticket,out=[],info={modo,diasSinPublicar:0,ultimo:RES.ultimo,faltan:{productos:0,insumos:0}};
    if(modo==='jef'){
      lista.forEach(f=>{const x=RES.dias.get(f);if(!x){info.diasSinPublicar++;return;}out.push(...expandir(x,f));});
      cb(out,info);return id;
    }
    let i=0;
    (function paso(){
      if(id!==ticket)return;
      const fin=Date.now()+14;
      while(i<lista.length&&Date.now()<fin){
        const c=filasCalculadas(lista[i],modo);
        out.push(...c.filas);info.faltan.productos=Math.max(info.faltan.productos,c.faltan.productos);info.faltan.insumos=Math.max(info.faltan.insumos,c.faltan.insumos);
        i++;
      }
      if(i<lista.length)setTimeout(paso,0);else cb(out,info);
    })();
    return id;
  }
  const meta=()=>eco()&&eco().esGerencia()?num((eco().docs().general||{}).metaPerdidaMes):RES.meta;
  const cancelar=()=>{ticket++;};

  /* =========================================================
     5) CAMBIOS DE NIVEL
     ========================================================= */
  function alCambiarNivel(){
    const n=eco()?eco().nivel():null;
    if(n==='gerencia'){cerrarResultados();programar();}
    else if(n==='jefatura'){detenerPublicacion();abrirResultados();}
    else{detenerPublicacion();cerrarResultados();}
    limpiarCache();avisar();
  }
  let nivelPrevio=null;
  if(eco())eco().alCambiar(()=>{
    const n=eco().nivel();
    if(n==='gerencia'&&eco().listo()){limpiarCache();publicar(true);avisar();}   // llegó un valor nuevo: se recalcula y se publica
    if(nivelPrevio!==n){nivelPrevio=n;alCambiarNivel();}
  });
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detenerPublicacion();cerrarResultados();limpiarCache();cancelar();nivelPrevio=null;});

  window.glacialImpactoResultados={cargar,cancelar,meta,alCambiarDatos,limpiarCache,publicar,estado:RES,VENTANA,VERSION,compactar,expandir,docDia};
  // Si el nivel ya estaba resuelto cuando se cargó este archivo, se arranca de inmediato.
  if(eco()&&eco().accesoListo()){nivelPrevio=eco().nivel();alCambiarNivel();}
})();
