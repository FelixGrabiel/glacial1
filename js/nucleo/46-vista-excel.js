/* =============================================================
   GLACIAL · VISTA PREVIA EN EXCEL (23/11/2026)
   -------------------------------------------------------------
   Muestra un libro de ExcelJS tal como se verá en Excel, sin descargarlo: pestañas de hojas abajo (con su color), letras de
   columna y números de fila, anchos y altos, celdas combinadas, rellenos, fuentes, bordes, alineación, formatos de número
   (miles, decimales, %, hh:mm, fechas), el resultado de las fórmulas, formato condicional (barras de datos y «menor que») e
   imágenes. Lo que se ve es el MISMO libro que se descarga.
   EDITAR (27/11/2026): «✎ Editar» permite cambiar el valor de las celdas (no las que tienen fórmula: esas se recalculan al abrir el Excel).
   Los cambios quedan en el libro que se descarga desde esta ventana; NO cambian los datos del sistema (registros, paletas, paradas).
   Números: se aceptan «1,234.5», «1234,5» y «85%».
   Uso: glacialVistaExcel.abrir(wb, {titulo, nombre, alDescargar, notas, acciones:[{texto, fn}]})  · glacialVistaExcel.html(ws, wb) (para pruebas).
   ============================================================= */
(function instalarVistaExcel(raiz){
  'use strict';
  const PX_CHAR=7.2,PX_PT=1.333,ANCHO_DEF=9.14,ALTO_DEF=15,MAX_FILAS=1500,MAX_COLS=60;
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const letra=n=>{let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};   // 1 → A
  const color=c=>{const a=c&&(c.argb||'');return /^[0-9A-F]{8}$/i.test(a)?'#'+a.slice(2):(/^[0-9A-F]{6}$/i.test(a)?'#'+a:'');};
  const refA=ref=>{const m=/^\$?([A-Z]+)\$?(\d+)$/.exec(String(ref||'').toUpperCase());if(!m)return null;let c=0;for(const ch of m[1])c=c*26+ch.charCodeAt(0)-64;return {c,r:Number(m[2])};};
  const rango=ref=>{const [a,b]=String(ref||'').split(':');const x=refA(a),y=refA(b||a);return x&&y?{top:Math.min(x.r,y.r),left:Math.min(x.c,y.c),bottom:Math.max(x.r,y.r),right:Math.max(x.c,y.c)}:null;};

  /* ---------- valores y formatos de número ---------- */
  function valorCrudo(v){
    if(v===null||v===undefined)return null;
    if(v instanceof Date)return v;
    if(typeof v==='object'){
      if('result' in v||'formula' in v||'sharedFormula' in v)return valorCrudo(v.result===undefined?null:v.result);
      if(Array.isArray(v.richText))return v.richText.map(x=>x.text).join('');
      if('text' in v)return v.text;
      if('error' in v)return v.error;
    }
    return v;
  }
  const fechaExcel=n=>new Date(Math.round((n-25569)*864e5));
  function formatear(v,fmt){
    if(v===null||v===undefined||v==='')return {txt:'',rojo:false};
    if(v instanceof Date){
      const f=String(fmt||'dd/mm/yyyy');const d=v,p=n=>String(n).padStart(2,'0');
      if(/h/i.test(f)&&!/d|y/i.test(f))return {txt:p(d.getUTCHours())+':'+p(d.getUTCMinutes())};
      return {txt:p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+'/'+d.getUTCFullYear()};
    }
    if(typeof v!=='number')return {txt:String(v)};
    let f=String(fmt||'');
    const secciones=f.split(';');
    let rojo=false;
    if(v<0&&secciones.length>1){f=secciones[1];rojo=/\[Red\]/i.test(f);f=f.replace(/\[[^\]]*\]/g,'').replace(/^-/,'');v=Math.abs(v);const r=formatear(v,f);return {txt:'-'+r.txt,rojo};}
    f=secciones[0].replace(/\[[^\]]*\]/g,'');
    if(/^(hh|h):mm/i.test(f)){const min=Math.round((((v%1)+1)%1)*1440);return {txt:String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0')};}
    if(/d{1,2}\/m{1,2}\/y{2,4}|yyyy/i.test(f))return formatear(fechaExcel(v),f);
    const pct=f.includes('%');if(pct)v=v*100;
    const dec=(/\.([0#]+)/.exec(f)||[,''])[1];
    const minDec=(dec.match(/0/g)||[]).length,maxDec=dec.length;
    if(!f||/general/i.test(f))return {txt:Number.isInteger(v)?v.toLocaleString('en-US',{useGrouping:false}):String(Math.round(v*10000)/10000)};
    const miles=/#,##|0,0/.test(f);
    const t=v.toLocaleString('en-US',{minimumFractionDigits:minDec,maximumFractionDigits:maxDec,useGrouping:miles});
    return {txt:t+(pct?'%':'')};
  }
  const numeroDe=v=>{const x=valorCrudo(v);return typeof x==='number'?x:null;};

  /* ---------- una hoja → HTML ---------- */
  function combinadas(ws){
    let lista=[];
    try{if(ws._merges)lista=Object.values(ws._merges).map(m=>m.model||m).filter(Boolean);}catch(_){lista=[];}
    if(!lista.length){try{lista=(ws.model&&ws.model.merges||[]).map(rango).filter(Boolean);}catch(_){lista=[];}}
    return lista.map(m=>({top:m.top,left:m.left,bottom:m.bottom,right:m.right}));
  }
  function reglasCondicionales(ws){
    const out=[];
    (ws.conditionalFormattings||[]).forEach(cf=>{
      String(cf.ref||'').split(/\s+/).forEach(ref=>{const rg=rango(ref);if(rg)(cf.rules||[]).forEach(r=>out.push({rg,regla:r}));});
    });
    return out;
  }
  /* Texto escrito en una celda → valor para el libro: número si la celda era número (o el texto parece número), si no texto. */
  function valorEditado(txt,anterior){
    const t=String(txt==null?'':txt).replace(/\u00a0/g,' ').trim();
    if(t==='')return null;
    const eraNum=typeof valorCrudo(anterior)==='number';
    let n=t.replace(/\s/g,''),pct=false;
    if(/%$/.test(n)){pct=true;n=n.slice(0,-1);}
    if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(n))n=n.replace(/,/g,'');            // 1,234.5
    else if(/^-?\d+,\d+$/.test(n))n=n.replace(',','.');                         // 1234,5
    if(/^-?\d+(\.\d+)?$/.test(n)&&(eraNum||pct||/^-?\d/.test(t))){const x=Number(n);return pct?x/100:x;}
    return t;
  }
  const esFormula=v=>!!(v&&typeof v==='object'&&('formula' in v||'sharedFormula' in v));
  function html(ws,wb,opc){
    const editar=!!(opc&&opc.editar);
    const filas=Math.min(Math.max(ws.rowCount||0,ws.actualRowCount||0,1),MAX_FILAS);
    let cols=Math.max(ws.columnCount||0,1);
    (ws.getImages?ws.getImages():[]).forEach(im=>{const c=Math.ceil((im.range&&im.range.tl&&(im.range.tl.nativeCol!==undefined?im.range.tl.nativeCol:im.range.tl.col))||0)+8;if(c>cols)cols=c;});
    cols=Math.min(cols,MAX_COLS);
    const anchos=[];for(let c=1;c<=cols;c++){const w=ws.getColumn(c).width;anchos[c]=Math.round((w||ANCHO_DEF)*PX_CHAR+5);}
    const altos=[];for(let r=1;r<=filas;r++){const h=ws.getRow(r).height;altos[r]=Math.round((h||ALTO_DEF)*PX_PT);}
    const merges=combinadas(ws),cubierta=new Set(),maestro=new Map();
    merges.forEach(m=>{maestro.set(m.top+':'+m.left,m);for(let r=m.top;r<=m.bottom;r++)for(let c=m.left;c<=m.right;c++)if(r!==m.top||c!==m.left)cubierta.add(r+':'+c);});
    const reglas=reglasCondicionales(ws);
    // máximos para las barras de datos
    reglas.forEach(x=>{if(x.regla.type!=='dataBar')return;let mx=0;for(let r=x.rg.top;r<=x.rg.bottom;r++)for(let c=x.rg.left;c<=x.rg.right;c++){const n=numeroDe(ws.getCell(r,c).value);if(n!==null&&n>mx)mx=n;}
      const cf=x.regla.cfvo||[];const tope=cf[1]&&cf[1].type==='num'?Number(cf[1].value):mx;x.max=tope>0?tope:1;});
    const cuadricula=!(ws.views&&ws.views[0]&&ws.views[0].showGridLines===false);
    const borde=b=>{if(!b||!b.style)return '';const w=/medium|thick|double/.test(b.style)?2:1;return w+'px '+(b.style==='dashed'||b.style==='dotted'?b.style:'solid')+' '+(color(b.color)||'#000');};
    let h=`<table class="vxl-t" style="table-layout:fixed;border-collapse:collapse"><colgroup><col style="width:42px">${anchos.slice(1).map(w=>`<col style="width:${w}px">`).join('')}</colgroup>`;
    h+=`<thead><tr><th class="vxl-esq"></th>${anchos.slice(1).map((_,i)=>`<th class="vxl-col">${letra(i+1)}</th>`).join('')}</tr></thead><tbody>`;
    for(let r=1;r<=filas;r++){
      h+=`<tr style="height:${altos[r]}px"><th class="vxl-fila">${r}</th>`;
      for(let c=1;c<=cols;c++){
        if(cubierta.has(r+':'+c))continue;
        const m=maestro.get(r+':'+c);
        const cel=ws.getCell(r,c),st=cel.style||{};
        const v=valorCrudo(cel.value);
        const fo=formatear(v,cel.numFmt||(st.numFmt));
        const css=[];
        const fg=st.fill&&st.fill.type==='pattern'&&st.fill.pattern==='solid'&&color(st.fill.fgColor);if(fg)css.push('background:'+fg);
        const fn=st.font||{};
        if(fn.bold)css.push('font-weight:700');if(fn.italic)css.push('font-style:italic');
        if(fn.size)css.push('font-size:'+Math.round(fn.size*PX_PT)+'px');
        const fc=color(fn.color);if(fo.rojo)css.push('color:#C00000');else if(fc)css.push('color:'+fc);
        const al=st.alignment||{};
        const hor=al.horizontal||(typeof v==='number'||v instanceof Date?'right':'left');
        css.push('text-align:'+(hor==='centerContinuous'?'center':hor==='fill'||hor==='distributed'||hor==='justify'?'left':hor));
        css.push('vertical-align:'+(al.vertical==='middle'?'middle':al.vertical==='top'?'top':'bottom'));
        css.push(al.wrapText?'white-space:pre-wrap;word-break:break-word':'white-space:nowrap');
        // Como en Excel: un texto sin ajuste y alineado a la izquierda se extiende sobre las celdas vacías de la derecha.
        const desborda=!al.wrapText&&typeof v==='string'&&(css.join(';').includes('text-align:left'))&&!m;
        if(desborda)css.push('overflow:visible');
        if(al.indent)css.push('padding-left:'+(4+al.indent*9)+'px');
        const b=st.border||{};
        const bt=borde(b.top),bb=borde(b.bottom),bl=borde(b.left),br=borde(b.right);
        if(bt)css.push('border-top:'+bt);if(bb)css.push('border-bottom:'+bb);if(bl)css.push('border-left:'+bl);if(br)css.push('border-right:'+br);
        // formato condicional
        let barra='';
        const n=numeroDe(cel.value);
        reglas.forEach(x=>{
          if(r<x.rg.top||r>x.rg.bottom||c<x.rg.left||c>x.rg.right||n===null)return;
          const g=x.regla;
          if(g.type==='dataBar'&&n>0){const pct=Math.max(0,Math.min(100,n/x.max*100));barra=`<span class="vxl-barra" style="width:${pct}%;background:${color(g.color)||'#7FB8D8'}"></span>`;}
          if(g.type==='cellIs'&&g.formulae&&g.formulae.length){const lim=Number(g.formulae[0]);const ok=g.operator==='lessThan'?n<lim:g.operator==='greaterThan'?n>lim:g.operator==='equal'?n===lim:false;
            if(ok&&g.style){const f2=g.style.fill&&color(g.style.fill.fgColor||g.style.fill.bgColor);if(f2)css.push('background:'+f2);const c2=g.style.font&&color(g.style.font.color);if(c2)css.push('color:'+c2);if(g.style.font&&g.style.font.bold)css.push('font-weight:700');}}
        });
        const span=m?` colspan="${Math.min(m.right,cols)-m.left+1}" rowspan="${Math.min(m.bottom,filas)-m.top+1}"`:'';
        const titulo=cel.value&&typeof cel.value==='object'&&cel.value.formula?` title="=${esc(cel.value.formula)}"`:'';
        const ed=editar&&!esFormula(cel.value)?` contenteditable="true" spellcheck="false" data-vxl-r="${r}" data-vxl-c="${c}"`:'';
        h+=`<td${span}${titulo} class="${cuadricula?'vxl-g':''}${barra?' vxl-cb':''}${ed?' vxl-ed':''}${editar&&esFormula(cel.value)?' vxl-fx':''}" style="${css.join(';')}">${barra}<span class="vxl-v"${ed}>${esc(fo.txt)}</span></td>`;
      }
      h+='</tr>';
    }
    h+='</tbody></table>';
    // imágenes (posición aproximada según la celda de arriba a la izquierda)
    const imgs=(ws.getImages?ws.getImages():[]).map(im=>{
      let src='';try{const d=wb.getImage(Number(im.imageId));if(d&&d.base64)src='data:image/'+(d.extension||'png')+';base64,'+String(d.base64).replace(/^data:[^,]+,/,'');
        else if(d&&d.buffer){let bin='';const u8=new Uint8Array(d.buffer);for(let i=0;i<u8.length;i++)bin+=String.fromCharCode(u8[i]);src='data:image/'+(d.extension||'png')+';base64,'+btoa(bin);}}catch(_){src='';}
      if(!src)return '';
      const tl=im.range&&im.range.tl||{};const c0=tl.nativeCol!==undefined?tl.nativeCol:Math.floor(tl.col||0),r0=tl.nativeRow!==undefined?tl.nativeRow:Math.floor(tl.row||0);
      let x=42,y=22;for(let c=1;c<=c0;c++)x+=anchos[c]||Math.round(ANCHO_DEF*PX_CHAR+5);for(let r=1;r<=r0;r++)y+=altos[r]||Math.round(ALTO_DEF*PX_PT);
      const ext=im.range&&im.range.ext||{};let w=ext.width,hh=ext.height;
      if(!w&&im.range&&im.range.br){const br=im.range.br;let x2=42,y2=22;const bc=br.nativeCol!==undefined?br.nativeCol:Math.floor(br.col||0),brr=br.nativeRow!==undefined?br.nativeRow:Math.floor(br.row||0);
        for(let c=1;c<=bc;c++)x2+=anchos[c]||66;for(let r=1;r<=brr;r++)y2+=altos[r]||20;w=x2-x;hh=y2-y;}
      return `<img class="vxl-img" alt="Imagen de la hoja" src="${src}" data-vxl-r="${r0}" data-vxl-c="${c0}" style="left:${x}px;top:${y}px;width:${Math.round(w||480)}px;height:${Math.round(hh||300)}px">`;
    }).join('');
    const aviso=(ws.rowCount||0)>MAX_FILAS?`<div class="vxl-aviso">La vista muestra las primeras ${MAX_FILAS} filas; el Excel tiene ${ws.rowCount}.</div>`:'';
    return `<div class="vxl-hoja">${h}${imgs}</div>${aviso}`;
  }

  /* 25/11/2026: las filas de la vista pueden quedar más altas que en Excel (el texto ajustado las agranda), así que cada imagen se
     ubica en la posición REAL de su fila y columna ya dibujadas (antes se sumaban los altos teóricos y la imagen tapaba la tabla). */
  function ubicarImagenes(hoja,intento){
    const tabla=hoja.querySelector('table');if(!tabla)return;
    // aún no está en pantalla (la ventana se arma antes de agregarse): se espera al siguiente cuadro; mientras, queda la posición estimada
    if(!hoja.isConnected||!tabla.offsetHeight){if((intento||0)<20)requestAnimationFrame(()=>ubicarImagenes(hoja,(intento||0)+1));return;}
    const filas=tabla.querySelectorAll('tbody > tr'),cols=tabla.querySelectorAll('thead th');
    hoja.querySelectorAll('img.vxl-img[data-vxl-r]').forEach(img=>{
      const r=Number(img.getAttribute('data-vxl-r')),c=Number(img.getAttribute('data-vxl-c'));
      const tr=filas[r],th=cols[c+1];
      if(tr)img.style.top=(tabla.offsetTop+tr.offsetTop)+'px';
      if(th)img.style.left=(tabla.offsetLeft+th.offsetLeft)+'px';
    });
  }

  /* ---------- ventana ---------- */
  function estilos(){
    if(document.getElementById('vxl-estilos'))return;
    const s=document.createElement('style');s.id='vxl-estilos';
    s.textContent=`#vxl{position:fixed;inset:0;z-index:2147483100;background:#E9EEF2;display:flex;flex-direction:column;font-family:Arial,Helvetica,sans-serif;color:#1D2B36}
#vxl .vxl-barra-sup{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:calc(8px + env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) 8px max(12px,env(safe-area-inset-left,0px));background:#1D6F42;color:#fff}
#vxl .vxl-barra-sup b{font-size:15px}#vxl .vxl-barra-sup small{opacity:.85;display:block;font-size:12px}
#vxl .vxl-barra-sup .vxl-esp{flex:1}
#vxl .vxl-btn{min-height:38px;padding:0 14px;border-radius:8px;border:2px solid #fff;background:#fff;color:#1D6F42;font-weight:700;font-size:14px;cursor:pointer}
#vxl .vxl-btn.o{background:transparent;color:#fff}
#vxl .vxl-zoom{display:flex;align-items:center;gap:4px}#vxl .vxl-zoom button{min-width:34px;min-height:34px;border-radius:6px;border:1px solid rgba(255,255,255,.6);background:transparent;color:#fff;font-weight:700;cursor:pointer}
#vxl .vxl-notas{background:#FFF8E1;color:#6B4E00;font-size:13px;padding:6px 12px;border-bottom:1px solid #F0D98A}
#vxl .vxl-area{flex:1;overflow:auto;background:#fff;position:relative}
#vxl .vxl-hoja{position:relative;display:inline-block}
#vxl .vxl-t{font-size:12px}
#vxl .vxl-t td{padding:1px 4px;overflow:hidden;position:relative;line-height:1.2}
#vxl .vxl-t td.vxl-g{box-shadow:inset -1px -1px 0 #E3E3E3}
#vxl .vxl-t th{position:sticky;background:#F3F3F3;color:#555;font-weight:400;font-size:11px;border:1px solid #D4D4D4;z-index:2}
#vxl .vxl-col{top:0;height:22px}#vxl .vxl-fila{left:0;text-align:center}#vxl .vxl-esq{top:0;left:0;z-index:3}
#vxl .vxl-barra{position:absolute;left:2px;top:3px;bottom:3px;opacity:.55;border-radius:1px}
#vxl .vxl-v{position:relative}
#vxl .vxl-img{position:absolute;z-index:1;box-shadow:0 0 0 1px #ccc}
#vxl .vxl-pest{display:flex;gap:2px;overflow-x:auto;background:#F3F3F3;border-top:1px solid #CCC;padding:0 max(8px,env(safe-area-inset-right,0px)) env(safe-area-inset-bottom,0px) max(8px,env(safe-area-inset-left,0px))}
#vxl .vxl-pest button{border:0;border-bottom:3px solid transparent;background:transparent;padding:9px 16px;font-size:13px;cursor:pointer;white-space:nowrap;color:#333;min-height:40px}
#vxl .vxl-pest button.act{background:#fff;font-weight:700;color:#1D6F42}
#vxl .vxl-aviso{padding:8px 12px;color:#6B4E00;background:#FFF8E1;font-size:12px}
#vxl .vxl-ed{cursor:text}#vxl .vxl-ed:hover{outline:1px dashed #1D6F42;outline-offset:-1px}#vxl .vxl-ed .vxl-v{display:block;min-height:1em;outline:none}
#vxl .vxl-ed:focus-within{outline:2px solid #1D6F42;outline-offset:-2px;background:#F2FBF5}#vxl .vxl-fx{cursor:not-allowed}
#vxl .vxl-cambiado{background:#FFF4C2!important}#vxl .vxl-btn.act{background:#FFD866;border-color:#FFD866;color:#3A2E00}
@media print{#vxl{display:none!important}}`;
    document.head.appendChild(s);
  }
  function abrir(wb,opc){
    opc=opc||{};
    if(typeof document==='undefined')return;
    estilos();
    cerrar();
    const hojas=(wb.worksheets||[]).filter(Boolean);
    const E={i:0,zoom:1,editar:false,cambios:new Map()};      // cambios: 'hoja|fila|col' → valor nuevo
    const div=document.createElement('div');div.id='vxl';div.setAttribute('role','dialog');div.setAttribute('aria-modal','true');div.setAttribute('aria-label','Vista previa en Excel');
    const pintar=()=>{
      const ws=hojas[E.i];
      div.innerHTML=`<div class="vxl-barra-sup"><div><b>${esc(opc.titulo||'Vista previa')}</b><small>${esc(opc.nombre||'')} · vista previa: así se verá en Excel</small></div><span class="vxl-esp"></span>
        <span class="vxl-zoom" aria-label="Zoom"><button type="button" data-vxl-z="-1" aria-label="Alejar">−</button><span>${Math.round(E.zoom*100)}%</span><button type="button" data-vxl-z="1" aria-label="Acercar">+</button></span>
        ${(opc.acciones||[]).map((a,i)=>`<button type="button" class="vxl-btn o" data-vxl-acc="${i}">${esc(a.texto)}</button>`).join('')}
        <button type="button" class="vxl-btn o${E.editar?' act':''}" data-vxl-ed aria-pressed="${E.editar}">${E.editar?'✓ Editando':'✎ Editar'}</button>
        ${typeof opc.alDescargar==='function'||E.editar||E.cambios.size?`<button type="button" class="vxl-btn" data-vxl-desc>⬇ Descargar Excel${E.cambios.size?' (con '+E.cambios.size+' cambio'+(E.cambios.size===1?'':'s')+')':''}</button>`:''}
        <button type="button" class="vxl-btn o" data-vxl-x>Cerrar</button></div>
        ${E.editar?`<div class="vxl-notas">Toca una celda y escribe. Las celdas con fórmula no se editan (se recalculan al abrir el Excel). Los cambios van en el Excel que descargues desde aquí; no cambian los datos del sistema.${E.cambios.size?' · <b>'+E.cambios.size+' cambio'+(E.cambios.size===1?'':'s')+'</b>':''}</div>`:(opc.notas?`<div class="vxl-notas">${esc(opc.notas)}</div>`:'')}
        <div class="vxl-area">${ws?html(ws,wb,{editar:E.editar}):'<p style="padding:16px">El libro no tiene hojas.</p>'}</div>
        <div class="vxl-pest" role="tablist">${hojas.map((h,i)=>{const tc=color(h.properties&&h.properties.tabColor);return `<button type="button" role="tab" aria-selected="${i===E.i}" class="${i===E.i?'act':''}" data-vxl-h="${i}" style="${tc?'border-bottom-color:'+tc:''}">${esc(h.name)}</button>`;}).join('')}</div>`;
      div.querySelectorAll('.vxl-v[data-vxl-r]').forEach(el=>{if(E.cambios.has(E.i+'|'+el.getAttribute('data-vxl-r')+'|'+el.getAttribute('data-vxl-c')))el.parentElement.classList.add('vxl-cambiado');});
      const hoja=div.querySelector('.vxl-hoja');if(hoja&&E.zoom!==1)hoja.style.zoom=String(E.zoom);   // zoom (no transform): el área de desplazamiento se ajusta
      if(hoja)ubicarImagenes(hoja);
    };
    div.addEventListener('click',async e=>{
      const t=e.target.closest('button');if(!t)return;
      if(t.hasAttribute('data-vxl-x'))return cerrar();
      if(t.hasAttribute('data-vxl-acc')){const a=(opc.acciones||[])[Number(t.getAttribute('data-vxl-acc'))];if(a&&typeof a.fn==='function'){cerrar();a.fn();}return;}
      if(t.hasAttribute('data-vxl-h')){E.i=Number(t.getAttribute('data-vxl-h'));pintar();return;}
      if(t.hasAttribute('data-vxl-z')){E.zoom=Math.max(0.4,Math.min(1.6,Math.round((E.zoom+Number(t.getAttribute('data-vxl-z'))*0.1)*10)/10));pintar();return;}
      if(t.hasAttribute('data-vxl-ed')){E.editar=!E.editar;pintar();return;}
      if(t.hasAttribute('data-vxl-desc')){
        const txt=t.textContent;t.disabled=true;t.textContent='Generando…';
        // Con cambios se descarga ESTE libro (el de alDescargar se volvería a armar con los datos y perdería lo editado).
        try{if(E.cambios.size)await descargarLibro(wb,opc.nombre);else await opc.alDescargar();}
        catch(err){alert('No se pudo descargar: '+((err&&err.message)||err));}
        finally{t.disabled=false;t.textContent=txt;}
      }
    });
    /* Edición: al salir de la celda se guarda el valor en el libro. Enter = confirmar; Esc = deshacer lo escrito. */
    const confirmar=el=>{
      const r=Number(el.getAttribute('data-vxl-r')),c=Number(el.getAttribute('data-vxl-c')),ws=hojas[E.i];if(!ws||!r||!c)return;
      const cel=ws.getCell(r,c),antes=cel.value,nuevo=valorEditado(el.textContent,antes);
      const fo=formatear(valorCrudo(antes),cel.numFmt||(cel.style&&cel.style.numFmt));
      if(String(el.textContent).trim()===String(fo.txt).trim())return;      // sin cambios reales
      cel.value=nuevo;E.cambios.set(E.i+'|'+r+'|'+c,nuevo);
      try{wb.calcProperties=Object.assign({},wb.calcProperties,{fullCalcOnLoad:true});}catch(_){/* versión sin calcProperties */}
      // Sin redibujar la hoja (el foco pasa a la celda siguiente): se marca la celda y se actualizan el contador y el botón.
      el.parentElement.classList.add('vxl-cambiado');
      el.textContent=formatear(valorCrudo(nuevo),cel.numFmt||(cel.style&&cel.style.numFmt)).txt;
      const n=E.cambios.size,tx=n+' cambio'+(n===1?'':'s');
      const d=div.querySelector('[data-vxl-desc]');if(d)d.textContent='⬇ Descargar Excel (con '+tx+')';
      const no=div.querySelector('.vxl-notas');if(no){const b2=no.querySelector('b');if(b2)b2.textContent=tx;else no.insertAdjacentHTML('beforeend',' · <b>'+tx+'</b>');}
    };
    div.addEventListener('focusout',e=>{const el=e.target;if(el&&el.matches&&el.matches('.vxl-v[data-vxl-r]'))confirmar(el);});
    div.addEventListener('keydown',e=>{
      const el=e.target;
      if(el&&el.matches&&el.matches('.vxl-v[data-vxl-r]')){
        if(e.key==='Enter'){e.preventDefault();el.blur();return;}
        if(e.key==='Escape'){e.preventDefault();pintar();return;}      // deshace lo escrito en la celda
        return;
      }
      if(e.key==='Escape')cerrar();
    });
    // en el celular empieza más pequeño para ver más columnas
    if(typeof window!=='undefined'&&window.innerWidth<700)E.zoom=0.6;
    pintar();
    document.body.appendChild(div);
    const x=div.querySelector('[data-vxl-x]');if(x)x.focus();
  }
  function cerrar(){const d=typeof document!=='undefined'&&document.getElementById('vxl');if(d)d.remove();}
  async function descargarLibro(wb,nombre){
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const n=String(nombre||'libro.xlsx').replace(/\.xlsx$/i,'')+' (editado).xlsx';
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=n;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);
  }

  const API={abrir,cerrar,html,formatear,valorCrudo,letra,valorEditado,descargarLibro};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  raiz.glacialVistaExcel=API;
})(typeof window!=='undefined'?window:globalThis);
