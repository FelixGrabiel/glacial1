/* =============================================================
   GLACIAL · ROTACIÓN SEMANAL DE MAQUINISTAS
   -------------------------------------------------------------
   - Pestaña "Rotación maquinista" del Tareo (junto a "Rotación semanal").
   - Grilla semanal: una fila por maquinista y una columna por día
     (lunes a domingo). Cada celda: DÍA, NOCHE o DESCANSO (tocar para cambiar).
   - Cada maquinista tiene su línea (PET1, PET2, B7L, C20L, B20L).
   - Botones: Agregar maquinista · Copiar semana anterior · Importar Excel.
   - SOLO el Supervisor de Mantenimiento y el Administrador la editan;
     el resto la ve en modo lectura.
   - Se guarda en Firebase en un nodo NUEVO: sync/rotacionMaquinistas
     (independiente de la rotación semanal de Mantenimiento/Producción).
   - El Tareo de Producción la consulta con rotacionMaquinistasDia().

   Cargar DESPUÉS de 13-tareo.js, 28 y 30; antes de 12-init.js.
   ============================================================= */
(function instalarRotacionMaquinistas(){
  'use strict';

  const DIAS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const LINEAS_MAQ=['PET1','PET2','B7L','C20L','B20L'];
  const VALORES=['DÍA','NOCHE','DESCANSO'];

  let semana='';              // lunes ISO de la semana mostrada
  let borrador=[];            // personal de la semana mostrada (aún sin guardar)
  let sucio=false;

  const norm=t=>tareoNormalizarTexto(t);
  const esc=t=>escaparHTML(t);

  /* ---------- fechas ---------- */
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const aFecha=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,(m||1)-1,d||1);};
  function lunesDe(fechaISO){
    const f=aFecha(fechaISO);
    const dif=f.getDay()===0?-6:1-f.getDay();
    f.setDate(f.getDate()+dif);
    return iso(f);
  }
  const sumarDias=(fechaISO,n)=>{const f=aFecha(fechaISO);f.setDate(f.getDate()+n);return iso(f);};
  const indiceDia=fechaISO=>{const d=aFecha(fechaISO).getDay();return d===0?6:d-1;};

  /* ---------- permisos ---------- */
  function puedeGestionarRotacionMaquinistas(){
    if(typeof state==='undefined'||!state.user)return false;
    if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(state.user))return false;
    // Administrador
    if(String(state.user.rol||'').trim()==='Administrador')return true;
    if(normalizarPermisosUsuario(state.user)==='todos')return true;
    // Supervisor / Jefe de Mantenimiento
    return typeof puedeGestionarRotacionMtto==='function'&&puedeGestionarRotacionMtto();
  }
  window.puedeGestionarRotacionMaquinistas=puedeGestionarRotacionMaquinistas;

  /* ---------- datos ---------- */
  const todas=()=>typeof loadRotacionMaquinistas==='function'?(loadRotacionMaquinistas()||[]):[];
  const guardadaDe=lunes=>todas().find(r=>r&&r.fechaInicio===lunes)||null;

  function cargarBorrador(){
    const g=guardadaDe(semana);
    borrador=g&&Array.isArray(g.personal)?JSON.parse(JSON.stringify(g.personal)):[];
    sucio=false;
  }

  function maquinistasActivos(){
    const lista=typeof loadWorkers==='function'?(loadWorkers()||[]):[];
    return lista.filter(w=>w&&norm(w.estado)==='activo'&&
      typeof tareoEsMaquinistaEquipo==='function'&&tareoEsMaquinistaEquipo(w.cargo));
  }

  /* =========================================================
     CONSULTA PARA EL TAREO DE PRODUCCIÓN
     Devuelve quiénes tocan (o descansan) ese día y turno.
     ========================================================= */
  function rotacionMaquinistasDia(fecha,turno){
    const g=guardadaDe(lunesDe(fecha));
    const res={tieneRotacion:!!g,trabajan:[],descansan:[]};
    if(!g)return res;
    const i=indiceDia(fecha);
    const turnoNorm=norm(turno).includes('noche')?'NOCHE':'DÍA';
    (g.personal||[]).forEach(p=>{
      const v=(p.dias||[])[i]||'DESCANSO';
      if(v==='DESCANSO')res.descansan.push(p);
      else if(v===turnoNorm)res.trabajan.push(p);
    });
    return res;
  }
  window.rotacionMaquinistasDia=rotacionMaquinistasDia;

  /* ¿Existe rotación de maquinistas para la semana de esa fecha? */
  window.rotacionMaquinistasVigente=fecha=>!!guardadaDe(lunesDe(fecha));

  window.onRotacionMaquinistasUpdated=function(){
    try{
      if(document.getElementById('rotmaq-view')&&!sucio){cargarBorrador();renderRotacionMaquinistas();}
      else if(document.getElementById('tareo-form-view')&&typeof tareoRefrescarFormularioRemoto==='function')
        tareoRefrescarFormularioRemoto();
    }catch(_){/* se actualizará en el siguiente cambio */}
  };

  /* =========================================================
     INTERACCIÓN
     ========================================================= */
  function alternarCelda(i,d){
    if(!puedeGestionarRotacionMaquinistas())return;
    const p=borrador[i];if(!p)return;
    p.dias=Array.isArray(p.dias)&&p.dias.length===7?p.dias:Array(7).fill('DÍA');
    p.dias[d]=VALORES[(VALORES.indexOf(p.dias[d])+1)%VALORES.length];
    sucio=true;
    renderRotacionMaquinistas();
  }
  function cambiarLinea(i,v){
    if(!puedeGestionarRotacionMaquinistas())return;
    if(borrador[i]){borrador[i].linea=v;sucio=true;}
  }
  function quitar(i){
    if(!puedeGestionarRotacionMaquinistas())return;
    if(!confirm('¿Quitar a este maquinista de la rotación de la semana?'))return;
    borrador.splice(i,1);sucio=true;renderRotacionMaquinistas();
  }
  function moverSemana(n){
    if(sucio&&!confirm('Hay cambios sin guardar. ¿Cambiar de semana y descartarlos?'))return;
    semana=sumarDias(semana,n*7);cargarBorrador();renderRotacionMaquinistas();
  }
  function irSemanaActual(){
    if(sucio&&!confirm('Hay cambios sin guardar. ¿Descartarlos?'))return;
    semana=lunesDe(iso(new Date()));cargarBorrador();renderRotacionMaquinistas();
  }

  function abrirAgregar(){
    if(!puedeGestionarRotacionMaquinistas())return;
    const root=document.getElementById('modal-root');if(!root)return;
    const yaEstan=new Set(borrador.flatMap(tareoIdentidades));
    const candidatos=maquinistasActivos().filter(w=>!tareoIdentidades(w).some(c=>yaEstan.has(c)))
      .sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es',{sensitivity:'base'}));
    root.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal">
      <div class="modal-head"><h3>Agregar maquinista</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">${candidatos.length?`
        <div class="field-sm"><label>Maquinista</label><select id="rotmaq-nuevo">${candidatos.map(w=>`<option value="${esc(w.id)}">${esc(w.nombre)}${w.dni?' — '+esc(w.dni):''}</option>`).join('')}</select></div>
        <div class="field-sm"><label>Línea</label><select id="rotmaq-nueva-linea">${LINEAS_MAQ.map(l=>`<option>${l}</option>`).join('')}</select></div>
        <div class="actions-row"><button class="btn btn-primary" onclick="rotMaqConfirmarAgregar()">Agregar</button></div>`
        :'<p class="small-muted" style="margin:0">No hay más maquinistas activos para agregar (registra maquinistas en Gestionar trabajadores).</p>'}
      </div></div></div>`;
  }
  function confirmarAgregar(){
    const id=document.getElementById('rotmaq-nuevo')?.value;
    const linea=document.getElementById('rotmaq-nueva-linea')?.value||LINEAS_MAQ[0];
    const w=maquinistasActivos().find(x=>String(x.id)===String(id));
    if(!w)return;
    borrador.push({trabajadorId:String(w.id),nombre:w.nombre||'',dni:w.dni||'',linea,dias:Array(7).fill('DÍA')});
    sucio=true;closeModal();renderRotacionMaquinistas();
  }

  function copiarSemanaAnterior(){
    if(!puedeGestionarRotacionMaquinistas())return;
    const previa=guardadaDe(sumarDias(semana,-7));
    if(!previa||!(previa.personal||[]).length){alert('No existe una rotación guardada en la semana anterior.');return;}
    if(borrador.length&&!confirm('Esto reemplazará lo que hay en pantalla con la semana anterior. ¿Continuar?'))return;
    borrador=JSON.parse(JSON.stringify(previa.personal));
    sucio=true;renderRotacionMaquinistas();
  }

  function guardar(){
    if(!puedeGestionarRotacionMaquinistas()){alert('Solo el Supervisor de Mantenimiento o el Administrador puede guardar la rotación de maquinistas.');return;}
    if(!borrador.length){alert('Agrega al menos un maquinista.');return;}
    const sinLinea=borrador.find(p=>!p.linea);
    if(sinLinea){alert('Asigna la línea de '+sinLinea.nombre+'.');return;}
    const lista=[...todas()];
    const registro={
      id:'ROT-MAQ-'+semana,area:'Mantenimiento',fechaInicio:semana,fechaFin:sumarDias(semana,6),
      personal:borrador,actualizadoEn:Date.now(),
      actualizadoPor:state.user?.nombre||state.user?.username||''
    };
    const i=lista.findIndex(r=>r&&r.fechaInicio===semana);
    if(i>=0)lista[i]={...lista[i],...registro};else lista.push(registro);
    saveRotacionMaquinistas(lista);
    sucio=false;
    alert('Rotación de maquinistas guardada correctamente.');
    renderRotacionMaquinistas();
  }

  /* ---------- importar Excel ---------- */
  function abrirImportacion(){
    if(!puedeGestionarRotacionMaquinistas())return;
    if(typeof XLSX==='undefined'){alert('No se encontró SheetJS/XLSX.');return;}
    document.getElementById('rotmaq-excel')?.click();
  }
  function valorCelda(v){
    const t=norm(v);
    if(!t)return '';
    if(t==='dia'||t==='d')return 'DÍA';
    if(t==='noche'||t==='n')return 'NOCHE';
    if(['descanso','desc','x','-','libre','off'].includes(t))return 'DESCANSO';
    return '';
  }
  async function importarExcel(input){
    const archivo=input?.files?.[0];if(!archivo)return;
    try{
      const libro=XLSX.read(await archivo.arrayBuffer(),{type:'array'});
      const filas=XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]],{defval:'',raw:true});
      if(!filas.length)throw new Error('La primera hoja está vacía.');
      const col=(fila,nombres)=>{
        const e=Object.entries(fila);
        for(const n of nombres){const h=e.find(([k])=>norm(k)===norm(n));if(h)return h[1];}
        return '';
      };
      const activos=maquinistasActivos();
      const nuevos=[],omitidos=[];
      filas.forEach((f,n)=>{
        const dni=tareoNormalizarDNI(col(f,['DNI','Documento']));
        const nombre=String(col(f,['Maquinista','Nombre','Trabajador'])).trim();
        if(!dni&&!nombre)return;
        const linea=String(col(f,['Línea','Linea'])).trim().toUpperCase();
        const dias=DIAS.map(d=>valorCelda(col(f,[d,d.slice(0,3)])));
        if(!LINEAS_MAQ.includes(linea)||dias.some(v=>!v)){omitidos.push(`Fila ${n+2}: ${nombre||dni} (línea o días inválidos)`);return;}
        const w=activos.find(x=>(dni&&tareoNormalizarDNI(x.dni)===dni)||(nombre&&norm(x.nombre)===norm(nombre)));
        nuevos.push({trabajadorId:String(w?.id??dni??nombre),nombre:w?.nombre||nombre,dni:w?.dni||dni,linea,dias});
      });
      if(!nuevos.length){alert('No se importó ningún maquinista.\n\n'+omitidos.join('\n'));return;}
      borrador=nuevos;sucio=true;renderRotacionMaquinistas();
      alert(`Excel cargado: ${nuevos.length} maquinista(s).`+(omitidos.length?`\nOmitidos: ${omitidos.length}\n`+omitidos.join('\n'):'')+
        '\n\nRevisa la grilla y pulsa "Guardar rotación".');
    }catch(err){
      console.error('Rotación maquinistas · Excel:',err);
      alert('No se pudo leer el Excel: '+(err?.message||err));
    }finally{if(input)input.value='';}
  }

  /* =========================================================
     PANTALLA
     ========================================================= */
  function estilos(){
    if(document.getElementById('rotmaq-css'))return;
    const s=document.createElement('style');s.id='rotmaq-css';
    s.textContent=`
      .rotmaq-grid td,.rotmaq-grid th{text-align:center}
      .rotmaq-grid td:first-child,.rotmaq-grid th:first-child{text-align:left}
      .rotmaq-cel{min-width:84px;padding:6px 8px;border-radius:7px;border:1px solid transparent;font-weight:700;font-size:12px;cursor:pointer;background:#eef3f7;color:#5a7083}
      .rotmaq-cel.dia{background:#e3f1fb;color:#005b96;border-color:#bcdcf3}
      .rotmaq-cel.noche{background:#1d3550;color:#fff}
      .rotmaq-cel.descanso{background:#eceff2;color:#7a8b98}
      .rotmaq-cel[disabled]{cursor:default;opacity:1}
      .rotmaq-hoy{outline:2px solid #f5b335}
    `;
    document.head.appendChild(s);
  }

  function renderRotacionMaquinistas(){
    const main=document.getElementById('main');if(!main)return;
    estilos();
    if(!puedeGestionarRotacionMaquinistas()){
      main.innerHTML='<div class="empty-state"><h4>Acceso restringido</h4><p>La Rotación de maquinistas solo la ve el Supervisor de Mantenimiento, el Administrador o quien tenga el permiso asignado.</p></div>';
      return;
    }
    if(!semana){semana=lunesDe(iso(new Date()));cargarBorrador();}
    const puede=puedeGestionarRotacionMaquinistas();
    const guardada=guardadaDe(semana);
    const hoy=iso(new Date());
    const fechas=DIAS.map((_,i)=>sumarDias(semana,i));
    main.innerHTML=`
      <div class="main-head" id="rotmaq-view">
        <div><h2>Rotación de maquinistas</h2>
          <div class="sub">Turno por día y línea asignada de cada maquinista${puede?'':' · <strong>Modo lectura</strong>'}</div></div>
        <button class="btn btn-ghost" onclick="${tareoAreasEditables().length?'renderTareoPrincipal()':'renderTareoGeneral()'}">← Volver</button>
      </div>
      ${typeof tareoRenderTabs==='function'?tareoRenderTabs('rotacionMaq'):''}
      <div class="panel">
        <div class="panel-head">
          <div><h3>Semana ${formatearFecha(semana)} — ${formatearFecha(fechas[6])}</h3>
            <span class="small-muted">${guardada?'Rotación guardada':'Rotación pendiente de guardar'}${sucio?' · <strong>cambios sin guardar</strong>':''}</span></div>
          <div class="actions-row" style="margin:0;">
            <button class="btn btn-ghost btn-sm" onclick="rotMaqMoverSemana(-1)">← Semana anterior</button>
            <button class="btn btn-ghost btn-sm" onclick="rotMaqSemanaActual()">Semana actual</button>
            <button class="btn btn-ghost btn-sm" onclick="rotMaqMoverSemana(1)">Semana siguiente →</button>
          </div>
        </div>
        <div class="panel-body">
          ${puede?`<div class="actions-row" style="justify-content:flex-end;margin:0 0 14px;gap:8px;flex-wrap:wrap;">
            <input id="rotmaq-excel" type="file" accept=".xlsx,.xls" style="display:none" onchange="rotMaqImportarExcel(this)">
            <button class="btn btn-ghost btn-sm" onclick="rotMaqAbrirAgregar()">+ Agregar maquinista</button>
            <button class="btn btn-ghost btn-sm" onclick="rotMaqCopiarAnterior()">Copiar semana anterior</button>
            <button class="btn btn-ghost btn-sm" onclick="rotMaqAbrirImportacion()">📥 Importar rotación Excel</button>
          </div>
          <div class="small-muted" style="margin-bottom:12px;">Toca una celda para cambiar entre DÍA, NOCHE y DESCANSO. Excel: DNI | Maquinista | Línea | Lunes … Domingo.</div>`:''}
          ${borrador.length?`<div class="tareo-table-scroll"><table class="tareo-table rotmaq-grid">
            <thead><tr><th>Maquinista</th><th>Línea</th>${DIAS.map((d,i)=>`<th class="${fechas[i]===hoy?'rotmaq-hoy':''}">${d}<br><small>${fechas[i].slice(8)}/${fechas[i].slice(5,7)}</small></th>`).join('')}${puede?'<th></th>':''}</tr></thead>
            <tbody>${borrador.map((p,i)=>`<tr>
              <td><strong>${esc(p.nombre)}</strong><div class="small-muted">${p.dni?'DNI '+esc(p.dni):''}</div></td>
              <td>${puede?`<select onchange="rotMaqCambiarLinea(${i},this.value)">${LINEAS_MAQ.map(l=>`<option ${p.linea===l?'selected':''}>${l}</option>`).join('')}</select>`:esc(p.linea||'—')}</td>
              ${DIAS.map((_,d)=>{const v=(p.dias||[])[d]||'DÍA';return `<td><button type="button" class="rotmaq-cel ${v==='DÍA'?'dia':v==='NOCHE'?'noche':'descanso'}" ${puede?`onclick="rotMaqAlternar(${i},${d})"`:'disabled'}>${v}</button></td>`;}).join('')}
              ${puede?`<td><button class="btn btn-sm btn-ghost" onclick="rotMaqQuitar(${i})">✕</button></td>`:''}
            </tr>`).join('')}</tbody></table></div>
            ${puede?`<div class="actions-row" style="justify-content:flex-end;margin-top:16px;"><button class="btn btn-primary" onclick="rotMaqGuardar()">💾 Guardar rotación</button></div>`:''}`
          :`<div class="empty-state"><h4>${guardada?'Sin maquinistas':'Sin rotación de maquinistas'}</h4><p>${puede?'Agrega maquinistas, copia la semana anterior o importa un Excel.':'Aún no se cargó la rotación de esta semana.'}</p></div>`}
        </div>
      </div>`;
  }

  window.renderRotacionMaquinistas=renderRotacionMaquinistas;
  window.rotMaqAlternar=alternarCelda;window.rotMaqCambiarLinea=cambiarLinea;window.rotMaqQuitar=quitar;
  window.rotMaqMoverSemana=moverSemana;window.rotMaqSemanaActual=irSemanaActual;
  window.rotMaqAbrirAgregar=abrirAgregar;window.rotMaqConfirmarAgregar=confirmarAgregar;
  window.rotMaqCopiarAnterior=copiarSemanaAnterior;window.rotMaqGuardar=guardar;
  window.rotMaqAbrirImportacion=abrirImportacion;window.rotMaqImportarExcel=importarExcel;

  /* Pestaña "Rotación maquinista" junto a "Rotación semanal". */
  if(typeof tareoRenderTabs==='function'){
    const anterior=tareoRenderTabs;
    tareoRenderTabs=function(activa){
      const html=anterior(activa);
      // Solo quien gestiona la rotación (Supervisor de Mantenimiento, Administrador o con permiso).
      if(!puedeGestionarRotacionMaquinistas())return html;
      const boton=`<button class="tareo-tab ${activa==='rotacionMaq'?'active':''}" onclick="if(confirmarAbandonoRotacionPendiente())renderRotacionMaquinistas()">Rotación maquinista</button>`;
      return html.replace('</div>',boton+'</div>');
    };
    window.tareoRenderTabs=tareoRenderTabs;
  }
})();
