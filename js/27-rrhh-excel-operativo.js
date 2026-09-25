/* GLACIAL · Excel de tareo con personal operativo y responsables.
   Cargar después de 13-tareo.js, 20-tareo-control.js y 26-rrhh-panel.js;
   antes de 12-init.js. No cambia los registros ni el resumen mensual. */
(function instalarExcelOperativoRRHH(){
  'use strict';

  const COLUMNAS=[
    'Fecha','Turno','Área','DNI','Nombre','Cargo','Asistencia','Ingreso','Salida',
    'Horas trabajadas','Horas extra','Tardanza (min)','Refrigerio (h)'
  ];
  const RESPONSABLES=[
    'Fecha','Turno','Área','Supervisor(es) que registraron','Tareo creado por',
    'Personas sin cargo verificado'
  ];

  function personalRegistrado(){
    const trabajadores=typeof loadWorkers==='function' ? loadWorkers() : [];
    return Array.isArray(trabajadores) ? trabajadores : [];
  }
  function fichaTrabajador(persona,trabajadores){
    const id=String(persona?.trabajadorId ?? persona?.id ?? '').trim();
    if(id){
      const porId=trabajadores.find(w=>String(w.id??'').trim()===id);
      if(porId)return porId;
    }
    const dni=String(persona?.dni??'').replace(/\D/g,'');
    if(dni){
      const porDni=trabajadores.find(w=>String(w.dni??'').replace(/\D/g,'')===dni);
      if(porDni)return porDni;
    }
    const nombre=tareoNormalizarTexto(persona?.nombre);
    const coincidencias=trabajadores.filter(w=>tareoNormalizarTexto(w.nombre)===nombre);
    return nombre && coincidencias.length===1 ? coincidencias[0] : null;
  }
  function clasificarPersona(persona,trabajadores,usuarios){
    const ficha=fichaTrabajador(persona,trabajadores);
    // El padrón de trabajadores tiene el cargo vigente; el tareo conserva
    // el cargo capturado en su fecha para quien ya no figura en el padrón.
    const cargo=tareoNormalizarTexto(ficha?.cargo || persona?.cargo);
    // Una cuenta de supervisor puede no tener cargo en tareos antiguos.
    const nombre=tareoNormalizarTexto(persona?.nombre);
    const cuentaSupervisor=[...usuarios.values()].some(u=>
      esSupervisor(u) && nombre && tareoNormalizarTexto(u.nombre)===nombre);
    const directivo=/supervis|jefe|gerent|coordinad|asistent|rrhh|administr/.test(cargo);
    const cargoOperativo=/operari[oa]|maquinista|operador[ae]?|tecnic|mecanic|electricista/.test(cargo) ||
      (typeof tareoEsMaquinistaEquipo==='function' && tareoEsMaquinistaEquipo(cargo));
    // Un tareo también puede contener cargos antiguos o sin completar.
    // Incluye al personal no directivo del propio tareo y lo marca para revisión.
    return {incluido:!directivo && !cuentaSupervisor,cargoVerificado:cargoOperativo,ficha};
  }
  function numero(valor){
    const n=Number(valor);
    return Number.isFinite(n) ? Math.round(n*100)/100 : 0;
  }
  function usuariosPorNombre(){
    return new Map((typeof loadUsers==='function' ? loadUsers() : [])
      .filter(Boolean).map(u=>[String(u.username||'').trim().toLowerCase(),u]));
  }
  function resolverUsuario(usuarios,username){
    const nombre=String(username||'').trim();
    return usuarios.get(nombre.toLowerCase()) || null;
  }
  function etiquetaUsuario(usuarios,username){
    const nombre=String(username||'').trim();
    const usuario=resolverUsuario(usuarios,nombre);
    return String(usuario?.nombre || nombre || 'No identificado');
  }
  function esSupervisor(usuario){
    return usuario && (tareoNormalizarTexto(usuario.rol)==='supervisor' ||
      tareoNormalizarTexto(usuario.puesto).includes('supervisor'));
  }
  function nombresSupervisores(tareo,usuarios){
    const identificados=new Map();
    const candidatos=[tareo.creadoPor,...(tareo.personal||[]).map(p=>p.registradoPor)];
    candidatos.forEach(username=>{
      const usuario=resolverUsuario(usuarios,username);
      if(esSupervisor(usuario))identificados.set(
        String(usuario.username||'').trim().toLowerCase(),
        usuario.nombre || usuario.username
      );
    });
    return [...identificados.values()].join(', ') || 'No identificado';
  }
  function filaOperativo(tareo,p,ficha){
    const dni=String(ficha?.dni ?? '').trim() || String(p.dni ?? '').trim();
    return [
      String(tareo.fecha||''),String(tareo.turno||''),tareoAreaDe(tareo),
      dni,String(p.nombre||ficha?.nombre||''),
      String(ficha?.cargo||p.cargo||''),tareoEtiquetaEstado(p.asistencia),
      String(p.horaIngreso||''),String(p.horaSalida||''),
      numero(p.horasTrabajadas),numero(p.horasExtras),
      numero(p.tardanzaMinutos),numero(p.refrigerio)
    ];
  }
  function filaResponsable(tareo,usuarios,filas){
    return [
      String(tareo.fecha||''),String(tareo.turno||''),tareoAreaDe(tareo),
      nombresSupervisores(tareo,usuarios),
      etiquetaUsuario(usuarios,tareo.creadoPor),
      filas.filter(f=>f.tareo===tareo && !f.cargoVerificado).length
    ];
  }
  function crearHoja(filas,encabezados,anchos){
    const hoja=XLSX.utils.aoa_to_sheet([encabezados,...filas]);
    aplicarEstiloExcelTareo(hoja,encabezados);
    hoja['!cols']=anchos.map(wch=>({wch}));
    hoja['!autofilter']={ref:hoja['!ref']};
    hoja['!freeze']={xSplit:0,ySplit:1};
    return hoja;
  }
  function exportar(tareos,filas,nombreArchivo){
    if(typeof XLSX==='undefined'){
      alert('SheetJS no está disponible.');return;
    }
    if(!filas.length){
      alert('No hay personal operativo registrado en estos tareos.');
      return;
    }
    const usuarios=usuariosPorNombre();
    const hojaPersonal=crearHoja(filas.map(({tareo,persona,ficha})=>filaOperativo(tareo,persona,ficha)),
      COLUMNAS,[13,11,17,16,32,25,22,13,13,21,16,17,18]);
    // El DNI es identificador, no número: conserva ceros iniciales.
    for(let i=2;i<=filas.length+1;i++){
      const celda=hojaPersonal['D'+i];
      if(celda){celda.t='s';celda.v=String(celda.v??'');celda.z='@';}
    }
    const hojaResponsables=crearHoja(
      tareos.map(tareo=>filaResponsable(tareo,usuarios,filas)),
      RESPONSABLES,[13,11,17,42,32,29]);
    const libro=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro,hojaPersonal,'Personal operativo');
    XLSX.utils.book_append_sheet(libro,hojaResponsables,'Responsables');
    XLSX.writeFile(libro,nombreArchivo);
  }

  function exportarTareoExcelOperativo(id){
    const tareo=obtenerTareos().find(t=>t.id===id);
    if(!tareo){alert('No se encontró el tareo.');return;}
    if(!tareoAreasVisibles().includes(tareoAreaDe(tareo))){
      alert('No tienes acceso a este tareo.');return;
    }
    const trabajadores=personalRegistrado(),usuarios=usuariosPorNombre();
    const filas=ordenarPersonalTareo(tareo.personal||[])
      .map(persona=>({tareo,persona,...clasificarPersona(persona,trabajadores,usuarios)}))
      .filter(f=>f.incluido);
    const area=tareoNormalizarTexto(tareoAreaDe(tareo)).replace(/[^a-z0-9]/g,'_');
    const turno=tareoNormalizarTexto(tareo.turno).replace(/[^a-z0-9]/g,'_');
    exportar([tareo],filas,`Tareo_Operativo_${area}_${tareo.fecha}_${turno}.xlsx`);
  }
  function exportarTareoGeneralExcelOperativo(){
    if(!tareoAccesoUsuario().general){
      alert('No tienes permiso para exportar el Tareo General.');return;
    }
    const {filas}=tareoGeneralDatos();
    const trabajadores=personalRegistrado(),usuarios=usuariosPorNombre();
    const operativos=filas.map(({tareo,persona})=>({
      tareo,persona,...clasificarPersona(persona,trabajadores,usuarios)
    })).filter(f=>f.incluido);
    const tareos=[...new Set(operativos.map(({tareo})=>tareo))];
    const fecha=String(tareoGeneralFiltros.fecha||'sin_fecha')
      .replace(/[^0-9-]/g,'');
    exportar(tareos,operativos,`Tareo_General_Operativo_${fecha}.xlsx`);
  }
  exportarTareoExcel=exportarTareoExcelOperativo;
  exportarTareoGeneralExcel=exportarTareoGeneralExcelOperativo;
  window.exportarTareoExcel=exportarTareoExcelOperativo;
  window.exportarTareoGeneralExcel=exportarTareoGeneralExcelOperativo;
})();
