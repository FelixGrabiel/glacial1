/* =============================================================
   FORMULARIO DE NUEVO REGISTRO (KPI, inputs, tablas, guardar)
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   STATUS
   ========================================================= */

function statusClass(v){

  return v >= 0.85

    ? 'is-good'

    : v >= 0.6

      ? 'is-warn'

      : 'is-bad';

}


function badgeClass(v){

  return v >= 0.85

    ? 'good'

    : v >= 0.6

      ? 'warn'

      : 'bad';

}


/* =========================================================
   CÁLCULOS OEE
   ========================================================= */

function calcDerivedLegacy(r){

  const horasTurno = num(r.horasTurno);
  const pProg = num((r.paradasProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0)) / 60;
  const pNoProg = num((r.paradasNoProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0)) / 60;
  const horasEfectivas = Math.max(horasTurno - pProg - pNoProg, 0);
  const ratio = num(r.ratioNominal);
  const produccionNominal = ratio * horasEfectivas;
  const efectiva = num(r.produccion?.efectiva);
  const programada = num(r.produccion?.programada);
  const sopladas = num(r.produccion?.sopladas);

  /* El campo "Botellas calidad" es la cantidad de botellas RECHAZADAS (no conformes). */
  const rechazadas = num(r.produccion?.calidad);
  const calidadBot = Math.max(sopladas - rechazadas, 0); /* botellas conformes */

  const disponibilidad = horasTurno > 0 ? horasEfectivas / horasTurno : 0;
  const rendimiento = produccionNominal > 0 ? Math.min(efectiva / produccionNominal, 1) : 0;
  const calidad = sopladas > 0 ? Math.min(calidadBot / sopladas, 1) : (efectiva > 0 ? 1 : 0);
  const oee = disponibilidad * rendimiento * calidad;
  const cumplimiento = programada > 0 ? efectiva / programada : 0;
  const eficiencia = produccionNominal > 0 ? efectiva / produccionNominal : 0;
  const noCumplida = Math.max(produccionNominal - efectiva, 0);
  const ratioEfectivo = horasEfectivas > 0 ? efectiva / horasEfectivas : 0;

  return {
    horasEfectivas,
    produccionNominal,
    disponibilidad,
    rendimiento,
    calidad,
    oee,
    cumplimiento,
    eficiencia,
    noCumplida,
    ratioEfectivo,
    pProg,
    pNoProg,
    rechazadas,
    calidadBot
  };
}


function calcDerivedCuadro(cuadro){

  const horasTurno = num(cuadro?.horasTurno);
  const pProg = num((cuadro?.paradasProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0)) / 60;
  const pNoProg = num((cuadro?.paradasNoProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0)) / 60;
  const horasEfectivas = Math.max(horasTurno - pProg - pNoProg, 0);
  const ratio = num(cuadro?.ratioNominal);
  const produccionNominal = ratio * horasEfectivas;
  const efectiva = num(cuadro?.produccion?.efectiva);
  const programada = num(cuadro?.produccion?.programada);
  const sopladas = num(cuadro?.produccion?.sopladas);

  /* El campo "Botellas calidad" es la cantidad de botellas RECHAZADAS (no conformes). */
  const rechazadas = num(cuadro?.produccion?.calidad);
  const calidadBot = Math.max(sopladas - rechazadas, 0); /* botellas conformes */

  const disponibilidad = horasTurno > 0 ? horasEfectivas / horasTurno : 0;
  const rendimiento = produccionNominal > 0 ? Math.min(efectiva / produccionNominal, 1) : 0;
  const calidad = sopladas > 0 ? Math.min(calidadBot / sopladas, 1) : (efectiva > 0 ? 1 : 0);
  const oee = disponibilidad * rendimiento * calidad;
  const cumplimiento = programada > 0 ? efectiva / programada : 0;
  const eficiencia = produccionNominal > 0 ? efectiva / produccionNominal : 0;
  const noCumplida = Math.max(produccionNominal - efectiva, 0);
  const ratioEfectivo = horasEfectivas > 0 ? efectiva / horasEfectivas : 0;

  return {
    horasEfectivas,
    produccionNominal,
    disponibilidad,
    rendimiento,
    calidad,
    oee,
    cumplimiento,
    eficiencia,
    noCumplida,
    ratioEfectivo,
    pProg,
    pNoProg,
    rechazadas,
    calidadBot
  };
}


function calcDerivedMulti(r){

  const cuadros = Array.isArray(r?.cuadros) ? r.cuadros : [];
  const ds = cuadros.map(calcDerivedCuadro);

  const horasTurno = ds.reduce((a,d) => a + num(d.horasEfectivas + d.pProg + d.pNoProg), 0);
  const horasEfectivas = ds.reduce((a,d) => a + num(d.horasEfectivas), 0);
  const produccionNominal = ds.reduce((a,d) => a + num(d.produccionNominal), 0);
  const efectiva = cuadros.reduce((a,c) => a + num(c?.produccion?.efectiva), 0);
  const programada = cuadros.reduce((a,c) => a + num(c?.produccion?.programada), 0);
  const sopladas = cuadros.reduce((a,c) => a + num(c?.produccion?.sopladas), 0);

  /* Rechazadas: suma del campo "Botellas calidad". Conformes: sopladas - rechazadas, cuadro por cuadro. */
  const rechazadas = cuadros.reduce((a,c) => a + num(c?.produccion?.calidad), 0);
  const calidadBot = ds.reduce((a,d) => a + num(d.calidadBot), 0);

  const pProg = ds.reduce((a,d) => a + num(d.pProg), 0);
  const pNoProg = ds.reduce((a,d) => a + num(d.pNoProg), 0);

  const disponibilidad = horasTurno > 0 ? horasEfectivas / horasTurno : 0;
  const rendimiento = produccionNominal > 0 ? Math.min(efectiva / produccionNominal, 1) : 0;
  const calidad = sopladas > 0 ? Math.min(calidadBot / sopladas, 1) : (efectiva > 0 ? 1 : 0);
  const oee = disponibilidad * rendimiento * calidad;
  const cumplimiento = programada > 0 ? efectiva / programada : 0;
  const eficiencia = produccionNominal > 0 ? efectiva / produccionNominal : 0;
  const noCumplida = Math.max(produccionNominal - efectiva, 0);
  const ratioEfectivo = horasEfectivas > 0 ? efectiva / horasEfectivas : 0;

  return {
    horasTurno,
    horasEfectivas,
    produccionNominal,
    disponibilidad,
    rendimiento,
    calidad,
    oee,
    cumplimiento,
    eficiencia,
    noCumplida,
    ratioEfectivo,
    pProg,
    pNoProg,
    efectiva,
    programada,
    sopladas,
    calidadBot,
    rechazadas,
    cuadros: ds
  };
}


function calcDerived(r){
  return Array.isArray(r?.cuadros)
    ? calcDerivedMulti(r)
    : calcDerivedLegacy(r);
}


/* =========================================================
   CLOUDINARY — EVIDENCIAS HOJAS DE PRODUCTO TERMINADO
   ========================================================= */

const CLOUDINARY_CLOUD_NAME = 'c0vr6joq';

const CLOUDINARY_UPLOAD_PRESET = 'glacial_pt';

const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;


/*
   Evita que el usuario pueda hacer doble clic en
   "Guardar registro" mientras las fotos están subiendo.
*/
let guardandoRegistro = false;


/*
   Genera un ID único para cada evidencia.
*/
function generarIdEvidenciaPT(){

  return 'pt_' +
    Date.now() +
    '_' +
    Math.random()
      .toString(36)
      .slice(2,8);

}


/*
   Escapa texto para evitar que nombres de archivos
   rompan el HTML de las vistas previas.
*/
function escapeHtmlPT(value){

  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');

}


/*
   Libera las URLs temporales creadas para las vistas previas.
*/
function liberarPreviewsEvidenciasPT(evidencias){

  (evidencias || []).forEach(e => {

    if(e?.previewUrl){

      try{

        URL.revokeObjectURL(
          e.previewUrl
        );

      }catch(error){}

    }

  });

}


/*
   Comprime una imagen antes de enviarla a Cloudinary.

   Máximo:
   1600 px en su lado mayor.

   Calidad:
   JPEG 75%.
*/
function comprimirImagenPT(
  file,
  maxDimension = 1600,
  quality = 0.75
){

  return new Promise((resolve,reject)=>{

    if(
      !file ||
      !file.type ||
      !file.type.startsWith('image/')
    ){

      reject(
        new Error(
          'El archivo seleccionado no es una imagen válida.'
        )
      );

      return;

    }


    const reader =
      new FileReader();


    reader.onload = e => {

      const img =
        new Image();


      img.onload = () => {

        const mayor =
          Math.max(
            img.width,
            img.height
          );


        const escala =
          mayor > maxDimension
            ? maxDimension / mayor
            : 1;


        const canvas =
          document.createElement(
            'canvas'
          );


        canvas.width =
          Math.max(
            1,
            Math.round(
              img.width * escala
            )
          );


        canvas.height =
          Math.max(
            1,
            Math.round(
              img.height * escala
            )
          );


        const ctx =
          canvas.getContext('2d');


        ctx.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        );


        canvas.toBlob(
          blob => {

            if(!blob){

              reject(
                new Error(
                  'No se pudo comprimir la imagen.'
                )
              );

              return;

            }


            resolve({

              blob,

              previewUrl:
                URL.createObjectURL(
                  blob
                ),

              width:
                canvas.width,

              height:
                canvas.height

            });

          },
          'image/jpeg',
          quality
        );

      };


      img.onerror = () => {

        reject(
          new Error(
            'No se pudo leer la imagen.'
          )
        );

      };


      img.src =
        e.target.result;

    };


    reader.onerror = () => {

      reject(
        new Error(
          'No se pudo leer el archivo.'
        )
      );

    };


    reader.readAsDataURL(file);

  });

}


/*
   Maneja la selección de fotografías.
*/
async function handleEvidenciasPT(event){

  if(!draft){
    return;
  }


  const files =
    Array.from(
      event.target.files || []
    );


  if(!files.length){
    return;
  }


  if(!Array.isArray(draft.evidenciasPT)){

    draft.evidenciasPT = [];

  }


  let agregadas = 0;


  for(const file of files){

    try{

      /*
         Límite preventivo antes de comprimir.
      */
      if(
        file.size >
        15 * 1024 * 1024
      ){

        throw new Error(
          'La imagen supera los 15 MB.'
        );

      }


      /*
         Solo imágenes.
      */
      if(
        !file.type ||
        !file.type.startsWith('image/')
      ){

        throw new Error(
          'El archivo seleccionado no es una imagen.'
        );

      }


      const imagen =
        await comprimirImagenPT(
          file
        );


      draft.evidenciasPT.push({

        id:
          generarIdEvidenciaPT(),

        nombre:
          file.name,

        tipo:
          'image/jpeg',

        blob:
          imagen.blob,

        previewUrl:
          imagen.previewUrl,

        width:
          imagen.width,

        height:
          imagen.height

      });


      agregadas++;

    }catch(error){

      console.error(
        'Error procesando evidencia PT:',
        error
      );

    }

  }


  /*
     Permite volver a seleccionar el mismo archivo
     si el usuario lo elimina y quiere volver a agregarlo.
  */
  event.target.value = '';


  renderFormTab();


  if(
    agregadas <
    files.length
  ){

    alert(
      'Algunas imágenes no pudieron ser procesadas.'
    );

  }

}


/*
   Elimina una fotografía del formulario
   antes de subirla a Cloudinary.
*/
function removeEvidenciaPT(index){

  if(
    !draft ||
    !Array.isArray(draft.evidenciasPT) ||
    !draft.evidenciasPT[index]
  ){

    return;

  }


  const evidencia =
    draft.evidenciasPT[index];


  if(evidencia.previewUrl){

    try{

      URL.revokeObjectURL(
        evidencia.previewUrl
      );

    }catch(error){}

  }


  draft.evidenciasPT.splice(
    index,
    1
  );


  renderFormTab();

}


/*
   Renderiza el panel de evidencias.
*/
function renderEvidenciasPT(){

  const fotos =
    Array.isArray(draft?.evidenciasPT)
      ? draft.evidenciasPT
      : [];


  const tieneFotos =
    fotos.length > 0;


  return `

    <div
      class="panel"
      style="
        margin-top:14px;
        border-left:4px solid ${
          tieneFotos
            ? '#20a86b'
            : '#d64545'
        };
      "
    >

      <div class="panel-head">

        <div>

          <h3 style="margin:0;">
            📷 Hojas de Producto Terminado
          </h3>

          <div
            style="
              font-size:12px;
              color:#6b7780;
              margin-top:3px;
            "
          >
            Evidencia fotográfica obligatoria
            para guardar el reporte.
          </div>

        </div>


        <strong
          style="
            font-size:12px;
            color:${
              tieneFotos
                ? '#168052'
                : '#c0392b'
            };
          "
        >

          ${
            tieneFotos

              ? `✓ ${fotos.length}
                 foto${fotos.length === 1 ? '' : 's'}
                 adjunta${fotos.length === 1 ? '' : 's'}`

              : '⚠ 0 fotos'

          }

        </strong>

      </div>


      <div class="panel-body">

        <input
          id="evidencias-pt-input"
          type="file"
          accept="image/*"
          multiple
          style="display:none;"
          onchange="handleEvidenciasPT(event)"
        >


        <button
          type="button"
          class="btn btn-primary"
          onclick="
            document
              .getElementById('evidencias-pt-input')
              .click()
          "
        >
          📷 Seleccionar fotografías
        </button>


        <div
          style="
            margin-top:8px;
            font-size:12px;
            color:#6b7780;
          "
        >
          Puedes seleccionar una o varias fotos.
          Las imágenes se comprimirán
          automáticamente antes de subirlas.
        </div>


        ${
          fotos.length

            ? `

              <div
                style="
                  display:grid;
                  grid-template-columns:
                    repeat(
                      auto-fill,
                      minmax(140px,1fr)
                    );
                  gap:10px;
                  margin-top:14px;
                "
              >

                ${

                  fotos.map(
                    (foto,i) => `

                      <div
                        style="
                          position:relative;
                          border:1px solid #D7DBD4;
                          border-radius:8px;
                          overflow:hidden;
                          background:#F7F9FA;
                        "
                      >

                        <img
                          src="${
                            escapeHtmlPT(
                              foto.previewUrl ||
                              foto.url ||
                              ''
                            )
                          }"
                          alt="
                            Hoja de Producto
                            Terminado ${i+1}
                          "
                          style="
                            display:block;
                            width:100%;
                            height:120px;
                            object-fit:cover;
                            background:#eee;
                          "
                        >


                        <button
                          type="button"
                          onclick="
                            removeEvidenciaPT(${i})
                          "
                          title="Eliminar fotografía"
                          style="
                            position:absolute;
                            top:6px;
                            right:6px;
                            width:28px;
                            height:28px;
                            border:0;
                            border-radius:50%;
                            background:
                              rgba(0,0,0,.65);
                            color:#fff;
                            cursor:pointer;
                            font-weight:700;
                          "
                        >
                          ✕
                        </button>


                        <div
                          style="
                            padding:7px;
                            font-size:11px;
                            white-space:nowrap;
                            overflow:hidden;
                            text-overflow:ellipsis;
                          "
                          title="${
                            escapeHtmlPT(
                              foto.nombre || ''
                            )
                          }"
                        >
                          ${
                            escapeHtmlPT(
                              foto.nombre ||
                              `Foto ${i+1}`
                            )
                          }
                        </div>

                      </div>

                    `
                  ).join('')

                }

              </div>

            `

            : `

              <div
                style="
                  margin-top:12px;
                  padding:12px;
                  border-radius:8px;
                  background:#FFF4F4;
                  color:#A33A3A;
                  font-size:13px;
                "
              >
                Debes adjuntar al menos una
                fotografía de las Hojas de Producto
                Terminado para poder guardar el registro.
              </div>

            `

        }

      </div>

    </div>

  `;

}


/*
   Sube las fotografías a Cloudinary.

   IMPORTANTE:
   El API Secret de Cloudinary NO se utiliza aquí.
   El preset es UNSIGNED.
*/
async function subirEvidenciasPT(recordId){

  const fotos =
    Array.isArray(draft?.evidenciasPT)
      ? draft.evidenciasPT
      : [];


  const subidas = [];


  for(
    let i = 0;
    i < fotos.length;
    i++
  ){

    const foto =
      fotos[i];


    /*
       Si por alguna razón la foto ya tiene URL
       y no tiene Blob, conservamos la referencia.
    */
    if(
      foto.url &&
      !foto.blob
    ){

      subidas.push({

        id:
          foto.id,

        nombre:
          foto.nombre,

        tipo:
          foto.tipo ||
          'image/jpeg',

        url:
          foto.url,

        publicId:
          foto.publicId ||
          '',

        fecha:
          foto.fecha ||
          new Date().toISOString()

      });


      continue;

    }


    if(!foto.blob){

      throw new Error(
        `La fotografía ${i+1} no está disponible para subir.`
      );

    }


    const formData =
      new FormData();


    formData.append(
      'file',
      foto.blob
    );


    formData.append(
      'upload_preset',
      CLOUDINARY_UPLOAD_PRESET
    );


    /*
       Cada registro queda agrupado
       en su propia carpeta.
    */
    formData.append(
      'folder',
      `hojas_producto_terminado/${recordId}`
    );


    /*
       Guardamos contexto sencillo.
       Se reemplazan | y = para evitar
       problemas con el formato de Cloudinary.
    */
    const nombreOriginal =
      String(
        foto.nombre || ''
      )
      .replace(/[|=]/g,'_');


    formData.append(
      'context',
      `recordId=${recordId}|originalName=${nombreOriginal}`
    );


    const response =
      await fetch(
        CLOUDINARY_UPLOAD_URL,
        {
          method:'POST',
          body:formData
        }
      );


    let data = {};


    try{

      data =
        await response.json();

    }catch(error){

      data = {};

    }


    if(
      !response.ok ||
      !data.secure_url
    ){

      throw new Error(
        data?.error?.message ||
        `Cloudinary rechazó la fotografía ${i+1}.`
      );

    }


    subidas.push({

      id:
        foto.id,

      nombre:
        foto.nombre ||
        `Foto ${i+1}`,

      tipo:
        data.resource_type
          ? `${data.resource_type}/${data.format || 'jpeg'}`
          : 'image/jpeg',

      url:
        data.secure_url,

      publicId:
        data.public_id ||
        '',

      fecha:
        new Date().toISOString()

    });

  }


  return subidas;

}


/* =========================================================
   REGISTRO VACÍO
   ========================================================= */

function blankCuadro(lineKey, numero){

  const marcas =
    MARCAS_POR_LINEA[lineKey] || [];

  const presentaciones =
    PRESENTACIONES_POR_LINEA[lineKey] || [];

  const activo =
    numero === 1;

  const marca =
    activo && marcas.length
      ? marcas[0]
      : '';

  const presentacion =
    activo && presentaciones.length
      ? presentaciones[0]
      : '';

  const horaInicio =
    activo
      ? '07:00'
      : '';

  const horaFin =
    activo
      ? '19:00'
      : '';


  return {

    numero,

    marca,

    presentacion,

    gramajePreforma: 0,

    ratioNominal:
      activo
        ? obtenerRatioNominal(
            lineKey,
            presentacion,
            marca
          )
        : 0,

    lote: '',

    fechaVencimiento: '',

    horaInicio,

    horaFin,

    horasTurno:
      horaInicio && horaFin
        ? calcularHorasTurno(
            horaInicio,
            horaFin
          )
        : 0,

    produccion: {
      programada:0,
      efectiva:0,
      sopladas:0,
      calidad:0,
      paletas:0
    },

    paradasProgramadas: [
      {
        descripcion:'',
        tiempoMin:0
      }
    ],

    /*
       "causa" solo se usa/muestra para las NO programadas
       (ver CAUSAS_PARADA_NO_PROGRAMADA en 01-config.js) —
       es lo que permite que "Impacto Económico" sepa cuáles
       paradas fueron por falla de máquina.
    */
    paradasNoProgramadas: [
      {
        descripcion:'',
        tiempoMin:0,
        causa:''
      }
    ],

    insumos: {
      cajasPreformas:0,
      planchasCarton:0,
      polietilenoKg:0,
      stretchFilmKg:0,
      cartonReciclado:0,
      cartonRealUtilizado:0
    },

    mermas:
      obtenerItemsMerma(lineKey).map(
        m => ({
          item:m,
          peso:0,
          unidades:0
        })
      ),

    observaciones: ''

  };

}


function normalizarCuadros(record){

  if(!record) return [];


  if(
    !Array.isArray(record.cuadros) ||
    record.cuadros.length !== 4
  ){

    const cuadros =
      [1,2,3,4].map(
        n =>
          blankCuadro(
            record.linea,
            n
          )
      );


    const legacy =
      cuadros[0];


    legacy.marca =
      record.marca ||
      legacy.marca;


    legacy.presentacion =
      record.presentacion ||
      legacy.presentacion;


    legacy.gramajePreforma =
      record.gramajePreforma ??
      0;


    legacy.ratioNominal =
      record.ratioNominal ??
      obtenerRatioNominal(
        record.linea,
        legacy.presentacion,
        legacy.marca
      );


    legacy.lote =
      record.lote ||
      '';


    legacy.fechaVencimiento =
      record.fechaVencimiento ||
      '';


    legacy.horaInicio =
      record.horaInicio ||
      '07:00';


    legacy.horaFin =
      record.horaFin ||
      '19:00';


    legacy.horasTurno =
      num(record.horasTurno) ||
      calcularHorasTurno(
        legacy.horaInicio,
        legacy.horaFin
      );


    legacy.produccion =
      JSON.parse(
        JSON.stringify(
          record.produccion ||
          legacy.produccion
        )
      );


    legacy.paradasProgramadas =
      JSON.parse(
        JSON.stringify(
          record.paradasProgramadas ||
          legacy.paradasProgramadas
        )
      );


    legacy.paradasNoProgramadas =
      JSON.parse(
        JSON.stringify(
          record.paradasNoProgramadas ||
          legacy.paradasNoProgramadas
        )
      );


    legacy.insumos =
      JSON.parse(
        JSON.stringify(
          record.insumos ||
          legacy.insumos
        )
      );


    legacy.mermas =
      JSON.parse(
        JSON.stringify(
          record.mermas ||
          legacy.mermas
        )
      );


    legacy.observaciones =
      record.observaciones ||
      '';


    record.cuadros =
      cuadros;

  }


  record.cuadros =
    record.cuadros
      .slice(0,4)
      .map((c,i) => {

        const base =
          blankCuadro(
            record.linea,
            i+1
          );


        return {

          ...base,

          ...(c || {}),

          numero:
            i+1,

          produccion:{
            ...base.produccion,
            ...(c?.produccion || {})
          },

          insumos:{
            ...base.insumos,
            ...(c?.insumos || {})
          },

          paradasProgramadas:
            Array.isArray(
              c?.paradasProgramadas
            ) &&
            c.paradasProgramadas.length
              ? c.paradasProgramadas
              : base.paradasProgramadas,

          paradasNoProgramadas:
            Array.isArray(
              c?.paradasNoProgramadas
            ) &&
            c.paradasNoProgramadas.length
              ? c.paradasNoProgramadas
              : base.paradasNoProgramadas,

          mermas:
            Array.isArray(
              c?.mermas
            ) &&
            c.mermas.length
              ? c.mermas
              : base.mermas

        };

      });


  return record.cuadros;

}


function syncLegacyFromCuadro1(){

  if(!draft) return;


  const c =
    normalizarCuadros(
      draft
    )[0];


  draft.marca =
    c.marca;

  draft.presentacion =
    c.presentacion;

  draft.gramajePreforma =
    c.gramajePreforma;

  draft.ratioNominal =
    c.ratioNominal;

  draft.lote =
    c.lote;

  draft.fechaVencimiento =
    c.fechaVencimiento;

  draft.horaInicio =
    c.horaInicio;

  draft.horaFin =
    c.horaFin;

  draft.horasTurno =
    c.horasTurno;

  draft.produccion =
    c.produccion;

  draft.paradasProgramadas =
    c.paradasProgramadas;

  draft.paradasNoProgramadas =
    c.paradasNoProgramadas;

  draft.insumos =
    c.insumos;

  draft.mermas =
    c.mermas;

  draft.observaciones =
    c.observaciones;

}


function generarLoteCuadro(cuadro){

  if(
    !draft ||
    !cuadro
  ){

    return '';

  }


  const codigoMarca =
    obtenerCodigoMarca(
      draft.linea,
      cuadro.marca,
      cuadro.presentacion
    );


  const esAlfanumerico =
    codigoMarca !== '' &&
    !/^\d+$/.test(
      String(codigoMarca)
    );


  if(esAlfanumerico){

    return String(
      codigoMarca
    );

  }


  const diaJuliano =
    obtenerDiaDelAño(
      draft.fecha
    );


  const semana =
    obtenerSemana(
      draft.fecha
    );


  const codigoTurno =
    obtenerCodigoTurno(
      draft.turno
    );


  if(
    diaJuliano === '' ||
    semana === '' ||
    codigoTurno === ''
  ){

    return '';

  }


  return (
    String(diaJuliano) +
    '-' +
    String(codigoTurno) +
    String(codigoMarca) +
    String(semana)
  );

}


function actualizarLotesCuadros(){

  if(!draft) return;


  normalizarCuadros(
    draft
  ).forEach(
    c => {
      c.lote =
        generarLoteCuadro(c);
    }
  );


  syncLegacyFromCuadro1();

}


function calcularPaletasCuadro(cuadro){

  if(
    !draft ||
    !cuadro
  ){

    return 0;

  }


  const upp =
    obtenerUnidadesPorPalet(
      draft.linea,
      cuadro.marca,
      cuadro.presentacion
    );


  if(!upp) return 0;


  return Math.round(
    (
      num(
        cuadro.produccion?.efectiva
      ) / upp
    ) * 100
  ) / 100;

}


function calcularCajasPreformasCuadro(cuadro){

  if(
    !draft ||
    !cuadro
  ){

    return 0;

  }


  const efectiva =
    num(
      cuadro.produccion?.efectiva
    );


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const divisor =
      obtenerDivisorCajasPreformas(
        cuadro.presentacion
      );


    return divisor
      ? Math.round(
          (
            efectiva /
            divisor
          ) * 100
        ) / 100
      : 0;

  }


  if(
    draft.linea === 'B7L'
  ){

    return Math.round(
      (
        efectiva /
        2900
      ) * 100
    ) / 100;

  }


  return 0;

}


function calcularPlanchasCartonCuadro(cuadro){

  if(
    !draft ||
    !cuadro
  ){

    return 0;

  }


  const paletas =
    num(
      cuadro.produccion?.paletas
    );


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorCartonPET(
        cuadro.presentacion
      );


    return factor
      ? Math.round(
          paletas *
          factor *
          100
        ) / 100
      : 0;

  }


  if(
    draft.linea === 'B7L'
  ){

    return Math.round(
      paletas *
      CARTON_FIJO_B7L *
      100
    ) / 100;

  }


  if(
    draft.linea === 'C20L'
  ){

    const factor =
      normalizarTexto(
        cuadro.marca
      ) === 'san fernando'
        ? CARTON_C20L_SAN_FERNANDO
        : CARTON_C20L_DEFAULT;


    return Math.round(
      paletas *
      factor *
      100
    ) / 100;

  }


  if(
    draft.linea === 'B20L'
  ){

    return Math.round(
      paletas *
      CARTON_FIJO_B20L *
      100
    ) / 100;

  }


  return 0;

}


function calcularPolietilenoCuadro(cuadro){

  if(
    !draft ||
    !cuadro
  ){

    return 0;

  }


  const paletas =
    num(
      cuadro.produccion?.paletas
    );


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorPolietileno(
        cuadro.presentacion
      );


    return factor
      ? Math.round(
          paletas *
          factor *
          100
        ) / 100
      : 0;

  }


  if(
    draft.linea === 'B7L'
  ){

    const m =
      normalizarTexto(
        cuadro.marca
      );


    return MARCAS_POLIETILENO_B7L_SI.includes(m)

      ? Math.round(
          paletas *
          POLIETILENO_B7L_FACTOR *
          100
        ) / 100

      : 0;

  }


  if(
    draft.linea === 'C20L'
  ){

    return Math.round(
      paletas *
      POLIETILENO_C20L_FACTOR *
      100
    ) / 100;

  }


  return 0;

}


function calcularStretchFilmCuadro(cuadro){

  if(
    !draft ||
    !cuadro
  ){

    return 0;

  }


  const paletas =
    num(
      cuadro.produccion?.paletas
    );


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorStretchFilm(
        cuadro.presentacion
      );


    return factor
      ? Math.round(
          paletas *
          factor *
          100
        ) / 100
      : 0;

  }


  if(
    draft.linea === 'B7L'
  ){

    return Math.round(
      paletas *
      STRETCHFILM_B7L_FACTOR *
      100
    ) / 100;

  }


  if(
    draft.linea === 'C20L'
  ){

    return Math.round(
      paletas *
      STRETCHFILM_C20L_FACTOR *
      100
    ) / 100;

  }


  if(
    draft.linea === 'B20L'
  ){

    return Math.round(
      paletas *
      STRETCHFILM_B20L_FACTOR *
      100
    ) / 100;

  }


  return 0;

}


function actualizarCuadro(i){

  if(!draft) return null;


  const c =
    normalizarCuadros(
      draft
    )[i];


  if(!c) return null;


  c.ratioNominal =
    obtenerRatioNominal(
      draft.linea,
      c.presentacion,
      c.marca
    );


  c.horasTurno =
    c.horaInicio &&
    c.horaFin
      ? calcularHorasTurno(
          c.horaInicio,
          c.horaFin
        )
      : 0;


  c.produccion.paletas =
    calcularPaletasCuadro(c);


  c.insumos.cajasPreformas =
    calcularCajasPreformasCuadro(c);


  c.insumos.planchasCarton =
    calcularPlanchasCartonCuadro(c);


  c.insumos.polietilenoKg =
    calcularPolietilenoCuadro(c);


  c.insumos.stretchFilmKg =
    calcularStretchFilmCuadro(c);


  c.lote =
    generarLoteCuadro(c);


  actualizarMermasAutomaticasCuadro(i);


  return c;

}


function actualizarTodosCuadros(){

  if(!draft) return;


  normalizarCuadros(
    draft
  ).forEach(
    (_,i) =>
      actualizarCuadro(i)
  );


  syncLegacyFromCuadro1();

}


function blankRecord(lineKey){

  const ahora =
    new Date();


  const today =
    ahora.getFullYear() +
    '-' +
    String(
      ahora.getMonth()+1
    ).padStart(2,'0') +
    '-' +
    String(
      ahora.getDate()
    ).padStart(2,'0');


  const diaDelAño =
    obtenerDiaDelAño(
      today
    );


  const semana =
    obtenerSemana(
      today
    );


  const record = {

    id:null,

    linea:lineKey,

    fecha:today,

    diaJuliano:
      diaDelAño,

    semana,

    turno:'DÍA',

    cuadros:
      [1,2,3,4].map(
        n =>
          blankCuadro(
            lineKey,
            n
          )
      ),

    personal:
      posicionesPersonalLinea(lineKey).map(
        p => ({
          posicion:p,
          nombre:'',
          cargo:''
        })
      ),

    /*
       NUEVO:
       Evidencias fotográficas obligatorias
       de las Hojas de Producto Terminado.
    */
    evidenciasPT:[],

    observaciones:'',

    registradoPor:
      state.user
        ? state.user.nombre
        : '',

    timestamp:null

  };


  draft =
    record;


  actualizarTodosCuadros();


  return draft;

}


/* =========================================================
   RENDER PRINCIPAL
   ========================================================= */

function renderMain(){

  const main =
    document.getElementById('main');


  /* =====================================================
     PANTALLA DE BIENVENIDA
     ===================================================== */

  if(state.showWelcome){

    const nombreUsuario =
      state.user?.nombre ||
      state.user?.username ||
      'USUARIO';


    main.innerHTML = `

      <section class="welcome-panel">

        <div class="welcome-content">

          <div class="welcome-tag">
            SISTEMA INTERNO · GLACIAL
          </div>


          <h1>
            JEFATURA DE PRODUCCIÓN
          </h1>


          <p class="welcome-message">

            ¡Bienvenido,

            <strong>
              ${nombreUsuario}
            </strong>!

          </p>


          <p class="welcome-description">

            Has ingresado correctamente al sistema de
            control operativo y seguimiento de producción.

          </p>


          <button
            type="button"
            class="btn btn-glacial"
            onclick="closeWelcome()"
            style="margin-top:24px;"
          >
            Ingresar al sistema →
          </button>

        </div>


        <div class="welcome-logo">

          <img
            src="/img/logo_glacial.png"
            alt="GLACIAL"
          >

        </div>

      </section>

    `;


    return;

  }


  /* =====================================================
     RESUMEN GENERAL
     ===================================================== */

  if(
    state.currentTab === 'resumen'
  ){

    renderResumen(main);

    return;

  }


  /* =====================================================
     IMPACTO ECONÓMICO (SOLO PARADAS DE MÁQUINA)
     ===================================================== */

  if(
    state.currentTab === 'perdidas'
  ){

    renderPerdidasSoles(main);

    return;

  }


  /* =====================================================
     PRODUCCIÓN ACTUAL (TODAS LAS LÍNEAS — VENTAS)
     =====================================================

     Igual que resumen/perdidas: es una vista global, no
     depende de state.currentLine. Vive en 16-paletas.js
     porque reutiliza toda la lógica de programación/
     comparación de ese módulo.
     ===================================================== */

  if(
    state.currentTab === 'produccion-actual'
  ){

    renderProduccionActualTab();

    return;

  }


  /* =====================================================
     BUSCAR LÍNEA ACTUAL
     ===================================================== */

  const line =
    LINES.find(
      l =>
        l.key ===
        state.currentLine
    );


  if(!line){

    return;

  }


  /* =====================================================
     CONTENIDO PRINCIPAL
     ===================================================== */

  main.innerHTML = `

    <div class="main-head">

      <div>

        <h2>
          ${line.name}
        </h2>

        <div class="sub">
          Reporte diario de producción,
          paradas, insumos, mermas y personal
        </div>

      </div>

    </div>


    <div class="tabs">

      <button
        class="
          tab
          ${
            state.currentTab === 'nuevo'
              ? 'active'
              : ''
          }
        "
        onclick="setTab('nuevo')"
      >
        Nuevo registro
      </button>


      <button
        class="
          tab
          ${
            state.currentTab === 'historial'
              ? 'active'
              : ''
          }
        "
        onclick="setTab('historial')"
      >
        Historial
      </button>


      <button
        class="
          tab
          ${
            state.currentTab === 'graficos'
              ? 'active'
              : ''
          }
        "
        onclick="setTab('graficos')"
      >
        Gráficos
      </button>


      <button
        class="
          tab
          ${
            state.currentTab === 'paletas'
              ? 'active'
              : ''
          }
        "
        onclick="setTab('paletas')"
      >
        Paletas
      </button>

    </div>


    <div id="tab-content"></div>

  `;


  /* =====================================================
     RENDERIZAR PESTAÑA
     ===================================================== */

  if(
    state.currentTab === 'nuevo'
  ){

    renderFormTab();

  }

  else if(
    state.currentTab === 'historial'
  ){

    renderHistorialTab();

  }

  else if(
    state.currentTab === 'paletas'
  ){

    renderPaletasTab();

  }

  else{

    renderGraficosTab();

  }

}


function setTab(t){

  const permiso = {
    nuevo:'nuevo',
    historial:'historial',
    graficos:'graficos',
    paletas:'paletas',
    resumen:'resumen'
  }[t];


  if(
    permiso &&
    !tienePermiso(permiso)
  ){

    alert(
      'No tienes permiso para acceder a esta sección.'
    );

    return;

  }


  state.currentTab =
    t;


  state.viewingRecordId =
    null;


  renderMain();

}


/* =========================================================
   TAB NUEVO REGISTRO
   ========================================================= */

function renderFormTab(){

  if(
    !draft ||
    draft.linea !==
      state.currentLine
  ){

    draft =
      blankRecord(
        state.currentLine
      );

  }


  /*
     Compatibilidad con registros anteriores:
     si no tenían evidenciasPT, se inicializa.
  */
  if(
    !Array.isArray(
      draft.evidenciasPT
    )
  ){

    draft.evidenciasPT = [];

  }


  normalizarCuadros(
    draft
  );


  actualizarTodosCuadros();


  const c =
    document.getElementById(
      'tab-content'
    );


  const d =
    calcDerivedMulti(
      draft
    );


  const cuadros =
    draft.cuadros;


  const line =
    LINES.find(
      l =>
        l.key ===
        state.currentLine
    ) ||
    {
      name:
        state.currentLine,

      ratioDefault:
        0
    };


  const cuadroCard =
    (q,i) => {

      const dq =
        calcDerivedCuadro(q);


      const paradaProg =
        (
          q.paradasProgramadas ||
          []
        )
        .reduce(
          (a,p) =>
            a +
            num(
              p.tiempoMin
            ),
          0
        );


      const paradaNoProg =
        (
          q.paradasNoProgramadas ||
          []
        )
        .reduce(
          (a,p) =>
            a +
            num(
              p.tiempoMin
            ),
          0
        );


      const tieneDatos =
        !!(
          q.marca ||
          q.presentacion ||
          q.horaInicio ||
          num(
            q.produccion?.efectiva
          ) > 0
        );


      const marcas =
        MARCAS_POR_LINEA[
          state.currentLine
        ] || [];


      const presentaciones =
        PRESENTACIONES_POR_LINEA[
          state.currentLine
        ] || [];


      const optionList =
        arr =>
          arr.length

            ? arr.map(
                o =>
                  `<option
                    value="${o}"
                    ${
                      o === q.presentacion
                        ? 'selected'
                        : ''
                    }
                  >
                    ${o}
                  </option>`
              ).join('')

            : `
                <option value="">
                  Sin opciones
                </option>
              `;


      const marcaList =
        arr =>
          arr.length

            ? arr.map(
                o =>
                  `<option
                    value="${o}"
                    ${
                      o === q.marca
                        ? 'selected'
                        : ''
                    }
                  >
                    ${o}
                  </option>`
              ).join('')

            : `
                <option value="">
                  Sin opciones
                </option>
              `;


      const field =
        (
          label,
          type,
          value,
          handler,
          extra=''
        ) =>
          `
            <div class="field-sm">

              <label>
                ${label}
              </label>

              <input
                type="${type}"
                value="${value ?? ''}"
                ${extra}
                oninput="${handler}"
              >

            </div>
          `;


      const readonly =
        `
          readonly
          style="
            background:#f1f3f5;
            font-weight:700;
            color:#243746;
            cursor:not-allowed;
          "
        `;


      return `

        <div
          class="production-card"
          style="
            border:1px solid #D7DBD4;
            border-radius:10px;
            background:#fff;
            overflow:hidden;
            box-shadow:
              0 2px 8px rgba(0,0,0,.05);
            min-width:0;
          "
        >

          <div
            style="
              background:
                linear-gradient(
                  135deg,
                  #0f8fc8,
                  #14b8c4
                );
              color:#fff;
              padding:12px 14px;
              display:flex;
              justify-content:space-between;
              align-items:center;
            "
          >

            <strong style="font-size:16px;">
              Cuadro ${i+1}
            </strong>


            <span
              style="
                font-size:12px;
                opacity:.95;
              "
            >
              ${
                tieneDatos
                  ? 'Producción'
                  : 'Sin producción'
              }
            </span>

          </div>


          <div style="padding:12px;">

            <div class="grid grid-2">

              <div class="field-sm">

                <label>
                  Marca
                </label>

                <select
                  onchange="
                    updateCuadroField(
                      ${i},
                      'marca',
                      this.value
                    )
                  "
                >

                  <option value="">
                    Seleccione...
                  </option>

                  ${marcaList(marcas)}

                </select>

              </div>


              <div class="field-sm">

                <label>
                  Presentación
                </label>

                <select
                  onchange="
                    updateCuadroField(
                      ${i},
                      'presentacion',
                      this.value
                    )
                  "
                >

                  <option value="">
                    Seleccione...
                  </option>

                  ${optionList(presentaciones)}

                </select>

              </div>


              <div class="field-sm">

                <label>
                  Lote automático
                </label>

                <input
                  type="text"
                  value="${q.lote||''}"
                  ${readonly}
                >

              </div>


              <div class="field-sm">

                <label
                  for="gramaje_preforma_${i}"
                >
                  Gramaje preforma (g)
                </label>

                <select
                  id="gramaje_preforma_${i}"
                  name="gramaje_preforma_${i}"
                  class="gramaje-preforma-select"
                  style="
                    width:100%;
                    min-height:38px;
                    display:block;
                    cursor:pointer;
                  "
                  onchange="
                    updateCuadroField(
                      ${i},
                      'gramajePreforma',
                      this.value
                    )
                  "
                >

                  <option value="">
                    Seleccione...
                  </option>

                  ${
                    [
                      '42.7',
                      '43.7',
                      '45.7',
                      '33.7',
                      '21.7',
                      '23.7',
                      '17.7',
                      '15.7',
                      '13.8',
                      '12.7'
                    ]
                    .map(
                      g =>
                        `
                          <option
                            value="${g}"
                            ${
                              String(
                                q.gramajePreforma ?? ''
                              ) === g
                                ? 'selected'
                                : ''
                            }
                          >
                            ${g} g
                          </option>
                        `
                    )
                    .join('')
                  }

                </select>

              </div>


              <div class="field-sm">

                <label>
                  Hora inicio
                </label>

                <input
                  type="time"
                  value="${q.horaInicio||''}"
                  onchange="
                    updateCuadroField(
                      ${i},
                      'horaInicio',
                      this.value
                    )
                  "
                >

              </div>


              <div class="field-sm">

                <label>
                  Hora fin
                </label>

                <input
                  type="time"
                  value="${q.horaFin||''}"
                  onchange="
                    updateCuadroField(
                      ${i},
                      'horaFin',
                      this.value
                    )
                  "
                >

              </div>

            </div>


            <div
              style="
                margin:10px 0;
                padding:10px;
                border-radius:8px;
                background:#EEF8FC;
                display:grid;
                grid-template-columns:
                  repeat(3,1fr);
                gap:8px;
                text-align:center;
              "
            >

              <div>

                <small>
                  Ratio nominal
                </small>

                <br>

                <strong>
                  ${
                    num(
                      q.ratioNominal
                    ).toLocaleString(
                      'es-PE'
                    )
                  }
                  BPH
                </strong>

              </div>


              <div>

                <small>
                  Horas turno
                </small>

                <br>

                <strong>
                  ${
                    num(
                      q.horasTurno
                    ).toFixed(2)
                  }
                  h
                </strong>

              </div>


              <div>

                <small>
                  Horas efectivas
                </small>

                <br>

                <strong
                  style="font-size:18px;"
                >
                  ${
                    num(
                      dq.horasEfectivas
                    ).toFixed(2)
                  }
                  h
                </strong>

              </div>

            </div>


            <div
              class="panel"
              style="
                margin:10px 0 0;
                border-left:
                  4px solid #20a86b;
              "
            >

              <div class="panel-head">

                <h4 style="margin:0;">
                  Producción
                </h4>

              </div>


              <div class="panel-body grid grid-2">

                ${
                  field(
                    'Programada (bot)',
                    'number',
                    q.produccion.programada,
                    `
                      updateCuadroPath(
                        ${i},
                        'produccion.programada',
                        this.value
                      )
                    `
                  )
                }


                ${
                  field(
                    'Efectiva (bot)',
                    'number',
                    q.produccion.efectiva,
                    `
                      updateCuadroPathLigero(
                        ${i},
                        'produccion.efectiva',
                        this.value
                      )
                    `,
                    `
                      onchange="
                        updateCuadroPath(
                          ${i},
                          'produccion.efectiva',
                          this.value
                        )
                      "
                    `
                  )
                }


                ${
                  field(
                    'Botellas sopladas',
                    'number',
                    q.produccion.sopladas,
                    `
                      updateCuadroPath(
                        ${i},
                        'produccion.sopladas',
                        this.value
                      )
                    `
                  )
                }


                ${
                  field(
                    'Botellas rechazadas (calidad)',
                    'number',
                    q.produccion.calidad,
                    `
                      updateCuadroPath(
                        ${i},
                        'produccion.calidad',
                        this.value
                      )
                    `
                  )
                }


                <div class="field-sm">

                  <label>
                    Paletas (automático)
                  </label>

                  <input
                    type="text"
                    id="f_paletas_${i}"
                    value="${
                      q.produccion.paletas ??
                      0
                    }"
                    ${readonly}
                  >

                </div>

              </div>

            </div>


            <div
              class="panel accent-amber"
              style="margin:10px 0 0;"
            >

              <div class="panel-head">

                <h4 style="margin:0;">
                  Paradas programadas
                </h4>

                <button
                  class="
                    btn
                    btn-ghost
                    btn-sm
                  "
                  onclick="
                    addParadaCuadro(
                      ${i},
                      'paradasProgramadas'
                    )
                  "
                >
                  + Agregar
                </button>

              </div>


              <div class="panel-body">

                ${
                  paradasTableCuadro(
                    'paradasProgramadas',
                    q.paradasProgramadas,
                    i
                  )
                }

              </div>

            </div>


            <div
              class="panel accent-bad"
              style="margin:10px 0 0;"
            >

              <div class="panel-head">

                <h4 style="margin:0;">
                  Paradas no programadas
                </h4>

                <button
                  class="
                    btn
                    btn-ghost
                    btn-sm
                  "
                  onclick="
                    addParadaCuadro(
                      ${i},
                      'paradasNoProgramadas'
                    )
                  "
                >
                  + Agregar
                </button>

              </div>


              <div class="panel-body">

                ${
                  paradasTableCuadro(
                    'paradasNoProgramadas',
                    q.paradasNoProgramadas,
                    i
                  )
                }

              </div>

            </div>


            <div
              class="panel"
              style="margin:10px 0 0;"
            >

              <div class="panel-head">

                <h4 style="margin:0;">
                  Mermas
                </h4>

              </div>


              <div class="panel-body">

                ${
                  mermasTableCuadro(
                    q.mermas,
                    q.produccion.efectiva,
                    draft.linea,
                    i
                  )
                }

              </div>

            </div>


            <div
              class="panel"
              style="margin:10px 0 0;"
            >

              <div class="panel-head">

                <h4 style="margin:0;">
                  Insumos
                </h4>

              </div>


              <div
                class="panel-body"
                style="
                  display:grid;
                  grid-template-columns:
                    repeat(
                      2,
                      minmax(0,1fr)
                    );
                  gap:6px;
                "
              >

                <div class="field-sm">

                  <label>
                    Cajas preformas (auto)
                  </label>

                  <input
                    type="text"
                    value="${
                      q.insumos.cajasPreformas ??
                      0
                    }"
                    ${readonly}
                  >

                </div>


                <div class="field-sm">

                  <label>
                    Planchas cartón (auto)
                  </label>

                  <input
                    type="text"
                    value="${
                      q.insumos.planchasCarton ??
                      0
                    }"
                    ${readonly}
                  >

                </div>


                <div class="field-sm">

                  <label>
                    Polietileno (kg) (auto)
                  </label>

                  <input
                    type="text"
                    value="${
                      q.insumos.polietilenoKg ??
                      0
                    }"
                    ${readonly}
                  >

                </div>


                <div class="field-sm">

                  <label>
                    Stretch film (kg) (auto)
                  </label>

                  <input
                    type="text"
                    value="${
                      q.insumos.stretchFilmKg ??
                      0
                    }"
                    ${readonly}
                  >

                </div>


                ${
                  field(
                    'Cartón reciclado (Und)',
                    'number',
                    q.insumos.cartonReciclado,
                    `
                      updateCuadroPath(
                        ${i},
                        'insumos.cartonReciclado',
                        this.value
                      )
                    `
                  )
                }


                ${
                  field(
                    'Cartón real utilizado (Und)',
                    'number',
                    q.insumos.cartonRealUtilizado,
                    `
                      updateCuadroPath(
                        ${i},
                        'insumos.cartonRealUtilizado',
                        this.value
                      )
                    `
                  )
                }

              </div>

            </div>


            <div
              style="
                margin-top:10px;
                padding:9px;
                border-radius:8px;
                background:#F5F8FA;
                display:grid;
                grid-template-columns:
                  repeat(4,1fr);
                gap:6px;
                text-align:center;
                font-size:12px;
              "
            >

              <div>

                <small>
                  Prod. nominal
                </small>

                <br>

                <strong>
                  ${
                    Math.round(
                      dq.produccionNominal
                    ).toLocaleString(
                      'es-PE'
                    )
                  }
                </strong>

              </div>


              <div>

                <small>
                  Disponibilidad
                </small>

                <br>

                <strong>
                  ${
                    pct(
                      dq.disponibilidad
                    )
                  }
                </strong>

              </div>


              <div>

                <small>
                  OEE
                </small>

                <br>

                <strong>
                  ${
                    pct(
                      dq.oee
                    )
                  }
                </strong>

              </div>


              <div>

                <small>
                  Paradas
                </small>

                <br>

                <strong>
                  ${
                    paradaProg +
                    paradaNoProg
                  }
                  min
                </strong>

              </div>

            </div>

          </div>

        </div>

      `;

    };


  c.innerHTML = `

    <div class="kpi-row">

      ${
        kpi(
          'Disponibilidad',
          pct(d.disponibilidad),
          d.disponibilidad
        )
      }


      ${
        kpi(
          'Rendimiento',
          pct(d.rendimiento),
          d.rendimiento
        )
      }


      ${
        kpi(
          'Calidad',
          pct(d.calidad),
          d.calidad
        )
      }


      ${
        kpi(
          'OEE',
          pct(d.oee),
          d.oee
        )
      }


      ${
        kpi(
          'Cumplimiento',
          pct(d.cumplimiento),
          d.cumplimiento
        )
      }


      ${
        kpi(
          'Producción efectiva',
          Math.round(
            d.efectiva || 0
          ).toLocaleString(
            'es-PE'
          ),
          1
        )
      }

    </div>


    <div
      class="panel"
      style="margin-bottom:14px;"
    >

      <div class="panel-head">

        <h3>
          Datos generales ·
          ${line.name}
        </h3>

      </div>


      <div class="panel-body grid grid-4">

        ${
          inp(
            'fecha',
            'Fecha',
            'date',
            draft.fecha
          )
        }


        ${
          inp(
            'diaJuliano',
            'Día juliano',
            'number',
            draft.diaJuliano
          )
        }


        ${
          inp(
            'semana',
            'Semana',
            'number',
            draft.semana
          )
        }


        ${
          sel(
            'turno',
            'Turno',
            [
              'DÍA',
              'INTERMEDIO',
              'NOCHE'
            ],
            draft.turno
          )
        }

      </div>

    </div>


    <div
      style="
        display:grid;
        grid-template-columns:
          repeat(
            4,
            minmax(0,1fr)
          );
        gap:10px;
        align-items:start;
      "
    >

      ${
        cuadros
          .map(
            (q,i) =>
              cuadroCard(q,i)
          )
          .join('')
      }

    </div>


    <div
      class="panel"
      style="margin-top:14px;"
    >

      <div class="panel-head">

        <h3>
          Personal del turno
        </h3>

      </div>


      <div class="panel-body">

        ${
          personalTable(
            draft.personal,
            draft.linea
          )
        }

      </div>

    </div>


    <div class="panel">

      <div class="panel-head">

        <h3>
          Observaciones generales
        </h3>

      </div>


      <div class="panel-body">

        <textarea
          id="f_observaciones"
          rows="3"
          style="
            width:100%;
            border:
              1px solid
              var(--line-strong);
            border-radius:3px;
            padding:10px;
            font-family:inherit;
            font-size:14px;
          "
          oninput="
            updateField(
              'observaciones',
              this.value
            )
          "
        >${draft.observaciones||''}</textarea>

      </div>

    </div>


    <!-- =================================================
         EVIDENCIAS HOJAS DE PRODUCTO TERMINADO
         ================================================= -->

    ${renderEvidenciasPT()}


    <div class="actions-row">

      <button
        class="btn btn-ghost"
        onclick="resetDraft()"
      >
        Limpiar formulario
      </button>


      <button
        class="btn btn-primary"
        onclick="saveDraft()"
      >
        Guardar registro
      </button>

    </div>

  `;

}


/* =========================================================
   KPI
   ========================================================= */

function kpi(
  label,
  value,
  ratio
){

  return `

    <div
      class="
        kpi
        ${statusClass(ratio)}
      "
    >

      <div class="kpi-label">
        ${label}
      </div>


      <div class="kpi-value">
        ${value}
      </div>

    </div>

  `;

}


/* =========================================================
   INPUT
   ========================================================= */

function inp(
  name,
  label,
  type,
  value
){

  const automatico =
    name === 'diaJuliano' ||
    name === 'semana' ||
    name === 'ratioNominal' ||
    name === 'horasTurno';


  return `

    <div class="field-sm">

      <label>
        ${label}
      </label>


      <input
        id="f_${name}"
        type="${type}"
        ${
          name === 'gramajePreforma'
            ? 'min="0" step="0.1" inputmode="decimal"'
            : ''
        }
        value="${value ?? ''}"
        ${automatico ? 'readonly' : ''}

        ${
          automatico
            ? `
              style="
                background:#f1f3f5;
                cursor:not-allowed;
                font-weight:600;
              "
            `
            : ''
        }

        oninput="
          updateField(
            '${name}',
            this.value
          )
        "

        ${
          name === 'gramajePreforma'
            ? `
              onblur="
                actualizarMermasAutomaticas();
                renderFormTab();
              "
            `
            : ''
        }

      >

    </div>

  `;

}


/* =========================================================
   INPUT POR RUTA
   ========================================================= */

function inpPath(
  path,
  label,
  type,
  value
){

  return `

    <div class="field-sm">

      <label>
        ${label}
      </label>


      <input
        type="${type}"
        value="${value ?? ''}"
        oninput="
          updatePath(
            '${path}',
            this.value
          )
        "
      >

    </div>

  `;

}


/* =========================================================
   SELECT
   ========================================================= */

function sel(
  name,
  label,
  options,
  value
){

  return `

    <div class="field-sm">

      <label>
        ${label}
      </label>


      <select
        onchange="
          updateField(
            '${name}',
            this.value
          )
        "
      >

        ${
          options.length

            ? options.map(

                o => `

                  <option
                    value="${o}"
                    ${
                      o === value
                        ? 'selected'
                        : ''
                    }
                  >
                    ${o}
                  </option>

                `

              ).join('')

            : `

              <option value="">
                Sin opciones
              </option>

            `
        }

      </select>

    </div>

  `;

}


function updateCuadroField(
  i,
  name,
  val
){

  const q =
    normalizarCuadros(
      draft
    )[i];


  if(!q) return;


  q[name] =
    val;


  if(
    name === 'marca' ||
    name === 'presentacion'
  ){

    q.ratioNominal =
      obtenerRatioNominal(
        draft.linea,
        q.presentacion,
        q.marca
      );


    q.lote =
      generarLoteCuadro(q);


    actualizarCuadro(i);


    renderFormTab();


    return;

  }


  if(
    name === 'horaInicio' ||
    name === 'horaFin'
  ){

    actualizarCuadro(i);


    renderFormTab();


    return;

  }


  if(
    name === 'gramajePreforma'
  ){

    q.gramajePreforma =
      val;


    draft.gramajePreforma =
      val;


    actualizarMermasAutomaticasCuadro(
      i
    );


    return;

  }


  actualizarCuadro(i);


  refreshKpisOnly();

}


/* =========================================================
   ACTUALIZACIÓN "LIGERA" DE UN CAMPO DE CUADRO
   =========================================================

   Se usa en el oninput (cada tecla) de "Botellas efectivas"
   en vez de updateCuadroPath(), que hace un renderFormTab()
   completo — eso destruye y vuelve a crear el <input>, por
   lo que el campo pierde el foco en cada tecla y hay que
   hacer clic de nuevo para seguir escribiendo (y, si el
   re-render llega a mitad de un tecleo rápido, una tecla
   puede terminar aterrizando en el campo equivocado).

   Aquí, en cambio, solo se actualiza el dato en memoria, se
   recalculan los derivados (paletas, insumos) y se pisa el
   valor del campo "Paletas (automático)" directamente por
   su id — sin tocar el <input> donde la persona está
   escribiendo. El re-render completo (que si necesita la
   tabla de Mermas, que depende de la producción efectiva)
   sigue ocurriendo, pero recién cuando la persona sale del
   campo (onchange), no en cada tecla.
   ========================================================= */

function updateCuadroPathLigero(
  i,
  path,
  val
){

  const q =
    normalizarCuadros(
      draft
    )[i];


  if(!q) return;


  const [
    a,
    b
  ] =
    path.split('.');


  if(!q[a]){
    q[a] = {};
  }


  q[a][b] =
    val;


  actualizarCuadro(i);


  const campoPaletas =
    document.getElementById(
      'f_paletas_' + i
    );

  if(campoPaletas){

    campoPaletas.value =
      q.produccion.paletas ??
      0;

  }


  refreshKpisOnly();

}


function updateCuadroPath(
  i,
  path,
  val
){

  const q =
    normalizarCuadros(
      draft
    )[i];


  if(!q) return;


  const [
    a,
    b
  ] =
    path.split('.');


  if(!q[a]){
    q[a] = {};
  }


  q[a][b] =
    val;


  actualizarCuadro(i);


  if(
    path ===
    'produccion.efectiva'
  ){

    const scrollY =
      window.scrollY;


    renderFormTab();


    requestAnimationFrame(
      () =>
        window.scrollTo(
          0,
          scrollY
        )
    );


    return;

  }


  refreshKpisOnly();

}


/* =========================================================
   ACTUALIZAR CAMPO
   ========================================================= */

function updateField(
  name,
  val
){

  draft[name] =
    val;


  if(
    name === 'fecha'
  ){

    draft.diaJuliano =
      obtenerDiaDelAño(
        val
      );


    draft.semana =
      obtenerSemana(
        val
      );


    actualizarLote();


    actualizarLotesCuadros();


    renderFormTab();


    return;

  }


  if(
    name === 'turno'
  ){

    actualizarLote();


    actualizarLotesCuadros();


    renderFormTab();


    return;

  }


  if(
    name === 'gramajePreforma'
  ){

    /*
       Se conserva el texto mientras se escribe
       para permitir valores decimales como
       21.7, 12.7, etc.
    */

    draft.gramajePreforma =
      val;


    /*
       No renderizar aquí:
       si se renderiza en cada tecla,
       el navegador elimina el punto
       mientras se escribe.
    */

    actualizarMermasAutomaticas();


    return;

  }


  if(
    name === 'marca'
  ){

    draft.ratioNominal =
      obtenerRatioNominal(
        draft.linea,
        draft.presentacion,
        val
      );


    actualizarLote();


    actualizarPaletas();
    actualizarCajasPreformas();
    actualizarPlanchasCarton();
    actualizarPolietileno();
    actualizarStretchFilm();


    renderFormTab();


    return;

  }


  if(
    name === 'presentacion'
  ){

    draft.ratioNominal =
      obtenerRatioNominal(
        draft.linea,
        val,
        draft.marca
      );


    actualizarLote();


    actualizarPaletas();
    actualizarCajasPreformas();
    actualizarPlanchasCarton();
    actualizarPolietileno();
    actualizarStretchFilm();


    renderFormTab();


    return;

  }


  /* =======================================================
     HORA INICIO / HORA FIN
     ======================================================= */

  if(
    name === 'horaInicio' ||
    name === 'horaFin'
  ){

    draft.horasTurno =
      calcularHorasTurno(
        draft.horaInicio,
        draft.horaFin
      );


    renderFormTab();


    return;

  }


  /*
     "horasTurno" es un campo automático:
     no se permite editarlo a mano.
  */

  if(
    name === 'horasTurno'
  ){

    draft.horasTurno =
      calcularHorasTurno(
        draft.horaInicio,
        draft.horaFin
      );


    return;

  }


  if(
    name === 'diaJuliano'
  ){

    draft.diaJuliano =
      obtenerDiaDelAño(
        draft.fecha
      );


    actualizarLote();


    return;

  }


  if(
    name === 'semana'
  ){

    draft.semana =
      obtenerSemana(
        draft.fecha
      );


    actualizarLote();


    return;

  }


  refreshKpisOnly();

}


/* =========================================================
   ACTUALIZAR CAMPO ANIDADO
   ========================================================= */

function updatePath(
  path,
  val
){

  const [
    a,
    b
  ] =
    path.split('.');


  if(!draft[a]){

    draft[a] = {};

  }


  draft[a][b] =
    val;


  /*
     Si cambia la producción efectiva,
     recalculamos el N° de paletas
     automáticamente y refrescamos
     solo ese campo.
  */

  if(
    path ===
    'produccion.efectiva'
  ){

    actualizarMermasAutomaticas();


    actualizarPaletas();


    actualizarCajasPreformas();


    actualizarPlanchasCarton();


    actualizarPolietileno();


    actualizarStretchFilm();


    const campoPaletas =
      document.getElementById(
        'f_paletas'
      );


    if(campoPaletas){

      campoPaletas.value =
        draft.produccion.paletas ??
        0;

    }


    const campoCajas =
      document.getElementById(
        'f_cajaspreformas'
      );


    if(campoCajas){

      campoCajas.value =
        draft.insumos.cajasPreformas ??
        0;

    }


    const campoCarton =
      document.getElementById(
        'f_planchascarton'
      );


    if(campoCarton){

      campoCarton.value =
        draft.insumos.planchasCarton ??
        0;

    }


    const campoPolietileno =
      document.getElementById(
        'f_polietileno'
      );


    if(campoPolietileno){

      campoPolietileno.value =
        draft.insumos.polietilenoKg ??
        0;

    }


    const campoStretch =
      document.getElementById(
        'f_stretchfilm'
      );


    if(campoStretch){

      campoStretch.value =
        draft.insumos.stretchFilmKg ??
        0;

    }

  }


  refreshKpisOnly();

}


/* =========================================================
   ACTUALIZAR KPI
   ========================================================= */

function refreshKpisOnly(){

  if(!draft) return;


  const d =
    calcDerived(
      draft
    );


  const row =
    document.querySelector(
      '.kpi-row'
    );


  if(row){

    row.innerHTML = `

      ${
        kpi(
          'Disponibilidad',
          pct(d.disponibilidad),
          d.disponibilidad
        )
      }

      ${
        kpi(
          'Rendimiento',
          pct(d.rendimiento),
          d.rendimiento
        )
      }

      ${
        kpi(
          'Calidad',
          pct(d.calidad),
          d.calidad
        )
      }

      ${
        kpi(
          'OEE',
          pct(d.oee),
          d.oee
        )
      }

      ${
        kpi(
          'Cumplimiento',
          pct(d.cumplimiento),
          d.cumplimiento
        )
      }

      ${
        kpi(
          'Producción efectiva',
          Math.round(
            d.efectiva ??
            num(
              draft.produccion?.efectiva
            )
          ).toLocaleString(
            'es-PE'
          ),
          1
        )
      }

    `;

  }

}


/* =========================================================
   CUADROS DE PRODUCCIÓN — PARADAS
   ========================================================= */

function paradasTableCuadro(
  key,
  rows,
  cuadroIndex
){

  const esProgramada =
    key ===
    'paradasProgramadas';


  const safeRows =
    Array.isArray(rows) &&
    rows.length

      ? rows

      : [
          {
            descripcion:'',
            tiempoMin:0,
            causa:''
          }
        ];


  return `

    <div
      class="paradas-cuadro-table"
      style="
        width:100%;
        overflow-x:auto;
      "
    >

      <table
        style="
          width:100%;
          min-width:0;
          border-collapse:collapse;
          table-layout:fixed;
        "
      >

        <thead>

          <tr>

            <th
              style="
                width:${esProgramada ? '58%' : '38%'};
                text-align:left;
              "
            >
              Descripción
            </th>


            ${
              esProgramada
                ? ''
                : `
                  <th
                    style="
                      width:27%;
                      text-align:left;
                    "
                  >
                    Causa
                  </th>
                `
            }


            <th
              style="
                width:${esProgramada ? '27%' : '20%'};
                text-align:center;
              "
            >
              Tiempo (min)
            </th>


            <th
              style="
                width:${esProgramada ? '15%' : '15%'};
                text-align:center;
              "
            >
            </th>

          </tr>

        </thead>


        <tbody>

          ${
            safeRows
              .map(
                (r,i) => `

                  <tr>

                    <td style="padding:5px;">

                      ${
                        esProgramada

                          ? `

                            <select
                              style="
                                width:100%;
                                box-sizing:border-box;
                              "
                              onchange="
                                updateArrItemCuadro(
                                  ${cuadroIndex},
                                  '${key}',
                                  ${i},
                                  'descripcion',
                                  this.value
                                )
                              "
                            >

                              <option value="">
                                Seleccione...
                              </option>

                              ${
                                PARADAS_PROGRAMADAS
                                  .map(
                                    o =>
                                      `
                                        <option
                                          value="${o}"
                                          ${
                                            o ===
                                            r.descripcion
                                              ? 'selected'
                                              : ''
                                          }
                                        >
                                          ${o}
                                        </option>
                                      `
                                  )
                                  .join('')
                              }

                            </select>

                          `

                          : `

                            <input
                              type="text"
                              value="${r.descripcion||''}"
                              placeholder="
                                Motivo de la parada
                              "
                              style="
                                width:100%;
                                box-sizing:border-box;
                              "
                              oninput="
                                updateArrItemCuadro(
                                  ${cuadroIndex},
                                  '${key}',
                                  ${i},
                                  'descripcion',
                                  this.value
                                )
                              "
                            >

                          `

                      }

                    </td>


                    ${
                      esProgramada
                        ? ''
                        : `
                          <td style="padding:5px;">

                            <select
                              style="
                                width:100%;
                                box-sizing:border-box;
                                ${
                                  r.causa === 'Falla de máquina'
                                    ? 'font-weight:600;'
                                    : ''
                                }
                              "
                              title="
                                Ayuda a Gráficos/Excel a clasificar la
                                parada. El reporte 'Impacto Económico'
                                ya NO depende de esta causa: valoriza
                                TODAS las paradas no programadas,
                                agrupándolas por la máquina que
                                menciona la descripción.
                              "
                              onchange="
                                updateArrItemCuadro(
                                  ${cuadroIndex},
                                  '${key}',
                                  ${i},
                                  'causa',
                                  this.value
                                )
                              "
                            >

                              <option value="">
                                Sin clasificar
                              </option>

                              ${
                                CAUSAS_PARADA_NO_PROGRAMADA
                                  .map(
                                    o =>
                                      `
                                        <option
                                          value="${o}"
                                          ${
                                            o === r.causa
                                              ? 'selected'
                                              : ''
                                          }
                                        >
                                          ${o}
                                        </option>
                                      `
                                  )
                                  .join('')
                              }

                            </select>

                          </td>
                        `
                    }


                    <td style="padding:5px;">

                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputmode="numeric"
                        value="${r.tiempoMin ?? 0}"
                        placeholder="0"
                        title="
                          Ingrese los minutos
                          de la parada
                        "
                        style="
                          width:100%;
                          box-sizing:border-box;
                          text-align:center;
                          font-weight:600;
                        "
                        oninput="
                          updateArrItemCuadro(
                            ${cuadroIndex},
                            '${key}',
                            ${i},
                            'tiempoMin',
                            this.value
                          )
                        "
                      >

                    </td>


                    <td
                      style="
                        padding:5px;
                        text-align:center;
                      "
                    >

                      <button
                        type="button"
                        class="row-del"
                        onclick="
                          removeArrItemCuadro(
                            ${cuadroIndex},
                            '${key}',
                            ${i}
                          )
                        "
                      >
                        ✕
                      </button>

                    </td>

                  </tr>

                `
              )
              .join('')
          }

        </tbody>

      </table>

    </div>

  `;

}


function addParadaCuadro(
  cuadroIndex,
  key
){

  const q =
    normalizarCuadros(
      draft
    )[cuadroIndex];


  if(!q) return;


  q[key].push({
    descripcion:'',
    tiempoMin:0,
    causa:''
  });


  renderFormTab();

}


function updateArrItemCuadro(
  cuadroIndex,
  key,
  i,
  field,
  val
){

  const q =
    normalizarCuadros(
      draft
    )[cuadroIndex];


  if(
    !q ||
    !q[key]?.[i]
  ){

    return;

  }


  q[key][i][field] =
    field === 'tiempoMin'
      ? Number(
          val || 0
        )
      : val;


  actualizarCuadro(
    cuadroIndex
  );


  refreshKpisOnly();

}


function removeArrItemCuadro(
  cuadroIndex,
  key,
  i
){

  const q =
    normalizarCuadros(
      draft
    )[cuadroIndex];


  if(!q) return;


  q[key].splice(
    i,
    1
  );


  if(
    !q[key].length
  ){

    q[key].push({
      descripcion:'',
      tiempoMin:0,
      causa:''
    });

  }


  actualizarCuadro(
    cuadroIndex
  );


  renderFormTab();

}


/* =========================================================
   CUADROS DE PRODUCCIÓN — MERMAS
   ========================================================= */

/*
   =========================================================
   CÁLCULO CENTRAL DE MERMAS (peso en kg -> unidades)
   =========================================================

   Única función que sabe CÓMO convertir el peso ingresado
   (en kg) a unidades de merma, para cualquier línea y
   componente. Los números de conversión (divisores) NO
   están aquí — viven en MERMA_DIVISORES_POR_LINEA
   (01-config.js), que es el único lugar que hay que tocar
   si cambia el peso unitario de un componente.

   obtenerValoresMermaCuadro() y obtenerValoresMerma() son
   apenas dos envoltorios que solo resuelven de dónde sale
   el gramaje de preforma (del cuadro, o del draft) y le
   pasan todo a esta función.
*/

function calcularValoresMerma(
  r,
  linea,
  gramajePreforma
){

  const pesoIngresado =
    num(r.peso);

  const unidadesIngresadas =
    Math.round(
      num(r.unidades)
    );

  const config =
    (MERMA_DIVISORES_POR_LINEA[linea] || {})[r.item];


  /* =====================================================
     SIN CONFIGURACIÓN PARA ESTE ÍTEM/LÍNEA
     ===================================================== */

  if(config === undefined){

    if(linea === 'C20L'){

      return {

        peso:
          unidadesIngresadas *
          0.0906,

        unidades:
          unidadesIngresadas

      };

    }

    return {

      peso:
        pesoIngresado,

      unidades:
        unidadesIngresadas

    };

  }


  /* =====================================================
     DIVISOR VARIABLE: GRAMAJE DE LA PREFORMA
     (Botellas/Preformas de PET1/PET2)
     ===================================================== */

  if(config === 'gramajePreforma'){

    const gramaje =
      num(gramajePreforma);

    return {

      peso:
        pesoIngresado,

      unidades:
        gramaje > 0

          ? Math.round(
              (
                pesoIngresado *
                1000
              ) /
              gramaje
            )

          : 0

    };

  }


  /* =====================================================
     DIVISOR FIJO — FÓRMULA ESTÁNDAR
     unidades = round((peso × 1000) / divisor)
     ===================================================== */

  if(typeof config === 'number'){

    return {

      peso:
        pesoIngresado,

      unidades:
        Math.round(
          (
            pesoIngresado *
            1000
          ) /
          config
        )

    };

  }


  /* =====================================================
     DIVISOR FIJO — CASO ESPECIAL
     (peso ya viene en la unidad que se necesita,
     ej. Polietileno; y/o unidades con decimales)
     ===================================================== */

  const base =
    config.sinMultiplicarPor1000

      ? pesoIngresado

      : pesoIngresado * 1000;

  const valor =
    base /
    config.divisor;

  return {

    peso:
      pesoIngresado,

    unidades:
      config.decimales !== undefined

        ? Number(
            valor.toFixed(
              config.decimales
            )
          )

        : Math.round(valor)

  };

}


function obtenerValoresMermaCuadro(
  r,
  linea,
  cuadro
){

  return calcularValoresMerma(
    r,
    linea,
    cuadro?.gramajePreforma
  );

}


function actualizarMermasAutomaticasCuadro(i){

  if(!draft) return;


  const q =
    normalizarCuadros(
      draft
    )[i];


  if(
    !q ||
    !Array.isArray(q.mermas)
  ){

    return;

  }


  q.mermas.forEach(
    r => {

      const v =
        obtenerValoresMermaCuadro(
          r,
          draft.linea,
          q
        );


      r.peso =
        v.peso;


      r.unidades =
        Number(
          num(
            v.unidades
          ).toFixed(2)
        );

    }
  );

}


function mermasTableCuadro(
  rows,
  produccionEfectiva,
  linea,
  cuadroIndex
){

  const efectiva =
    num(
      produccionEfectiva
    ) || 0;


  const q =
    normalizarCuadros(
      draft
    )[cuadroIndex];


  return `

    <div
      class="mermas-cuadro-scroll"
      style="
        width:100%;
        max-width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        -webkit-overflow-scrolling:touch;
        border:
          1px solid #D7DBD4;
        border-radius:8px;
        background:#fff;
      "
    >

      <table
        style="
          width:520px;
          min-width:520px;
          table-layout:fixed;
          border-collapse:collapse;
          font-size:12px;
          margin:0;
        "
      >

        <thead>

          <tr>

            <th
              style="
                width:34%;
                text-align:left;
              "
            >
              Componente
            </th>


            <th
              style="
                width:22%;
                text-align:center;
              "
            >
              Peso (kg)
            </th>


            <th
              style="
                width:24%;
                text-align:center;
              "
            >
              Unidades
            </th>


            <th
              style="
                width:20%;
                text-align:center;
              "
            >
              %
            </th>

          </tr>

        </thead>


        <tbody>

          ${
            (rows || [])
              .map(
                (r,i) => {

                  const v =
                    obtenerValoresMermaCuadro(
                      r,
                      linea,
                      q
                    );


                  const porcentaje =
                    efectiva > 0

                      ? (
                          (
                            v.unidades /
                            efectiva
                          ) * 100
                        ).toFixed(2) +
                        '%'

                      : '—';


                  const pesoEdit =
                    linea === 'C20L';


                  const unidadesEdit =
                    linea === 'C20L' ||
                    linea === 'B20L';


                  return `

                    <tr>

                      <td>
                        ${r.item}
                      </td>


                      <td>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value="${v.peso}"

                          ${
                            pesoEdit

                              ? `
                                readonly
                                style="
                                  width:100%;
                                  box-sizing:border-box;
                                  background:#f1f3f5;
                                  font-weight:700;
                                  cursor:not-allowed;
                                  text-align:center;
                                "
                              `

                              : `
                                onchange="
                                  updateMermaCuadro(
                                    ${cuadroIndex},
                                    ${i},
                                    'peso',
                                    this.value
                                  )
                                "
                                style="
                                  width:100%;
                                  box-sizing:border-box;
                                  text-align:center;
                                "
                              `
                          }

                        >

                      </td>


                      <td>

                        <input
                          type="number"
                          min="0"
                          step="${
                            r.item.startsWith('Polietileno')
                              ? '0.01'
                              : '1'
                          }"
                          value="${
                            r.item.startsWith('Polietileno')
                              ? Number(
                                  v.unidades
                                ).toFixed(2)
                              : v.unidades
                          }"

                          ${
                            unidadesEdit

                              ? `
                                oninput="
                                  updateMermaCuadro(
                                    ${cuadroIndex},
                                    ${i},
                                    'unidades',
                                    this.value
                                  )
                                "
                                style="
                                  width:100%;
                                  box-sizing:border-box;
                                  text-align:center;
                                "
                              `

                              : `
                                readonly
                                style="
                                  width:100%;
                                  box-sizing:border-box;
                                  background:#f1f3f5;
                                  font-weight:700;
                                  cursor:not-allowed;
                                  text-align:center;
                                "
                              `
                          }

                        >

                      </td>


                      <td class="small-muted">
                        ${porcentaje}
                      </td>

                    </tr>

                  `;

                }
              )
              .join('')
          }

        </tbody>

      </table>

    </div>

  `;

}


function updateMermaCuadro(
  cuadroIndex,
  i,
  field,
  val
){

  const q =
    normalizarCuadros(
      draft
    )[cuadroIndex];


  if(
    !q?.mermas?.[i]
  ){

    return;

  }


  if(
    (
      draft.linea === 'PET1' ||
      draft.linea === 'PET2' ||
      draft.linea === 'B7L'
    ) &&
    field !== 'peso'
  ){

    return;

  }


  if(
    draft.linea === 'C20L' &&
    field !== 'unidades'
  ){

    return;

  }


  q.mermas[i][field] =
    val === ''
      ? ''
      : Number(val);


  actualizarMermasAutomaticasCuadro(
    cuadroIndex
  );


  renderFormTab();

}


/* =========================================================
   TABLA DE PARADAS
   ========================================================= */

function paradasTable(
  key,
  rows
){

  const esProgramada =
    key ===
    'paradasProgramadas';


  return `

    <table>

      <thead>

        <tr>

          <th>
            Descripción
          </th>


          <th
            style="width:140px;"
          >
            Tiempo (min)
          </th>


          <th
            style="width:40px;"
          >
          </th>

        </tr>

      </thead>


      <tbody>

        ${

          rows.map(

            (r,i) => {

              const celdaDescripcion =

                esProgramada

                  ? `

                    <select
                      onchange="
                        updateArrItem(
                          '${key}',
                          ${i},
                          'descripcion',
                          this.value
                        )
                      "
                    >

                      <option
                        value=""
                        ${
                          r.descripcion
                            ? ''
                            : 'selected'
                        }
                      >
                        Seleccione...
                      </option>


                      ${
                        PARADAS_PROGRAMADAS.map(

                          opcion => `

                            <option
                              value="${opcion}"
                              ${
                                opcion ===
                                r.descripcion
                                  ? 'selected'
                                  : ''
                              }
                            >
                              ${opcion}
                            </option>

                          `

                        ).join('')
                      }

                    </select>

                  `

                  : `

                    <input
                      style="width:500%;"
                      value="${r.descripcion}"
                      oninput="
                        updateArrItem(
                          '${key}',
                          ${i},
                          'descripcion',
                          this.value
                        )
                      "
                    >

                  `;


              return `

              <tr>

                <td>

                  ${celdaDescripcion}

                </td>


                <td>

                  <input
                    type="number"
                    value="${r.tiempoMin}"
                    oninput="
                      updateArrItem(
                        '${key}',
                        ${i},
                        'tiempoMin',
                        this.value
                      )
                    "
                  >

                </td>


                <td>

                  <button
                    class="row-del"
                    onclick="
                      removeArrItem(
                        '${key}',
                        ${i}
                      )
                    "
                  >
                    ✕
                  </button>

                </td>

              </tr>

              `;

            }

          ).join('')

        }

      </tbody>

    </table>

  `;

}


function addParada(
  key
){

  draft[key].push({

    descripcion:'',

    tiempoMin:0

  });


  renderFormTab();

}


function updateArrItem(
  key,
  i,
  field,
  val
){

  draft[key][i][field] =
    val;


  refreshKpisOnly();

}


function removeArrItem(
  key,
  i
){

  draft[key].splice(
    i,
    1
  );


  renderFormTab();

}


/* =========================================================
   TABLA DE MERMAS
   ========================================================= */

function obtenerValoresMerma(
  r,
  linea
){

  return calcularValoresMerma(
    r,
    linea,
    draft?.gramajePreforma
  );

}


function actualizarMermasAutomaticas(){

  if(!draft) return;


  if(
    Array.isArray(
      draft.cuadros
    )
  ){

    normalizarCuadros(
      draft
    ).forEach(
      (_,i) =>
        actualizarMermasAutomaticasCuadro(
          i
        )
    );


    syncLegacyFromCuadro1();


    return;

  }


  if(
    !Array.isArray(
      draft.mermas
    )
  ){

    return;

  }


  draft.mermas.forEach(
    r => {

      const valores =
        obtenerValoresMerma(
          r,
          draft.linea
        );


      r.peso =
        valores.peso;


      r.unidades =
        Number(
          num(
            valores.unidades
          ).toFixed(2)
        );

    }
  );

}


function mermasTable(
  rows,
  produccionEfectiva,
  linea
){

  const efectiva =
    num(
      produccionEfectiva
    ) || 0;


  return `

    <table>

      <thead>

        <tr>

          <th>
            Componente
          </th>


          <th>
            Peso (Kg)
          </th>


          <th>
            Unidades
          </th>


          <th>
            Porcentaje
          </th>

        </tr>

      </thead>


      <tbody>

        ${

          rows.map(

            (r,i) => {

              const valores =
                obtenerValoresMerma(
                  r,
                  linea
                );


              const porcentaje =
                efectiva > 0

                  ? (
                      (
                        valores.unidades /
                        efectiva
                      ) * 100
                    ).toFixed(2) +
                    '%'

                  : '—';


              /*
                 PESO:

                 Se utiliza onchange en lugar
                 de oninput para permitir
                 escribir decimales completos.
              */

              const pesoEditable =
                linea === 'C20L'

                  ? ''

                  : `
                    onchange="
                      updateMerma(
                        ${i},
                        'peso',
                        this.value
                      )
                    "
                  `;


              const pesoReadonly =
                linea === 'C20L'

                  ? `
                    readonly
                    tabindex="-1"
                    style="
                      background:#f1f3f5;
                      font-weight:700;
                      color:#243746;
                      cursor:not-allowed;
                    "
                  `

                  : '';


              const unidadesEditable =
                linea === 'C20L' ||
                linea === 'B20L';


              const unidadesReadonly =
                unidadesEditable

                  ? ''

                  : `
                    readonly
                    tabindex="-1"
                    style="
                      background:#f1f3f5;
                      font-weight:700;
                      color:#243746;
                      cursor:not-allowed;
                    "
                  `;


              const unidadesEvento =
                unidadesEditable

                  ? `
                    oninput="
                      updateMerma(
                        ${i},
                        'unidades',
                        this.value
                      )
                    "
                  `

                  : '';


              return `

                <tr>

                  <td>
                    ${r.item}
                  </td>


                  <td>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value="${valores.peso}"
                      ${pesoReadonly}
                      ${pesoEditable}
                    >

                  </td>


                  <td>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value="${
                        r.item.startsWith('Polietileno')
                          ? Number(
                              valores.unidades
                            ).toFixed(2)
                          : valores.unidades
                      }"
                      ${unidadesReadonly}
                      ${unidadesEvento}
                    >

                  </td>


                  <td class="small-muted">
                    ${porcentaje}
                  </td>

                </tr>

              `;

            }

          ).join('')

        }

      </tbody>

    </table>

  `;

}


function updateMerma(
  i,
  field,
  val
){

  if(
    !draft.mermas[i]
  ){

    return;

  }


  /*
     PET1, PET2 y B7L:
     solo se puede modificar el peso.

     C20L:
     solo se pueden modificar las unidades.

     B20L:
     ambos campos son editables.
  */

  if(
    (
      draft.linea === 'PET1' ||
      draft.linea === 'PET2' ||
      draft.linea === 'B7L'
    ) &&
    field !== 'peso'
  ){

    return;

  }


  if(
    draft.linea === 'C20L' &&
    field !== 'unidades'
  ){

    return;

  }


  /*
     Guardar posición actual
     de la pantalla.
  */

  const scrollY =
    window.scrollY;


  /*
     Guardar el valor.
  */

  if(
    field === 'peso'
  ){

    draft.mermas[i][field] =
      val === ''
        ? ''
        : Number(val);

  }else{

    draft.mermas[i][field] =
      val === ''
        ? ''
        : Number(val);

  }


  actualizarMermasAutomaticas();


  renderFormTab();


  requestAnimationFrame(
    () => {

      window.scrollTo(
        0,
        scrollY
      );

    }
  );

}


/* =========================================================
   TABLA DE PERSONAL
   ========================================================= */

function personalTable(
  rows,
  linea
){

  const trabajadoresDisponibles =
    findWorkersForLine(
      linea
    );


  return `

    <datalist
      id="personal-workers-datalist"
    >

      ${
        trabajadoresDisponibles.map(

          w => `

            <option
              value="${w.nombre}"
            >
              ${w.cargo || ''}
            </option>

          `

        ).join('')
      }

    </datalist>


    <table>

      <thead>

        <tr>

          <th
            style="width:160px;"
          >
            Posición
          </th>


          <th>
            Nombre y apellido
          </th>


          <th
            style="width:160px;"
          >
            Cargo
          </th>

        </tr>

      </thead>


      <tbody>

        ${

          rows.map(

            (r,i) => `

              <tr>

                <td>
                  ${r.posicion}
                </td>


                <td>

                  <input
                    list="personal-workers-datalist"
                    value="${r.nombre}"
                    oninput="
                      updatePersonal(
                        ${i},
                        'nombre',
                        this.value
                      )
                    "
                  >

                </td>


                <td>

                  <input
                    id="personal-cargo-${i}"
                    value="${r.cargo}"
                    oninput="
                      updatePersonal(
                        ${i},
                        'cargo',
                        this.value
                      )
                    "
                  >

                </td>

              </tr>

            `

          ).join('')

        }

      </tbody>

    </table>

  `;

}


function updatePersonal(
  i,
  field,
  val
){

  draft.personal[i][field] =
    val;


  /*
     Si se escribe/selecciona un nombre
     que coincide con un trabajador registrado
     en la base de datos, se autocompleta su cargo.
  */

  if(
    field === 'nombre'
  ){

    const worker =
      findWorkerByNombre(
        val
      );


    if(worker){

      draft.personal[i].cargo =
        worker.cargo ||
        '';


      const cargoInput =
        document.getElementById(
          'personal-cargo-' +
          i
        );


      if(cargoInput){

        cargoInput.value =
          worker.cargo ||
          '';

      }

    }

  }

}


/* =========================================================
   LIMPIAR FORMULARIO
   ========================================================= */

function resetDraft(){

  /*
     Liberar las vistas previas
     que todavía estén en memoria.
  */

  const evidencias =
    Array.isArray(
      draft?.evidenciasPT
    )
      ? draft.evidenciasPT
      : [];


  liberarPreviewsEvidenciasPT(
    evidencias
  );


  draft =
    blankRecord(
      state.currentLine
    );


  renderFormTab();

}


/* =========================================================
   GUARDAR REGISTRO
   ========================================================= */

async function saveDraft(){

  /*
     Evita doble guardado.
  */
  if(
    !draft ||
    guardandoRegistro
  ){

    return;

  }


  /*
     ======================================================
     VALIDACIÓN OBLIGATORIA DE FOTOS
     ======================================================
  */

  const evidencias =
    Array.isArray(
      draft.evidenciasPT
    )
      ? draft.evidenciasPT
      : [];


  if(
    !evidencias.length
  ){

    alert(
      'Debes adjuntar al menos una fotografía de las Hojas de Producto Terminado antes de guardar el registro.'
    );


    /*
       Llevar al usuario
       directamente al panel de evidencia.
    */

    const evidenciaPanel =
      document.querySelector(
        '.panel[style*="border-left"]'
      );


    if(evidenciaPanel){

      evidenciaPanel.scrollIntoView({

        behavior:
          'smooth',

        block:
          'center'

      });

    }


    return;

  }


  guardandoRegistro =
    true;


  /*
     Buscar botón guardar.
  */

  const botonGuardar =
    document.querySelector(
      '.actions-row .btn-primary'
    );


  const textoOriginal =
    botonGuardar
      ? botonGuardar.textContent
      : 'Guardar registro';


  if(botonGuardar){

    botonGuardar.disabled =
      true;


    botonGuardar.textContent =
      'Subiendo fotos...';


    botonGuardar.style.opacity =
      '.7';


    botonGuardar.style.cursor =
      'wait';

  }


  /*
     Mantener toda la lógica
     existente antes del guardado.
  */

  normalizarCuadros(
    draft
  );


  actualizarTodosCuadros();


  actualizarMermasAutomaticas();


  draft.diaJuliano =
    obtenerDiaDelAño(
      draft.fecha
    );


  draft.semana =
    obtenerSemana(
      draft.fecha
    );


  actualizarLotesCuadros();


  syncLegacyFromCuadro1();


  /*
     ID único del registro.
  */

  draft.id =
    'r_' +
    Date.now();


  draft.timestamp =
    new Date().toISOString();


  draft.registradoPor =
    state.user
      ? state.user.nombre
      : '';


  try{

    /*
       ==================================================
       SUBIR FOTOS A CLOUDINARY
       ==================================================
    */

    if(botonGuardar){

      botonGuardar.textContent =
        'Subiendo fotos...';

    }


    const evidenciasSubidas =
      await subirEvidenciasPT(
        draft.id
      );


    /*
       IMPORTANTE:
       Después de subir las imágenes,
       eliminamos Blob y previewUrl del objeto
       que finalmente irá a Firestore.
    */

    draft.evidenciasPT =
      evidenciasSubidas;


    if(botonGuardar){

      botonGuardar.textContent =
        'Guardando registro...';

    }


    /*
       ==================================================
       GUARDAR REGISTRO
       ==================================================
    */

    const records =
      loadRecords();


    /*
       JSON.parse/stringify mantiene
       exactamente el comportamiento anterior
       de guardar una copia limpia del registro.
    */

    records.push(
      JSON.parse(
        JSON.stringify(
          draft
        )
      )
    );


    saveRecords(
      records
    );


    /*
       Liberamos las URLs temporales
       creadas durante la vista previa.
    */

    liberarPreviewsEvidenciasPT(
      evidencias
    );


    /*
       Crear nuevo formulario limpio.
    */

    draft =
      blankRecord(
        state.currentLine
      );


    /*
       Ir al historial.
    */

    state.currentTab =
      'historial';


    renderMain();

  }catch(error){

    console.error(
      'Error guardando registro:',
      error
    );


    /*
       IMPORTANTE:

       No intentamos borrar las imágenes
       de Cloudinary desde el navegador.

       Para borrarlas se necesitaría el
       API Secret, que NUNCA debe exponerse
       en JavaScript del frontend.

       Conservamos las fotos locales para
       que el usuario pueda volver a intentar
       guardar el registro.
    */

    draft.evidenciasPT =
      evidencias;


    renderFormTab();


    alert(
      'No se pudo guardar el registro.\n\n' +
      'Detalle: ' +
      (
        error?.message ||
        error
      )
    );

  }finally{

    guardandoRegistro =
      false;


    if(botonGuardar){

      botonGuardar.disabled =
        false;


      botonGuardar.textContent =
        textoOriginal ||
        'Guardar registro';


      botonGuardar.style.opacity =
        '';


      botonGuardar.style.cursor =
        '';

    }

  }

}