/* =============================================================
   PLANIFICACIÓN · PROGRAMACIÓN DESDE WHATSAPP (25/11/2026)
   docs/planificacion/programacion-whatsapp.md

   El mensaje que Planificación manda al grupo («*Programación 24/11 Turno Noche …») se traduce a la secuencia de cada línea
   y se carga con el mismo guardado de «Secuencia de la línea» (66b: S.guardar). Así quedan los tramos (cantidad, hasta una
   hora, hasta el cierre), el orden, el reemplazo de lo anterior del bloque y el historial.

   · leer(texto, {hoy, marcas, presentaciones}) → {programaciones, errores, avisos}: PURO (se prueba con node).
   · resumen(lectura) → texto del mensaje privado que el bot manda a quien envió la programación.
   · remitente(numero) → usuario del sistema con ese WhatsApp y si está autorizado a enviar la programación (u.programacionWhatsapp).
   · cargar(lectura, {remitente, numero, enviadoEn}) → guarda cada línea y bloque. Lo llama el bot cuando la persona responde OK
     (también el botón «Importar de WhatsApp» de Planificación).

   Reglas de lectura:
   · «Pet 2.5 L» / «Pet 1» → PET1 · «Pet 2» / «PET2» → PET2 y siempre LÍNEA NUEVA (/ln) · «Bidones 7L» → B7L (10L → 10 Litros)
     · «Cajas 20L» → C20L · «Bidones 20L» → B20L · «Hielo» → nota del plan (no crea filas).
   · número → cantidad fija · «Hasta las 2 AM» → hasta 02:00 · «Resto / Hasta el fin / Todo el turno», «hasta cerrar» o marca sin
     número → hasta el cierre (solo puede ser el último paso de la línea).
   · «+ sticker» → presentación con sticker · «tapa plana» → TP · «NO PARA», horarios y colores de tapa → nota.
   Lo que no se entiende (marca o presentación) es un ERROR: no se carga nada hasta que se corrija y se vuelva a enviar.
   ============================================================= */
(function(raiz){
  'use strict';

  const sinTildes=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'');
  const norm=t=>sinTildes(t).toLowerCase().replace(/[*_~]/g,' ').replace(/\s+/g,' ').trim();
  const clave=t=>norm(t).replace(/'/g,'').replace(/&/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\b(co|cia)\b/g,' ').replace(/\s+/g,' ').trim();
  const pad=n=>String(n).padStart(2,'0');
  const LINEAS=['PET1','PET2','B7L','C20L','B20L'];
  const NOMBRE={PET1:'PET1',PET2:'PET2',B7L:'B7L',C20L:'C20L',B20L:'B20L'};
  const fmt=n=>Number(n||0).toLocaleString('en-US');

  /* ---------- catálogos (de la página o de opc, para las pruebas) ---------- */
  const marcasDe=(l,o)=>(o&&o.marcas&&o.marcas[l])||(typeof MARCAS_POR_LINEA!=='undefined'&&MARCAS_POR_LINEA[l])||[];
  const presDe=(l,o)=>(o&&o.presentaciones&&o.presentaciones[l])||(typeof PRESENTACIONES_POR_LINEA!=='undefined'&&PRESENTACIONES_POR_LINEA[l])||[];

  /* ---------- reconocer líneas del mensaje ---------- */
  const RE_PROG=/programaci[oó]n\s*(?:del?\s*)?(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?[^a-z0-9]*?(?:turno\s*)?(d[ií]a|noche|intermedio|ma[nñ]ana)/i;
  function lineaDe(t){
    const n=norm(t);
    if(/^\W*hielo\b/.test(n))return 'HIELO';
    if(/\bpet\s*-?\s*2(?![.,]\d)/.test(n))return 'PET2';
    if(/\bpet\s*-?\s*1(?![.,]\d)/.test(n))return 'PET1';
    if(/\bpet\b/.test(n))return 'PET1';
    if(/\bb\s*7\s*l\b|bidon(?:es)?\s*(?:de\s*)?(7|10)\s*(?:l|lt|lts|litros)\b/.test(n))return 'B7L';
    if(/\bc\s*20\s*l\b|caja(?:s)?\s*(?:de\s*)?20\s*(?:l|lt|lts|litros)\b/.test(n))return 'C20L';
    if(/\bb\s*20\s*l\b|bidon(?:es)?\s*(?:de\s*)?20\s*(?:l|lt|lts|litros)\b/.test(n))return 'B20L';
    return null;
  }
  const esItem=t=>/^\s*(?:[.\-•·–]|\*\s+|\d+[.)]\s+)\s*\S/.test(t)&&!/^\s*\*\*/.test(t);
  const limpiarItem=t=>String(t).replace(/^\s*(?:[.\-•·–]|\*|\d+[.)])\s*/,'').replace(/[*_~]/g,'').trim();

  /* ---------- horario «De 09:00 PM a 07:00 AM» ---------- */
  function hora24(h,m,ap){
    let H=Number(h);const M=Number(m||0);
    const a=String(ap||'').toLowerCase().replace(/[\s.]/g,'');
    if(a==='pm'&&H<12)H+=12;if(a==='am'&&H===12)H=0;
    if(!(H>=0&&H<=24&&M>=0&&M<60))return '';
    return pad(H%24)+':'+pad(M);
  }
  function horario(t){
    const m=/de\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\s*a\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i.exec(sinTildes(t));
    if(!m)return '';
    const a=hora24(m[1],m[2],m[3]),b=hora24(m[4],m[5],m[6]);
    return a&&b?a+'–'+b:'';
  }

  /* ---------- valor de un ítem: cantidad, hasta una hora o hasta el cierre ---------- */
  function valor(t){
    const s=sinTildes(t).toLowerCase();
    const h=/hasta\s*(?:las\s*|la\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|hrs?|h)?\b/.exec(s);
    if(h&&!/fin|cierre|cerrar/.test(s.slice(0,h.index+3))){
      let ap=h[3]&&/[ap]/.test(h[3])?h[3]:'';
      if(!ap&&Number(h[1])<=12&&!h[2])ap='';      // «hasta las 2» sin AM/PM: se toma tal cual (02:00)
      const hh=hora24(h[1],h[2],ap);
      if(hh)return {tipoFin:'HORA',hora:hh,resto:s.replace(h[0],' ')};
    }
    if(/resto|fin de(l)? turno|fin del turno|todo el turno|cierre|cerrar|hasta (el )?final/.test(s))return {tipoFin:'CIERRE',resto:s};
    const n=/(\d{1,3}(?:[.,\s]\d{3})+|\d+)(?!\s*(?:l\b|lt|ml|kg|:))/.exec(s);
    if(n){const c=Number(n[1].replace(/[.,\s]/g,''));if(c>0)return {tipoFin:'CANTIDAD',cantidad:c,resto:s.replace(n[0],' ')};}
    if(!s.replace(/[^a-z0-9]/g,''))return {tipoFin:'CIERRE',resto:''};
    return null;
  }

  /* ---------- marca ---------- */
  function marca(linea,texto,o){
    const k=clave(texto);
    if(!k)return null;
    const lista=marcasDe(linea,o);
    const exacta=lista.find(m=>clave(m)===k);
    if(exacta)return exacta;
    // «Bells» = «Bell's»; la marca «simple» (sin _Gas, _Manzana…) cuando el texto no dice el sabor
    const simple=lista.filter(m=>!/_/.test(m)).find(m=>clave(m).replace(/\s/g,'')===k.replace(/\s/g,''));
    return simple||null;
  }

  /* ---------- presentación ---------- */
  function presentacion(linea,pista,o){
    const lista=presDe(linea,o),p=norm(pista);
    const tp=/tapa\s*plana|\btp\b/.test(p),sticker=/sticker/.test(p);
    const x=(/\bx\s*(\d+)\b/.exec(p)||[])[1];
    const tam=/\b2[.,]5\s*l/.test(p)?'2.5L':/\b1[.,]5\s*l/.test(p)?'1.5L':/\b1\s*l\b|\b1\s*litro/.test(p)?'1L':/\b625\b/.test(p)?'625ml':/\b380\b/.test(p)?'380ml':/\b10\s*l/.test(p)?'10L':'';
    const elegir=(cands,que)=>{
      if(x)cands=cands.filter(c=>new RegExp('x'+x+'und','i').test(c));
      if(cands.length===1)return {presentacion:cands[0]};
      if(!cands.length)return {error:'no hay presentación de '+que+' en '+linea};
      return {error:linea+' '+que+': indica cuál ('+cands.map(c=>c.replace(/^Pack_?/,'').replace(/_/g,' ')).join(' / ')+')'};
    };
    if(linea==='PET1'){
      if(sticker)return elegir(lista.filter(c=>/sticker/i.test(c)&&/2\.5L/i.test(c)),'2.5L con sticker');
      if(tam==='1L')return elegir(lista.filter(c=>/1Lx/i.test(c)),'1L');
      return elegir(lista.filter(c=>/2\.5L/i.test(c)&&!/sticker/i.test(c)),'2.5L');
    }
    if(linea==='PET2'){
      // PET2 = línea nueva: entre /la y /ln se toma /ln; si una presentación no tiene esa distinción (1.5L, 2.5L), se usa la única que hay.
      const ln=c=>/\/ln$/i.test(c)||!/\/l[an]$/i.test(c);
      const delTam=t=>lista.filter(c=>c.toLowerCase().includes(t.toLowerCase()+'x')).filter(ln);
      if(!tam)return {error:'PET2: falta el tamaño (1L, 625ml, 380ml, 1.5L o 2.5L) en el título o en la línea'};
      let c=delTam(tam);
      if(tam==='1L'){c=c.filter(z=>tp?/_TP_/i.test(z):!/_TP_/i.test(z));}
      return elegir(c,tam+(tp?' tapa plana':''));
    }
    if(linea==='B7L')return {presentacion:lista.find(c=>tam==='10L'?/10/.test(c):/7/.test(c))||lista[0]};
    return lista.length?{presentacion:lista[0]}:{error:'sin presentaciones en '+linea};
  }

  /* ---------- fecha (año más cercano a hoy) ---------- */
  function fechaDe(d,m,y,hoy){
    const ahora=new Date(),h=/^\d{4}-\d{2}-\d{2}$/.test(String(hoy||''))?hoy:(ahora.getFullYear()+'-'+pad(ahora.getMonth()+1)+'-'+pad(ahora.getDate()));
    let Y=y?Number(String(y).length===2?'20'+y:y):Number(h.slice(0,4));
    if(!y){const mh=Number(h.slice(5,7));if(mh===12&&Number(m)===1)Y++;else if(mh===1&&Number(m)===12)Y--;}
    const f=Y+'-'+pad(m)+'-'+pad(d);
    const dt=new Date(Y,Number(m)-1,Number(d));
    return dt.getMonth()===Number(m)-1&&dt.getDate()===Number(d)?f:'';
  }

  /* ================== LEER EL MENSAJE ================== */
  function leer(texto,o){
    o=o||{};
    const out={programaciones:[],errores:[],avisos:[]};
    let prog=null,sec=null;
    const lineas=String(texto||'').replace(/\r/g,'').split('\n');
    const nuevaSeccion=(linea,txt)=>{
      if(!prog){out.errores.push('«'+txt.trim()+'» está antes del título «Programación dd/mm Turno …».');return null;}
      let s=prog.lineas.find(x=>x.linea===linea);
      if(!s){s={linea,pista:'',horario:'',notas:[],filas:[]};prog.lineas.push(s);}
      s.pista+=' '+txt;
      const h=horario(txt);if(h&&!s.horario)s.horario=h;
      const extra=sinTildes(txt).replace(/[*_]/g,' ').replace(/\(?\s*de\s*\d{1,2}(:\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\s*a\s*\d{1,2}(:\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\s*\)?/i,' ');
      if(/no\s*para/i.test(extra))s.notas.push('NO PARA');
      const tapa=/(con\s+)?tapa\s+plana(\s+[a-z]+)?/i.exec(extra);if(tapa)s.notas.push(tapa[0].replace(/^con\s+/i,'').replace(/^t/,'T').trim());
      return s;
    };
    lineas.forEach((crudo,i)=>{
      const t=crudo.trim();
      if(!t)return;
      const mp=RE_PROG.exec(sinTildes(t));
      if(mp){
        const fecha=fechaDe(mp[1],mp[2],mp[3],o.hoy);
        const tn=sinTildes(mp[4]).toLowerCase();
        const turno=tn==='noche'?'NOCHE':tn==='intermedio'?'INTERMEDIO':'DÍA';
        if(!fecha){out.errores.push('Fecha no válida en «'+t+'».');prog=null;sec=null;return;}
        prog={fecha,turno,titulo:t.replace(/[*_]/g,'').trim(),lineas:[],notas:[]};out.programaciones.push(prog);sec=null;return;
      }
      if(!esItem(t)){
        const l=lineaDe(t);
        if(l==='HIELO'){if(!prog){out.errores.push('«Hielo» está antes del título de la programación.');return;}sec={linea:'HIELO'};const r=t.replace(/[*_]/g,'').replace(/^\W*hielo\W*/i,'').trim();if(r)prog.notas.push('Hielo: '+r);return;}
        if(l){
          // «**Bidones 7L NO PARA*» después de la sección de B7L: nota de esa misma línea
          if(sec&&sec.linea===l&&sec.filas&&sec.filas.length&&/no\s*para/i.test(sinTildes(t))){sec.notas.push('NO PARA');return;}
          sec=nuevaSeccion(l,t);return;
        }
        if(sec&&sec.linea==='HIELO'){prog.notas.push('Hielo: '+t.replace(/[*_]/g,'').trim());return;}
        if(sec&&sec.linea&&/no\s*para|tapa|sticker|^\(/i.test(sinTildes(t))){sec.pista+=' '+t;if(/no\s*para/i.test(sinTildes(t)))sec.notas.push('NO PARA');return;}
        out.avisos.push('No entendí la línea '+(i+1)+': «'+t+'» (se omitió).');return;
      }
      if(!sec||sec.linea==='HIELO'){
        if(sec&&sec.linea==='HIELO'){prog.notas.push('Hielo: '+limpiarItem(t));return;}
        out.errores.push('«'+t+'» no está debajo de una línea (Pet 1, Pet 2, Bidones 7L, Cajas 20L, Bidones 20L).');return;
      }
      const it=limpiarItem(t);
      const dos=it.indexOf(':');
      let mTxt=dos>=0?it.slice(0,dos):it,vTxt=dos>=0?it.slice(dos+1):'';
      const sticker=/\+?\s*(c\/|con\s+)?sticker/i.test(mTxt);
      mTxt=mTxt.replace(/\+?\s*(c\/|con\s+)?sticker/i,'').trim();
      // sin «:» la cantidad puede venir pegada: «Cuisine 2600»
      if(dos<0){const m2=/^(.*?)\s+(\d[\d.,\s]*\d|\d)\s*(.*)$/.exec(mTxt);if(m2&&!/\b\d+\s*l\b/i.test(m2[1]+' '+m2[2])){mTxt=m2[1];vTxt=m2[2]+' '+m2[3];}}
      const v=valor(vTxt);
      const linea=sec.linea,nom='«'+it+'»';
      const mk=marca(linea,mTxt,o);
      if(!mk){out.errores.push(NOMBRE[linea]+': no conozco la marca «'+mTxt.trim()+'» ('+nom+').');return;}
      if(!v){out.errores.push(NOMBRE[linea]+': no entendí la cantidad de '+nom+'. Usa un número, «hasta las 2 AM» o «resto del turno».');return;}
      const pr=presentacion(linea,sec.pista+' '+(sticker?'sticker ':'')+vTxt,o);
      if(pr.error){out.errores.push(pr.error+' ('+nom+').');return;}
      const notas=[];
      const tapa=/tapa\s+plana(\s+[a-záéíóú]+)?/i.exec(vTxt);if(tapa)notas.push(tapa[0].replace(/^t/,'T'));
      sec.filas.push({marca:mk,presentacion:pr.presentacion,tipoFin:v.tipoFin,cantidad:v.cantidad||'',hora:v.hora||'',texto:it,notas});
    });
    // validaciones de cada línea
    out.programaciones.forEach(p=>{
      p.lineas=p.lineas.filter(s=>{
        if(!s.filas.length){out.avisos.push(p.titulo+' · '+NOMBRE[s.linea]+': sin marcas (no se cambia lo programado).');return false;}
        return true;
      });
      p.lineas.forEach(s=>{
        s.notas=[...new Set(s.notas)];
        const idx=s.filas.findIndex(f=>f.tipoFin==='CIERRE');
        if(idx>=0&&idx<s.filas.length-1)out.errores.push(p.titulo+' · '+NOMBRE[s.linea]+': «'+s.filas[idx].texto+'» dice resto del turno pero no es el último; muévelo al final o pon una hora («hasta las 2 AM»).');
      });
      if(!p.lineas.length)out.errores.push(p.titulo+': no tiene líneas con marcas.');
    });
    if(!out.programaciones.length)out.errores.push('No encontré «Programación dd/mm Turno Día/Noche».');
    return out;
  }

  /* ================== RESUMEN PARA EL MENSAJE PRIVADO ================== */
  const fechaTxt=f=>f.slice(8,10)+'/'+f.slice(5,7);
  // etiqueta corta de la página + lo que hay que confirmar: tapa plana / sport cap y línea nueva / antigua
  const pres=(l,p)=>{const base=typeof window!=='undefined'&&window.glacialPlanificacion&&typeof window.glacialPlanificacion.etiquetaPresentacion==='function'?window.glacialPlanificacion.etiquetaPresentacion(l,'',p):String(p).replace(/^Pack_?/,'').replace(/_/g,' ');
    const ex=[];if(/_TP_/i.test(p))ex.push('tapa plana');else if(/_SC_/i.test(p)&&l==='PET2')ex.push('sport cap');if(/\/ln$/i.test(p))ex.push('línea nueva');else if(/\/la$/i.test(p))ex.push('línea antigua');
    return base+(ex.length&&!ex.every(x=>base.toLowerCase().includes(x))?' ('+ex.join(', ')+')':'');};
  const pasoTxt=(f,i)=>f.tipoFin==='CANTIDAD'?fmt(f.cantidad):f.tipoFin==='HORA'?'hasta '+f.hora:(i===0?'todo el turno':'resto del turno');
  function resumen(r){
    if(r.errores.length)return ['🤖 No pude leer tu programación:',...r.errores.map(e=>'• '+e),'','Corrígela y vuelve a enviarla al grupo. No se cargó nada.'].join('\n');
    const l=['🤖 Leí tu programación:'];
    r.programaciones.forEach(p=>{
      l.push('','*'+fechaTxt(p.fecha)+' · Turno '+(p.turno==='NOCHE'?'NOCHE':p.turno==='INTERMEDIO'?'INTERMEDIO':'DÍA')+'*');
      p.lineas.forEach(s=>{
        l.push('*'+NOMBRE[s.linea]+'*'+(s.horario?' ('+s.horario+')':'')+(s.notas.length?' · '+s.notas.join(' · '):''));
        s.filas.forEach((f,i)=>l.push((i+1)+'. '+f.marca+' '+pres(s.linea,f.presentacion)+': '+pasoTxt(f,i)+((f.notas||[]).length?' · '+f.notas.join(' · '):'')));
      });
      p.notas.forEach(n=>l.push('📝 '+n));
    });
    if(r.avisos.length)l.push('','⚠️ '+r.avisos.join('\n⚠️ '));
    l.push('','Responde *OK* para cargarla a Planificación (reemplaza lo programado de esas líneas y turnos) o *NO* para descartarla.');
    return l.join('\n');
  }

  /* ================== REMITENTE ================== */
  const digitos=n=>String(n||'').replace(/\D/g,'');
  const mismoNumero=(a,b)=>{a=digitos(a);b=digitos(b);return a.length>=9&&b.length>=9&&a.slice(-9)===b.slice(-9);};
  function remitente(numero){
    const us=typeof loadUsers==='function'?(loadUsers()||[]):[];
    const u=us.find(x=>x&&x.whatsapp&&mismoNumero(x.whatsapp,numero));
    if(!u)return {ok:false,motivo:'Tu número no está registrado en el sistema (Gestión de usuarios › WhatsApp).'};
    // 25/11/2026: SOLO las personas autorizadas expresamente por el Administrador (Gestión de usuarios › 📱 WhatsApp › «Puede enviar la programación»)
    if(u.programacionWhatsapp!==true)return {ok:false,usuario:u.nombre||u.username,motivo:'Tu usuario no está autorizado para enviar la programación por WhatsApp.'};
    return {ok:true,usuario:u.nombre||u.username,username:u.username};
  }

  /* ================== CARGAR ================== */
  async function cargar(r,o){
    o=o||{};
    const NS=typeof window!=='undefined'?window.glacialPlanificacion:null;
    if(!NS||!NS.secuencia||typeof NS.secuencia.guardar!=='function')throw new Error('Planificación no está cargada.');
    if(r.errores&&r.errores.length)throw new Error('La programación tiene errores: '+r.errores.join(' '));
    let quien=o.remitente||'';
    if(o.numero){const re=remitente(o.numero);if(!re.ok)throw new Error(re.motivo);quien=re.usuario;}
    const en=Number(o.enviadoEn)||Date.now(),conf=Date.now();
    const res=[];
    for(const p of r.programaciones){
      for(const s of p.lineas){
        // con la versión vigente de cada producto (control de cambios del guardado)
        const vig=(NS.secuencia.filasDe(s.linea,p.fecha,p.turno)||[]);
        const filas=s.filas.map(f=>{const v=vig.find(x=>String(x.marca).toLowerCase()===String(f.marca).toLowerCase()&&x.presentacion===f.presentacion);
          return Object.assign({marca:f.marca,presentacion:f.presentacion,tipoFin:f.tipoFin,cantidad:f.cantidad,hora:f.hora,cambioPrevioMin:null},v?{itemClave:v.itemClave,version:v.version,modo:v.modo}:{});});
        const notas=s.notas.concat(s.horario?['Horario '+s.horario]:[],...s.filas.map(f=>f.notas||[]));
        const origen={tipo:'WHATSAPP',enviadoPor:quien,enviadoEn:en,confirmadoEn:conf,titulo:p.titulo,notas:[...new Set(notas)],notasPlan:p.notas};
        try{
          await NS.secuencia.guardar(s.linea,p.fecha,p.turno,filas,{motivo:'Programación por WhatsApp · enviada por '+(quien||'—')+(notas.length?' · '+[...new Set(notas)].join(' · '):''),camposExtra:{origen}});
          res.push({ok:true,fecha:p.fecha,turno:p.turno,linea:s.linea,filas:filas.length});
        }catch(e){res.push({ok:false,fecha:p.fecha,turno:p.turno,linea:s.linea,error:(e&&e.message)||String(e)});}
      }
    }
    const ok=res.filter(x=>x.ok),mal=res.filter(x=>!x.ok);
    const texto=(mal.length?'⚠️ ':'✅ ')+'Cargada en Planificación: '+ok.map(x=>fechaTxt(x.fecha)+' '+(x.turno==='NOCHE'?'Noche':'Día')+' '+x.linea).join(', ')+(ok.length?'':'nada')+
      (mal.length?'\nNo se pudo cargar: '+mal.map(x=>x.linea+' ('+x.error+')').join('; '):'')+(quien?'\nConfirmado por '+quien+'.':'');
    return {ok:!mal.length,resultados:res,texto};
  }

  /* ================== PANTALLA (Planificación › Programación turno) ================== */
  function pantalla(){
    const NS=window.glacialPlanificacion;
    if(!NS||NS.__wsp)return;NS.__wsp=true;
    const esc=t=>NS.util&&NS.util.esc?NS.util.esc(t):String(t==null?'':t);
    const hhmm=ms=>{try{return new Date(ms).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:false});}catch(_){return '';}};
    const previo=NS.pintarExtras;
    NS.pintarExtras=function(){
      if(typeof previo==='function')previo.apply(this,arguments);
      try{
        const E=NS.estado;if(!E)return;
        const barra=document.querySelector('.plan-acc-barra');
        if(barra&&NS.puede()&&!barra.querySelector('[data-plan-wsp]'))barra.insertAdjacentHTML('beforeend','<button type="button" class="btn btn-ghost btn-sm" data-plan-wsp title="Pega el mensaje de programación del grupo de WhatsApp">📲 Importar de WhatsApp…</button>');
        // aviso de lo cargado desde WhatsApp en este bloque
        const items=(NS.items(E.fecha,E.turno)||[]).filter(p=>p&&p.origen&&p.origen.tipo==='WHATSAPP');
        const tabla=document.getElementById('plan-prog-tabla'),viejo=document.getElementById('plan-wsp-aviso');if(viejo)viejo.remove();
        if(tabla&&items.length){
          const o=items.reduce((a,p)=>Number(p.origen.confirmadoEn)>Number(a.confirmadoEn||0)?p.origen:a,{});
          const lin=[...new Set(items.map(p=>p.linea))].map(l=>{const it=items.find(p=>p.linea===l);return '<b>'+esc(l)+'</b>'+((it.origen.notas||[]).length?' ('+esc(it.origen.notas.join(' · '))+')':'');}).join(' · ');
          tabla.insertAdjacentHTML('beforebegin','<div id="plan-wsp-aviso" class="plan-nota" style="background:#E8F8EE;border:1px solid #1FA855;border-radius:8px;padding:8px 10px;margin:8px 0">📲 <b>Cargada desde WhatsApp</b> · enviada por '+esc(o.enviadoPor||'—')+(o.enviadoEn?' '+esc(hhmm(o.enviadoEn)):'')+' · confirmada '+esc(hhmm(o.confirmadoEn))+'. Líneas: '+lin+
            ((o.notasPlan||[]).length?'<br>📝 '+o.notasPlan.map(esc).join('<br>📝 '):'')+'<br><small>Se puede editar como siempre; queda en el historial.</small></div>');
        }
      }catch(_){/* informativo */}
    };
    document.addEventListener('click',e=>{
      if(!e.target.closest||!e.target.closest('[data-plan-wsp]'))return;
      const fondo=NS.abrirDialogo('<h3>Importar programación de WhatsApp</h3><p class="plan-nota">Pega el mensaje tal como se envió al grupo («*Programación 24/11 Turno Noche …»). Primero verás lo que se entendió; nada se guarda hasta que pulses «Cargar».</p>'+
        '<textarea id="pw-texto" rows="12" style="width:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px" placeholder="*Programación 25/11 Turno Dia&#10;*Pet 1 2.5L* …"></textarea>'+
        '<pre id="pw-vista" style="white-space:pre-wrap;background:#F4F8FB;border:1px solid #D5DEE5;border-radius:8px;padding:10px;font-size:12.5px;max-height:320px;overflow:auto;display:none"></pre>'+
        '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="pw-cancelar">Cancelar</button><button type="button" class="btn btn-ghost" id="pw-leer">Leer</button><button type="button" class="btn btn-primary" id="pw-cargar" disabled>Cargar a Planificación</button></div>',true);
      let lect=null;
      const vista=fondo.querySelector('#pw-vista'),bt=fondo.querySelector('#pw-cargar');
      fondo.querySelector('#pw-cancelar').onclick=()=>fondo.remove();
      fondo.querySelector('#pw-texto').oninput=()=>{bt.disabled=true;lect=null;};
      fondo.querySelector('#pw-leer').onclick=()=>{
        const hoy=NS.util&&NS.util.iso?NS.util.iso(new Date(NS.util.ahoraMs())):undefined;
        lect=leer(fondo.querySelector('#pw-texto').value,{hoy});
        vista.style.display='block';vista.textContent=resumen(lect).replace(/\*/g,'').replace(/\n\nResponde OK[\s\S]*$/,'');
        bt.disabled=!!lect.errores.length;
      };
      bt.onclick=async()=>{
        if(!lect)return;bt.disabled=true;bt.textContent='Cargando…';
        try{const r=await cargar(lect,{remitente:(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||''});
          vista.textContent=r.texto;bt.textContent=r.ok?'Cargada ✓':'Cargar a Planificación';if(typeof NS.repintar==='function')NS.repintar();}
        catch(err){vista.textContent='No se pudo cargar: '+((err&&err.message)||err);bt.disabled=false;bt.textContent='Cargar a Planificación';}
      };
    });
  }

  const API={leer,resumen,pasoTxt,remitente,cargar,lineaDe,valor,presentacion,marca,horario,mismoNumero};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof window!=='undefined'){
    window.glacialProgramacionWhatsApp=API;
    if(window.glacialPlanificacion){window.glacialPlanificacion.whatsapp=API;pantalla();}
  }
})(typeof window!=='undefined'?window:globalThis);
