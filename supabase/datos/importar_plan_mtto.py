#!/usr/bin/env python3
"""GLACIAL · Mantenimiento · importa el PLAN-PROGRAMA MTTO 2026 (.xlsx, una hoja por máquina) y genera el SQL de carga (glacial_47).

Uso:  python3 supabase/datos/importar_plan_mtto.py RUTA_DEL_PLAN.xlsx [SALIDA.sql] [AÑO]
      (requiere openpyxl; no se conecta a ninguna base: solo escribe el .sql y el informe por hoja)

Reglas (acordadas con el dueño):
  · Los textos se normalizan SOLO en espacios (se quitan los sobrantes). Ortografía y numeración NO se corrigen:
    «VETILADOR», «ELECTROVÁVULAS», «RODILLLOS» y el ítem 16 repetido de SOP salen tal cual, porque el impreso debe ser idéntico al Excel.
  · Semanas: «1 - 52» / «1 -52» = todo el año; un número = esa semana; «1,3» o «17,19,21» = todas esas semanas.
  · Las hojas «… CARB» se importan marcadas pendiente_confirmar = true y sin línea asignada (no se asignan a PET2).
  · El nombre de la máquina sale del encabezado de página de la hoja (3.ª línea del centro).
El SQL es repetible: actualiza las máquinas por codigo_hoja y reemplaza las actividades del año de esas máquinas.
"""
import re
import sys

import openpyxl

TODO_ANIO = '["1 - 52"' + ',""' * 11 + ']'      # texto de las 12 celdas de mes de una actividad «1 - 52» (impresa combinada)
BLOQUES = ['SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', '18 MESES', 'BIANUAL']


def limpio(v):
    return re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''


def semanas_de(v):
    """(texto original, lista de semanas, es_todo_el_anio) de una celda de mes."""
    if v is None or limpio(v) == '':
        return '', [], False
    t = limpio(v)
    if re.fullmatch(r'1\s*-\s*52', t):
        return '1 - 52', list(range(1, 53)), True
    nums = [int(x) for x in re.findall(r'\d+', t)]
    for n in nums:
        if not 1 <= n <= 53:
            raise ValueError('semana fuera de rango: %r' % t)
    if not re.fullmatch(r'\d+(\s*,\s*\d+)*', t):
        raise ValueError('formato de semana no reconocido: %r' % t)
    return t, nums, False


def sql_txt(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    origen = sys.argv[1]
    salida = sys.argv[2] if len(sys.argv) > 2 else 'plan_mtto.sql'
    anio = int(sys.argv[3]) if len(sys.argv) > 3 else 2026
    wb = openpyxl.load_workbook(origen)
    maquinas, actividades, informe = [], [], []
    for orden_m, ws in enumerate(wb.worksheets, start=1):
        cod = limpio(ws.title)
        centro = (ws.oddHeader.center.text or '').split('\n')
        nombre = limpio(centro[-1]) if len(centro) >= 3 else cod
        carb = 'CARB' in cod.upper()
        maquinas.append((cod, nombre, orden_m, carb))
        n = 0
        por_bloque = {}
        for fila in ws.iter_rows(min_row=3, max_col=17, values_only=True):
            if fila[1] is None and fila[4] is None:
                continue
            frec = limpio(fila[4]).upper()
            if frec not in BLOQUES:
                raise ValueError('%s: frecuencia desconocida %r' % (cod, frec))
            textos, semanas, todo = [], set(), False
            for v in fila[5:17]:
                t, s, tod = semanas_de(v)
                textos.append(t)
                semanas.update(s)
                todo = todo or tod
            n += 1
            por_bloque[frec] = por_bloque.get(frec, 0) + 1
            actividades.append(dict(cod=cod, frec=frec, bloque=BLOQUES.index(frec) + 1, item=limpio(fila[0]), actividad=limpio(fila[1]),
                                    insumos=limpio(fila[2]), n_tec=int(fila[3]) if fila[3] not in (None, '') else 1,
                                    textos=textos, semanas=sorted(semanas), todo=todo, orden=n))
        informe.append((cod, nombre, n, por_bloque, carb))

    out = ['-- GLACIAL · Mantenimiento · carga del PLAN-PROGRAMA MTTO %d (generado por supabase/datos/importar_plan_mtto.py). Repetible.' % anio,
           '-- Requiere glacial_47. Reemplaza las actividades del año de estas máquinas; no toca nada más.', 'begin;']
    for cod, nombre, orden_m, carb in maquinas:
        out.append("insert into public.mtto_maquinas (codigo_hoja, nombre, orden, pendiente_confirmar) values (%s, %s, %d, %s) "
                   "on conflict (codigo_hoja) do update set nombre = excluded.nombre, orden = excluded.orden, pendiente_confirmar = excluded.pendiente_confirmar;"
                   % (sql_txt(cod), sql_txt(nombre), orden_m, 'true' if carb else 'false'))
    out.append("delete from public.mtto_plan_actividades where anio = %d and maquina_id in (select id from public.mtto_maquinas where codigo_hoja in (%s));"
               % (anio, ', '.join(sql_txt(m[0]) for m in maquinas)))
    # Hojas idénticas a otra (las «CARB» son copias de SOP, ENV, DISP y COMP. AP): se copian en el servidor desde la hoja original, sin repetir las filas.
    def firma(cod):
        return [(a['frec'], a['bloque'], a['item'], a['actividad'], a['insumos'], a['n_tec'], tuple(a['textos']), tuple(a['semanas']), a['todo'], a['orden'])
                for a in actividades if a['cod'] == cod]
    copia_de, vistos = {}, {}
    for m in maquinas:
        f = tuple(map(repr, firma(m[0])))
        if f in vistos:
            copia_de[m[0]] = vistos[f]
        else:
            vistos[f] = m[0]
    # INSERT … VALUES por trozos (compacto): «1 - 52» (todo el año) se expande en el servidor y no se repite en cada fila.
    filas = []
    for a in actividades:
        if a['cod'] in copia_de:
            continue
        meses = '[' + ','.join('"%s"' % t.replace('"', '\\"') for t in a['textos']) + ']'
        sem = "null" if a['todo'] else "'{%s}'::integer[]" % ','.join(str(x) for x in a['semanas'])
        filas.append("(%s,%s,%d,%s,%s,%s,%d,%s,%s,%s,%d)" % (sql_txt(a['cod']), sql_txt(a['frec']), a['bloque'], sql_txt(a['item']), sql_txt(a['actividad']),
                     sql_txt(a['insumos']), a['n_tec'], sql_txt('' if a['todo'] else meses), sem, 'true' if a['todo'] else 'false', a['orden']))
    TROZO = 110
    for i in range(0, len(filas), TROZO):
        out.append("insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)\n"
                   "select m.id, %d, v.frec, v.bloque, v.item, v.actividad, v.insumos, v.n_tec, case when v.todo then %s::jsonb else v.meses::jsonb end, case when v.todo then array(select generate_series(1,52)) else v.semanas end, v.todo, v.orden\n"
                   "from (values\n%s\n) as v(cod, frec, bloque, item, actividad, insumos, n_tec, meses, semanas, todo, orden)\n"
                   "join public.mtto_maquinas m on m.codigo_hoja = v.cod;" % (anio, sql_txt(TODO_ANIO), ',\n'.join(filas[i:i + TROZO])))
    for cod, origen_cod in copia_de.items():
        out.append("insert into public.mtto_plan_actividades (maquina_id, anio, frecuencia, bloque_orden, item, actividad, insumos, n_tecnicos, semanas_por_mes, semanas, es_todo_el_anio, orden)\n"
                   "select d.id, o.anio, o.frecuencia, o.bloque_orden, o.item, o.actividad, o.insumos, o.n_tecnicos, o.semanas_por_mes, o.semanas, o.es_todo_el_anio, o.orden\n"
                   "from public.mtto_plan_actividades o join public.mtto_maquinas c on c.id = o.maquina_id and c.codigo_hoja = %s, public.mtto_maquinas d\n"
                   "where d.codigo_hoja = %s and o.anio = %d;   -- hoja idéntica a %s" % (sql_txt(origen_cod), sql_txt(cod), anio, origen_cod))
    out.append('commit;')
    with open(salida, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')

    print('INFORME DE IMPORTACIÓN · %s · %d' % (origen, anio))
    total = 0
    for cod, nombre, n, bl, carb in informe:
        total += n
        print('  %-14s %-52s %3d actividades  %s%s' % (cod, nombre, n, ' · '.join('%s %d' % (k, v) for k, v in bl.items()), '  [PENDIENTE DE CONFIRMAR LÍNEA]' if carb else ''))
    print('TOTAL: %d hojas, %d actividades -> %s' % (len(informe), total, salida))


if __name__ == '__main__':
    main()
