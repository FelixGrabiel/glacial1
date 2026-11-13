/* =====================================================================================================================
   MANTENIMIENTO · REGISTRO CFA-CA-F-023 · impreso A4 horizontal, 1 sola hoja · docs/mantenimiento/plan-y-registro.md (punto 5.1)
   Idéntico al formato del Excel (REGISTRO MANTENIMIENTO Y CALIBRACION): cabecera con logo · datos con etiquetas en cursiva y valores subrayados ·
   REVISIÓN INICIAL · tabla de 22 actividades en dos bloques de 11 filas con «Mantenimiento Preventivo» al costado · Tiempo Programado · ACCIONES REALIZADAS
   (piezas, insumos químicos fijos, informe final) · firmas. La línea se imprime solo como «PET». Máximo 22 actividades: no hay segunda hoja.
   No lleva nada de la interfaz de GLACIAL (ni columna OK, ni sellos, ni hora real, ni pies de página).
   ===================================================================================================================== */
(function(raiz){
  'use strict';
  const N=raiz.glacialMttoPlan||(typeof require!=='undefined'?require('./71-plan-anual-nucleo.js'):null);
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const FIRMAS_DEFECTO={vbGG:'ÁLVARO HIDALGO',jefeMantenimiento:'ADRIÁN MARTÍNEZ',supervisorMantenimiento:'CRISTIAN MEZA'};
  const INSUMOS_DEFECTO=['Grasa Multipropósito Sanitaria.','Limpiacontacto.','Aflojatodo.','Lubricatodo.'];
  /** «07:00» → «07:00 a.m.» · «16:00» → «04:00 p.m.» */
  function hora12(h){
    const m=/^(\d{1,2}):(\d{2})/.exec(String(h||''));if(!m)return '';
    let hh=+m[1];const ap=hh>=12?'p.m.':'a.m.';hh=hh%12;if(hh===0)hh=12;
    return String(hh).padStart(2,'0')+':'+m[2]+' '+ap;
  }
  const raya=(marcada)=>'<span class="raya">'+(marcada?'x':'&nbsp;')+'</span>';
  const celdaAct=(a,n)=>a?'<td class="c">'+esc(a.item)+'</td><td class="t">'+esc(a.equipo)+'</td><td class="t">'+esc(a.actividad)+(a.no_realizado&&!a.realizado?' (NO REALIZADA)':'')+'</td><td class="t">'+esc(a.frecuencia)+'</td>'
    :'<td class="c">'+n+'</td><td></td><td></td><td></td>';

  const CSS='@page{size:A4 landscape;margin:.35in .4in}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:11px}'+
    '.hoja{width:1120px;margin:0 auto;border:2px solid #000}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:0 3px;vertical-align:middle}'+
    '.cab td{border-bottom:2px solid #000;height:64px}.cab .logo{width:15%;border-right:2px solid #000;text-align:center}.cab .logo img{width:100px;height:62px;object-fit:contain}.cab .tit{text-align:center;font-weight:700;font-size:19px;border-right:2px solid #000}.cab .cod{width:21%;text-align:right;font-weight:700;font-size:20px;padding-right:8px}'+
    '.datos td{height:19px;font-size:13px;white-space:nowrap;overflow:hidden}.datos i{font-style:italic}.datos u{text-decoration:underline}.datos .ce{text-align:center}.datos .de{text-align:right}'+
    '.raya{display:inline-block;min-width:38px;border-bottom:1px solid #000;text-align:center;line-height:13px;margin-left:6px}'+
    '.barra{border-top:2px solid #000;border-bottom:1px solid #000;text-align:center;font-weight:700;font-size:14px;height:21px;line-height:19px}.barra.acc{border-top:2px solid #000;border-bottom:2px solid #000}'+
    '.diag td{border-bottom:1px solid #000;font-weight:700;font-size:10.5px;height:16px}.diag td+td{text-align:center}'+
    '.act td,.act th{border:1px solid #000;height:20px;font-size:11px;overflow:hidden;white-space:nowrap}.act th{font-style:italic;font-weight:400;text-align:center}.act .c{text-align:center}.act .t{text-align:left}.act .lado{text-align:center;white-space:normal;font-size:12.5px;line-height:1.25;border-left:0}'+
    '.tp td{border:1px solid #000;height:21px;font-size:12.5px}.tp td:first-child{font-weight:700;text-align:center}'+
    '.pi td{border:1px solid #000;height:19px;font-size:11.5px;overflow:hidden;white-space:nowrap}.pi th{border:1px solid #000;font-size:10px;font-weight:700;height:18px}.pi .inf{white-space:normal;text-align:center;font-size:12.5px;line-height:1.35;padding:8px 14px}'+
    '.fir th{border:1px solid #000;border-top:2px solid #000;font-weight:400;font-size:13px;height:28px}.fir td{border:1px solid #000;text-align:center;font-size:14px;height:34px}';

  /** Documento HTML completo del impreso de UN registro. acts: sus actividades; piezas: [{orden, descripcion}]; cfg: mtto_config.datos. */
  function htmlRegistro(reg,maquina,acts,piezas,cfg,urlLogo){
    cfg=cfg||{};
    const f=Object.assign({},FIRMAS_DEFECTO,cfg.firmas||{}),insumos=(cfg.insumosQuimicos&&cfg.insumosQuimicos.length?cfg.insumosQuimicos:INSUMOS_DEFECTO);
    const lista=(acts||[]).slice().sort((a,b)=>(a.item||0)-(b.item||0)).slice(0,N.MAX_IMPRESO);        // máximo 22: no se genera una segunda hoja
    const filas=[];for(let i=0;i<11;i++)filas.push('<tr>'+celdaAct(lista[i],i+1)+celdaAct(lista[i+11],i+12)+'</tr>');
    const pz=o=>((piezas||[]).find(p=>p.orden===o)||{}).descripcion||'';
    const prev=reg.tipo_mtto==='PREVENTIVO',pred=reg.tipo_mtto==='PREDICTIVO',corr=reg.tipo_mtto==='CORRECTIVO';
    const interno=reg.condicion!=='EXTERNO';
    const datos='<table class="datos"><colgroup><col style="width:15%"><col style="width:22%"><col style="width:15%"><col style="width:9%"><col style="width:14%"><col style="width:9%"><col style="width:16%"></colgroup>'+
      '<tr><td><i>Técnico Ejecutor:</i></td><td><u>'+esc(reg.tecnico_senior)+'</u></td><td colspan="2" class="ce"><i>Tipo de Mantenimiento:</i></td><td class="de"><i>Condición:</i></td><td class="de"><i>Fecha:</i></td><td class="de"><u>'+esc(N.ddmmaaaa(reg.fecha))+'</u></td></tr>'+
      '<tr><td><i>Maquinista Ejecutor:</i></td><td><u>'+esc(reg.maquinista)+'</u></td><td>.- Predictivo</td><td>'+raya(pred)+'</td><td>.- Interno '+raya(interno)+'</td><td class="de"><i>Semana:</i></td><td class="de"><u>'+esc(N.etiquetaSemana(reg.semana))+'</u></td></tr>'+
      '<tr><td></td><td></td><td>.- Preventivo</td><td>'+raya(prev)+'</td><td>.- Externo '+raya(!interno)+'</td><td></td><td></td></tr>'+
      '<tr><td></td><td></td><td>.- Correctivo</td><td>'+raya(corr)+'</td><td></td><td class="de"><i>Próxima revisión:</i></td><td class="de"><u>'+esc(N.ddmmaaaa(reg.proxima_revision))+'</u></td></tr>'+
      '<tr><td colspan="7" style="padding:0"><table><colgroup><col style="width:33.33%"><col style="width:33.33%"><col style="width:33.34%"></colgroup><tr><td class="ce"><i>Máquina y/o Equipo:</i><br><u>'+esc(maquina.nombre)+'</u></td><td class="ce"><i>Ubicación en Planta:</i><br><u>'+esc(maquina.planta||'AGUA')+'</u></td><td class="ce"><i>Línea:</i><br><u>'+esc(String(maquina.linea_impresion||'PET').replace(/\s*\d+$/,''))+'</u></td></tr></table></td></tr></table>';
    const colAct='<colgroup><col style="width:8.1%"><col style="width:4.1%"><col style="width:18%"><col style="width:11.7%"><col style="width:7.6%"><col style="width:2.9%"><col style="width:21.5%"><col style="width:13.9%"><col style="width:12.2%"></colgroup>';
    const act='<table class="act">'+colAct+'<tr><th rowspan="12" class="lado">Mantenimiento<br>Preventivo</th><th>Item</th><th>Equipo/Pieza/Sistema</th><th>Actividad</th><th>Frecuencia</th><th>Item</th><th>Equipo/Pieza/Sistema</th><th>Actividad</th><th>Frecuencia</th></tr>'+filas.join('')+'</table>';
    const tp='<table class="tp"><colgroup><col style="width:19.4%"><col style="width:33%"><col style="width:21.4%"><col style="width:26.2%"></colgroup><tr><td>Tiempo Programado</td><td><u>Inicio:</u> '+esc(hora12(reg.hora_inicio_prog))+'</td><td><u>Fin:</u> '+esc(hora12(reg.hora_fin_prog))+'</td><td><u>Horas:</u> '+esc(reg.horas_prog)+'</td></tr></table>';
    const pi='<table class="pi"><colgroup><col style="width:19.4%"><col style="width:22.5%"><col style="width:7.4%"><col style="width:50.7%"></colgroup>'+
      '<tr><th>CAMBIO O REPARACION DE PIEZAS</th><th>INSUMOS QUIMICOS USADOS</th><th></th><th>INFORME FINAL / ESTATUS DE EQUIPO - MAQUINARIA - INSTRUMENTO</th></tr>'+
      [1,2,3,4].map(o=>'<tr><td>'+o+'.- '+esc(pz(o))+'</td><td>'+o+'.- '+esc(insumos[o-1]||'')+'</td>'+(o===1?'<td rowspan="4"></td><td rowspan="4" class="inf">'+esc(reg.informe_final)+'</td>':'')+'</tr>').join('')+'</table>';
    const fir='<table class="fir"><colgroup><col style="width:12.2%"><col style="width:18%"><col style="width:22.2%"><col style="width:21.4%"><col style="width:26.2%"></colgroup>'+
      '<tr><th>VB° GG</th><th>Jefe Mantenimiento</th><th>Supervisor Mantenimiento</th><th>Técnico Mantenimiento Senior</th><th>Maquinista / Técnico Mant. Junior</th></tr>'+
      '<tr><td>'+esc(f.vbGG)+'</td><td>'+esc(f.jefeMantenimiento)+'</td><td>'+esc(f.supervisorMantenimiento)+'</td><td>'+esc(reg.tecnico_senior)+'</td><td>'+esc(reg.maquinista)+'</td></tr></table>';
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>CFA-CA-F-023 · '+esc(maquina.nombre)+' · '+esc(N.etiquetaSemana(reg.semana))+'</title><style>'+CSS+'</style></head><body><div class="hoja">'+
      '<table class="cab"><tr><td class="logo">'+(urlLogo?'<img src="'+esc(urlLogo)+'" alt="">':'')+'</td><td class="tit">REGISTRO DE MANTENIMIENTO Y CALIBRACION</td><td class="cod">CFA - CA - F - 023</td></tr></table>'+
      datos+'<div class="barra">REVISIÓN INICIAL</div>'+
      '<table class="diag"><colgroup><col style="width:10.8%"><col style="width:89.2%"></colgroup><tr><td>DIAGNOSTICO</td><td>ACCION CORRECTIVA / ACTIVIDAD A REALIZAR</td></tr></table>'+
      act+tp+'<div class="barra acc">ACCIONES REALIZADAS</div>'+pi+fir+'</div></body></html>';
  }
  const API={htmlRegistro,hora12,FIRMAS_DEFECTO,INSUMOS_DEFECTO};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;

  /* ---------- navegador: abrir el diálogo de impresión ---------- */
  if(typeof window!=='undefined'&&raiz===window){
    const D=()=>window.glacialMttoPlanDatos;
    API.imprimir=async function(registroId){
      const d=D();if(!d)return;
      let det;try{det=await d.detalleRegistro(registroId);}catch(e){alert('No se pudo preparar el impreso: '+((e&&e.message)||e));return;}
      if(!det)return;
      const reg=det.reg,maq=d.cache.maquinas.find(m=>m.id===reg.maquina_id)||{nombre:'',planta:'AGUA',linea_impresion:'PET'};
      const html=htmlRegistro(reg,maq,det.acts,det.piezas,(d.cache.config&&d.cache.config.datos)||{},new URL('assets/img/mtto-logo.png',location.href).href);
      const f=document.createElement('iframe');f.setAttribute('aria-hidden','true');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      f.onload=()=>setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print();}catch(_){alert('No se pudo abrir la impresión.');}setTimeout(()=>f.remove(),60000);},250);
      f.srcdoc=html;document.body.appendChild(f);
    };
    window.glacialMttoRegistroImpresion=API;
  }else raiz.glacialMttoRegistroImpresionPuro=API;
})(typeof window!=='undefined'?window:globalThis);
