/* =============================================================
   PERSONAL DEL TURNO DESDE EL TAREO (formulario de registro › «Personal del turno»)
   -------------------------------------------------------------
   El supervisor ya no escribe los nombres a mano: el Tareo de Producción del mismo día y turno dice quién vino. Este módulo
     · lista a los PRESENTES (asistió, tardanza, feriado trabajado, comisión) del bloque del reporte (Día + Intermedio / Noche), con su cargo;
     · «Completar con el tareo» llena SOLO las filas vacías cuya posición se reconoce por el cargo (MAQUINISTA SOPLADOR → Sopladora, ENVASADOR →
       Envasadora, ETIQUETADOR → Etiquetadora, EMPAQUETADOR → Empaquetadora) o, mejor, por el «Puesto en máquina (habitual)» fijado al trabajador en Trabajadores (manda sobre el cargo);
       un trabajador fijado a otra línea no se propone aquí;
     · los demás presentes salen como botones: un clic los pone en la primera fila vacía.
   Nunca pisa lo que el supervisor ya escribió, y todo se puede corregir a mano. Si el Tareo del turno aún no existe, no se inventa nada.
   Funciones puras (presentes, posicionDeCargo, proponer) + la pieza de pantalla; la lista y los cálculos no leen el reloj.
   ============================================================= */
(function(raiz){
  'use strict';

  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const ASISTENCIA_TRABAJA=new Set(['ASISTIO','ASISTIÓ','TARDANZA','FERIADO TRABAJADO','COMISION/TRABAJO EXTERNO','COMISIÓN/TRABAJO EXTERNO']);
  const esNoche=turno=>String(turno||'').toUpperCase()==='NOCHE';

  /* Posición del formulario que corresponde a un cargo del tareo (null = no se reconoce). */
  function posicionDeCargo(cargo){
    const t=norm(cargo);
    if(/sopla/.test(t))return 'Sopladora';
    if(/envasad/.test(t))return 'Envasadora';
    if(/etiquet/.test(t))return 'Etiquetadora';
    if(/empaquet/.test(t))return 'Empaquetadora';
    if(/paletiz/.test(t))return 'Paletizado';
    if(/pantall/.test(t))return 'Pantallista';
    return null;
  }

  /* Presentes del bloque del turno según los tareos de Producción.
     tareos: lista de tareos {fecha, turno, area, personal:[{trabajadorId, nombre, cargo, asistencia}]}; workers: trabajadores (para completar cargo y línea fija).
     Devuelve null si no hay tareo de Producción de ese día y bloque (no se puede saber: no es «nadie vino»). */
  function presentes(tareos,fecha,turno,workers,areaDe){
    const turnos=esNoche(turno)?['NOCHE']:['DÍA','DIA','INTERMEDIO'];
    const esProd=t=>typeof areaDe==='function'?areaDe(t)==='Producción':String(t.area||'').toLowerCase()!=='mantenimiento';
    const ts=(Array.isArray(tareos)?tareos:[]).filter(t=>t&&t.fecha===fecha&&turnos.includes(String(t.turno||'').toUpperCase())&&esProd(t));
    if(!ts.length)return null;
    const porId=new Map();(Array.isArray(workers)?workers:[]).forEach(w=>{if(w){porId.set(String(w.id||w.trabajadorId||''),w);porId.set('n:'+norm(w.nombre),w);}});
    const vistos=new Map();
    ts.forEach(t=>(t.personal||[]).forEach(p=>{
      if(!p||!ASISTENCIA_TRABAJA.has(String(p.asistencia||'').toUpperCase()))return;
      const nombre=String(p.nombre||'').trim();if(!nombre)return;
      const k=String(p.trabajadorId||'').trim()||'n:'+norm(nombre);
      if(vistos.has(k))return;
      const w=porId.get(String(p.trabajadorId||''))||porId.get('n:'+norm(nombre))||null;
      const cargo=String(p.cargo||(w&&w.cargo)||'').trim();
      vistos.set(k,{id:k,nombre,cargo,linea:String((w&&w.linea)||''),posicion:String((w&&w.puestoMaquina)||'').trim()||posicionDeCargo(cargo)});   // el puesto fijado al trabajador manda; si no, se deduce del cargo
    }));
    return [...vistos.values()].sort((a,b)=>(a.posicion?0:1)-(b.posicion?0:1)||a.nombre.localeCompare(b.nombre,'es'));
  }

  /* Qué escribir en las filas vacías: [{i, nombre, cargo}]. No toca filas con nombre ni repite a una persona ya puesta. */
  function proponer(lista,filas,linea){
    const filasOk=Array.isArray(filas)?filas:[];
    const usados=new Set(filasOk.map(f=>norm(f&&f.nombre)).filter(Boolean));
    const res=[];
    filasOk.forEach((f,i)=>{
      if(!f||String(f.nombre||'').trim())return;
      const p=(lista||[]).find(x=>x.posicion&&norm(x.posicion)===norm(f.posicion)&&!usados.has(norm(x.nombre))&&(!x.linea||x.linea===linea));
      if(!p)return;
      usados.add(norm(p.nombre));res.push({i,nombre:p.nombre,cargo:p.cargo});
    });
    return res;
  }

  /* Presentes que todavía no están en ninguna fila (para ofrecerlos como botones). */
  function sinUbicar(lista,filas,linea){
    const usados=new Set((Array.isArray(filas)?filas:[]).map(f=>norm(f&&f.nombre)).filter(Boolean));
    return (lista||[]).filter(p=>!usados.has(norm(p.nombre))&&(!p.linea||p.linea===linea));
  }

  const API={norm,posicionDeCargo,presentes,proponer,sinUbicar};
  raiz.GlacialPersonalTareo=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;

  /* ---------- pantalla (solo en el navegador) ---------- */
  if(typeof document==='undefined'||typeof window==='undefined')return;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actual=()=>{
    if(typeof draft==='undefined'||!draft)return null;
    const lista=presentes(typeof loadTareos==='function'?loadTareos():[],draft.fecha,draft.turno,typeof loadWorkers==='function'?loadWorkers():[],typeof tareoAreaDe==='function'?tareoAreaDe:null);
    return lista;
  };
  /* Pieza que se pone arriba de la tabla de personal (personalTable de 06-registro.js). */
  raiz.personalTareoHtml=function(linea){
    const lista=actual();
    const caja=h=>'<div class="personal-tareo" style="margin:0 0 10px;padding:9px 12px;border:1px solid #cfe3d8;border-left:4px solid #1a7f4b;border-radius:6px;background:#f2faf5;color:#2f4a3a;font-size:12px">'+h+'</div>';
    if(lista===null)return caja('<b>Tareo de Producción:</b> todavía no hay tareo de este día y turno. Escribe los nombres a mano; cuando el tareo esté lleno podrás completarlos desde aquí.');
    const filas=(typeof draft!=='undefined'&&draft&&draft.personal)||[];
    const prop=proponer(lista,filas,linea),resto=sinUbicar(lista,filas,linea);
    const sinPos=resto.filter(p=>!prop.some(x=>norm(x.nombre)===norm(p.nombre)));
    return caja('<b>Tareo de Producción:</b> '+lista.length+' persona(s) con asistencia en este turno.'+
      (prop.length?' <button type="button" class="btn btn-primary btn-sm" style="margin-left:6px" onclick="personalTareoCompletar()">Completar '+prop.length+' posición(es) con el tareo</button>':'')+
      (sinPos.length?'<div style="margin-top:6px">Toca un nombre para ponerlo en la primera fila vacía:</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">'+
        sinPos.map(p=>'<button type="button" class="btn btn-ghost btn-sm" onclick="personalTareoPoner(\''+esc(String(p.id).replace(/\\/g,'\\\\').replace(/'/g,"\\'"))+'\')" title="'+esc(p.cargo)+'">'+esc(p.nombre)+'</button>').join('')+'</div>':'')+
      (!prop.length&&!sinPos.length?' Todos ya están en la tabla.':''));
  };
  raiz.personalTareoCompletar=function(){
    const lista=actual();if(!lista||typeof draft==='undefined')return;
    proponer(lista,draft.personal,draft.linea).forEach(x=>{draft.personal[x.i].nombre=x.nombre;draft.personal[x.i].cargo=x.cargo;});
    if(typeof renderFormTab==='function')renderFormTab();
  };
  raiz.personalTareoPoner=function(id){
    const lista=actual();if(!lista||typeof draft==='undefined')return;
    const p=lista.find(x=>String(x.id)===String(id));if(!p)return;
    const i=(draft.personal||[]).findIndex(f=>f&&!String(f.nombre||'').trim());
    if(i<0){if(typeof mostrarAviso==='function')mostrarAviso('No hay filas vacías en el personal del turno.');return;}
    draft.personal[i].nombre=p.nombre;draft.personal[i].cargo=p.cargo;
    if(typeof renderFormTab==='function')renderFormTab();
  };
})(typeof window!=='undefined'?window:globalThis);
