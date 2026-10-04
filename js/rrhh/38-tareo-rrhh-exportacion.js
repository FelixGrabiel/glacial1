/* =============================================================
   GLACIAL · TAREO — LISTA ÚNICA, GRUPOS DE RRHH, EXCEL E IMAGEN
   -------------------------------------------------------------
   0) UNA SOLA FUENTE: tareoListaUnica() arma la lista del tareo y la usan
      el Excel (por tareo, General y panel RRHH) y la imagen de WhatsApp.
      Antes la imagen tomaba tareo.personal completo (53) y el Excel
      (27-rrhh-excel-operativo.js) descartaba supervisores/asistentes (49).
   1) GRUPOS: cada persona cae en UN solo grupo según su cargo
      (tareoGrupoRRHH, definido aquí y en ningún otro lugar).
   2) ORDEN: Supervisores · Maquinistas · Técnicos · Operarios (con líderes)
      · Sin clasificar · PERSONAL X DÍA; alfabético dentro de cada bloque.
   3) PANEL "Exportar RRHH": grupo + turno + período (día/semana/mes/rango).
   4) EXCEL con ExcelJS (colores, filtros, encabezado fijo, impresión).
   5) IMAGEN vertical 1080 px para WhatsApp, varias páginas si hace falta.

   No modifica datos ni estructura de Firestore: solo LEE tareos,
   trabajadores y usuarios. NO crea documentos nuevos.
   Cargar DESPUÉS de 27-rrhh-excel-operativo.js y 34-integraciones.js;
   ANTES de 12-init.js. Requiere ExcelJS (index.html).
   ============================================================= */
(function instalarExportacionRRHH(){
  'use strict';

  /* ---------------------------------------------------------
     1) GRUPOS (regla única)
     --------------------------------------------------------- */
  const GRUPOS={
    SUP:{clave:'SUP',orden:1,etiqueta:'Producción / supervisores',bloque:'SUPERVISORES DE PRODUCCIÓN',hoja:'Supervisores'},
    MAQ:{clave:'MAQ',orden:2,etiqueta:'Mantenimiento / maquinistas',bloque:'MAQUINISTAS',hoja:'Maquinistas'},
    TEC:{clave:'TEC',orden:3,etiqueta:'Mantenimiento / técnicos',bloque:'TÉCNICOS DE MANTENIMIENTO',hoja:'Técnicos'},
    OPE:{clave:'OPE',orden:4,etiqueta:'Producción / operarios',bloque:'OPERARIOS Y LÍDERES DE PRODUCCIÓN',hoja:'Operarios'},
    SIN:{clave:'SIN',orden:5,etiqueta:'Sin clasificar',bloque:'SIN CLASIFICAR · REVISAR CARGO',hoja:'Sin clasificar'},
    DIA:{clave:'DIA',orden:6,etiqueta:'Personal por día',bloque:'PERSONAL X DÍA',hoja:'Personal x día'}
  };
  const ORDEN_GRUPOS=Object.values(GRUPOS).sort((a,b)=>a.orden-b.orden).map(g=>g.clave);

  /* Opciones del selector "Grupo" → grupos que incluye. */
  const OPCIONES_GRUPO=[
    {valor:'MAQ',texto:'Mantenimiento / maquinistas',incluye:['MAQ']},
    {valor:'TEC',texto:'Mantenimiento / técnicos',incluye:['TEC']},
    {valor:'OPE',texto:'Producción / operarios',incluye:['OPE','DIA']},
    {valor:'SUP',texto:'Producción / supervisores',incluye:['SUP']},
    {valor:'GENERAL',texto:'General',incluye:ORDEN_GRUPOS}
  ];
  const gruposDe=valor=>(OPCIONES_GRUPO.find(o=>o.valor===valor)||OPCIONES_GRUPO[4]).incluye;

  const norm=t=>typeof tareoNormalizarTexto==='function'
    ? tareoNormalizarTexto(t)
    : String(t||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

  /* Grupo según el texto del cargo. Un cargo vacío o desconocido → SIN. */
  function tareoGrupoRRHH(cargo){
    const c=norm(cargo);
    if(!c)return 'SIN';
    if(/maquinista/.test(c))return 'MAQ';
    if(/supervis|jefe|gerent|coordinad|asistent|rrhh|administr/.test(c)){
      // Solo los supervisores de Producción tienen grupo; el resto se revisa.
      return /supervis/.test(c)&&!/mantenimiento|mtto/.test(c)?'SUP':'SIN';
    }
    if(/tecnic/.test(c)||(typeof tareoEsTecnicoMantenimiento==='function'&&tareoEsTecnicoMantenimiento(cargo)))return 'TEC';
    if(/operari|operador|lider|ayudante|auxiliar/.test(c))return 'OPE';
    return 'SIN';
  }
  window.tareoGrupoRRHH=tareoGrupoRRHH;
  window.TAREO_GRUPOS_RRHH=GRUPOS;

  /* ---------------------------------------------------------
     0) LISTA ÚNICA
     --------------------------------------------------------- */
  const soloDigitos=v=>String(v==null?'':v).replace(/\D/g,'');
  const mismaPersona=(a,b)=>typeof tareoMismaPersonaFlexible==='function'
    ? tareoMismaPersonaFlexible(a,b)
    : (soloDigitos(a.dni)&&soloDigitos(a.dni)===soloDigitos(b.dni))||norm(a.nombre)===norm(b.nombre);

  function fichaDe(p,trabajadores){
    const id=String((p&&(p.trabajadorId??p.id))??'').trim();
    if(id){const x=trabajadores.find(w=>String(w.id??'').trim()===id);if(x)return x;}
    const dni=soloDigitos(p&&p.dni);
    if(dni){const x=trabajadores.find(w=>soloDigitos(w.dni)===dni);if(x)return x;}
    const nombre=norm(p&&p.nombre);
    const c=trabajadores.filter(w=>norm(w.nombre)===nombre);
    return nombre&&c.length===1?c[0]:null;
  }

  function nombreUsuario(usuarios,username){
    const u=String(username||'').trim();
    if(!u)return '';
    const f=usuarios.find(x=>String(x.username||'').toLowerCase()===u.toLowerCase());
    return (f&&f.nombre)||u;
  }

  function textoObservacion(p,porDia){
    const partes=[];
    if(p.salidaEditada){
      const ult=(p.edicionesSalida||[]).slice(-1)[0]||{};
      partes.push('salida editada por '+(ult.usuarioNombre||ult.usuario||'Mantenimiento')+': '+
        (p.salidaOriginal||ult.anterior||'—')+' -> '+(p.horaSalida||'—')+
        (ult.motivo?' ('+ult.motivo+')':''));
    }
    if(p.agregadoManual){
      partes.push((p.nuevoIngreso?'Personal nuevo':'Agregado manualmente')+(p.agregadoPor?' por '+p.agregadoPor:''));
    }
    const libre=porDia?p.observacion:(p.observacion||p.observaciones);
    if(libre)partes.push(String(libre));
    return partes.join(' · ');
  }

  const minutosDe=h=>{
    const m=/^(\d{1,2}):(\d{2})/.exec(String(h||''));
    return m?Number(m[1])*60+Number(m[2]):null;
  };

  function construirFila(tareo,p,porDia,ctx){
    const ficha=porDia?null:fichaDe(p,ctx.trabajadores);
    const cargoMaestro=ficha&&ficha.cargo?String(ficha.cargo):'';
    const cargo=porDia?'Personal por día':(cargoMaestro||String(p.cargo||''));
    let grupo='DIA';
    if(!porDia){
      grupo=tareoGrupoRRHH(cargoMaestro||p.cargo);
      if(grupo==='SIN'&&cargoMaestro)grupo=tareoGrupoRRHH(p.cargo);
      if(grupo==='SIN'&&p.origenMaquinista)grupo='MAQ';
    }
    const estado=porDia
      ? (p.horaIngreso?'Asistió':'')
      : tareoEstadoCanonico(p.asistencia);
    const atendio=estado==='Asistió';
    const saldoBruto=(atendio||porDia)?tareoSaldoHoras(p,tareo.jornadaNormal):null;
    const saldoMin=(saldoBruto===null||saldoBruto===undefined||Number.isNaN(saldoBruto))
      ? null : Math.round(saldoBruto*60);
    const horas=porDia?tareoHorasPorDia(p):Number(p.horasTrabajadas||0);
    return {
      fecha:tareo.fecha,
      turno:normalizarTurno(tareo.turno),
      area:tareoAreaDe(tareo),
      estadoTareo:typeof tareoEstadoBloqueo==='function'?tareoEstadoBloqueo(tareo):'Abierto',
      tareoId:tareo.id,
      grupo,
      tipo:porDia?'Por día':'Planilla',
      nombre:String((ficha&&ficha.nombre)||p.nombre||'').replace(/\s+/g,' ').trim(),
      dni:String((ficha&&ficha.dni)||p.dni||'').trim(),
      cargo,
      cargoVerificado:porDia?true:(!!cargoMaestro&&grupo!=='SIN'),
      linea:porDia?String(p.area||''):String(p.linea||(ficha&&ficha.linea)||''),
      estado,
      // Quien no asistió no muestra horas aunque el registro conserve datos viejos.
      ingreso:(atendio||porDia)?(p.horaIngreso||''):'',
      salidaRef:(atendio&&!porDia)?(p.salidaRefrigerio||''):'',
      retornoRef:(atendio&&!porDia)?(p.retornoRefrigerio||''):'',
      salida:(atendio||porDia)?(p.horaSalida||''):'',
      horas:(atendio||porDia)&&horas>0?horas:null,
      saldoMin,
      tardanza:Number(p.tardanzaMinutos||0),
      registradoPor:nombreUsuario(ctx.usuarios,p.registradoPor||tareo.creadoPor),
      observacion:textoObservacion(p,porDia),
      salidaEditada:!!p.salidaEditada,
      _persona:p
    };
  }

  /* opts: {fechas:[ISO], turnos:['Día','Noche'], grupos:[claves], areaPorDia:'Producción'|'Mantenimiento'|null}
     Devuelve {filas, porGrupo, registradores, tareos}. */
  function tareoListaUnica(opts){
    const fechas=opts.fechas||[];
    const turnos=(opts.turnos&&opts.turnos.length?opts.turnos:['Día','Noche']).map(normalizarTurno);
    const grupos=opts.grupos&&opts.grupos.length?opts.grupos:ORDEN_GRUPOS;
    const visibles=typeof tareoAreasVisibles==='function'?tareoAreasVisibles():['Producción','Mantenimiento'];
    const ctx={
      trabajadores:(typeof loadWorkers==='function'?loadWorkers():[])||[],
      usuarios:(typeof loadUsers==='function'?loadUsers():[])||[]
    };
    const todos=obtenerTareos();
    const usados=[];
    let filas=[];

    fechas.forEach(fecha=>turnos.forEach(turno=>{
      const delTurno=todos.filter(t=>t.fecha===fecha&&normalizarTurno(t.turno)===turno);
      const candidatos=[];
      delTurno.forEach(t=>{
        const area=tareoAreaDe(t);
        const lista=typeof tareoDeduplicarPersonas==='function'
          ? tareoDeduplicarPersonas(t.personal||[]) : (t.personal||[]);
        lista.forEach(p=>candidatos.push(construirFila(t,p,false,ctx)));
        if(typeof tareoPorDiaActivos==='function'){
          tareoPorDiaActivos(t).forEach(p=>{
            if(visibles.includes(area))candidatos.push(construirFila(t,p,true,ctx));
          });
        }
      });
      // Una persona = una fila por fecha y turno. Prefiere el registro de Producción
      // para maquinistas y, en general, el que ya tiene asistencia marcada.
      const unicas=[];
      candidatos.forEach(c=>{
        if(c.tipo==='Por día'){unicas.push(c);return;}
        const i=unicas.findIndex(u=>u.tipo!=='Por día'&&mismaPersona(u._persona,c._persona));
        if(i<0){unicas.push(c);return;}
        const u=unicas[i];
        const mejor=(c.grupo==='MAQ'&&c.area==='Producción'&&u.area!=='Producción')||
          (!u.estado&&c.estado);
        if(mejor)unicas[i]=c;
      });
      unicas.forEach(f=>{
        // Visibilidad: un maquinista registrado en Producción lo ve también Mantenimiento.
        const ok=visibles.includes(f.area)||(f.grupo==='MAQ'&&visibles.includes('Mantenimiento'));
        if(ok)filas.push(f);
      });
      delTurno.forEach(t=>{if(visibles.includes(tareoAreaDe(t)))usados.push(t);});
    }));

    filas=filas.filter(f=>grupos.includes(f.grupo));
    if(opts.areaPorDia)filas=filas.filter(f=>f.grupo!=='DIA'||f.area===opts.areaPorDia);

    filas.sort((a,b)=>
      GRUPOS[a.grupo].orden-GRUPOS[b.grupo].orden||
      a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})||
      a.fecha.localeCompare(b.fecha)||
      (a.turno==='Día'?0:1)-(b.turno==='Día'?0:1));

    const porGrupo={};
    ORDEN_GRUPOS.forEach(k=>{porGrupo[k]=filas.filter(f=>f.grupo===k);});

    const registradores=[...new Set([
      ...usados.map(t=>typeof tareoResponsable==='function'?tareoResponsable(t):t.creadoPor),
      ...filas.map(f=>f.registradoPor)
    ].filter(x=>x&&x!=='—'))];

    return {filas,porGrupo,registradores,tareos:usados};
  }
  window.tareoListaUnica=tareoListaUnica;

  /* ---------- resumen y utilidades de cálculo ---------- */
  const FALTAS=['Falta por justificar','Falta justificada'];
  function resumir(filas){
    // Criterio único de asistencia (13-tareo.js: tareoResumenAsistencia).
    const g=tareoResumenAsistencia(filas,{estado:f=>f.estado,tardanza:f=>f.tardanza});
    const r={programados:filas.length,asistieron:g.presentes,enComision:g.enComision,faltas:g.faltas,tardanzas:g.tardanzas,
      descansos:g.descansos,otros:g.otros,sinRegistrar:g.sinRegistrar,favorMin:0,contraMin:0};
    filas.forEach(f=>{
      if(f.saldoMin>0)r.favorMin+=f.saldoMin;
      if(f.saldoMin<0)r.contraMin+=-f.saldoMin;
    });
    return r;
  }
  const textoHM=min=>{
    const a=Math.abs(Math.round(min));
    return Math.floor(a/60)+':'+String(a%60).padStart(2,'0');
  };
  const textoSaldo=min=>min===0?'0:00':(min>0?'+':'-')+textoHM(min);
  const personasDistintas=filas=>new Set(filas.map(f=>soloDigitos(f.dni)||norm(f.nombre))).size;

  /* ---------- fechas ---------- */
  const aIso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const aFecha=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,(m||1)-1,d||1);};
  function rangoFechas(modo,desde,hasta){
    const d=aFecha(desde);
    let ini=d,fin=d;
    if(modo==='semana'){
      const dif=d.getDay()===0?-6:1-d.getDay();
      ini=new Date(d.getFullYear(),d.getMonth(),d.getDate()+dif);
      fin=new Date(ini.getFullYear(),ini.getMonth(),ini.getDate()+6);
    }else if(modo==='mes'){
      ini=new Date(d.getFullYear(),d.getMonth(),1);
      fin=new Date(d.getFullYear(),d.getMonth()+1,0);
    }else if(modo==='rango'){
      ini=aFecha(desde);fin=aFecha(hasta||desde);
      if(fin<ini){const t=ini;ini=fin;fin=t;}
    }
    const lista=[];
    for(let x=new Date(ini);x<=fin&&lista.length<=93;x.setDate(x.getDate()+1))lista.push(aIso(x));
    return lista;
  }
  const dmy=iso=>{const [y,m,d]=String(iso).split('-');return d+'/'+m+'/'+y;};
  const etiquetaRango=f=>f.length===1?dmy(f[0]):dmy(f[0])+' al '+dmy(f[f.length-1]);
  const etiquetaTurnos=t=>t.length===2?'Día y Noche':t[0];
  const ahoraTxt=()=>{const d=new Date();return dmy(aIso(d))+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  const capitalizar=s=>s.charAt(0).toUpperCase()+s.slice(1);

  /* ---------------------------------------------------------
     4) EXCEL (ExcelJS)
     --------------------------------------------------------- */
  const COLOR={azul:'FF003B5C',azulClaro:'FFE3EEF5',gris:'FFF2F4F6',bloque:'FFD9E6EF',aviso:'FFFFE8A3'};
  const ESTADO_COLOR={
    'Asistió':['FFC6EFCE','FF1E6B33'],
    'Falta por justificar':['FFFFC7CE','FF9C0006'],
    'Falta justificada':['FFFFEB9C','FF9C5700'],
    'Descanso':['FFE7E9EC','FF555F69'],
    '':['FFDDEBF7','FF1F4E79']
  };
  const borde={style:'thin',color:{argb:'FFD0D7DE'}};
  const bordes={top:borde,left:borde,bottom:borde,right:borde};
  const fraccion=min=>min/1440;
  const fechaExcel=iso=>{const [y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));};
  const horaExcel=h=>{const m=minutosDe(h);return m===null?null:m/1440;};
  const FMT_SALDO='+[h]:mm;-[h]:mm;0:00';

  function columnasExcel(multi){
    const c=[{k:'n',t:'N°',w:6}];
    if(multi){c.push({k:'fecha',t:'Fecha',w:12},{k:'turno',t:'Turno',w:9});}
    c.push(
      {k:'dni',t:'DNI',w:12},{k:'nombre',t:'Apellidos y nombres',w:38},{k:'cargo',t:'Cargo',w:28},
      {k:'grupo',t:'Grupo',w:28},{k:'tipo',t:'Tipo',w:11},{k:'linea',t:'Línea',w:12},
      {k:'estado',t:'Estado',w:22},{k:'estadoTareo',t:'Estado del tareo',w:15},{k:'ingreso',t:'Ingreso',w:10},{k:'salidaRef',t:'Salida refrigerio',w:11},
      {k:'retornoRef',t:'Retorno refrigerio',w:11},{k:'salida',t:'Salida',w:10},
      {k:'horas',t:'Horas trabajadas',w:12},{k:'saldo',t:'HORAS EXTRAS',w:13},
      {k:'tardanza',t:'Tardanza (min)',w:11},{k:'registradoPor',t:'Registrado por',w:22},
      {k:'observacion',t:'Observación',w:50}
    );
    return c;
  }

  function nombreHojaSeguro(n){return String(n).replace(/[\\/?*[\]:]/g,'-').slice(0,31);}

  function celdaValor(f,k,n){
    switch(k){
      case 'n':return n;
      case 'fecha':return fechaExcel(f.fecha);
      case 'turno':return f.turno;
      case 'dni':return f.dni;
      case 'nombre':return f.nombre;
      case 'cargo':return f.cargo;
      case 'grupo':return GRUPOS[f.grupo].etiqueta;
      case 'tipo':return f.tipo==='Por día'?'Por día':'Planilla';
      case 'linea':return f.linea||'';
      case 'estado':return f.estado?f.estado.toUpperCase():'PENDIENTE';
      case 'estadoTareo':return f.estadoTareo||'Abierto';
      case 'ingreso':return horaExcel(f.ingreso);
      case 'salidaRef':return horaExcel(f.salidaRef);
      case 'retornoRef':return horaExcel(f.retornoRef);
      case 'salida':return horaExcel(f.salida);
      case 'horas':return f.horas===null?null:Math.round(f.horas*60)/1440;
      case 'saldo':return f.saldoMin===null?null:fraccion(f.saldoMin);
      case 'tardanza':return f.tardanza>0?f.tardanza:null;
      case 'registradoPor':return f.registradoPor;
      case 'observacion':return f.observacion;
      default:return '';
    }
  }

  /* info: {grupoTexto, rangoTexto, turnoTexto, registradores, filas(todas), resumen, multi, control} */
  function hojaTareo(wb,nombre,filas,info){
    const ws=wb.addWorksheet(nombreHojaSeguro(nombre),{properties:{defaultRowHeight:18}});
    const cols=columnasExcel(info.multi);
    const ncol=cols.length;
    cols.forEach((c,i)=>{ws.getColumn(i+1).width=c.w;});

    const fila=(texto,opts)=>{
      const r=ws.addRow([texto]);
      ws.mergeCells(r.number,1,r.number,Math.min(ncol,12));
      const c=r.getCell(1);
      c.font={bold:!!(opts&&opts.bold),size:(opts&&opts.size)||11,color:{argb:(opts&&opts.color)||'FF1B2A38'}};
      if(opts&&opts.fill)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:opts.fill}};
      c.alignment={vertical:'middle'};
      if(opts&&opts.alto)r.height=opts.alto;
      return r;
    };
    fila('GLACIAL · Tareo de personal',{bold:true,size:16,color:'FFFFFFFF',fill:COLOR.azul,alto:28});
    fila('Grupo: '+info.grupoTexto+'     Fecha: '+info.rangoTexto+'     Turno: '+info.turnoTexto,{bold:true});
    fila('Registrado por: '+(info.registradores.join(', ')||'No identificado')+'     Exportado: '+ahoraTxt());

    // Resumen
    const r=info.resumen;
    const etiquetas=['Programados','Presentes','Faltas','Descansos','Otros ausentes','Sin registrar','Tardanzas','Horas a favor','Horas en contra'];
    const valores=[r.programados,r.asistieron+(r.enComision?' ('+r.enComision+' en comisión)':''),r.faltas,r.descansos,r.otros,r.sinRegistrar,r.tardanzas,fraccion(r.favorMin),fraccion(r.contraMin)];
    const rEt=ws.addRow([]);const rVal=ws.addRow([]);
    const base=4; // desde la columna D
    etiquetas.forEach((t,i)=>{
      const ce=rEt.getCell(base+i);ce.value=t;
      ce.font={bold:true,size:10,color:{argb:'FF405261'}};
      ce.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLOR.azulClaro}};
      ce.alignment={horizontal:'center'};ce.border=bordes;
      const cv=rVal.getCell(base+i);cv.value=valores[i];
      cv.font={bold:true,size:13,color:{argb:i===7?'FF1E7B34':(i===8?'FFC00000':'FF1B2A38')}};
      cv.alignment={horizontal:'center'};cv.border=bordes;
      if(i>=7)cv.numFmt='[h]:mm';
    });
    ws.addRow([]);

    // Encabezado de la tabla
    const hdr=ws.addRow(cols.map(c=>c.t));
    const filaHdr=hdr.number;
    hdr.height=30;
    hdr.eachCell(c=>{
      c.font={bold:true,color:{argb:'FFFFFFFF'}};
      c.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLOR.azul}};
      c.alignment={horizontal:'center',vertical:'middle',wrapText:true};
      c.border=bordes;
    });
    const iGrupo=cols.findIndex(c=>c.k==='grupo')+1;
    const iNombre=cols.findIndex(c=>c.k==='nombre')+1;

    // Bloques
    ORDEN_GRUPOS.forEach(clave=>{
      const lista=filas.filter(f=>f.grupo===clave);
      if(!lista.length)return;
      const g=GRUPOS[clave];
      const tit=ws.addRow([]);
      const personas=personasDistintas(lista);
      tit.getCell(1).value=g.bloque+'  ·  '+personas+(personas===1?' persona':' personas');
      ws.mergeCells(tit.number,1,tit.number,Math.max(1,iGrupo-1));
      tit.getCell(iGrupo).value=g.etiqueta;
      tit.height=22;
      for(let c=1;c<=ncol;c++){
        const cel=tit.getCell(c);
        cel.fill={type:'pattern',pattern:'solid',fgColor:{argb:clave==='SIN'?COLOR.aviso:COLOR.bloque}};
        cel.font={bold:true,size:11,color:{argb:clave==='SIN'?'FF7A4B00':'FF003B5C'}};
        cel.border=bordes;
        cel.alignment={vertical:'middle'};
      }
      lista.forEach((f,i)=>{
        const row=ws.addRow(cols.map(c=>celdaValor(f,c.k,i+1)));
        row.eachCell({includeEmpty:true},(cel,numCol)=>{
          cel.border=bordes;
          cel.alignment={vertical:'middle',wrapText:cols[numCol-1].k==='observacion'||cols[numCol-1].k==='nombre'};
        });
        cols.forEach((c,idx)=>{
          const cel=row.getCell(idx+1);
          if(c.k==='fecha')cel.numFmt='dd/mm/yyyy';
          if(['ingreso','salidaRef','retornoRef','salida'].includes(c.k)){cel.numFmt='hh:mm';cel.alignment={horizontal:'center',vertical:'middle'};}
          if(c.k==='horas'){cel.numFmt='[h]:mm';cel.alignment={horizontal:'center',vertical:'middle'};}
          if(c.k==='n'||c.k==='tardanza'||c.k==='turno'||c.k==='tipo'){cel.alignment={horizontal:'center',vertical:'middle'};}
          if(c.k==='dni'){cel.numFmt='@';cel.value=f.dni;}
          if(c.k==='saldo'){
            cel.numFmt=FMT_SALDO;
            cel.alignment={horizontal:'center',vertical:'middle'};
            if(f.saldoMin!==null){
              cel.font={bold:true,color:{argb:f.saldoMin>0?'FF1E7B34':(f.saldoMin<0?'FFC00000':'FF7F7F7F')}};
            }
          }
          if(c.k==='estado'){
            const [bg,fg]=ESTADO_COLOR[f.estado]||['FFEADCF4','FF5B2C83'];
            cel.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
            cel.font={bold:true,color:{argb:fg}};
            cel.alignment={horizontal:'center',vertical:'middle'};
          }
          if(c.k==='estadoTareo'){
            cel.alignment={horizontal:'center',vertical:'middle'};
            if(f.estadoTareo==='Bloqueado'){cel.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8E8E8'}};cel.font={bold:true,color:{argb:'FF8A1C1C'}};}
          }
          if(c.k==='observacion'&&f.salidaEditada)cel.font={color:{argb:'FF9C5700'}};
        });
        if(!f.cargoVerificado||!f.dni){
          const cel=row.getCell(!f.dni?cols.findIndex(c=>c.k==='dni')+1:cols.findIndex(c=>c.k==='cargo')+1);
          cel.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLOR.aviso}};
        }
      });
    });
    const ultima=ws.lastRow.number;
    if(ultima>filaHdr)ws.autoFilter={from:{row:filaHdr,column:1},to:{row:ultima,column:ncol}};

    if(info.control){
      ws.addRow([]);
      const c=info.control;
      const rc=ws.addRow(['CONTROL: total general '+c.total+' = suma de grupos '+c.suma+'  →  '+(c.total===c.suma?'CORRECTO':'REVISAR')+
        '   ('+c.detalle+')']);
      ws.mergeCells(rc.number,1,rc.number,Math.min(ncol,12));
      rc.getCell(1).font={bold:true,color:{argb:c.total===c.suma?'FF1E7B34':'FFC00000'}};
    }

    ws.views=[{state:'frozen',xSplit:0,ySplit:filaHdr,activeCell:'A'+(filaHdr+1)}];
    ws.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,
      margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.3,footer:0.3},
      printTitlesRow:filaHdr+':'+filaHdr};
    ws.headerFooter={oddFooter:'GLACIAL · Tareo &D     Página &P de &N'};
    return ws;
  }

  function hojaIncidencias(wb,filas){
    const ws=wb.addWorksheet('Incidencias');
    const cols=[['Fecha',12],['Turno',9],['Incidencia',24],['Apellidos y nombres',38],['DNI',12],['Cargo',28],['Grupo',28],['Detalle',60]];
    cols.forEach((c,i)=>{ws.getColumn(i+1).width=c[1];});
    const hdr=ws.addRow(cols.map(c=>c[0]));
    hdr.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLOR.azul}};c.alignment={horizontal:'center'};});
    let n=0;
    const add=(f,tipo,detalle)=>{
      n++;
      const r=ws.addRow([fechaExcel(f.fecha),f.turno,tipo,f.nombre,f.dni,f.cargo,GRUPOS[f.grupo].etiqueta,detalle]);
      r.getCell(1).numFmt='dd/mm/yyyy';
      r.getCell(5).numFmt='@';
      r.eachCell(c=>{c.border=bordes;});
    };
    filas.forEach(f=>{
      if(FALTAS.includes(f.estado))add(f,'Falta',f.estado);
      if(f.tardanza>0)add(f,'Tardanza',f.tardanza+' min');
      if(f.salidaEditada)add(f,'Salida editada',f.observacion);
      if(!f.dni)add(f,'Sin DNI','Completar DNI en Trabajadores');
      if(!f.cargoVerificado)add(f,'Sin cargo verificado',f.cargo?'Cargo en tareo: '+f.cargo:'Sin cargo');
    });
    if(!n){const r=ws.addRow(['','','Sin incidencias en el período']);r.getCell(3).font={italic:true};}
    ws.views=[{state:'frozen',ySplit:1}];
    if(n)ws.autoFilter={from:{row:1,column:1},to:{row:ws.lastRow.number,column:cols.length}};
    ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
  }

  function hojaTotales(wb,filas){
    const ws=wb.addWorksheet('Totales por persona');
    const cols=[['Apellidos y nombres',38],['DNI',12],['Cargo',28],['Grupo',28],['Días programados',12],['Días trabajados',12],
      ['Faltas',9],['Tardanzas',11],['Horas a favor',13],['Horas en contra',13],['Saldo neto',13]];
    cols.forEach((c,i)=>{ws.getColumn(i+1).width=c[1];});
    const hdr=ws.addRow(cols.map(c=>c[0]));
    hdr.height=30;
    hdr.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLOR.azul}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
    const mapa=new Map();
    filas.forEach(f=>{
      const k=f.grupo+'|'+(soloDigitos(f.dni)||norm(f.nombre));
      if(!mapa.has(k))mapa.set(k,{f,prog:0,trab:0,faltas:0,tard:0,fav:0,con:0});
      const t=mapa.get(k);
      t.prog++;
      if(tareoEsPresente(f.estado))t.trab++;
      if(FALTAS.includes(f.estado))t.faltas++;
      if(f.tardanza>0)t.tard++;
      if(f.saldoMin>0)t.fav+=f.saldoMin;
      if(f.saldoMin<0)t.con+=-f.saldoMin;
    });
    [...mapa.values()].sort((a,b)=>GRUPOS[a.f.grupo].orden-GRUPOS[b.f.grupo].orden||a.f.nombre.localeCompare(b.f.nombre,'es'))
      .forEach(t=>{
        const r=ws.addRow([t.f.nombre,t.f.dni,t.f.cargo,GRUPOS[t.f.grupo].etiqueta,t.prog,t.trab,t.faltas,t.tard,
          fraccion(t.fav),fraccion(t.con),fraccion(t.fav-t.con)]);
        r.getCell(2).numFmt='@';
        r.getCell(9).numFmt='[h]:mm';r.getCell(10).numFmt='[h]:mm';
        r.getCell(11).numFmt=FMT_SALDO;
        r.getCell(11).font={bold:true,color:{argb:t.fav-t.con>0?'FF1E7B34':(t.fav-t.con<0?'FFC00000':'FF7F7F7F')}};
        r.eachCell({includeEmpty:true},(c,i)=>{c.border=bordes;if(i>=5)c.alignment={horizontal:'center'};});
      });
    ws.views=[{state:'frozen',ySplit:1}];
    ws.autoFilter={from:{row:1,column:1},to:{row:ws.lastRow.number,column:cols.length}};
    ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
  }

  async function descargarBlob(blob,nombre){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
  }

  /* cfg: {grupoSel, turnos, fechas, areaPorDia?, titulo?, nombreArchivo?} */
  async function exportarExcelRRHH(cfg){
    if(typeof ExcelJS==='undefined'){alert('No se pudo cargar ExcelJS. Revisa tu conexión a internet y recarga la página.');return;}
    const grupos=gruposDe(cfg.grupoSel);
    const L=tareoListaUnica({fechas:cfg.fechas,turnos:cfg.turnos,grupos,areaPorDia:cfg.areaPorDia});
    if(!L.filas.length){alert('No hay personal registrado con esos filtros.');return;}
    const multi=cfg.fechas.length>1||cfg.turnos.length>1;
    const opcion=OPCIONES_GRUPO.find(o=>o.valor===cfg.grupoSel)||OPCIONES_GRUPO[4];
    const info={
      grupoTexto:cfg.etiquetaGrupo||opcion.texto,
      rangoTexto:etiquetaRango(cfg.fechas),
      turnoTexto:etiquetaTurnos(cfg.turnos),
      registradores:L.registradores,
      resumen:resumir(L.filas),
      multi
    };
    const wb=new ExcelJS.Workbook();
    wb.creator='GLACIAL';wb.created=new Date();

    if(cfg.grupoSel==='GENERAL'){
      // Control: el total general debe ser igual a la suma de los grupos (calculados por separado).
      const hojasGrupo=[['SUP'],['MAQ'],['TEC'],['OPE','DIA'],['SIN']];
      const partes=hojasGrupo.map(g=>({g,L:tareoListaUnica({fechas:cfg.fechas,turnos:cfg.turnos,grupos:g})}));
      const suma=partes.reduce((s,p)=>s+p.L.filas.length,0);
      info.control={total:L.filas.length,suma,
        detalle:partes.map(p=>p.g.map(k=>GRUPOS[k].hoja).join('+')+' '+p.L.filas.length).join(' · ')};
      hojaTareo(wb,'General',L.filas,info);
      partes.forEach(p=>{
        if(!p.L.filas.length)return;
        const nombre=p.g.length>1?'Operarios':GRUPOS[p.g[0]].hoja;
        hojaTareo(wb,nombre,p.L.filas,Object.assign({},info,{
          grupoTexto:p.g.length>1?'Producción / operarios':GRUPOS[p.g[0]].etiqueta,
          resumen:resumir(p.L.filas),control:null}));
      });
    }else{
      hojaTareo(wb,'Tareo',L.filas,info);
    }
    hojaIncidencias(wb,L.filas);
    if(multi)hojaTotales(wb,L.filas);

    const buffer=await wb.xlsx.writeBuffer();
    const rango=cfg.fechas.length===1?cfg.fechas[0]:cfg.fechas[0]+'_a_'+cfg.fechas[cfg.fechas.length-1];
    const nombre=cfg.nombreArchivo||('Tareo_RRHH_'+norm(opcion.texto).replace(/[^a-z0-9]+/g,'_')+'_'+rango+'_'+norm(etiquetaTurnos(cfg.turnos)).replace(/[^a-z0-9]+/g,'_')+'.xlsx');
    await descargarBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),nombre);
  }
  window.exportarExcelRRHH=exportarExcelRRHH;

  /* ---------------------------------------------------------
     5) IMAGEN PARA WHATSAPP
     --------------------------------------------------------- */
  const GRUPOS_IMAGEN={'Producción':['SUP','MAQ','OPE','DIA'],'Mantenimiento':['MAQ','TEC','DIA']};
  const ESTADO_CORTO={
    'Falta por justificar':'FALTA','Falta justificada':'FALTA JUSTIF.','Descanso':'DESCANSO',
    'Descanso médico':'DESC. MÉDICO','Vacaciones':'VACACIONES','Suspensión':'SUSPENSIÓN',
    'Licencia sin goce':'LICENCIA','Licencia por maternidad':'LICENCIA','Licencia por paternidad':'LICENCIA',
    'Fallecimiento de familiar directo':'DUELO','Comisión / trabajo externo':'COMISIÓN','Feriado trabajado':'FERIADO'
  };

  /* Imagen HORIZONTAL (1600 px) con una fila por persona. Máximo 25 personas por imagen;
     si hay más se generan varias páginas. Sale de la misma lista que el Excel de RRHH. */
  const IMG_W=1600,IMG_M=66,IMG_FILAS=25;
  const IMG_FILA=42,IMG_TITULO=44,IMG_FUENTE=23;
  const IMG_COL={ing:735,ref:940,sal:1135,ext:1312,tar:1478};

  function fuente(px,peso){return (peso||'')+' '+px+'px "Segoe UI", Arial, sans-serif';}
  function partirTexto(ctx,texto,ancho){
    const palabras=String(texto).split(/\s+/);
    const lineas=[];let actual='';
    palabras.forEach(p=>{
      const prueba=actual?actual+' '+p:p;
      if(ctx.measureText(prueba).width<=ancho||!actual)actual=prueba;
      else{lineas.push(actual);actual=p;}
    });
    if(actual)lineas.push(actual);
    return lineas.slice(0,3);
  }
  function rectRedondo(ctx,x,y,w,h,r,color){
    ctx.fillStyle=color;ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.fill();
  }

  /* Resumen de la imagen: asistieron + faltas + descansos + pendientes = total de personas. */
  function resumenImagen(filas){
    // Criterio único de asistencia (13-tareo.js): presentes + faltas + descansos + otros ausentes + sin registrar = total.
    const g=tareoResumenAsistencia(filas,{estado:f=>f.estado,tardanza:f=>f.tardanza});
    const r={total:g.total,asistieron:g.presentes,enComision:g.enComision,faltas:g.faltas,descansos:g.descansos,otros:g.otros,
      pendientes:g.sinRegistrar,tardanzas:g.tardanzas,parcial:false};
    filas.forEach(f=>{if(tareoEsPresente(f.estado)&&!f.salida)r.parcial=true;});
    if(r.pendientes>0)r.parcial=true;
    return r;
  }

  function medirFila(ctx,f){
    ctx.font=fuente(IMG_FUENTE,'500');
    const lineas=partirTexto(ctx,f.nombre,560);
    return {lineas,alto:lineas.length>1?IMG_FILA+(lineas.length-1)*28:IMG_FILA};
  }

  function paginarImagen(filas,ctx){
    const bloques=ORDEN_GRUPOS.map(k=>({clave:k,filas:filas.filter(f=>f.grupo===k)})).filter(b=>b.filas.length);
    const paginas=[];
    let pag={items:[],personas:0};
    const nueva=()=>{if(pag.personas)paginas.push(pag);pag={items:[],personas:0};};
    bloques.forEach(b=>{
      const total=personasDistintas(b.filas);
      const filasM=b.filas.map(f=>({tipo:'persona',f,m:medirFila(ctx,f)}));
      let i=0,continuacion=false;
      while(i<filasM.length){
        // El título de un bloque nunca queda solo al final: necesita sitio para 2 filas (o todas si son menos).
        const minimo=Math.min(2,filasM.length-i);
        if(pag.personas&&IMG_FILAS-pag.personas<minimo)nueva();
        pag.items.push({tipo:'titulo',clave:b.clave,total,continuacion});
        const cabe=IMG_FILAS-pag.personas;
        filasM.slice(i,i+cabe).forEach(x=>{pag.items.push(x);pag.personas++;});
        i+=cabe;continuacion=true;
        if(i<filasM.length)nueva();
      }
    });
    nueva();
    return paginas;
  }

  /* Dibuja una página; devuelve la altura usada (con alto=null solo mide). */
  function dibujarPagina(ctx,pagina,meta,alto){
    const W=IMG_W,M=IMG_M;
    const dib=alto!==null;
    if(dib){ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,W,alto);}
    let y=44;

    // Cabecera (se repite en cada página)
    if(dib){
      ctx.textAlign='left';ctx.fillStyle='#1B2733';
      ctx.font=fuente(40,'bold');ctx.fillText('Glacial · '+meta.titulo,M,y+36);
      ctx.fillStyle='#6B7681';ctx.font=fuente(26);
      ctx.fillText(meta.fechaTxt+' · Turno '+meta.turno.toLowerCase()+' · '+meta.total+' personas',M,y+74);
      if(meta.paginas>1){ctx.textAlign='right';ctx.fillText('Página '+meta.n+' de '+meta.paginas,W-M,y+74);ctx.textAlign='left';}
    }
    // Resumen: solo en la primera página
    if(meta.n===1){
      const r=meta.resumen;
      const chips=[[r.asistieron+(r.asistieron===1?' presente':' presentes')+(r.enComision?', '+r.enComision+' en comisión':''),'#C9E8CD','#1B5E20'],[r.faltas+' faltas','#FBD5D5','#9B1C1C'],
        [r.tardanzas+' tardanzas','#F8DCA0','#8A5300'],[r.descansos+(r.descansos===1?' descanso':' descansos'),'#F1F2F3','#555E67'],
        [r.otros+(r.otros===1?' otro ausente':' otros ausentes'),'#F1F2F3','#555E67'],
        [r.pendientes+' sin registrar','#F1F2F3','#555E67']];
      if(dib){
        ctx.font=fuente(24,'500');
        const anchos=chips.map(c=>ctx.measureText(c[0]).width+36);
        let x=M;
        chips.forEach((c,i)=>{
          rectRedondo(ctx,x,y+92,anchos[i],46,23,c[1]);
          ctx.fillStyle=c[2];ctx.textAlign='center';ctx.fillText(c[0],x+anchos[i]/2,y+123);
          x+=anchos[i]+12;
        });
        ctx.textAlign='left';
      }
    }
    y+=(meta.n===1?150:96);
    if(meta.n===1&&meta.resumen.parcial){
      if(dib){
        rectRedondo(ctx,M,y,W-2*M,44,10,'#FFF1D0');
        ctx.fillStyle='#8A5300';ctx.font=fuente(25,'bold');ctx.textAlign='left';
        ctx.fillText('Turno en curso · datos parciales',M+18,y+31);
      }
      y+=58;
    }

    // Títulos de columna (se repiten en cada página)
    if(dib){
      ctx.fillStyle='#4A5560';ctx.font=fuente(23,'bold');ctx.textAlign='left';
      ctx.fillText('Trabajador',M+12,y+34);
      ctx.textAlign='center';
      ctx.fillText('Ingreso',IMG_COL.ing,y+34);ctx.fillText('Refrigerio',IMG_COL.ref,y+34);
      ctx.fillText('Salida',IMG_COL.sal,y+34);ctx.fillText('HORAS EXTRAS',IMG_COL.ext,y+34);
      ctx.fillText('Tardanza',IMG_COL.tar,y+34);
      ctx.textAlign='left';
      ctx.fillStyle='#CDD3D9';ctx.fillRect(M,y+48,W-2*M,2);
    }
    y+=54;

    let indice=0;
    pagina.items.forEach(it=>{
      if(it.tipo==='titulo'){
        const g=GRUPOS[it.clave];
        if(dib){
          ctx.fillStyle=it.clave==='SIN'?'#FFF1D0':'#F3F4F5';ctx.fillRect(M,y,W-2*M,IMG_TITULO);
          ctx.fillStyle=it.clave==='SIN'?'#8A5300':'#4A5560';ctx.font=fuente(25,'bold');ctx.textAlign='left';
          const nombre=g.bloque.charAt(0)+g.bloque.slice(1).toLowerCase();
          ctx.fillText(nombre+(it.continuacion?' (cont.)':'')+' · '+it.total,M+12,y+31);
          ctx.fillStyle='#E3E7EB';ctx.fillRect(M,y+IMG_TITULO-1,W-2*M,1);
        }
        y+=IMG_TITULO;indice=0;
        return;
      }
      const f=it.f,m=it.m,h=m.alto;
      if(dib){
        if(indice%2){ctx.fillStyle='#F7F8F9';ctx.fillRect(M,y,W-2*M,h);}
        const cy=y+h/2+8;
        // Trabajador (completo, en dos líneas si es largo) y línea asignada, pequeña
        ctx.fillStyle='#1E2933';ctx.font=fuente(IMG_FUENTE,'500');ctx.textAlign='left';
        m.lineas.forEach((l,k)=>ctx.fillText(l,M+12,y+(h===IMG_FILA?IMG_FILA/2+8:28)+k*28));
        if(f.linea&&norm(f.linea)!=='sin linea'){
          const ult=m.lineas[m.lineas.length-1];
          ctx.font=fuente(IMG_FUENTE,'500');const ancho=ctx.measureText(ult).width;
          ctx.fillStyle='#8A949E';ctx.font=fuente(20);
          ctx.fillText(f.linea,M+12+ancho+14,y+(h===IMG_FILA?IMG_FILA/2+8:28)+(m.lineas.length-1)*28);
        }
        const centro=(IMG_COL.ing+IMG_COL.tar)/2;
        const asistio=f.estado==='Asistió';
        ctx.textAlign='center';
        if(asistio&&f.ingreso){
          ctx.fillStyle='#1E2933';ctx.font=fuente(IMG_FUENTE);
          ctx.fillText(f.ingreso,IMG_COL.ing,cy);
          if(f.salidaRef)ctx.fillText(f.salidaRef+' – '+(f.retornoRef||''),IMG_COL.ref,cy);
          if(f.salida)ctx.fillText(f.salida,IMG_COL.sal,cy);
          else{ctx.fillStyle='#8A949E';ctx.fillText('En turno',IMG_COL.sal,cy);}
          if(f.saldoMin!==null){
            ctx.font=fuente(IMG_FUENTE,'bold');
            ctx.fillStyle=f.saldoMin>0?'#1B6E20':(f.saldoMin<0?'#9B1C1C':'#9AA3AB');
            ctx.fillText(textoSaldo(f.saldoMin),IMG_COL.ext,cy);
          }
          if(f.tardanza>0){ctx.font=fuente(IMG_FUENTE);ctx.fillStyle='#8A5300';ctx.fillText(f.tardanza+' min',IMG_COL.tar,cy);}
        }else{
          // Sin horas: el estado ocupa las columnas (Falta, Descanso, Pendiente...)
          let txt,color;
          if(!f.estado){txt='Pendiente';color='#A7B0B8';}
          else if(asistio){txt='Asistió';color='#6B7681';}
          else if(f.estado==='Falta por justificar'){txt='Falta';color='#9B1C1C';}
          else{txt=f.estado;color='#6B7681';}
          ctx.fillStyle=color;ctx.font=fuente(IMG_FUENTE);ctx.fillText(txt,centro,cy);
        }
        ctx.textAlign='left';
        ctx.fillStyle='#E9ECEF';ctx.fillRect(M,y+h-1,W-2*M,1);
      }
      y+=h;indice++;
    });

    // Pie
    y+=22;
    if(dib){
      ctx.fillStyle='#1F5FA8';ctx.font=fuente(24);ctx.textAlign='left';
      ctx.fillText('¿Ves un error en tus horas? Avisa a tu supervisor',M,y+30);
      ctx.fillStyle='#8A949E';ctx.textAlign='right';
      ctx.fillText('Generado '+meta.generado+' · Página '+meta.n+' de '+meta.paginas,W-M,y+30);
      if(meta.registradores){
        ctx.font=fuente(21);ctx.textAlign='left';
        ctx.fillText('Registró: '+meta.registradores,M,y+62);
      }
      ctx.textAlign='left';
    }
    y+=meta.registradores?84:56;
    return y;
  }

  function generarImagenes(cfg){
    const grupos=cfg.grupos||GRUPOS_IMAGEN[cfg.area]||GRUPOS_IMAGEN['Producción'];
    const L=tareoListaUnica({fechas:[cfg.fecha],turnos:[cfg.turno],grupos,areaPorDia:cfg.area});
    const sinClasificar=tareoListaUnica({fechas:[cfg.fecha],turnos:[cfg.turno],grupos:['SIN']}).filas.length;
    const paginas=paginarImagen(L.filas,document.createElement('canvas').getContext('2d'));
    const [y,m,d]=cfg.fecha.split('-').map(Number);
    const fechaTxt=capitalizar(new Date(y,m-1,d).toLocaleDateString('es-PE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}));
    const resumen=resumenImagen(L.filas);
    const meta0={titulo:cfg.titulo||'Tareo de producción',fechaTxt,turno:cfg.turno,resumen,total:L.filas.length,
      generado:ahoraTxt().slice(-5),registradores:L.registradores.join(', '),paginas:paginas.length};
    const imagenes=paginas.map((pag,i)=>{
      const meta=Object.assign({},meta0,{n:i+1});
      const medidor=document.createElement('canvas');
      medidor.width=IMG_W;medidor.height=10;
      const alto=Math.ceil(dibujarPagina(medidor.getContext('2d'),pag,meta,null));
      const lienzo=document.createElement('canvas');
      lienzo.width=IMG_W;lienzo.height=alto;
      dibujarPagina(lienzo.getContext('2d'),pag,meta,alto);
      return lienzo.toDataURL('image/png');
    });
    return {imagenes,filas:L.filas,sinClasificar,total:L.filas.length,resumen};
  }
  window.tareoGenerarImagenesRRHH=generarImagenes;

  /* Nombre: Tareo_produccion_AAAA-MM-DD_turno_p1.png */
  function nombreImagen(cfg,n){
    return 'Tareo_'+norm(cfg.area||'produccion').replace(/[^a-z0-9]/g,'_')+'_'+cfg.fecha+'_'+norm(cfg.turno)+'_p'+n+'.png';
  }
  function descargarImagen(url,nombre){
    const a=document.createElement('a');
    a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();
  }
  window.__tareoImgDescargar=(i)=>{const s=window.__tareoImgEstado;if(s)descargarImagen(s.imagenes[i],nombreImagen(s.cfg,i+1,s.imagenes.length));};
  window.__tareoImgDescargarTodas=()=>{
    const s=window.__tareoImgEstado;if(!s)return;
    s.imagenes.forEach((u,i)=>setTimeout(()=>descargarImagen(u,nombreImagen(s.cfg,i+1,s.imagenes.length)),i*400));
  };
  async function compartirImagenes(){
    const s=window.__tareoImgEstado;
    if(!s)return;
    try{
      const archivos=await Promise.all(s.imagenes.map(async(u,i)=>{
        const b=await (await fetch(u)).blob();
        return new File([b],nombreImagen(s.cfg,i+1,s.imagenes.length),{type:'image/png'});
      }));
      if(navigator.canShare&&navigator.canShare({files:archivos}))await navigator.share({files:archivos,title:'Tareo GLACIAL'});
      else window.__tareoImgDescargarTodas();
    }catch(_){/* cancelado por el usuario */}
  }
  window.__tareoImgCompartir=compartirImagenes;

  function mostrarImagenes(cfg){
    const root=document.getElementById('modal-root');
    if(!root){alert('No se pudo abrir la vista previa.');return;}
    const r=generarImagenes(cfg);
    if(!r.imagenes.length){alert('No hay personal para generar la imagen.');return;}
    window.__tareoImgEstado={cfg,imagenes:r.imagenes};
    // En celular: el menú de compartir del teléfono (Web Share con archivos) lleva todas las páginas a WhatsApp.
    let puedeCompartir=false;
    try{puedeCompartir=!!(navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.png',{type:'image/png'})]}));}catch(_){/* sin Web Share */}
    root.innerHTML=`
      <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
        <div class="modal" style="max-width:980px;width:96%;">
          <div class="modal-head"><h3>Imagen para WhatsApp</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
          <div class="modal-body">
            <p class="small-muted">${r.total} persona(s) · ${r.imagenes.length} imagen(es) · presentes ${r.resumen.asistieron}${r.resumen.enComision?` (${r.resumen.enComision} en comisión)`:''} + faltas ${r.resumen.faltas} + descansos ${r.resumen.descansos} + otros ausentes ${r.resumen.otros} + sin registrar ${r.resumen.pendientes} = ${r.resumen.asistieron+r.resumen.faltas+r.resumen.descansos+r.resumen.otros+r.resumen.pendientes}${r.sinClasificar?` · <strong>${r.sinClasificar} sin clasificar no se muestran</strong> (solo salen en el Excel General)`:''}</p>
            <div class="actions-row" style="margin-bottom:10px;">
              ${puedeCompartir
                ? `<button class="btn btn-primary" onclick="__tareoImgCompartir()">Compartir ${r.imagenes.length>1?'todas las páginas':'imagen'}</button>
                   <button class="btn btn-ghost" onclick="__tareoImgDescargarTodas()">Descargar</button>`
                : `<button class="btn btn-primary" onclick="__tareoImgDescargarTodas()">Descargar ${r.imagenes.length>1?'todas':'imagen'}</button>`}
            </div>
            ${r.imagenes.map((u,i)=>`
              <div style="margin-bottom:14px;">
                <img src="${u}" alt="Página ${i+1}" style="width:100%;border:1px solid #d5dfe8;border-radius:8px;">
                <button class="btn btn-sm btn-ghost" style="margin-top:6px;" onclick="__tareoImgDescargar(${i})">Descargar página ${i+1}</button>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------
     3) PANEL "Exportar RRHH"
     --------------------------------------------------------- */
  function puedeExportarRRHH(){
    try{
      // Solo quien gestiona el tareo, RRHH o Administrador (no Jefatura/Gerencia/solo ver).
      return typeof tareoPuedeExportar==='function'&&tareoPuedeExportar();
    }catch(_){return false;}
  }
  const esc=t=>typeof escaparHTML==='function'?escaparHTML(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function leerPanel(){
    const v=id=>document.getElementById(id)?.value||'';
    const modo=v('rrhhx-modo')||'dia';
    const desde=v('rrhhx-desde')||obtenerFechaHoy();
    const turnoSel=v('rrhhx-turno')||'AMBOS';
    return {
      grupoSel:v('rrhhx-grupo')||'GENERAL',
      turnos:turnoSel==='AMBOS'?['Día','Noche']:[turnoSel],
      modo,
      fechas:rangoFechas(modo,desde,v('rrhhx-hasta')||desde)
    };
  }
  function vistaPrevia(){
    const el=document.getElementById('rrhhx-previa');
    if(!el)return;
    const hastaWrap=document.getElementById('rrhhx-hasta-wrap');
    if(hastaWrap)hastaWrap.style.display=document.getElementById('rrhhx-modo')?.value==='rango'?'':'none';
    const c=leerPanel();
    const L=tareoListaUnica({fechas:c.fechas,turnos:c.turnos,grupos:gruposDe(c.grupoSel)});
    const partes=ORDEN_GRUPOS.filter(k=>L.porGrupo[k].length)
      .map(k=>GRUPOS[k].bloque.toLowerCase().replace(/^./,x=>x.toUpperCase())+': <strong>'+personasDistintas(L.porGrupo[k])+'</strong>');
    el.innerHTML=L.filas.length
      ? 'Se exportarán <strong>'+L.filas.length+'</strong> registro(s) · '+etiquetaRango(c.fechas)+'<br>'+partes.join(' · ')
      : 'No hay personal registrado con esos filtros.';
    const img=document.getElementById('rrhhx-btn-img');
    if(img){
      const unico=c.fechas.length===1&&c.turnos.length===1;
      img.disabled=!unico;
      img.title=unico?'':'La imagen se genera para un solo día y un solo turno';
    }
  }
  window.__rrhhxVista=vistaPrevia;
  window.__rrhhxExcel=async()=>{
    const c=leerPanel();
    const b=document.getElementById('rrhhx-btn-xls');
    if(b){b.disabled=true;b.textContent='Generando...';}
    try{await exportarExcelRRHH(c);}
    catch(e){console.error(e);alert('No se pudo generar el Excel: '+(e&&e.message||e));}
    finally{if(b){b.disabled=false;b.textContent='Exportar Excel';}}
  };
  window.__rrhhxImagen=()=>{
    const c=leerPanel();
    if(c.fechas.length!==1||c.turnos.length!==1)return;
    const areaPorDefecto=c.grupoSel==='MAQ'||c.grupoSel==='TEC'?'Mantenimiento':'Producción';
    mostrarImagenes({fecha:c.fechas[0],turno:c.turnos[0],area:areaPorDefecto,
      titulo:areaPorDefecto==='Producción'?'Tareo de producción':'Tareo de mantenimiento'});
  };

  function abrirExportacionRRHH(){
    if(!puedeExportarRRHH()){alert('No tienes permiso para exportar el tareo para RRHH.');return;}
    const root=document.getElementById('modal-root');
    if(!root)return;
    const hoy=(typeof tareoGeneralFiltros!=='undefined'&&tareoGeneralFiltros.fecha)||obtenerFechaHoy();
    const turnoGen=(typeof tareoGeneralFiltros!=='undefined'&&tareoGeneralFiltros.turno)||'AMBOS';
    root.innerHTML=`
      <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
        <div class="modal" style="max-width:520px;width:96%;">
          <div class="modal-head"><h3>Exportar tareo para RRHH</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
          <div class="modal-body">
            <div class="field-sm"><label>Grupo</label>
              <select id="rrhhx-grupo" onchange="__rrhhxVista()">
                ${OPCIONES_GRUPO.map(o=>`<option value="${o.valor}" ${o.valor==='GENERAL'?'selected':''}>${esc(o.texto)}</option>`).join('')}
              </select></div>
            <div class="field-sm"><label>Turno</label>
              <select id="rrhhx-turno" onchange="__rrhhxVista()">
                <option value="AMBOS" ${turnoGen==='AMBOS'||!turnoGen?'selected':''}>Día y Noche</option>
                <option value="Día" ${turnoGen==='Día'?'selected':''}>Día</option>
                <option value="Noche" ${turnoGen==='Noche'?'selected':''}>Noche</option>
              </select></div>
            <div class="field-sm"><label>Período</label>
              <select id="rrhhx-modo" onchange="__rrhhxVista()">
                <option value="dia">Un día</option><option value="semana">Una semana (lunes a domingo)</option>
                <option value="mes">Un mes</option><option value="rango">Rango libre</option>
              </select></div>
            <div class="grid grid-2">
              <div class="field-sm"><label>Fecha</label><input type="date" id="rrhhx-desde" value="${esc(hoy)}" onchange="__rrhhxVista()"></div>
              <div class="field-sm" id="rrhhx-hasta-wrap" style="display:none;"><label>Hasta</label><input type="date" id="rrhhx-hasta" value="${esc(hoy)}" onchange="__rrhhxVista()"></div>
            </div>
            <p class="small-muted" id="rrhhx-previa" style="margin:8px 0;"></p>
            <div class="actions-row">
              <button class="btn btn-primary" id="rrhhx-btn-xls" onclick="__rrhhxExcel()">Exportar Excel</button>
              <button class="btn btn-ghost" id="rrhhx-btn-img" onclick="__rrhhxImagen()">Imagen WhatsApp</button>
            </div>
          </div>
        </div>
      </div>`;
    vistaPrevia();
  }
  window.abrirExportacionRRHH=abrirExportacionRRHH;

  /* ---------------------------------------------------------
     ENGANCHES: botones por tareo, Tareo General y panel
     --------------------------------------------------------- */
  function exportarTareoExcelUnico(id){
    const tareo=obtenerTareos().find(t=>t.id===id);
    if(!tareo){alert('No se encontró el tareo.');return;}
    if(!tareoPuedeExportar(tareo)){alert('No tienes permiso para exportar este tareo.');return;}
    const area=tareoAreaDe(tareo);
    if(!tareoAreasVisibles().includes(area)){alert('No tienes acceso a este tareo.');return;}
    const turno=normalizarTurno(tareo.turno);
    exportarExcelRRHH({
      grupoSel:'GENERAL',turnos:[turno],fechas:[tareo.fecha],areaPorDia:area,
      etiquetaGrupo:'Tareo de '+area,
      nombreArchivo:'Tareo_'+norm(area).replace(/[^a-z0-9]/g,'_')+'_'+tareo.fecha+'_'+norm(turno)+'.xlsx'
    }).catch(e=>alert('No se pudo generar el Excel: '+(e&&e.message||e)));
  }
  function exportarTareoPNGUnico(id){
    const tareo=obtenerTareos().find(t=>t.id===id);
    if(!tareo)return;
    if(!tareoPuedeExportar(tareo)){alert('No tienes permiso para exportar este tareo.');return;}
    const area=tareoAreaDe(tareo);
    mostrarImagenes({fecha:tareo.fecha,turno:normalizarTurno(tareo.turno),area,
      titulo:area==='Producción'?'Tareo de producción':'Tareo de mantenimiento'});
  }
  function exportarTareoGeneralUnico(){
    if(!tareoAccesoUsuario().general||!tareoPuedeExportar()){alert('No tienes permiso para exportar el Tareo General.');return;}
    const f=tareoGeneralFiltros;
    exportarExcelRRHH({
      grupoSel:'GENERAL',fechas:[f.fecha||obtenerFechaHoy()],
      turnos:f.turno?[f.turno]:['Día','Noche'],
      nombreArchivo:'Tareo_General_'+(f.fecha||obtenerFechaHoy())+'.xlsx'
    }).catch(e=>alert('No se pudo generar el Excel: '+(e&&e.message||e)));
  }
  exportarTareoExcel=exportarTareoExcelUnico;
  exportarTareoPNG=exportarTareoPNGUnico;
  exportarTareoGeneralExcel=exportarTareoGeneralUnico;
  window.exportarTareoExcel=exportarTareoExcelUnico;
  window.exportarTareoPNG=exportarTareoPNGUnico;
  window.exportarTareoGeneralExcel=exportarTareoGeneralUnico;

  // Sheets y WhatsApp por tareo: misma regla que Excel y PNG.
  ['wspEnviarTareo','sheetsReenviarTareo'].forEach(nombre=>{
    const original=window[nombre];
    if(typeof original!=='function')return;
    window[nombre]=function(id){
      const t=obtenerTareos().find(x=>x.id===id);
      if(!tareoPuedeExportar(t)){alert('No tienes permiso para enviar este tareo.');return;}
      return original.apply(this,arguments);
    };
  });

  /* ---------------------------------------------------------
     TAREO GENERAL EN PANTALLA: mismos grupos, orden y personas que el Excel y la imagen
     --------------------------------------------------------- */
  let grupoVista='TODOS';
  const CHIPS_VISTA=[['TODOS','Todos'],['SUP','Supervisores'],['MAQ','Maquinistas'],['TEC','Técnicos'],['OPE','Operarios'],['DIA','Personal x día'],['SIN','Sin clasificar']];

  function datosVistaGeneral(){
    const f=tareoGeneralFiltros;
    const L=tareoListaUnica({fechas:[f.fecha||obtenerFechaHoy()],turnos:f.turno?[f.turno]:['Día','Noche']});
    let filas=L.filas;
    // Filtro de área: Producción = supervisores/operarios; Mantenimiento = maquinistas/técnicos (regla de RRHH).
    if(f.area==='Producción')filas=filas.filter(x=>['SUP','OPE'].includes(x.grupo)||((x.grupo==='DIA'||x.grupo==='SIN')&&x.area==='Producción'));
    if(f.area==='Mantenimiento')filas=filas.filter(x=>['MAQ','TEC'].includes(x.grupo)||((x.grupo==='DIA'||x.grupo==='SIN')&&x.area==='Mantenimiento'));
    return filas;
  }

  function claseEstadoVista(estado){
    return typeof tareoClaseEstado==='function'?tareoClaseEstado(estado):'neutral';
  }

  function tablaBloque(lista,ambosTurnos){
    return '<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr>'+
      (ambosTurnos?'<th>Turno</th>':'')+
      '<th>Trabajador</th><th>Cargo</th><th>Línea</th><th>Asistencia</th><th>Ingreso</th><th>Tardanza</th>'+
      '<th>Salida</th><th>Horas</th><th>HORAS EXTRAS</th></tr></thead><tbody>'+
      lista.map(x=>{
        const p=x._persona;
        const nombre=x.tipo==='Por día'
          ? esc(x.nombre)
          : (typeof tareoBotonNombre==='function'?tareoBotonNombre(p,x.tareoId):esc(x.nombre));
        const estado=x.estado?x.estado.toUpperCase():'PENDIENTE';
        const saldo=x.saldoMin===null?'—':tareoSaldoHTML(x.saldoMin/60);
        return '<tr>'+(ambosTurnos?'<td>'+esc(x.turno)+'</td>':'')+
          '<td>'+nombre+'</td><td>'+esc(x.cargo)+'</td><td>'+(esc(x.linea)||'—')+'</td>'+
          '<td><span class="tareo-status '+claseEstadoVista(x.estado)+'">'+esc(estado)+'</span></td>'+
          '<td>'+(x.ingreso||'—')+'</td>'+
          '<td>'+(x.tardanza>0?'<span class="tareo-late">'+esc(formatearMinutos(x.tardanza))+'</span>':'—')+'</td>'+
          '<td>'+(x.salida||'—')+(x.salidaEditada&&typeof tareoMarcaSalidaEditada==='function'?tareoMarcaSalidaEditada(p):'')+'</td>'+
          '<td>'+(x.horas===null?'—':esc(formatearHoras(x.horas))+' h')+'</td>'+
          '<td>'+saldo+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }

  function pintarTareoGeneralAgrupado(){
    const vista=document.getElementById('tareo-general-view');
    if(!vista)return;
    const filas=datosVistaGeneral();
    const planilla=filas.filter(x=>x.grupo!=='DIA');
    const gA=tareoResumenAsistencia(planilla,{estado:x=>x.estado,tardanza:x=>x.tardanza});   // criterio único de asistencia
    const k={total:gA.total,asist:gA.presentes,com:gA.enComision,aus:gA.faltas+gA.descansos+gA.otros,pend:gA.sinRegistrar,tard:gA.tardanzas};

    // KPIs con la misma lista
    const kpi=document.querySelector('#main .tareo-kpi-grid');
    if(kpi){
      const caja=(t,v,c)=>'<div class="tareo-kpi"><span class="tareo-kpi-label">'+t+'</span><strong'+(c?' class="'+c+'"':'')+'>'+v+'</strong></div>';
      kpi.innerHTML=caja('Personal',k.total)+caja('Presentes'+(k.com?' ('+k.com+' en comisión)':''),k.asist,'tareo-good')+caja('Ausencias',k.aus)+
        caja('Sin registrar',k.pend,k.pend?'tareo-warn':'')+caja('Tardanzas',k.tard);
    }

    // El bloque "Personal por día" ya sale dentro de la lista agrupada.
    [...document.querySelectorAll('#main .panel')].forEach(p=>{
      const h=p.querySelector('.panel-head h3');
      const t=h?h.textContent.trim():'';
      if(t==='Personal por día (no planilla)')p.remove();
    });
    const panel=[...document.querySelectorAll('#main .panel')].find(p=>{
      const h=p.querySelector('.panel-head h3');return h&&h.textContent.trim()==='Personal del día';
    });
    if(!panel)return;

    const hayTurnos=!tareoGeneralFiltros.turno;
    const cuentas={TODOS:filas.length};
    ORDEN_GRUPOS.forEach(g=>{cuentas[g]=filas.filter(x=>x.grupo===g).length;});
    if(grupoVista!=='TODOS'&&!cuentas[grupoVista])grupoVista='TODOS';
    const chips=CHIPS_VISTA.filter(([c])=>c==='TODOS'||cuentas[c]).map(([c,t])=>
      '<button type="button" class="tareo-tab'+(c===grupoVista?' active':'')+'" data-gv="'+c+'" style="padding:8px 14px;">'+t+
      ' <span class="small-muted">'+cuentas[c]+'</span></button>').join('');
    const visibles=grupoVista==='TODOS'?filas:filas.filter(x=>x.grupo===grupoVista);

    const bloques=ORDEN_GRUPOS.map(g=>({g,l:visibles.filter(x=>x.grupo===g)})).filter(b=>b.l.length).map(b=>{
      const G=GRUPOS[b.g];
      const n=personasDistintas(b.l);
      const aviso=b.g==='DIA'?' · no suma a los totales':'';
      const resaltado=b.g==='SIN'?'background:#fff3cd;color:#7a4b00;':'background:#e8f0f6;color:#003b5c;';
      return '<div style="margin:16px 0 8px;padding:9px 14px;border-radius:8px;font-weight:800;letter-spacing:.02em;'+resaltado+'">'+
        esc(G.bloque)+' · '+n+(n===1?' persona':' personas')+'<span style="font-weight:600;">'+aviso+'</span></div>'+
        tablaBloque(b.l,hayTurnos);
    }).join('');

    panel.innerHTML='<div class="panel-head"><h3>Personal del día</h3><span class="small-muted">'+filas.length+
      ' personas · toca un nombre para ver su ficha</span></div>'+
      '<div class="panel-body"><div class="tareo-tabs" style="margin-bottom:6px;">'+chips+'</div>'+
      (visibles.length?bloques:'<div class="empty-state"><h4>Sin registros para esta fecha</h4><p>Cuando los supervisores abran sus tareos, aparecerán aquí en tiempo real.</p></div>')+
      '</div>';
    panel.querySelectorAll('[data-gv]').forEach(b=>{b.onclick=()=>{grupoVista=b.dataset.gv;pintarTareoGeneralAgrupado();};});
  }
  window.tareoGeneralPintarAgrupado=pintarTareoGeneralAgrupado;

  // Solo visualización: sin botones de exportación en el Tareo General.
  if(typeof renderTareoGeneral==='function'){
    const anterior=renderTareoGeneral;
    renderTareoGeneral=function(){
      const r=anterior.apply(this,arguments);
      try{
        const barra=document.querySelector('#tareo-general-view .tareo-head-actions');
        if(barra&&!puedeExportarRRHH())barra.innerHTML='';   // solo visualización: sin botones
        pintarTareoGeneralAgrupado();
      }catch(e){console.warn('Exportar RRHH:',e);}
      return r;
    };
    window.renderTareoGeneral=renderTareoGeneral;
  }

  // Botón "Exportar RRHH" en la barra de pestañas de TODAS las pantallas del tareo
  // (Tareo, Tareo General, Historial, Resumen mensual, Panel de RRHH...).
  if(typeof tareoRenderTabs==='function'){
    const tabsAnterior=tareoRenderTabs;
    tareoRenderTabs=function(){
      const html=tabsAnterior.apply(this,arguments);
      if(!puedeExportarRRHH()||html.indexOf('btn-exportar-rrhh')>=0)return html;
      const boton='<button type="button" id="btn-exportar-rrhh" class="btn btn-sm btn-primary" '+
        'style="margin-left:auto;align-self:center;" onclick="abrirExportacionRRHH()">Exportar RRHH</button>';
      return html.replace('</div>',boton+'</div>');
    };
    window.tareoRenderTabs=tareoRenderTabs;
  }
})();
