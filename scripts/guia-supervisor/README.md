# Guía del supervisor de producción: videos, PDF y guion de voz

Genera la guía a partir de la **página real** (`index.html`) con la **base simulada** de las pruebas
(`tests/ayuda/servidor-simulado.js`). No toca ninguna base real. Las pantallas usan **datos de ejemplo**:
- la supervisora ficticia «Ana Supervisora», con usuario `ana` y clave `Demo#2026`, que solo existen en la simulación;
- la programación, las paletas, el personal y la rotación se inventan en `datos-demo.js`;
- la hora queda fija en las 10:30 del día en curso (turno DÍA).

| Archivo | Qué hace |
|---|---|
| `entorno.js` | Levanta la página con la base simulada y un navegador (Playwright). |
| `datos-demo.js` | Siembra los datos de ejemplo. |
| `escenas.js` | **El contenido de cada sección.** Por cada escena define:<br>• el texto (es a la vez el subtítulo y la voz);<br>• la pantalla que se abre;<br>• lo que se resalta o se toca. |
| `capturar.js` | Graba un video MP4 por sección y saca las capturas del PDF (PC y celular). |
| `armar-guion.js` | Arma `guion-voz.md`, con las instrucciones para la IA de voz y una línea por escena (`[01-01] …`). |
| `armar-pdf.py` | Arma `Guia-Supervisor-Produccion-GLACIAL.pdf` con las capturas y los mismos textos. |

## Regenerar

```bash
# 1) Librerías de gráficos para el navegador (solo la primera vez), en una carpeta fuera del repositorio:
npm install --prefix /ruta/libs apexcharts@3.45.2 echarts@5.4.3 canvas-gauges@2.1.7
# 2) Videos y capturas (todas las secciones, o solo algunas: … capturar.js salida 1 4)
GLX_LIBS=/ruta/libs node scripts/guia-supervisor/capturar.js guia-supervisor-salida
# 3) Guion de voz y PDF
node scripts/guia-supervisor/armar-guion.js guia-supervisor-salida
python3 scripts/guia-supervisor/armar-pdf.py guia-supervisor-salida
```

## Con voz

1. Pásale `guion-voz.md` a la IA de voz. Debe entregar un audio por línea, nombrado con su código: `01-01.mp3`, `01-02.mp3`…
2. Pon los audios en una carpeta y vuelve a grabar con `VOZ=<carpeta>`:

```bash
VOZ=/ruta/audios GLX_LIBS=/ruta/libs node scripts/guia-supervisor/capturar.js guia-supervisor-salida
```

Cada escena dura lo que dura su audio, más una pausa, y el video sale con la voz mezclada.

La carpeta de salida (`guia-supervisor-salida/`) no se sube al repositorio.
