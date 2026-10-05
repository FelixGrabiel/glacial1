/* =============================================================
   PLANIFICACIÓN · CATÁLOGO Y VISTA SEMANAL (Parte B)

   Catálogo: sync/catalogoPlanificacion → items [{id, linea, marca, presentacion, unidadesPorPaleta, activo}].
   La velocidad estándar NO se guarda aquí: se muestra y se edita la tabla que ya existe en
   sync/configIndicadores (velocidades), con la misma escritura que usa Análisis de paradas
   (window.glacialGuardarConfigIndicadores, 47-analisis-paradas.js). Los ratios fijos del código
   (01-config.js) solo sirven como valor inicial (botón «Cargar velocidades iniciales»).
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  const {num,norm,esc,iso,addDias,lunesDe,fechaOk,ahoraMs}=NS.util;

  /* ---------- datos del catálogo (escucha en vivo) ---------- */
  let items=[],listo=false;
  const claveItem=(l,m,p)=>norm(l)+'|'+norm(m)+'|'+norm(p);
  const buscar=(l,m,p)=>items.find(x=>claveItem(x.linea,x.marca,x.presentacion)===claveItem(l,m,p))||null;
  NS.catalogo=()=>items.slice();
  NS.catalogoListo=()=>listo;
  NS.uppCatalogo=(l,m,p)=>{const x=buscar(l,m,p);return x&&x.activo!==false?num(x.unidadesPorPaleta):0;};
  NS.productoInactivo=(l,m,p)=>{const x=buscar(l,m,p);return !!x&&x.activo===false;};

  NS.escuchas.push(function(){
    if(typeof db==='undefined')return null;
    return db.collection('sync').doc('catalogoPlanificacion').onSnapshot(snap=>{
      items=(snap.exists&&Array.isArray(snap.data().items))?snap.data().items:[];
      listo=true;
      NS.refrescar();
    },err=>console.warn('Catálogo de Planificación:',err&&err.message||err));
  });

  /* Crea o actualiza UN producto en una transacción (varias personas a la vez no se pisan). */
  async function guardarProducto(prod){
    if(!NS.puede())throw new Error('Solo Planificación puede editar el catálogo.');
    const upp=Number(prod.unidadesPorPaleta);
    if(!prod.linea||!prod.marca||!prod.presentacion)throw new Error('Elige línea, marca y presentación.');
    if(!Number.isInteger(upp)||upp<=0)throw new Error('Las unidades por paleta deben ser un entero mayor que cero.');
    const ref=db.collection('sync').doc('catalogoPlanificacion');
    const clave=claveItem(prod.linea,prod.marca,prod.presentacion);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const actuales=snap.exists&&Array.isArray(snap.data().items)?snap.data().items.slice():[];
      const idx=actuales.findIndex(x=>claveItem(x.linea,x.marca,x.presentacion)===clave);
      const registro={
        id:idx>-1?actuales[idx].id:'cat_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        linea:prod.linea,marca:prod.marca,presentacion:prod.presentacion,unidadesPorPaleta:upp,activo:prod.activo!==false,
        actualizadoPor:(state.user&&(state.user.nombre||state.user.username))||'',actualizadoEn:ahoraMs()
      };
      if(idx>-1)actuales[idx]=Object.assign({},actuales[idx],registro);else actuales.push(registro);
      tx.set(ref,{items:actuales,updatedAt:Date.now()});
    });
  }
  NS.guardarProducto=guardarProducto;

  /* Carga inicial: toma las unidades por paleta que ya usan las programaciones guardadas (la más reciente de cada producto).
     No cambia ninguna programación. */
  function valoresIniciales(){
    const mapa=new Map();
    NS.programaciones().forEach(p=>{
      const upp=num(p&&p.unidadesPorPaleta);
      if(!p||!(upp>0)||!p.linea||!p.marca||!p.presentacion)return;
      const k=claveItem(p.linea,p.marca,p.presentacion),ref=mapa.get(k);
      if(!ref||String(p.fecha)>String(ref.fecha))mapa.set(k,{linea:p.linea,marca:p.marca,presentacion:p.presentacion,unidadesPorPaleta:upp,fecha:p.fecha});
    });
    return [...mapa.values()].filter(x=>!buscar(x.linea,x.marca,x.presentacion));
  }
  async function cargarIniciales(){
    const nuevos=valoresIniciales();
    if(!nuevos.length)return 0;
    const ref=db.collection('sync').doc('catalogoPlanificacion');
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const actuales=snap.exists&&Array.isArray(snap.data().items)?snap.data().items.slice():[];
      nuevos.forEach(n=>{
        if(actuales.some(x=>claveItem(x.linea,x.marca,x.presentacion)===claveItem(n.linea,n.marca,n.presentacion)))return;
        actuales.push({id:'cat_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),linea:n.linea,marca:n.marca,presentacion:n.presentacion,
          unidadesPorPaleta:n.unidadesPorPaleta,activo:true,origen:'programaciones existentes',
          actualizadoPor:(state.user&&(state.user.nombre||state.user.username))||'',actualizadoEn:ahoraMs()});
      });
      tx.set(ref,{items:actuales,updatedAt:Date.now()});
    });
    return nuevos.length;
  }

  /* ---------- velocidad estándar (tabla de sync/configIndicadores) ---------- */
  const claveVel=(l,p,m)=>l+'|'+String(p||'').trim()+(m?'|'+m:'');
  const normVel=k=>norm(k).replace(/\s+/g,'');
  function velocidadTabla(l,p,m){
    const cfg=typeof window.glacialConfigIndicadores==='function'?window.glacialConfigIndicadores():null;
    const v=cfg&&cfg.velocidades?cfg.velocidades:{};
    const buscarClave=k=>{const e=Object.entries(v).find(([kk])=>normVel(kk)===normVel(k));return e?num(e[1]):0;};
    return (m?buscarClave(claveVel(l,p,m)):0)||buscarClave(claveVel(l,p));
  }
  const velocidadEfectiva=(l,p,m)=>typeof window.glacialVelocidadEstandar==='function'?num(window.glacialVelocidadEstandar(l,p,m)):0;
  const velocidadCodigo=(l,p,m)=>typeof window.glacialVelocidadCatalogo==='function'?num(window.glacialVelocidadCatalogo(l,p,m)):0;
  const puedeVelocidad=()=>NS.puede()&&typeof window.glacialGuardarConfigIndicadores==='function';

  /* Velocidades iniciales: copia los ratios fijos del código a la tabla donde todavía no hay valor (con la excepción por marca). */
  async function cargarVelocidadesIniciales(){
    const nuevas={};
    NS.lineas().forEach(l=>{
      NS.presentacionesBrutas(l.key).forEach(p=>{
        const general=velocidadCodigo(l.key,p,'');
        if(general>0&&!velocidadTabla(l.key,p,''))nuevas[claveVel(l.key,p)]=general;
        NS.marcas(l.key).forEach(m=>{
          const v=velocidadCodigo(l.key,p,m);
          if(v>0&&v!==general&&!velocidadTabla(l.key,p,m))nuevas[claveVel(l.key,p,m)]=v;
        });
      });
    });
    const n=Object.keys(nuevas).length;
    if(n)await window.glacialGuardarConfigIndicadores({},nuevas);
    return n;
  }

  /* =========================================================
     PESTAÑA CATÁLOGO
     ========================================================= */
  const F={linea:''};

  function pintarCatalogo(cont){
    const planifica=NS.puede();
    cont.innerHTML='<div class="plan-bar"><label>Línea<select id="cat-linea"><option value="">Todas</option>'+
      NS.lineas().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===F.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      (planifica?'<span style="flex:1"></span><button type="button" class="btn btn-ghost btn-sm" data-cat-nuevo>+ Agregar producto</button>'+
        '<button type="button" class="btn btn-ghost btn-sm" data-cat-iniciales>Cargar valores iniciales</button>'+
        (puedeVelocidad()?'<button type="button" class="btn btn-ghost btn-sm" data-cat-vel-iniciales>Cargar velocidades iniciales</button>':''):'')+
      '</div><div id="cat-tabla"></div>'+
      '<p class="plan-nota">La velocidad estándar es la misma tabla de Análisis de paradas y del Resumen (sync/configIndicadores): aquí se muestra y se edita, no se duplica. «valor inicial» = viene del ratio fijo del código y no está en la tabla.</p>';
    pintarTablaCatalogo();
  }

  function pintarTablaCatalogo(){
    const cont=document.getElementById('cat-tabla');
    if(!cont)return;
    const planifica=NS.puede();
    if(!listo){cont.innerHTML='<div class="empty-state"><p>Cargando catálogo…</p></div>';return;}
    const filas=items.filter(x=>!F.linea||x.linea===F.linea)
      .sort((a,b)=>(NS.lineas().findIndex(l=>l.key===a.linea)-NS.lineas().findIndex(l=>l.key===b.linea))||String(a.marca).localeCompare(String(b.marca),'es')||String(a.presentacion).localeCompare(String(b.presentacion),'es'));
    if(!filas.length){
      cont.innerHTML='<div class="empty-state"><h4>El catálogo está vacío</h4><p>'+(planifica?'Pulsa «Cargar valores iniciales» para tomar las unidades por paleta que ya usan las programaciones, o agrega un producto.':'Todavía no hay productos cargados.')+'</p></div>';
      return;
    }
    cont.innerHTML='<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Línea</th><th>Marca</th><th>Presentación</th><th class="num">UND por paleta</th><th class="num">Velocidad estándar (UND/h)</th><th>Activo</th><th></th></tr></thead><tbody>'+
      filas.map(x=>{
        const tabla=velocidadTabla(x.linea,x.presentacion,x.marca),ef=velocidadEfectiva(x.linea,x.presentacion,x.marca);
        return '<tr'+(x.activo===false?' style="opacity:.55"':'')+'><td>'+esc(NS.nombreLinea(x.linea))+'</td><td>'+esc(x.marca)+'</td><td>'+esc(NS.etiquetaPresentacion(x.linea,x.marca,x.presentacion))+'</td>'+
          '<td class="num">'+num(x.unidadesPorPaleta).toLocaleString('es-PE')+'</td><td class="num">'+(ef?ef.toLocaleString('es-PE'):'—')+(ef&&!tabla?' <small>(valor inicial)</small>':'')+'</td>'+
          '<td>'+(x.activo===false?'No':'Sí')+'</td><td class="acc">'+(planifica?'<button type="button" class="btn btn-ghost btn-sm" data-cat-editar="'+esc(x.id)+'">Editar</button>':'')+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }

  function abrirProducto(id){
    if(!NS.puede())return;
    const x=id?items.find(i=>i.id===id):null;
    const base=x||{linea:F.linea||(NS.lineas()[0]&&NS.lineas()[0].key)||'',marca:'',presentacion:'',unidadesPorPaleta:'',activo:true};
    const fondo=NS.abrirDialogo('<h3>'+(x?'Editar producto':'Agregar producto')+'</h3><div class="plan-campos">'+
      '<label>Línea<select id="cp-linea"'+(x?' disabled':'')+'>'+NS.lineas().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===base.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<label>Marca<select id="cp-marca"'+(x?' disabled':'')+'></select></label>'+
      '<label class="completo">Presentación<select id="cp-pres"'+(x?' disabled':'')+'></select></label>'+
      '<label>Unidades por paleta<input type="number" id="cp-upp" min="1" step="1" value="'+esc(base.unidadesPorPaleta)+'"></label>'+
      '<label>Velocidad estándar (UND/h)<input type="number" id="cp-vel" min="0" step="1"'+(puedeVelocidad()?'':' disabled')+'></label>'+
      '<label class="completo" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="cp-activo"'+(base.activo!==false?' checked':'')+'> Producto activo</label></div>'+
      '<div class="plan-aviso" id="cp-nota"></div><div class="plan-error" id="cp-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="cp-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="cp-guardar">Guardar</button></div>');
    const q=i=>fondo.querySelector('#'+i);
    let velOrig='';
    const llenar=()=>{
      const l=q('cp-linea').value;
      q('cp-marca').innerHTML='<option value="">Selecciona…</option>'+NS.marcas(l).map(m=>'<option value="'+esc(m)+'"'+(m===base.marca?' selected':'')+'>'+esc(m)+'</option>').join('');
      q('cp-pres').innerHTML='<option value="">Selecciona…</option>'+NS.presentaciones(l).map(p=>'<option value="'+esc(p.value)+'"'+(p.value===base.presentacion?' selected':'')+'>'+esc(p.label)+'</option>').join('');
    };
    const mostrarVel=()=>{
      const l=q('cp-linea').value,m=q('cp-marca').value,p=q('cp-pres').value;
      if(!l||!p){q('cp-vel').value='';velOrig='';return;}
      const t=velocidadTabla(l,p,m),ef=velocidadEfectiva(l,p,m);
      q('cp-vel').value=t||ef||'';velOrig=String(t||'');
      q('cp-nota').textContent=!t&&ef?'La velocidad viene del ratio fijo del código; al guardar se escribe en la tabla común.':'';
      if(!x){const s=NS.uppSugerida(l,m,p);if(s>0&&!q('cp-upp').value)q('cp-upp').value=s;}
    };
    llenar();mostrarVel();
    q('cp-linea').onchange=()=>{base.marca='';base.presentacion='';llenar();mostrarVel();};
    q('cp-marca').onchange=mostrarVel;q('cp-pres').onchange=mostrarVel;
    q('cp-cancelar').onclick=()=>fondo.remove();
    q('cp-guardar').onclick=async()=>{
      q('cp-guardar').disabled=true;q('cp-error').textContent='';
      try{
        const prod={linea:q('cp-linea').value,marca:q('cp-marca').value,presentacion:q('cp-pres').value,unidadesPorPaleta:q('cp-upp').value,activo:q('cp-activo').checked};
        await guardarProducto(prod);
        const vel=String(q('cp-vel').value||'').trim();
        if(puedeVelocidad()&&vel!==''&&vel!==velOrig){
          const n=Number(vel);
          if(!Number.isFinite(n)||n<=0)throw new Error('La velocidad estándar debe ser un número mayor que cero.');
          await window.glacialGuardarConfigIndicadores({},{[claveVel(prod.linea,prod.presentacion)]:n});
        }
        fondo.remove();
      }catch(e){q('cp-error').textContent=(e&&e.message)||String(e);q('cp-guardar').disabled=false;}
    };
  }

  document.addEventListener('click',async e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||NS.estado.tab!=='catalogo')return;
    if(e.target.closest('[data-cat-nuevo]')){abrirProducto('');return;}
    const ed=e.target.closest('[data-cat-editar]');
    if(ed){abrirProducto(ed.getAttribute('data-cat-editar'));return;}
    if(e.target.closest('[data-cat-iniciales]')){
      const n=valoresIniciales().length;
      if(!n){alert('No hay valores nuevos que cargar: todos los productos de las programaciones ya están en el catálogo.');return;}
      if(!confirm('Se agregarán '+n+' producto(s) al catálogo con las unidades por paleta de las programaciones existentes. No cambia ninguna programación. ¿Continuar?'))return;
      try{alert('Se cargaron '+(await cargarIniciales())+' producto(s).');}catch(err){alert('No se pudo cargar: '+((err&&err.message)||err));}
      return;
    }
    if(e.target.closest('[data-cat-vel-iniciales]')){
      if(!confirm('Se copiarán a la tabla de velocidades (la de Análisis de paradas) los ratios fijos del código que todavía no tengan valor. Los que ya tienen valor no se tocan. ¿Continuar?'))return;
      try{
        const n=await cargarVelocidadesIniciales();
        alert(n?'Se cargaron '+n+' velocidad(es). A partir de ahora el código solo sirve de respaldo.':'No había velocidades por cargar.');
        pintarTablaCatalogo();
      }catch(err){alert('No se pudo cargar: '+((err&&err.message)||err));}
    }
  });
  document.addEventListener('change',e=>{
    if(e.target&&e.target.id==='cat-linea'&&e.target.closest('#plan-root')){F.linea=e.target.value;pintarTablaCatalogo();}
  });
  // La tabla de velocidades llega por la suscripción que ya existe (47-analisis-paradas.js).
  if(window.glacialConfigIndicadoresOyentes)window.glacialConfigIndicadoresOyentes.push(()=>{if(NS.estado&&NS.estado.tab==='catalogo')pintarTablaCatalogo();});

  NS.pestanas.push({clave:'catalogo',titulo:'Catálogo',orden:3,pintar:pintarCatalogo,actualizar:pintarTablaCatalogo});

  /* =========================================================
     PESTAÑA VISTA SEMANAL
     ========================================================= */
  function pintarSemanal(cont){
    const E=NS.estado;
    if(!fechaOk(E.semana))E.semana=E.fecha;
    cont.innerHTML='<div class="plan-bar"><button type="button" class="btn btn-ghost btn-sm" data-sem="-7">◀ Semana anterior</button>'+
      '<label>Semana de<input type="date" id="sem-fecha" value="'+esc(E.semana)+'"></label>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-sem="7">Semana siguiente ▶</button>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-sem="hoy">Esta semana</button>'+
      '<span class="plan-nota" style="margin:0 0 0 8px">Ámbar = sin programación · borde azul = más de un producto. Toca una celda para abrirla en Programación.</span></div><div id="sem-grilla"></div>';
    pintarGrilla();
  }

  function pintarGrilla(){
    const cont=document.getElementById('sem-grilla');
    if(!cont)return;
    const E=NS.estado,lun=lunesDe(E.semana);
    const dias=[0,1,2,3,4,5,6].map(i=>addDias(lun,i));
    const nombres=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const todos=NS.programaciones().filter(p=>p&&dias.includes(p.fecha)&&num(p.cantidadProgramada)>0&&NS.estadoDe(p)!=='CANCELADA');
    const totDia={};let granTotal=0;
    let cab1='<th rowspan="2">Línea</th>',cab2='';
    dias.forEach((d,i)=>{cab1+='<th colspan="3" style="text-align:center;border-left:1px solid #d9e2e8">'+nombres[i]+' '+d.slice(8)+'/'+d.slice(5,7)+'</th>';NS.TURNOS.forEach(t=>{cab2+='<th style="text-align:center;font-size:10px;border-left:'+(t==='DÍA'?'1px solid #d9e2e8':'0')+'">'+t.slice(0,3)+'</th>';});});
    cab1+='<th rowspan="2" class="num" style="border-left:1px solid #d9e2e8">Total línea</th>';
    const filas=NS.lineas().map(l=>{
      let totalLinea=0,celdas='';
      dias.forEach(d=>NS.TURNOS.forEach(t=>{
        const ps=todos.filter(p=>p.linea===l.key&&p.fecha===d&&p.turno===t);
        const suma=ps.reduce((s,p)=>s+num(p.cantidadProgramada),0);
        totalLinea+=suma;totDia[d+'|'+t]=(totDia[d+'|'+t]||0)+suma;
        const estilo=!ps.length?'background:#fff8e6':ps.length>1?'box-shadow:inset 0 0 0 2px #2d7fc0;background:#eef6fc':'';
        celdas+='<td data-sem-fecha="'+d+'" data-sem-turno="'+t+'" style="cursor:pointer;font-size:11px;min-width:92px;vertical-align:top;border-left:'+(t==='DÍA'?'1px solid #d9e2e8':'0')+';'+estilo+'">'+
          (ps.length?ps.map(p=>'<div title="'+esc(p.marca+' '+NS.etiquetaPresentacion(p.linea,p.marca,p.presentacion))+'"><b>'+num(p.cantidadProgramada).toLocaleString('es-PE')+'</b> '+esc(p.marca)+' '+esc(NS.etiquetaPresentacion(p.linea,p.marca,p.presentacion))+'</div>').join('')+(ps.length>1?'<div style="color:#2d7fc0">'+ps.length+' productos</div>':''):'<span style="color:#8a6d1d">—</span>')+'</td>';
      }));
      granTotal+=totalLinea;
      return '<tr><td><b>'+esc(l.name)+'</b></td>'+celdas+'<td class="num" style="border-left:1px solid #d9e2e8"><b>'+totalLinea.toLocaleString('es-PE')+'</b></td></tr>';
    });
    let pie='<td><b>Total semana</b></td>';
    dias.forEach(d=>NS.TURNOS.forEach(t=>{pie+='<td class="num" style="font-size:11px"><b>'+(totDia[d+'|'+t]?totDia[d+'|'+t].toLocaleString('es-PE'):'')+'</b></td>';}));
    pie+='<td class="num" style="border-left:1px solid #d9e2e8"><b>'+granTotal.toLocaleString('es-PE')+'</b></td>';
    cont.innerHTML='<div class="plan-scroll"><table class="plan-tabla"><thead><tr>'+cab1+'</tr><tr>'+cab2+'</tr></thead><tbody>'+filas.join('')+'</tbody><tfoot><tr>'+pie+'</tr></tfoot></table></div>';
  }

  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||NS.estado.tab!=='semanal')return;
    const nav=e.target.closest('[data-sem]');
    if(nav){
      const v=nav.getAttribute('data-sem');
      NS.estado.semana=v==='hoy'?(window.GlacialIndicadores?window.GlacialIndicadores.diaOperativo(ahoraMs()):iso(new Date(ahoraMs()))):addDias(NS.estado.semana,Number(v));
      NS.pintarPestana();return;
    }
    const celda=e.target.closest('[data-sem-fecha]');
    if(celda)NS.irA(celda.getAttribute('data-sem-fecha'),celda.getAttribute('data-sem-turno'));
  });
  document.addEventListener('change',e=>{
    if(e.target&&e.target.id==='sem-fecha'&&e.target.closest('#plan-root')&&fechaOk(e.target.value)){NS.estado.semana=e.target.value;NS.pintarPestana();}
  });

  NS.pestanas.push({clave:'semanal',titulo:'Vista semanal',orden:2,pintar:pintarSemanal,actualizar:pintarGrilla});
})();
