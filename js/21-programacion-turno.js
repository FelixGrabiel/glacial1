/* Programación visible en Nuevo registro y Paletas. */
(function instalarProgramacionTurno(){
  'use strict';

  const CSS = `
    .pt-card{flex:1 1 480px;max-width:750px;min-width:0;padding:12px 16px;
      background:#fff;border:1px solid #dce3e8;border-left:4px solid #005b96;
      border-radius:10px;box-shadow:0 2px 8px rgba(0,44,69,.06)}
    .pt-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}
    .pt-title{margin:0;font-size:14px;font-weight:700;color:#003b5c}
    .pt-context{font-size:11px;color:#667784}
    .pt-list{margin-top:8px;display:grid;gap:6px}
    .pt-list.is-expanded{max-height:220px;overflow-y:auto;overscroll-behavior:contain}
    .pt-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) auto;
      gap:8px;margin-top:9px;font-size:10px;font-weight:700;color:#667784}
    .pt-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) auto;
      gap:8px;align-items:center;border-top:1px solid #edf1f4;padding-top:6px;font-size:12px}
    .pt-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pt-row strong{white-space:nowrap;color:#003b5c}
    .pt-empty{font-size:12px;color:#667784;padding-top:8px}
    .pt-more{margin-top:7px;border:0;background:transparent;color:#005b96;
      cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;padding:4px 0}
    .pt-more:hover{text-decoration:underline}
    .pt-overlay{position:fixed;inset:0;z-index:10000;background:rgba(10,30,43,.55);
      display:flex;justify-content:center;align-items:center;padding:18px}
    .pt-dialog{width:min(100%,480px);background:#fff;border-radius:14px;padding:24px;
      color:#172b3a;box-shadow:0 18px 55px rgba(0,0,0,.25)}
    .pt-dialog h3{margin:0 0 10px;font-size:20px;color:#003b5c}
    .pt-dialog p{margin:8px 0;line-height:1.5}
    .pt-dialog ul{padding-left:20px;max-height:40vh;overflow:auto}
    .pt-dialog li{margin:7px 0}
    .pt-dialog button{margin-top:12px;background:#005b96;color:#fff;border:0;
      border-radius:7px;padding:10px 18px;cursor:pointer;font-weight:700}
    @media(max-width:800px){.main-head .pt-card{width:100%;max-width:none;flex-basis:100%}}
    @media(max-width:520px){.pt-columns{display:none}
      .pt-row{grid-template-columns:minmax(0,1fr) auto}
      .pt-row span:nth-child(2){grid-column:1 / -1;grid-row:2}}
  `;

  let ultimaFoto = null;
  let ultimoUsuario = null;
  let claveExpandida = null;
  let focoAnterior = null;

  function instalarEstilo(){
    if(document.getElementById('pt-estilo')) return;
    const style = document.createElement('style');
    style.id = 'pt-estilo';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function contexto(){
    if(!state.user || !['nuevo','paletas'].includes(state.currentTab)) return null;
    if(!visibleLines().some(line => line.key === state.currentLine)) return null;
    if(state.currentTab === 'nuevo' && !permisoPestanaLinea('nuevo')) return null;
    if(state.currentTab === 'paletas' && !puedeAccederPaletas()) return null;

    const formulario = state.currentTab === 'paletas' ? draftPaleta : draft;
    if(!formulario?.fecha || !formulario?.turno) return null;

    return {
      linea:state.currentLine,
      fecha:formulario.fecha,
      turno:formulario.turno
    };
  }

  function claveRegistro(p){
    return [p.linea,p.fecha,p.turno,p.marca,p.presentacion].join('\u0001');
  }

  function unidades(p){
    const cantidad = num(p.cantidadProgramada);
    if(num(p.unidadesPorPaleta) > 0) return cantidad;

    return cantidad *
      (obtenerUnidadesPorPalet(p.linea,p.marca,p.presentacion) || 0);
  }

  function registros(c){
    return loadProgramaciones()
      .filter(p =>
        p.linea === c.linea &&
        p.fecha === c.fecha &&
        p.turno === c.turno &&
        unidades(p) > 0
      )
      .sort((a,b) =>
        String(a.marca || '').localeCompare(String(b.marca || ''),'es') ||
        String(a.presentacion || '')
          .localeCompare(String(b.presentacion || ''),'es')
      );
  }

  function escape(s){
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[c])
    );
  }

  function mostrarTarjeta(){
    const cabecera = document.querySelector('#main .main-head');
    if(!cabecera) return;

    let card = cabecera.querySelector('#pt-programacion-turno');
    const c = contexto();

    if(!c){
      card?.remove();
      return;
    }

    instalarEstilo();

    if(!card){
      card = document.createElement('section');
      card.id = 'pt-programacion-turno';
      card.className = 'pt-card';
      card.setAttribute('aria-label','Programación del turno');
      cabecera.appendChild(card);
    }

    const clave = [c.linea,c.fecha,c.turno].join('|');
    const todas = registros(c);
    const expandida = claveExpandida === clave;
    const visibles = expandida ? todas : todas.slice(0,2);

    card.innerHTML = `
      <div class="pt-top">
        <h3 class="pt-title">Programación del turno</h3>
        <span class="pt-context">
          ${escape(c.turno)} · ${escape(c.fecha)}
        </span>
      </div>

      ${todas.length ? `
        <div class="pt-columns">
          <span>MARCA</span>
          <span>PRESENTACIÓN</span>
          <span>UND PROGRAMADAS</span>
        </div>

        <div class="pt-list${expandida ? ' is-expanded' : ''}">
          ${visibles.map(p => `
            <div class="pt-row">
              <span title="${escape(p.marca)}">
                ${escape(p.marca)}
              </span>
              <span title="${escape(p.presentacion)}">
                ${escape(p.presentacion)}
              </span>
              <strong>
                ${unidades(p).toLocaleString('es-PE')} UND
              </strong>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="pt-empty">
          Aún no hay programación para este turno.
        </div>
      `}

      ${todas.length > 2 ? `
        <button
          type="button"
          class="pt-more"
          aria-expanded="${expandida}"
        >
          ${expandida
            ? 'Mostrar menos'
            : 'Ver toda la programación (' + todas.length + ')'}
        </button>
      ` : ''}
    `;

    card.querySelector('.pt-more')?.addEventListener('click',() => {
      claveExpandida = expandida ? null : clave;
      mostrarTarjeta();
    });
  }

  function mostrarAviso(cambios){
    instalarEstilo();

    let overlay = document.getElementById('pt-aviso-programacion');

    if(!overlay){
      focoAnterior = document.activeElement;

      overlay = document.createElement('div');
      overlay.id = 'pt-aviso-programacion';
      overlay.className = 'pt-overlay';

      overlay.innerHTML = `
        <div
          class="pt-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pt-aviso-titulo"
        >
          <h3 id="pt-aviso-titulo">
            Programación actualizada
          </h3>
          <p>Se modificó la programación de tu turno:</p>
          <ul id="pt-aviso-lista"></ul>
          <button type="button" id="pt-aviso-cerrar">
            Entendido
          </button>
        </div>
      `;

      document.body.appendChild(overlay);

      const cerrar = () => {
        overlay.remove();
        if(focoAnterior?.isConnected) focoAnterior.focus();
      };

      overlay.querySelector('#pt-aviso-cerrar')
        .addEventListener('click',cerrar);

      overlay.addEventListener('keydown',event => {
        if(event.key === 'Escape'){
          event.preventDefault();
          cerrar();
        }

        if(event.key === 'Tab'){
          event.preventDefault();
          overlay.querySelector('#pt-aviso-cerrar').focus();
        }
      });
    }

    const lista = overlay.querySelector('#pt-aviso-lista');

    cambios.forEach(cambio => {
      const li = document.createElement('li');

      li.textContent =
        cambio.marca + ' · ' +
        cambio.presentacion + ': ' +
        cambio.antes.toLocaleString('es-PE') +
        ' → ' +
        cambio.despues.toLocaleString('es-PE') +
        ' UND';

      lista.appendChild(li);
    });

    overlay.querySelector('#pt-aviso-cerrar').focus();
  }

  // La primera lectura no genera una ventana emergente.
  function compararProgramaciones(){
    const usuario =
      state.user?.username ||
      state.user?.nombre ||
      null;

    const foto = new Map(
      loadProgramaciones().map(p => [
        claveRegistro(p),
        {...p}
      ])
    );

    if(usuario !== ultimoUsuario){
      ultimaFoto = null;
      ultimoUsuario = usuario;
    }

    const c = contexto();

    if(
      ultimaFoto &&
      c &&
      tienePermiso('paletas') &&
      !puedeProgramarPaletas()
    ){
      const cambios = [];
      const claves = new Set([
        ...ultimaFoto.keys(),
        ...foto.keys()
      ]);

      claves.forEach(clave => {
        const antes = ultimaFoto.get(clave);
        const despues = foto.get(clave);
        const p = despues || antes;

        if(
          p.linea !== c.linea ||
          p.fecha !== c.fecha ||
          p.turno !== c.turno
        ){
          return;
        }

        const valorAntes = antes ? unidades(antes) : 0;
        const valorDespues = despues ? unidades(despues) : 0;

        if(valorAntes !== valorDespues){
          cambios.push({
            marca:p.marca,
            presentacion:p.presentacion,
            antes:valorAntes,
            despues:valorDespues
          });
        }
      });

      if(cambios.length) mostrarAviso(cambios);
    }

    ultimaFoto = foto;
  }

  const renderMainAnterior = renderMain;

  renderMain = function(...args){
    const resultado = renderMainAnterior.apply(this,args);
    mostrarTarjeta();
    return resultado;
  };

  const renderFormAnterior = renderFormTab;

  renderFormTab = function(...args){
    const resultado = renderFormAnterior.apply(this,args);
    mostrarTarjeta();
    return resultado;
  };

  const renderPaletasAnterior = renderPaletasTab;

  renderPaletasTab = function(...args){
    const resultado = renderPaletasAnterior.apply(this,args);
    mostrarTarjeta();
    return resultado;
  };

  const onProgramacionesAnterior = onProgramacionesUpdated;

  onProgramacionesUpdated = function(...args){
    const resultado = onProgramacionesAnterior.apply(this,args);
    compararProgramaciones();
    mostrarTarjeta();
    return resultado;
  };
})();