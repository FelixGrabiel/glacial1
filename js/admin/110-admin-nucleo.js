/* =============================================================
   GLACIAL · PANEL DE ADMINISTRACIÓN (Centro de control) · NÚCLEO PURO (sin pantalla ni base de datos)
   -------------------------------------------------------------
   Reglas y cálculos que se prueban con node (tests/admin-panel.test.js):
     · quién puede entrar (solo el Administrador, nunca en «Ver como» ni una cuenta compartida);
     · las 17 secciones del panel, en 5 grupos (la etapa en que se construye cada una);
     · motivo obligatorio de al menos 10 caracteres para todo cambio sobre datos de otras personas;
     · Auditoría consolidada: LEE las auditorías que ya existen (auditoriaTareos, apAuditoria, insumosAuditoria, auditoriaRegistros) y la propia del panel
       (adminAuditoria, glacial_59) sin moverlas ni cambiar su formato: cada una se adapta a una fila común;
     · cambios de usuarios en borrador (diferencias y aplicación).
   Documentación: docs/00-general/panel-administracion.md
   ============================================================= */
(function(raiz){
  'use strict';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const txt=v=>v===null||v===undefined?'':String(v);
  const MOTIVO_MIN=10;

  /* ---------- acceso ---------- */
  /** Solo un Administrador con sesión propia: no en «Ver como» (user.__vista o ventana de vista activa) ni una cuenta compartida. */
  function puedeAcceder(user,vistaActiva){
    if(!user||typeof user!=='object')return false;
    if(user.__vista||vistaActiva)return false;
    return txt(user.rol).trim()==='Administrador';
  }

  /* ---------- secciones (etapa: 1 = construida en esta entrega) ---------- */
  const GRUPOS=['General','Personas','Operación','Datos','Control'];
  const SECCIONES=[
    {id:'resumen',grupo:'General',titulo:'Resumen',sub:'Lo importante de GLACIAL de un vistazo',etapa:1},
    {id:'sistema',grupo:'General',titulo:'Salud y sesiones',sub:'Estado del sistema y equipos conectados',etapa:4},
    {id:'usuarios',grupo:'Personas',titulo:'Usuarios',sub:'Quién entra a GLACIAL, con qué rol y qué permisos',etapa:1},
    {id:'roles',grupo:'Personas',titulo:'Roles y permisos',sub:'Plantillas de permisos por rol',etapa:1},
    {id:'trabajadores',grupo:'Personas',titulo:'Trabajadores',sub:'Personal, rotaciones y turnos',etapa:3},
    {id:'pines',grupo:'Personas',titulo:'Cuentas compartidas',sub:'Quién usa cada cuenta compartida (PIN personal)',etapa:3},
    {id:'turnos',grupo:'Operación',titulo:'Turnos y horarios',sub:'Horarios de producción y ampliaciones de turno',etapa:3},
    {id:'tareo',grupo:'Operación',titulo:'Tareo y cierres',sub:'Cierres de tareo y reaperturas',etapa:3},
    {id:'registros',grupo:'Operación',titulo:'Corrección de registros',sub:'Corregir, reabrir o eliminar registros con motivo',etapa:3},
    {id:'maestros',grupo:'Datos',titulo:'Datos maestros',sub:'Productos, insumos, proveedores, equipos y motivos',etapa:2},
    {id:'metas',grupo:'Datos',titulo:'Metas y umbrales',sub:'Metas de indicadores y umbrales de avisos',etapa:2},
    {id:'consumos',grupo:'Datos',titulo:'Mermas y consumos',sub:'Factores de consumo, conversiones y tolerancias de merma',etapa:2},
    {id:'papelera',grupo:'Datos',titulo:'Papelera',sub:'Reportes eliminados: recuperarlos desde su constancia',etapa:3},
    {id:'alertas',grupo:'Control',titulo:'Alertas y anuncios',sub:'Anuncios para todos y alertas por rol',etapa:4},
    {id:'seguridad',grupo:'Control',titulo:'Seguridad',sub:'Intentos fallidos y cuentas bloqueadas',etapa:4},
    {id:'auditoria',grupo:'Control',titulo:'Auditoría',sub:'Todo lo que cambió en GLACIAL, de todos los módulos',etapa:1},
    {id:'respaldos',grupo:'Control',titulo:'Respaldos e integraciones',sub:'Respaldos, exportaciones e integraciones',etapa:4}
  ];
  const HECHAS=new Set(SECCIONES.map(x=>x.id));          // las 17 están construidas (etapas 1 a 4); lo que el navegador no puede hacer se dice en su pantalla
  SECCIONES.forEach(x=>{x.hecha=HECHAS.has(x.id);});     // construidas hasta ahora (la etapa dice cuándo se planeó)
  const seccion=id=>SECCIONES.find(s=>s.id===id)||SECCIONES[0];

  /* ---------- motivo ---------- */
  function validarMotivo(t){
    return txt(t).trim().length>=MOTIVO_MIN?[]:['El motivo es obligatorio (mínimo '+MOTIVO_MIN+' caracteres).'];
  }

  /* ---------- auditoría consolidada ---------- */
  /** Milisegundos de un valor de fecha de cualquier auditoría (Timestamp del puente, número, {seconds}, texto ISO). */
  function msDe(v){
    if(v===null||v===undefined||v==='')return 0;
    if(typeof v==='number')return v>1e12?v:v*1000;
    if(typeof v==='string'){const t=Date.parse(v);return Number.isFinite(t)?t:0;}
    if(typeof v==='object'){
      if(typeof v.toMillis==='function'){try{return v.toMillis();}catch(_){return 0;}}
      if(typeof v.toDate==='function'){try{return v.toDate().getTime();}catch(_){return 0;}}
      if(v.seconds!==undefined)return num(v.seconds)*1000+Math.floor(num(v.nanoseconds)/1e6);
    }
    return 0;
  }
  const resumenValor=v=>{
    if(v===null||v===undefined||v==='')return '';
    if(typeof v==='object'){try{const s=JSON.stringify(v);return s.length>160?s.slice(0,157)+'…':s;}catch(_){return '';}}
    return String(v);
  };
  const MODULOS={adminAuditoria:null,auditoriaTareos:'Tareo',apAuditoria:'Asistente de Producción',insumosAuditoria:'Inventario de insumos',auditoriaRegistros:'Registros de producción'};
  /** Una fila común {id, origen, ms, quien, modulo, accion, antes, despues, motivo} a partir de un documento de cualquiera de las auditorías. */
  function normalizarAuditoria(origen,d,id){
    d=d||{};const fila={id:origen+'/'+txt(id||d.opId||d.id),origen,ms:0,quien:'',modulo:MODULOS[origen]||'',accion:'',antes:'',despues:'',motivo:''};
    if(origen==='adminAuditoria'){
      fila.ms=msDe(d.guardadoEn);fila.quien=txt(d.usuarioNombre||d.usuario);fila.modulo=txt(d.modulo)||'Panel de Administración';fila.accion=txt(d.accion);
      fila.antes=resumenValor(d.antes);fila.despues=resumenValor(d.despues);fila.motivo=txt(d.motivo);
    }else if(origen==='auditoriaTareos'){
      fila.ms=msDe(d.timestamp);fila.quien=txt(d.usuarioNombre||d.usuario||d.uid);
      fila.modulo=d.area?'Tareo · '+d.area:'Tareo';
      fila.accion=[txt(d.accion).replace(/_/g,' ').toLowerCase(),d.trabajador?'· '+d.trabajador:'',d.fechaTareo?'· '+d.fechaTareo:''].filter(Boolean).join(' ');
      fila.antes=resumenValor(d.estadoAnterior);fila.despues=resumenValor(d.estadoNuevo);fila.motivo=txt(d.motivoCorreccion||d.motivo);
    }else if(origen==='apAuditoria'){
      fila.ms=msDe(d.en);fila.quien=txt(d.usuario||d.uid);fila.accion=[txt(d.operacion),txt(d.coleccion),txt(d.docId)].filter(Boolean).join(' · ');
      fila.antes=resumenValor(d.antes);fila.despues=resumenValor(d.despues);fila.motivo=txt(d.motivo);
    }else if(origen==='insumosAuditoria'){
      fila.ms=msDe(d.en)||msDe(d.enMs);fila.quien=txt(d.usuario||d.uid);fila.accion=[txt(d.tipo).replace(/_/g,' ').toLowerCase(),txt(d.articulo)].filter(Boolean).join(' · ');
      fila.antes=resumenValor(d.antes);fila.despues=resumenValor(d.despues);fila.motivo=txt(d.motivo||d.nota);
    }else if(origen==='auditoriaRegistros'){
      fila.ms=msDe(d.timestamp);fila.quien=txt(d.usuario||d.uid);
      fila.accion=[txt(d.accion).toLowerCase(),'reporte',txt(d.linea),txt(d.fecha),txt(d.turno)].filter(Boolean).join(' ');
      fila.antes=d.estadoRegistro?'Estado: '+d.estadoRegistro:'';fila.despues=txt(d.accion)==='ELIMINAR'?'Eliminado (hay copia)':'';fila.motivo=txt(d.motivo);
    }
    return fila;
  }
  /** porOrigen: {origen: [{id, data}]} → filas ordenadas de la más reciente a la más antigua. */
  function consolidar(porOrigen,limite){
    const filas=[];
    Object.keys(porOrigen||{}).forEach(o=>(porOrigen[o]||[]).forEach(x=>filas.push(normalizarAuditoria(o,x.data,x.id))));
    filas.sort((a,b)=>b.ms-a.ms);
    return limite?filas.slice(0,limite):filas;
  }
  const modulosDe=filas=>[...new Set(filas.map(f=>f.modulo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const quienesDe=filas=>[...new Set(filas.map(f=>f.quien).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  function filtrarAuditoria(filas,f){
    f=f||{};const q=txt(f.texto).trim().toLowerCase();
    return filas.filter(x=>(!f.modulo||f.modulo==='Todos'||x.modulo===f.modulo)&&(!f.quien||f.quien==='Todos'||x.quien===f.quien)&&
      (!q||[x.accion,x.quien,x.modulo,x.motivo,x.antes,x.despues].join(' ').toLowerCase().includes(q)));
  }

  /* ---------- usuarios y permisos ---------- */
  const TODOS='todos';
  /** Permisos de un usuario como arreglo de claves; 'todos' = todas las del catálogo. */
  function permisosDe(u,claves){
    if(!u)return [];
    if(u.permisos===TODOS)return claves.slice();
    return Array.isArray(u.permisos)?u.permisos.filter(p=>claves.includes(p)):[];
  }
  function resumenPermisos(u,claves){
    if(!u)return '';
    if(u.permisos===TODOS)return 'Todos los permisos';
    const n=permisosDe(u,claves).length;return n+(n===1?' permiso':' permisos');
  }
  /** Borrador de una ficha: {nombre, rol, linea, permisos:[...] | 'todos'}. */
  function borradorDe(u,claves){
    return {nombre:txt(u.nombre),rol:txt(u.rol),linea:txt(u.linea),permisos:u.permisos===TODOS?TODOS:permisosDe(u,claves)};
  }
  const igualesPermisos=(a,b)=>a===TODOS||b===TODOS?a===b:a.length===b.length&&a.every(x=>b.includes(x));
  /** Diferencias entre la ficha guardada y el borrador → [{campo, antes, despues}] (vacío = sin cambios). */
  function diffUsuario(u,b,claves,etiqueta){
    const d=[],lab=etiqueta||(k=>k);
    if(txt(u.nombre)!==txt(b.nombre))d.push({campo:'nombre',antes:txt(u.nombre),despues:txt(b.nombre)});
    if(txt(u.rol)!==txt(b.rol))d.push({campo:'rol',antes:txt(u.rol),despues:txt(b.rol)});
    if(txt(u.linea)!==txt(b.linea))d.push({campo:'líneas a cargo',antes:txt(u.linea),despues:txt(b.linea)});
    const antes=u.permisos===TODOS?TODOS:permisosDe(u,claves);
    if(!igualesPermisos(antes,b.permisos)){
      const a=antes===TODOS?claves:antes,n=b.permisos===TODOS?claves:b.permisos;
      d.push({campo:'permisos',antes:antes===TODOS?'Todos los permisos':a.length+' permisos',despues:b.permisos===TODOS?'Todos los permisos':n.length+' permisos',
        agregados:n.filter(x=>!a.includes(x)).map(lab),quitados:a.filter(x=>!n.includes(x)).map(lab)});
    }
    return d;
  }
  /** Usuario con el borrador aplicado (conserva el resto de sus datos). '-planificacion' se conserva si el rol la trae por defecto y no está marcada. */
  function aplicarBorrador(u,b,rolesPlanificacion){
    const n=Object.assign({},u,{nombre:txt(b.nombre).trim()||u.nombre,rol:b.rol,linea:b.linea});
    if(b.permisos===TODOS)n.permisos=TODOS;
    else{
      const marcados=b.permisos.filter(p=>p!=='-planificacion');
      const sinPlan=!marcados.includes('planificacion')&&(rolesPlanificacion||[]).includes(txt(b.rol).trim());
      n.permisos=sinPlan?[...marcados,'-planificacion']:marcados;
    }
    n.permisosGestionVersion=1;
    return n;
  }
  /** Los administradores principales no se tocan desde el panel: ni su rol ni sus permisos. */
  const esAdminPrincipal=u=>!!u&&(txt(u.username)==='admin'||txt(u.rol).trim()==='Administrador');

  /* ---------- resumen ---------- */
  function kpisResumen(d){
    const u=d.usuarios||[],w=d.trabajadores||[],r=d.registros||[],a=d.auditoria||[],hoy=d.hoy||'';
    const inicioHoy=d.inicioHoyMs||0;
    return {
      usuarios:u.length,
      trabajadores:w.filter(x=>x&&x.activo!==false&&x.estado!=='inactivo').length,
      registrosEnCurso:r.filter(x=>x&&x.estadoRegistro&&x.estadoRegistro!=='FINALIZADO'&&(!d.desdeFecha||String(x.fecha||'')>=d.desdeFecha)).length,
      cambiosHoy:a.filter(x=>x.ms>=inicioHoy&&inicioHoy>0).length,
      hoy
    };
  }

  /* ---------- etapa 2: tolerancias, roles propios, factores ---------- */
  const LINEAS=['PET1','PET2','B7L','C20L','B20L'];
  const campoPct=v=>v===null||v===undefined||v===''?null:Number(String(v).replace(',','.'));
  /** lineas: {PET1:{mermaPct, desviacionPct, validarMermaAntes}} (texto o número). → lista de errores. */
  function validarTolerancias(lineas){
    const e=[];
    Object.keys(lineas||{}).forEach(l=>{
      const x=lineas[l]||{};
      [['mermaPct','merma aceptable'],['desviacionPct','desviación aceptable']].forEach(([c,t])=>{
        const n=campoPct(x[c]);
        if(n!==null&&(!Number.isFinite(n)||n<0||n>100))e.push(l+': la '+t+' debe ser un porcentaje entre 0 y 100 (o vacío para que siga como hoy).');
      });
    });
    return e;
  }
  /** Solo guarda lo que tiene valor; sin valor = el Asistente se comporta como hoy. */
  function normalizarTolerancias(lineas){
    const o={};
    Object.keys(lineas||{}).forEach(l=>{
      const x=lineas[l]||{},m=campoPct(x.mermaPct),d=campoPct(x.desviacionPct),v=x.validarMermaAntes;
      if(m===null&&d===null&&v!==false)return;
      o[l]={mermaPct:m,desviacionPct:d,validarMermaAntes:v!==false};
    });
    return o;
  }
  /** Cambio porcentual de un valor a otro (null si no hay base). */
  function variacionPct(actual,nuevo){
    const a=Number(actual),n=Number(nuevo);
    if(!Number.isFinite(a)||!Number.isFinite(n))return null;
    if(a===0)return n===0?0:null;
    return Math.round((n-a)/Math.abs(a)*1000)/10;
  }
  const esCambioGrande=p=>p!==null&&Math.abs(p)>=20;
  const REG_NOMBRE=/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ._·-]{1,39}$/;
  /** Rol propio nuevo: nombre válido, que no exista y que no use el nombre de una cuenta compartida. */
  function validarRolNuevo(nombre,existentes){
    const n=txt(nombre).trim(),e=[];
    if(!REG_NOMBRE.test(n))e.push('El nombre del rol debe tener entre 2 y 40 caracteres (letras, números y espacios).');
    if((existentes||[]).some(x=>txt(x).trim().toLowerCase()===n.toLowerCase()))e.push('Ya existe un rol con ese nombre.');
    if(/compartid/i.test(n))e.push('Los roles de cuenta compartida los define el sistema.');
    if(n==='Administrador')e.push('«Administrador» es del sistema.');
    return e;
  }
  /** Plantilla de un rol: solo claves de permiso válidas (y '-planificacion'); un rol de consulta no lleva permisos de edición se mantiene tal cual lo decida el Administrador. */
  const limpiarPlantilla=(perms,claves)=>[...new Set((perms||[]).filter(p=>claves.includes(p)))];
  /** Combinaciones (línea · marca · presentación) producidas sin factor vigente para algún insumo. registros: reportes con producción; nf = factorVigente. */
  function combosSinFactor(registros,insumos,factores,fecha,nf,desdeFecha){
    const vistos=new Map();
    (registros||[]).forEach(r=>{
      if(!r||!r.linea||(desdeFecha&&String(r.fecha||'')<desdeFecha))return;
      const mp=r.cuadros&&r.cuadros.length?r.cuadros:[r];
      mp.forEach(c=>{const marca=c.marca||r.marca||'',pres=c.presentacion||r.presentacion||'';if(!marca&&!pres)return;vistos.set([r.linea,marca,pres].join('|'),{linea:r.linea,marca,presentacion:pres});});
    });
    const out=[];
    vistos.forEach(c=>{
      const faltan=(insumos||[]).filter(i=>i&&i.activo!==false).filter(i=>{const f=nf(factores,{insumo:i.codigo,linea:c.linea,marca:c.marca,presentacion:c.presentacion,fecha});return f&&f.error==='SIN_FACTOR';});
      if(faltan.length)out.push(Object.assign({},c,{faltan:faltan.map(i=>({codigo:i.codigo,nombre:i.nombre}))}));
    });
    return out.sort((a,b)=>b.faltan.length-a.faltan.length||String(a.linea).localeCompare(String(b.linea)));
  }

  const NUCLEO={LINEAS,validarTolerancias,normalizarTolerancias,variacionPct,esCambioGrande,validarRolNuevo,limpiarPlantilla,combosSinFactor,MOTIVO_MIN,GRUPOS,SECCIONES,seccion,puedeAcceder,validarMotivo,msDe,normalizarAuditoria,consolidar,modulosDe,quienesDe,filtrarAuditoria,
    permisosDe,resumenPermisos,borradorDe,diffUsuario,aplicarBorrador,igualesPermisos,esAdminPrincipal,kpisResumen,TODOS};
  if(typeof module!=='undefined'&&module.exports)module.exports=NUCLEO;
  else raiz.glacialAdminNucleo=NUCLEO;
})(typeof window!=='undefined'?window:this);
