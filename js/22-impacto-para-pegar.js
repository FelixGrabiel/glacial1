/* Pegar en js/22-impacto-para-pegar.js; cargar después de 15-perdidas-soles.js. */
(function instalarImpactoCorregido(){
  'use strict';
  // La versión completa de 15 ya incluye estos cambios.

  const LINEAS = [
    ['PET1','PET 1','botellas'], ['PET2','PET 2','botellas'],
    ['B7L','Bidones 7 L','bidones'], ['C20L','Cajas 20 L','cajas'],
    ['B20L','Bidones 20 L','bidones'], ['B10L','Bidones 10 L','bidones']
  ];
  const MAQUINAS = ['Etiquetadora','Empaquetadora','Sopladora',
    'Envasadora','Calidad','Producción','Otros / sin clasificar'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = v => Math.max(0,num(v));
  const f = v => Math.round(v).toLocaleString('es-PE');
  const soles = v => 'S/ ' + v.toLocaleString('es-PE',
    {minimumFractionDigits:2,maximumFractionDigits:2});

  function lineaReal(rec,c){
    if(rec.linea !== 'B7L') return rec.linea;
    const p = normalizarTexto(c.presentacion || rec.presentacion);
    return /(?:^|[^0-9])(?:10000\s*ml|10\s*l)(?:[^0-9]|$)/i.test(p)
      ? 'B10L' : 'B7L';
  }

  function precio(linea){
    return linea === 'B10L'
      ? n(loadPrecios().B10L ?? precioUnitarioLinea('B7L'))
      : n(precioUnitarioLinea(linea));
  }

  function sumar(dest,min,und,money){
    dest.minutos += min; dest.unidades += und; dest.dinero += money;
  }

  // Una fuente de datos para totales, tablas y gráficos.
  agruparParadasNoProgramadas = function(records){
    const permitidas = new Set(visibleLines().map(l=>l.key));
    const porLinea = {}, porCategoria = {}, porCausa = {}, porFecha = {};
    const porLineaMaquina = {};

    LINEAS.forEach(([key,nombre,unidad]) => {
      if(permitidas.has(key) || key === 'B10L' && permitidas.has('B7L'))
        porLinea[key] = {
          linea:key,nombre,unidad,minutos:0,unidades:0,dinero:0,paradas:0
        };
    });

    let totalMinutos=0,totalUnidades=0,totalDinero=0,totalParadas=0;
    let sinCategoriaCount=0,sinRatioCount=0,minutosSinRatio=0;

    records.forEach(rec => {
      const cuadros = Array.isArray(rec.cuadros) && rec.cuadros.length
        ? rec.cuadros : [rec];

      cuadros.forEach(c => (c.paradasNoProgramadas || []).forEach(p => {
        const min = n(p.tiempoMin);
        if(!min) return;

        const linea = lineaReal(rec,c);
        const ratio = n(c.ratioNominal ?? obtenerRatioNominal(
          rec.linea,c.presentacion || rec.presentacion,c.marca || rec.marca));

        if(!ratio){
          sinRatioCount++;
          minutosSinRatio += min;
        }

        const und = ratio * min / 60;
        const money = und * precio(linea);
        const descripcion = String(p.descripcion || '').trim()
          || 'Sin descripción';
        const maquina = MAQUINAS.includes(p.maquina) ? p.maquina
          : categorizarParadaPorTexto(descripcion);

        if(maquina === 'Otros / sin clasificar') sinCategoriaCount++;

        if(!porLinea[linea]) porLinea[linea] = {
          linea,nombre:linea,unidad:'UND',
          minutos:0,unidades:0,dinero:0,paradas:0
        };
        sumar(porLinea[linea],min,und,money);
        porLinea[linea].paradas++;

        if(!porCategoria[maquina]) porCategoria[maquina] = {
          categoria:maquina,minutos:0,unidades:0,dinero:0,veces:0
        };
        sumar(porCategoria[maquina],min,und,money);
        porCategoria[maquina].veces++;

        const lm = linea + '|' + maquina;
        if(!porLineaMaquina[lm]) porLineaMaquina[lm] = {
          linea,categoria:maquina,minutos:0,unidades:0,dinero:0,veces:0
        };
        sumar(porLineaMaquina[lm],min,und,money);
        porLineaMaquina[lm].veces++;

        const causa = linea + '|' + descripcion;
        if(!porCausa[causa]) porCausa[causa] = {
          linea,descripcion,categoria:maquina,
          minutos:0,unidades:0,dinero:0,veces:0
        };
        sumar(porCausa[causa],min,und,money);
        porCausa[causa].veces++;

        const fecha = rec.fecha || 'Sin fecha';
        if(!porFecha[fecha]) porFecha[fecha] = {
          fecha,minutos:0,unidades:0,dinero:0
        };
        sumar(porFecha[fecha],min,und,money);

        totalMinutos += min;
        totalUnidades += und;
        totalDinero += money;
        totalParadas++;
      }));
    });

    const ordenar = o => Object.values(o).sort((a,b)=>b.dinero-a.dinero);
    return {
      filasLinea:totalParadas ? Object.values(porLinea) : [],
      filasCategoria:ordenar(porCategoria),
      filasCausa:ordenar(porCausa),
      filasLineaMaquina:Object.values(porLineaMaquina)
        .sort((a,b)=>b.unidades-a.unidades),
      filasFecha:Object.values(porFecha)
        .filter(x=>x.fecha!=='Sin fecha')
        .sort((a,b)=>a.fecha.localeCompare(b.fecha)),
      totalMinutos,totalUnidades,totalDinero,totalParadas,
      sinCategoriaCount,sinRatioCount,minutosSinRatio
    };
  };

  // Permite indicar la máquina en cada parada no programada.
  const tablaAnterior = paradasTableCuadro;
  paradasTableCuadro = function(key,rows,cuadroIndex){
    const html = tablaAnterior.apply(this,arguments);
    if(key !== 'paradasNoProgramadas') return html;

    const temp = document.createElement('div');
    temp.innerHTML = html;
    const tabla = temp.querySelector('table');

    if(!tabla || tabla.textContent.includes('Máquina / área')) return html;
    tabla.style.minWidth = '760px';

    const cabecera = [...tabla.querySelectorAll('thead th')]
      .find(th=>th.textContent.trim()==='Causa');
    if(!cabecera) return html;

    cabecera.insertAdjacentHTML('beforebegin','<th>Máquina / área</th>');

    [...tabla.querySelectorAll('tbody tr')].forEach((tr,i)=>{
      const causa = tr.querySelector('select[onchange*="causa"]');
      if(!causa) return;

      const actual = rows?.[i]?.maquina || '';
      const opciones = ['',...MAQUINAS].map(m=>`
        <option value="${esc(m)}" ${m===actual?'selected':''}>
          ${esc(m || 'Sin identificar')}
        </option>`).join('');

      causa.closest('td').insertAdjacentHTML('beforebegin',`
        <td>
          <select aria-label="Máquina o área" style="width:100%"
            onchange="updateArrItemCuadro(${cuadroIndex},'${key}',${i},'maquina',this.value)">
            ${opciones}
          </select>
        </td>`);
    });

    return temp.innerHTML;
  };

  // Añade el desglose y los gráficos de unidades al reporte existente.
  const renderAnterior = renderPerdidasSoles;
  renderPerdidasSoles = function(main){
    renderAnterior.apply(this,arguments);
    const root=main?.querySelector('#perdidas-soles-view');
if(!root)return;

const graficoUndActual=root.querySelector('#chart-pd-linea-und');
if(graficoUndActual && typeof Chart!=='undefined' &&
   Chart.getChart && Chart.getChart(graficoUndActual))return;

    const permitidas = visibleLines().map(l=>l.key);
    const records = filtrarPorRangoPerdidas(loadRecords().filter(r=>
      permitidas.includes(r.linea) ||
      r.linea==='B10L' && tienePermiso('todasLasLineas')));
    const d = agruparParadasNoProgramadas(records);

    if(!document.getElementById('impacto-estilos-extra')){
      const style = document.createElement('style');
      style.id = 'impacto-estilos-extra';
      style.textContent =
        '.pd-formula-extra{padding:12px 16px;margin:12px 0;' +
        'background:#f3f8fc;border:1px solid #dce9f4;border-radius:10px;' +
        'font-size:13px;line-height:1.5}' +
        '.pd-scroll-extra{overflow-x:auto}' +
        '.pd-scroll-extra table{min-width:690px}';
      document.head.appendChild(style);
    }

    root.querySelector('.pd-kpis')?.insertAdjacentHTML('afterend',`
      <div class="pd-formula-extra">
        <b>Fórmula:</b> UND no producidas =
        ratio nominal (UND/h) × minutos de parada no programada ÷ 60.
        S/ estimados = UND × precio por línea.
        PET cuenta botellas; B7L, B10L y B20L cuentan bidones;
        C20L cuenta cajas. Las máquinas de reportes antiguos
        se infieren de la descripción.
      </div>`);

    const panel = [...root.querySelectorAll('.panel')].find(p=>
      p.querySelector('.panel-head')?.textContent.includes('Pérdida por línea'));

    if(panel){
      const body = panel.querySelector('.panel-body');
      body.innerHTML = d.totalParadas ? `
        <div class="pd-scroll-extra"><table class="pd-table">
          <thead><tr>
            <th>Línea</th><th>Unidad</th><th>Paradas</th>
            <th>Minutos</th><th>UND no producidas</th>
            <th>Precio UND</th><th>S/ estimados</th>
          </tr></thead>
          <tbody>
            ${d.filasLinea.map(x=>`<tr>
              <td>${esc(x.nombre)}</td><td>${esc(x.unidad)}</td>
              <td>${f(x.paradas)}</td><td>${f(x.minutos)}</td>
              <td>${f(x.unidades)}</td>
              <td>${soles(precio(x.linea))}
                ${x.linea==='B10L' && loadPrecios().B10L==null
                  ? ' (precio B7L)' : ''}
              </td>
              <td>${soles(x.dinero)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`
        : '<p>Sin paradas no programadas en el rango.</p>';

      panel.insertAdjacentHTML('afterend',`
        <div class="panel" style="margin-top:16px">
          <div class="panel-head">
            <h4>UND y S/ por línea y máquina / área</h4>
          </div>
          <div class="panel-body pd-scroll-extra">
            <table class="pd-table">
              <thead><tr>
                <th>Línea</th><th>Máquina / área</th><th>Paradas</th>
                <th>Minutos</th><th>UND</th><th>S/</th>
              </tr></thead>
              <tbody>
                ${d.filasLineaMaquina.map(x=>`<tr>
                  <td>${esc(x.linea)}</td><td>${esc(x.categoria)}</td>
                  <td>${f(x.veces)}</td><td>${f(x.minutos)}</td>
                  <td>${f(x.unidades)}</td><td>${soles(x.dinero)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`);
    }

    if(d.sinRatioCount){
      root.querySelector('.pd-kpis')?.insertAdjacentHTML('afterend',`
        <div class="pd-aviso">
          ${d.sinRatioCount} parada(s), ${f(d.minutosSinRatio)} min,
          sin ratio nominal: sus UND y S/ no se pueden calcular
          hasta corregirlo.
        </div>`);
    }

    const grid = root.querySelector('.chart-grid');
    if(!grid) return;

    const mostrarGrafico = (id,titulo,labels,values,tipo='bar')=>{
      grid.insertAdjacentHTML('beforeend',`
        <div class="chart-box">
          <h4>${titulo}</h4><canvas id="${id}"></canvas>
        </div>`);

      if(!d.totalParadas || !values.length) return;

      state.charts[id] = new Chart(document.getElementById(id),{
        type:tipo,
        data:{
          labels,
          datasets:[{
            label:'UND no producidas',
            data:values,
            backgroundColor:'#139cbb',
            borderColor:'#005b96',
            borderWidth:2,
            borderRadius:4
          }]
        },
        options:{
          indexAxis:tipo==='bar'?'y':'x',
          plugins:{
            legend:{display:false},
            tooltip:{
              callbacks:{
                label:ctx=>f(tipo==='bar'
                  ? ctx.parsed.x : ctx.parsed.y)+' UND'
              }
            }
          },
          scales:{
            x:{beginAtZero:tipo==='bar'},
            y:{beginAtZero:tipo!=='bar'}
          }
        }
      });
    };

    mostrarGrafico('pd-und-linea-extra',
      'UND no producidas por línea',
      d.filasLinea.map(x=>x.nombre),
      d.filasLinea.map(x=>x.unidades));

    mostrarGrafico('pd-und-maquina-extra',
      'UND no producidas por máquina / área',
      d.filasCategoria.map(x=>x.categoria),
      d.filasCategoria.map(x=>x.unidades));

    if(d.filasFecha.length>1){
      mostrarGrafico('pd-und-dia-extra',
        'UND no producidas por día',
        d.filasFecha.map(x=>x.fecha),
        d.filasFecha.map(x=>x.unidades),
        'line');
    }
  };
})();