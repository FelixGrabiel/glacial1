/* =============================================================
   HIELO · PROGRAMACIÓN DESDE WHATSAPP (26/11/2026)
   docs/hielo/programacion-whatsapp.md

   Planificación manda al grupo de Hielo la imagen de la programación (tablas «MIERCOLES - TURNO NOCHE», «JUEVES - TURNO DIA» con máquina, producto,
   kg y cantidad de bolsas). El bot de WhatsApp lee la imagen (visión) y entrega aquí lo que leyó; esta página lo interpreta con el catálogo
   de Hielo y lo guarda en «Programación» de Reporte Hielo (hieloProgramacion/{fecha_TURNO}, y _VASOS para los vasos) con el mismo guardado de la pantalla.

   · interpretar(lectura, {marcas, presentaciones, vasos:{marcas}, pares, hoy}) → {programaciones, errores, avisos}: PURO (se prueba con node).
       lectura = { tablas:[{ titulo, fecha, filas:[{ maquina, texto, kg, cantidad, detalle }] }] }  (lo que se ve en la imagen, sin interpretar).
   · resumen(r) → texto para el mensaje privado.
   · remitente(numero) → quien envía debe estar en Gestión de usuarios › WhatsApp con «Puede enviar la programación por WhatsApp».
   · cargar(r, {numero, enviadoEn}) → guarda cada turno (reemplaza lo programado de ese turno y producto) y deja «WhatsApp» y quién la envió en el historial.

   Reglas de lectura:
   · cada fila de «HIELO …» suma sus bolsas por marca + presentación (si una marca sale en dos máquinas, se suman). La máquina, «envasadora automática»,
     «diferido», «URGENTE» quedan como nota en el mensaje de confirmación (la programación guarda marca, presentación y bolsas).
   · «VASOS … CON TAPA» va a la programación de Vasos (marca Glacial / OXXO, presentación «Vaso», cantidad en vasos).
   · lo que no se entiende (marca, kg, cantidad, fecha o turno) es un ERROR: no se carga nada.
   ============================================================= */
(function(raiz){
  'use strict';

  const sinTildes=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'');
  const clave=t=>sinTildes(t).toLowerCase().replace(/['’`´]/g,'').replace(/&/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\b(co|cia)\b/g,' ').replace(/\s+/g,' ').trim();
  // «Bells» = «Bell's»; «Cuisine» = «Cusine & Co»; «Tottus» = «Tottus CD»
  const canon=t=>clave(t).replace(/cuisine/g,'cusine').replace(/\bcd\b/g,' ').replace(/\s+/g,'');
  const pad=n=>String(n).padStart(2,'0');
  const MESES={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,set:9,sep:9,sept:9,oct:10,nov:11,dic:12};

  function fechaDe(txt,hoy){
    const t=sinTildes(txt).toLowerCase();
    let m=/(\d{1,2})\s*[-\/. ]\s*([a-z]{3,4})\w*\s*[-\/. ]\s*(\d{2,4})/.exec(t);
    let d,mes,y;
    if(m&&MESES[m[2]]){d=+m[1];mes=MESES[m[2]];y=+m[3];}
    else{m=/(\d{1,2})\s*[-\/. ]\s*(\d{1,2})\s*[-\/. ]\s*(\d{2,4})/.exec(t);if(!m)return '';d=+m[1];mes=+m[2];y=+m[3];}
    if(y<100)y+=2000;
    const dt=new Date(Date.UTC(y,mes-1,d));
    if(!(y>=2000&&y<=2099)||dt.getUTCMonth()!==mes-1||dt.getUTCDate()!==d)return '';
    return y+'-'+pad(mes)+'-'+pad(d);
  }
  const turnoDe=t=>{const n=sinTildes(t).toLowerCase();return /noche/.test(n)?'NOCHE':/intermedio/.test(n)?'INTERMEDIO':/\bdia\b|ma[nñ]ana/.test(n)?'DÍA':'';};
  function numero(v){
    const s=String(v==null?'':v).replace(/\s/g,'');
    if(!/^\d[\d.,]*$/.test(s))return NaN;
    return Number(/^\d{1,3}([.,]\d{3})+$/.test(s)?s.replace(/[.,]/g,''):s.replace(',','.'));
  }
  const kgTxt=v=>{const n=numero(String(v||'').replace(/kg/i,''));return n>0?(Number.isInteger(n)?n:n)+' kg':'';};

  const RE_NOTAS=[[/diferid[oa]/i,'diferido'],[/envasadora\s*automatic[oa]/i,'envasadora automática'],[/\burgente\b/i,'URGENTE'],[/tolva\s*manual/i,'tolva manual']];
  /** «HIELO MOLITALIA diferido (envasadora automatica)» → { marca:'MOLITALIA', notas:['diferido','envasadora automática'] } */
  function partir(texto,detalle){
    const crudo=String(texto||'')+' '+String(detalle||'');
    const notas=[];RE_NOTAS.forEach(([re,n])=>{if(re.test(sinTildes(crudo)))notas.push(n);});
    let m=sinTildes(texto).replace(/\([^)]*\)/g,' ');
    RE_NOTAS.forEach(([re])=>{m=m.replace(re,' ');});
    m=m.replace(/\bcon\s+tapa\b/gi,' ').replace(/\bvasos?\b/gi,' ').replace(/^\s*hielo\b/i,' ').replace(/\bhielo\b/gi,' ').replace(/\b\d+[.,]?\d*\s*kg\b/gi,' ').replace(/\s+/g,' ').trim();
    return {marca:m,notas};
  }
  const buscar=(lista,txt)=>{const k=canon(txt);return k?(lista||[]).find(m=>canon(m)===k)||null:null;};

  function interpretar(lectura,o){
    o=o||{};
    const out={programaciones:[],errores:[],avisos:[]};
    const L=lectura||{};
    if(L.esProgramacion===false||!Array.isArray(L.tablas)||!L.tablas.length){out.errores.push('No encontré una tabla de programación de Hielo (día, turno y filas con producto y cantidad).');return out;}
    const marcasC=o.marcas||[],presC=o.presentaciones||['1.5 kg','3 kg'],marcasV=(o.vasos&&o.vasos.marcas)||['Glacial','OXXO'];
    const vistos=new Map();
    L.tablas.forEach((t,ti)=>{
      const nom='tabla '+(ti+1)+(t.titulo?' («'+String(t.titulo).trim()+'»)':'');
      const fecha=fechaDe(t.fecha||'',o.hoy)||fechaDe(t.titulo||'',o.hoy),turno=turnoDe(t.titulo||'');
      if(!fecha){out.errores.push(nom+': no leí la fecha (por ejemplo 25-nov-26).');return;}
      if(!turno){out.errores.push(nom+': no leí el turno (Día, Intermedio o Noche).');return;}
      const grupos=new Map();
      (t.filas||[]).forEach(f=>{
        const txt=String(f.texto||'').trim();
        if(!txt)return;
        const cant=numero(f.cantidad);
        if(!(cant>0)||!Number.isFinite(cant)){out.errores.push(nom+': no entendí la cantidad de «'+txt+'» ('+(f.cantidad==null||f.cantidad===''?'vacía':'«'+f.cantidad+'»')+').');return;}
        const vasos=/\bvasos?\b/i.test(sinTildes(txt)),prem=/\bpremium\b/i.test(sinTildes(txt));
        const {marca:mTxt,notas}=partir(txt,f.detalle);
        const producto=vasos?'VASOS':prem?'PREMIUM':'CUBOS';
        if(producto==='PREMIUM'){out.errores.push(nom+': «'+txt+'» es de Hielo Premium; esa programación todavía no se carga por WhatsApp.');return;}
        let marca,pres;
        if(producto==='VASOS'){marca=buscar(marcasV,mTxt);pres='Vaso';}
        else{marca=buscar(marcasC,mTxt);pres=kgTxt(f.kg);}
        if(!marca){out.errores.push(nom+': no conozco la marca «'+mTxt+'» de Hielo'+(vasos?' en vasos':'')+' («'+txt+'»).');return;}
        if(!pres||(producto==='CUBOS'&&!presC.includes(pres))){out.errores.push(nom+': «'+txt+'» trae un peso que no es una presentación de Hielo ('+(f.kg||'sin kg')+'; válidas: '+presC.join(', ')+').');return;}
        if(producto==='CUBOS'&&Array.isArray(o.pares)&&o.pares.length&&!o.pares.some(p=>canon(p[0])===canon(marca)&&p[1]===pres)){out.errores.push(nom+': '+marca+' '+pres+' no está en el catálogo de Hielo («'+txt+'»).');return;}
        const clv=producto+'|'+marca+'|'+pres;
        const g=grupos.get(clv)||{producto,marca,presentacion:pres,bolsas:0,notas:[],maquinas:[]};
        g.bolsas+=Math.round(cant);
        notas.forEach(n=>{if(!g.notas.includes(n))g.notas.push(n);});
        if(f.maquina&&!g.maquinas.includes(String(f.maquina).trim()))g.maquinas.push(String(f.maquina).trim());
        grupos.set(clv,g);
      });
      ['CUBOS','VASOS'].forEach(prod=>{
        const items=[...grupos.values()].filter(g=>g.producto===prod);
        if(!items.length)return;
        const k=fecha+'|'+turno+'|'+prod;
        if(vistos.has(k)){out.errores.push(nom+': ya hay otra tabla de '+(prod==='VASOS'?'vasos':'hielo')+' para el '+fecha+' '+turno+'.');return;}
        vistos.set(k,1);
        out.programaciones.push({fecha,turno,producto:prod,titulo:String(t.titulo||'').trim(),items:items.map(g=>({marca:g.marca,presentacion:g.presentacion,bolsas:g.bolsas,notas:g.notas,maquinas:g.maquinas}))});
      });
      if(!grupos.size)out.errores.push(nom+': no tiene filas de hielo con cantidad.');
    });
    if(!out.programaciones.length&&!out.errores.length)out.errores.push('No encontré filas de hielo con cantidad.');
    return out;
  }

  const fechaTxt=f=>f.slice(8,10)+'/'+f.slice(5,7);
  const fmt=n=>Number(n||0).toLocaleString('en-US');
  function resumen(r){
    if(r.errores.length)return ['🤖 No pude leer la programación de Hielo:',...r.errores.map(e=>'• '+e),'','Corrígela y vuelve a enviarla. No se cargó nada.'].join('\n');
    const l=['🤖 Leí la programación de Hielo:'];
    r.programaciones.forEach(p=>{
      l.push('','*'+fechaTxt(p.fecha)+' · Turno '+p.turno+(p.producto==='VASOS'?' · Vasos':'')+'*');
      p.items.forEach(i=>l.push('• '+i.marca+(p.producto==='VASOS'?'':' '+i.presentacion)+': '+fmt(i.bolsas)+(p.producto==='VASOS'?' vasos':' bolsas')+((i.notas&&i.notas.length)||(i.maquinas&&i.maquinas.length)?' ('+[...(i.maquinas||[]),...(i.notas||[])].join(' · ')+')':'')));
    });
    if(r.avisos.length)l.push('','⚠️ '+r.avisos.join('\n⚠️ '));
    return l.join('\n');
  }

  /* ================== REMITENTE y CARGA (solo en la página) ================== */
  const digitos=n=>String(n||'').replace(/\D/g,'');
  const mismoNumero=(a,b)=>{a=digitos(a);b=digitos(b);return a.length>=9&&b.length>=9&&a.slice(-9)===b.slice(-9);};
  function remitente(numeroWa){
    const A=typeof window!=='undefined'?window.glacialProgramacionWhatsApp:null;
    if(A&&typeof A.remitente==='function')return A.remitente(numeroWa);
    const us=typeof loadUsers==='function'?(loadUsers()||[]):[];
    const u=us.find(x=>x&&x.whatsapp&&mismoNumero(x.whatsapp,numeroWa));
    if(!u)return {ok:false,motivo:'Tu número no está registrado en el sistema (Gestión de usuarios › WhatsApp).'};
    if(u.programacionWhatsapp!==true)return {ok:false,usuario:u.nombre||u.username,motivo:'Tu usuario no está autorizado para enviar la programación por WhatsApp.'};
    return {ok:true,usuario:u.nombre||u.username,username:u.username};
  }
  /** Catálogo vivo de la página (Configuración de Hielo) para interpretar(). */
  function catalogo(){
    const D=typeof window!=='undefined'?window.glacialHieloDatos:null;
    if(!D||typeof D.config!=='function')return null;
    const c=D.config('CUBOS'),v=D.config('VASOS');
    return {marcas:c.marcas,presentaciones:c.presentaciones,vasos:{marcas:v.marcas},pares:typeof PRODUCTOS_HIELO!=='undefined'?PRODUCTOS_HIELO:null};
  }
  function interpretarEnPagina(lectura,hoy){
    const cat=catalogo();if(!cat)throw new Error('Reporte Hielo no está cargado en la página.');
    return interpretar(lectura,Object.assign({hoy},cat));
  }
  async function cargar(r,o){
    o=o||{};
    const D=typeof window!=='undefined'?window.glacialHieloDatos:null;
    if(!D||typeof D.guardarProgramacion!=='function')throw new Error('Reporte Hielo no está cargado en la página.');
    if(r.errores&&r.errores.length)throw new Error('La programación tiene errores: '+r.errores.join(' '));
    let quien=o.remitente||'';
    if(o.numero){const re=remitente(o.numero);if(!re.ok)throw new Error(re.motivo);quien=re.usuario;}
    const res=[];
    for(const p of r.programaciones){
      try{
        const id=p.fecha+'_'+p.turno+(p.producto!=='CUBOS'?'_'+p.producto:'');
        const s=await db.collection(D.C.programacion).doc(id).get();
        const rev=s.exists?Number((s.data()||{}).rev)||0:0;
        await D.guardarProgramacion(p.fecha,p.turno,p.items.map(i=>({marca:i.marca,presentacion:i.presentacion,bolsas:i.bolsas})),rev,p.producto,{tipo:'WHATSAPP',enviadoPor:quien,enviadoEn:Number(o.enviadoEn)||Date.now()});
        res.push({ok:true,fecha:p.fecha,turno:p.turno,producto:p.producto,items:p.items.length,bolsas:p.items.reduce((a,i)=>a+i.bolsas,0)});
      }catch(e){res.push({ok:false,fecha:p.fecha,turno:p.turno,producto:p.producto,error:(e&&e.message)||String(e)});}
    }
    const ok=res.filter(x=>x.ok),mal=res.filter(x=>!x.ok);
    const texto=(mal.length?'⚠️ ':'✅ ')+'Cargada en Hielo › Programación: '+(ok.length?ok.map(x=>fechaTxt(x.fecha)+' '+x.turno+(x.producto==='VASOS'?' (vasos)':'')+' · '+fmt(x.bolsas)).join(', '):'nada')+
      (mal.length?'\nNo se pudo cargar: '+mal.map(x=>fechaTxt(x.fecha)+' '+x.turno+' ('+x.error+')').join('; '):'')+(quien?'\nEnviada por '+quien+'.':'');
    return {ok:!mal.length,resultados:res,texto};
  }

  const API={interpretar,interpretarEnPagina,resumen,remitente,cargar,mismoNumero,fechaDe,turnoDe};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof window!=='undefined')window.glacialHieloProgramacionWhatsApp=API;
})(typeof window!=='undefined'?window:globalThis);
