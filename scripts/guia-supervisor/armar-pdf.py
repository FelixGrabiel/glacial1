# GLACIAL · Guía del supervisor de producción en PDF (12/11/2026)
# Usa las capturas de capturar.js (NN-MM.png, movil-*.png) y los textos de escenas.js (vía escenas.json).
# Uso: python3 scripts/guia-supervisor/armar-pdf.py [salida]
import json, os, sys, subprocess
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image, PageBreak,
                                Table, TableStyle, KeepTogether, NextPageTemplate)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SALIDA = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'guia-supervisor-salida'))
CAP = os.path.join(SALIDA, 'capturas')
LOGO = os.path.join(RAIZ, 'assets', 'img', 'icono-192.png')
AZUL, AZUL_OSC, CELESTE, AMBAR, GRIS = colors.HexColor('#0877A6'), colors.HexColor('#033350'), colors.HexColor('#10B5F2'), colors.HexColor('#F2A93B'), colors.HexColor('#5B6B78')

secciones = json.loads(subprocess.check_output(['node', '-e',
    "const {SECCIONES}=require(process.argv[1]);console.log(JSON.stringify(SECCIONES))", os.path.join(os.path.dirname(__file__), 'escenas.js')]))

E = {
  'tit': ParagraphStyle('tit', fontName='Helvetica-Bold', fontSize=30, leading=36, textColor=colors.white, alignment=TA_CENTER),
  'sub': ParagraphStyle('sub', fontName='Helvetica', fontSize=14, leading=19, textColor=colors.HexColor('#CFEFFF'), alignment=TA_CENTER),
  'h1': ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=20, leading=24, textColor=AZUL_OSC, spaceAfter=4),
  'h1n': ParagraphStyle('h1n', fontName='Helvetica-Bold', fontSize=11, leading=13, textColor=AZUL, spaceAfter=2),
  'txt': ParagraphStyle('txt', fontName='Helvetica', fontSize=10.5, leading=14.5, textColor=colors.HexColor('#1F2D3A')),
  'paso': ParagraphStyle('paso', fontName='Helvetica', fontSize=10.5, leading=14, textColor=colors.HexColor('#1F2D3A'), leftIndent=0),
  'nota': ParagraphStyle('nota', fontName='Helvetica-Oblique', fontSize=9, leading=12, textColor=GRIS),
  'preg': ParagraphStyle('preg', fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=AZUL_OSC, spaceBefore=8),
  'ind': ParagraphStyle('ind', fontName='Helvetica', fontSize=12, leading=20, textColor=AZUL_OSC),
}

def portada(c, doc):
    w, h = A4
    c.saveState()
    c.setFillColor(AZUL_OSC); c.rect(0, 0, w, h, stroke=0, fill=1)
    c.setFillColor(AZUL); c.rect(0, 0, w, h * 0.42, stroke=0, fill=1)
    if os.path.exists(LOGO): c.drawImage(LOGO, w / 2 - 2.2 * cm, h - 9.5 * cm, 4.4 * cm, 4.4 * cm, mask='auto')
    c.setFillColor(colors.HexColor('#9EE3FF')); c.setFont('Helvetica-Bold', 11); c.drawCentredString(w / 2, h - 11 * cm, 'GLACIAL · SISTEMA DE PRODUCCIÓN')
    c.setFillColor(colors.white); c.setFont('Helvetica-Bold', 30); c.drawCentredString(w / 2, h - 12.8 * cm, 'Guía del supervisor')
    c.drawCentredString(w / 2, h - 14.1 * cm, 'de producción')
    c.setFont('Helvetica', 13); c.setFillColor(colors.HexColor('#CFEFFF'))
    c.drawCentredString(w / 2, h - 15.6 * cm, 'Paso a paso: entrar, registrar el turno, finalizar y entregar')
    c.setFont('Helvetica', 10); c.setFillColor(colors.white)
    c.drawCentredString(w / 2, 3.2 * cm, 'Las pantallas de esta guía usan datos de ejemplo (no son datos de la planta).')
    c.drawCentredString(w / 2, 2.5 * cm, 'Cada sección tiene su video corto con el mismo contenido.')
    c.restoreState()

def pagina(c, doc):
    w, h = A4
    c.saveState()
    c.setFillColor(AZUL_OSC); c.rect(0, h - 1.15 * cm, w, 1.15 * cm, stroke=0, fill=1)
    if os.path.exists(LOGO): c.drawImage(LOGO, 1.3 * cm, h - 1.0 * cm, 0.85 * cm, 0.85 * cm, mask='auto')
    c.setFillColor(colors.white); c.setFont('Helvetica-Bold', 9.5); c.drawString(2.4 * cm, h - 0.72 * cm, 'GLACIAL · Guía del supervisor de producción')
    c.setFont('Helvetica', 8.5); c.setFillColor(colors.HexColor('#9EE3FF')); c.drawRightString(w - 1.4 * cm, h - 0.72 * cm, 'Datos de ejemplo')
    c.setFillColor(GRIS); c.setFont('Helvetica', 8.5); c.drawRightString(w - 1.4 * cm, 0.9 * cm, 'Página %d' % doc.page)
    c.restoreState()

def img(ruta, ancho):
    from PIL import Image as PI
    with PI.open(ruta) as im: w, h = im.size
    return Image(ruta, width=ancho, height=ancho * h / w)

doc = BaseDocTemplate(os.path.join(SALIDA, 'Guia-Supervisor-Produccion-GLACIAL.pdf'), pagesize=A4,
                      leftMargin=1.6 * cm, rightMargin=1.6 * cm, topMargin=1.8 * cm, bottomMargin=1.5 * cm,
                      title='Guía del supervisor de producción · GLACIAL', author='GLACIAL', subject='Guía de uso del sistema para supervisores de producción')
marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='m')
doc.addPageTemplates([PageTemplate(id='portada', frames=[marco], onPage=portada), PageTemplate(id='normal', frames=[marco], onPage=pagina)])
ANCHO = doc.width

h = [NextPageTemplate('normal'), PageBreak()]
h += [Paragraph('Contenido', E['h1']), Spacer(1, 6)]
filas = [[Paragraph('<b>%d.</b>&nbsp;&nbsp;%s' % (s['n'], s['titulo']), E['ind']), Paragraph('Video %02d' % s['n'], E['nota'])] for s in secciones]
filas.append([Paragraph('<b>10.</b>&nbsp;&nbsp;En el celular', E['ind']), Paragraph('', E['nota'])])
filas.append([Paragraph('<b>11.</b>&nbsp;&nbsp;Preguntas frecuentes y a quién avisar', E['ind']), Paragraph('', E['nota'])])
t = Table(filas, colWidths=[ANCHO * 0.78, ANCHO * 0.22])
t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#DCE6EE')), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
h += [t, Spacer(1, 14)]
h += [Paragraph('<b>Cómo usar esta guía.</b> Cada sección explica una pantalla con capturas numeradas. El recuadro naranja marca dónde mirar o tocar. '
                'Cada sección tiene además un video corto (de 1 a 2 minutos) con el mismo recorrido, para verlo en el celular antes de empezar el turno.', E['txt'])]

for s in secciones:
    h += [PageBreak(), Paragraph('SECCIÓN %d' % s['n'], E['h1n']), Paragraph(s['titulo'], E['h1']), Spacer(1, 4)]
    for i, esc in enumerate(s['escenas']):
        ruta = os.path.join(CAP, '%02d-%02d.png' % (s['n'], i + 1))
        bloque = []
        num = Table([[Paragraph('<font color="#FFFFFF"><b>%d</b></font>' % (i + 1), ParagraphStyle('n', fontName='Helvetica-Bold', fontSize=11, alignment=TA_CENTER, textColor=colors.white)),
                      Paragraph(esc['texto'], E['paso'])]], colWidths=[0.8 * cm, ANCHO - 0.8 * cm])
        num.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, 0), AZUL), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (1, 0), (1, 0), 8),
                                 ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
        bloque.append(num); bloque.append(Spacer(1, 4))
        if os.path.exists(ruta):
            im = img(ruta, ANCHO)
            marco_img = Table([[im]], colWidths=[ANCHO]); marco_img.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#C9D6E0')), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
            bloque.append(marco_img)
        bloque.append(Spacer(1, 12))
        h.append(KeepTogether(bloque))

# En el celular
h += [PageBreak(), Paragraph('SECCIÓN 10', E['h1n']), Paragraph('En el celular', E['h1']),
      Paragraph('El sistema funciona igual en el celular. El menú se abre con el botón de las tres rayas, arriba a la izquierda. '
                'Las tablas se muestran como tarjetas, una debajo de otra.', E['txt']), Spacer(1, 10)]
movs = [('movil-inicio.png', 'Inicio'), ('movil-menu.png', 'Menú abierto'), ('movil-produccion-actual.png', 'Producción actual'), ('movil-nuevo-registro.png', 'Nuevo registro')]
celdas = []
for f, et in movs:
    r = os.path.join(CAP, f)
    if os.path.exists(r): celdas.append([img(r, ANCHO / 4 - 0.4 * cm), Paragraph(et, ParagraphStyle('c', fontName='Helvetica-Bold', fontSize=9, alignment=TA_CENTER, textColor=AZUL_OSC))])
if celdas:
    tm = Table([[c[0] for c in celdas], [c[1] for c in celdas]], colWidths=[ANCHO / len(celdas)] * len(celdas))
    tm.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    h.append(tm)

# Preguntas frecuentes
faq = [
  ('Aparece «Todavía se están cargando los datos… No se guardó nada».', 'El equipo aún no terminó de cargar la lista. Espera unos segundos y vuelve a intentarlo. Si el aviso se repite, recarga la página (Ctrl + F5) y revisa la conexión.'),
  ('Aparece «Tu turno cerró».', 'Terminó tu horario: lo que estabas escribiendo quedó como borrador y la cuenta pasó a Visualizar. Si necesitas más tiempo, pídelo al Administrador.'),
  ('Dice «Turno sin horario» o «Sin rotación publicada».', 'La rotación de la semana no está publicada o no figuras en ella. Avísale a Jefatura de Producción.'),
  ('Se cortó internet mientras registraba.', 'No cierres la pantalla. Lo escrito queda como borrador en el equipo y los guardados se reintentan solos cuando vuelve la conexión.'),
  ('No aparece mi línea o la programación.', 'Revisa que la fecha y el turno sean los correctos. Si de verdad no hay programación, avisa a Planificación.'),
  ('Ya existe un reporte de mi línea y turno.', 'No crees otro. Ábrelo desde Registro de producción › Historial y continúa en ese.'),
  ('Me equivoqué en un reporte que ya finalicé.', 'Pide a Jefatura de Producción que lo reabra. Corrige y vuelve a finalizarlo.'),
  ('Una línea no está produciendo y tiene programación.', 'Informa el motivo en Producción actual con «Informar motivo de no producción» y registra la parada en el reporte.'),
]
h += [PageBreak(), Paragraph('SECCIÓN 11', E['h1n']), Paragraph('Preguntas frecuentes y a quién avisar', E['h1'])]
for p, r in faq: h += [Paragraph(p, E['preg']), Paragraph(r, E['txt'])]
h += [Spacer(1, 14)]
tq = Table([[Paragraph('<b>Tema</b>', E['txt']), Paragraph('<b>A quién avisar</b>', E['txt'])],
            [Paragraph('Usuario, contraseña, tiempo extra de turno', E['txt']), Paragraph('Administrador del sistema', E['txt'])],
            [Paragraph('Rotación, reabrir reportes, dudas del registro', E['txt']), Paragraph('Jefatura de Producción', E['txt'])],
            [Paragraph('Programación del turno o cambios de formato', E['txt']), Paragraph('Planificación', E['txt'])],
            [Paragraph('Paradas por falla de máquina', E['txt']), Paragraph('Mantenimiento (y regístralas en el reporte)', E['txt'])]],
           colWidths=[ANCHO * 0.58, ANCHO * 0.42])
tq.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E8F4FA')), ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#C9D6E0')), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
h.append(tq)
doc.build(h)
print('✔ Guia-Supervisor-Produccion-GLACIAL.pdf')
