/* Gestão Frota Legal — Grupo Vyas
 * Leitura das bases "Prontuário de Condutores" (Frota Legal) e gravação no banco.
 * Funciona no navegador (window.Processa). Não grava CPF: o condutor é identificado por um código
 * embaralhado (SHA-256 do CPF), que só serve para reconhecer a mesma pessoa entre uma base e outra.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- utilidades
  const DOCS = { 'ASO': 'ASO', 'CNH': 'CNH', 'DIRECAO DEFENSIVA': 'DDEF', 'ESCOLINHA': 'ESC', 'EXAME TOXICOLOGICO': 'TOX', 'INTEGRACAO': 'IT' };
  const DOC_ORDEM = ['CNH', 'ESC', 'DDEF', 'IT', 'ASO', 'TOX'];
  const DIA = 86400000;

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }
  function slug(s) { return norm(s).replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'SEM_FILIAL'; }
  // data do Excel (número de série) -> 'AAAA-MM-DD' / Date UTC; independe do fuso do computador
  function serialParaDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()));
    if (typeof v === 'number') return new Date(Math.round((v - 25569) * DIA));
    const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    const d = new Date(v); return isNaN(d) ? null : d;
  }
  const iso = d => d ? d.toISOString().slice(0, 10) : null;
  const mesDe = isoDia => isoDia.slice(0, 7);
  function mesAnterior(mk) { let [a, m] = mk.split('-').map(Number); m--; if (!m) { m = 12; a--; } return a + '-' + String(m).padStart(2, '0'); }
  function mesesEntre(a, b) { const out = []; let m = a; while (m <= b) { out.push(m); let [y, mm] = m.split('-').map(Number); mm++; if (mm > 12) { mm = 1; y++; } m = y + '-' + String(mm).padStart(2, '0'); } return out; }
  function num(v) { if (v == null || v === '') return 0; if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
  function txt(v) { return v == null ? '' : String(v).trim(); }

  async function hashCpf(cpf) {
    const dig = String(cpf == null ? '' : cpf).replace(/\D/g, '').padStart(11, '0');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('frota-vyas:' + dig));
    return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // cargos que ficam no SDPO quando o condutor saiu antes da separação DPO/SDPO
  function ambPorCargo(cargo) { return /VENDED|VENDAS|COORDENADOR DE OPERA|ADMINISTRATIV/.test(norm(cargo)) ? 'SDPO' : 'DPO'; }
  const partId = (amb, filial) => amb + '__' + slug(filial);

  // ---------------------------------------------------------------- leitura do Excel
  function lerPlanilha(buf, nomeArquivo, XLSX) {
    const wb = XLSX.read(buf, { type: 'array' });
    const aba = n => wb.SheetNames.find(s => norm(s).startsWith(n));
    const nPront = aba('PRONTUARIO'), nOc = aba('OCORRENCIAS');
    if (!nPront) throw new Error('aba "Prontuário do Condutores" não encontrada');
    const L = XLSX.utils.sheet_to_json(wb.Sheets[nPront], { header: 1, raw: true, defval: null });
    const r0 = L[0] || [];
    const iAmb = r0.findIndex(v => norm(v).startsWith('AMBIENTE'));
    const rotulo = iAmb >= 0 ? txt(r0[iAmb + 1]) : '';
    if (!/VYAS/.test(norm(rotulo))) throw new Error('o arquivo não é do ambiente Grupo Vyas (' + (rotulo || 'sem ambiente') + ')');
    const suf = norm(rotulo).split(' - ').pop();
    const amb = suf === 'DPO' || suf === 'SDPO' ? suf : null;
    const gerado = serialParaDate(r0[1]);
    if (!gerado) throw new Error('data de geração não encontrada');

    // cabeçalho em 3 níveis (linhas 2, 3 e 4)
    const g1 = L[1] || [], g2 = L[2] || [], h = L[3] || [];
    const col = (nome, grupo) => h.findIndex((v, i) => norm(v) === norm(nome) && (!grupo || norm(g1[i]) === norm(grupo)));
    const C = {
      nome: col('Nome'), cpf: col('CPF'), mat: col('Matrícula'), cargo: col('Cargo'),
      status: col('Status', 'Status'), motivo: col('Motivo'), pont: col('Pontuação Ponderada'),
      faixa: col('Faixa'), filial: col('Unidades'),
    };
    for (const k of ['nome', 'cpf', 'status', 'faixa', 'filial']) if (C[k] < 0) throw new Error('coluna "' + k + '" não encontrada');
    const docCols = {};
    h.forEach((v, i) => {
      if (norm(g1[i]) !== 'DOCUMENTOS') return;
      const d = DOCS[norm(g2[i])]; if (!d) return;           // ignora documentos fora da lista (ex.: CIOT das bases antigas)
      docCols[d] = docCols[d] || {};
      if (norm(v) === 'STATUS') docCols[d].st = i;
      if (norm(v) === 'VALIDADE') docCols[d].val = i;
    });

    const condutores = [], ignorados = [];
    for (const r of L.slice(4)) {
      if (!r || !txt(r[C.nome])) continue;
      const c = {
        cpf: r[C.cpf], nome: txt(r[C.nome]), mat: C.mat >= 0 ? txt(r[C.mat]) : '', cargo: C.cargo >= 0 ? txt(r[C.cargo]) : '',
        status: txt(r[C.status]), motivo: C.motivo >= 0 ? txt(r[C.motivo]) : '', pont: num(r[C.pont]),
        faixa: txt(r[C.faixa]), filial: txt(r[C.filial]) || 'Sem filial', docs: {},
      };
      for (const d in docCols) {
        const st = txt(r[docCols[d].st]).toUpperCase();
        c.docs[d] = [st || 'NOK', iso(serialParaDate(r[docCols[d].val]))];
      }
      if (/TESTE/i.test(c.mat)) { ignorados.push(c); continue; } // cadastro de teste
      condutores.push(c);
    }

    const ocorrencias = [];
    if (nOc) {
      const O = XLSX.utils.sheet_to_json(wb.Sheets[nOc], { header: 1, raw: true, defval: null });
      const oh = O[0] || []; const oc = n => oh.findIndex(v => norm(v) === norm(n));
      const K = { nome: oc('Nome'), tipo: oc('Tipo de Ocorrência'), oc: oc('Ocorrência'), data: oc('Data'), peso: oc('Peso'), just: oc('Justificativa'), filial: oc('Unidades') };
      const ign = new Set(ignorados.map(c => norm(c.nome)));
      for (const r of O.slice(1)) {
        if (!r || !txt(r[K.nome])) continue;
        if (ign.has(norm(r[K.nome]))) continue;
        const d = serialParaDate(r[K.data]); if (!d) continue;
        ocorrencias.push({
          nome: txt(r[K.nome]), tipo: txt(r[K.tipo]), oc: txt(r[K.oc]), data: iso(d), peso: num(r[K.peso]),
          venc: /OCORR.NCIA MENSAL VENCIDA/.test(norm(r[K.just])) ? 1 : 0, filial: txt(r[K.filial]) || 'Sem filial',
        });
      }
    }
    return { arquivo: nomeArquivo, rotulo, amb, gerado, condutores, ocorrencias, ignorados };
  }

  // ---------------------------------------------------------------- carga no banco
  /* store: { get(col,id) -> obj|null, write([{col,id,data|null}]) }  (data null = apagar)
   * Documentos (payload em JSON porque o Firestore não guarda listas dentro de listas):
   *   config/indice                    índice das partes (ambiente × filial), meses e datas — lido por todos os usuários ativos
   *   config/cargas                    histórico de uploads — só admin
   *   atual/{AMB__FILIAL}              foto mais recente dos condutores
   *   meses/{AAAA-MM__AMB__FILIAL}     fechamento do mês (faixa/pontuação, mês anterior e data de mudança)
   *   ocorr/{AAAA-MM__AMB__FILIAL}     ocorrências acumuladas do mês
   */
  function indiceVazio() { return { v: 1, amb: {}, ult: {}, sdpoDesde: null, atual: {}, meses: {}, oc: {}, filiais: { DPO: [], SDPO: [] } }; }
  const parseDoc = d => d ? Object.assign({}, d, { dados: JSON.parse(d.json || '[]') }) : null;

  // Base gerada nos dias 1 a 3 conta como fechamento do mês anterior, se for a primeira base do mês.
  function mesFechamento(gerado, ultIso) {
    const mk = gerado.toISOString().slice(0, 7);
    if (gerado.getUTCDate() <= 3 && !(ultIso && ultIso.slice(0, 7) === mk)) return mesAnterior(mk);
    return mk;
  }

  async function analisar(lidos, idx) {
    // devolve o plano (o que entra, o que é ignorado e avisos) sem gravar nada
    idx = idx || indiceVazio();
    const arq = [...lidos].sort((a, b) => a.gerado - b.gerado);
    let sdpoDesde = idx.sdpoDesde ? new Date(idx.sdpoDesde) : null;
    for (const f of arq) if (f.amb === 'SDPO' && (!sdpoDesde || f.gerado < sdpoDesde)) sdpoDesde = f.gerado;
    const ult = Object.assign({}, idx.ult);
    const conhecidas = new Set([...(idx.filiais.DPO || []), ...(idx.filiais.SDPO || [])].map(norm));
    const plano = [];
    for (const f of arq) {
      // base DPO de um dia anterior à primeira base SDPO ainda tinha todos os condutores juntos
      const preSplit = !f.amb || (f.amb === 'DPO' && sdpoDesde && iso(f.gerado) < iso(sdpoDesde));
      const cobre = preSplit ? ['DPO', 'SDPO'] : [f.amb];
      const velho = cobre.some(a => ult[a] && f.gerado.toISOString() <= ult[a]);
      const novas = [...new Set(f.condutores.map(c => c.filial))].filter(x => conhecidas.size && !conhecidas.has(norm(x)));
      plano.push({ f, preSplit, cobre, velho, novas });
      if (!velho) { cobre.forEach(a => ult[a] = f.gerado.toISOString()); f.condutores.forEach(c => conhecidas.add(norm(c.filial))); }
    }
    return { plano, sdpoDesde };
  }

  async function carregar(lidos, store, opts, log) {
    opts = opts || {}; log = log || (() => {});
    let idx = (await store.get('config', 'indice')) || null;
    idx = idx && idx.json ? JSON.parse(idx.json) : indiceVazio();

    if (opts.reconstruir) {
      log('Apagando os dados anteriores…');
      const del = [];
      for (const p in idx.atual) del.push({ col: 'atual', id: p, data: null });
      for (const m in idx.meses) for (const p of idx.meses[m]) del.push({ col: 'meses', id: m + '__' + p, data: null });
      for (const m in idx.oc) for (const p of idx.oc[m]) del.push({ col: 'ocorr', id: m + '__' + p, data: null });
      await store.write(del);
      idx = indiceVazio();
    }

    for (const f of lidos) for (const c of f.condutores) c.h = c.h || await hashCpf(c.cpf);
    const { plano, sdpoDesde } = await analisar(lidos, idx);
    if (sdpoDesde) idx.sdpoDesde = sdpoDesde.toISOString();

    // cache dos documentos lidos/gravados nesta carga
    const cache = {};
    const key = (col, id) => col + '/' + id;
    async function ler(col, id) {
      const k = key(col, id);
      if (!(k in cache)) cache[k] = parseDoc(await store.get(col, id));
      return cache[k];
    }
    const pend = new Map();
    function gravar(col, id, data) { const k = key(col, id); cache[k] = data ? Object.assign({}, data) : null; pend.set(k, { col, id, data: data ? (({ dados, ...rest }) => Object.assign(rest, { json: JSON.stringify(dados) }))(data) : null }); }

    // foto atual global (por código do condutor) e mapa código -> ambiente para reclassificar bases antigas
    const atualGlobal = new Map();
    for (const p in idx.atual) { const d = await ler('atual', p); if (d) d.dados.forEach(c => atualGlobal.set(c.h, Object.assign({ amb: d.amb, filial: d.filial, gerado: d.gerado }, c))); }
    const ambDoCodigo = new Map();
    atualGlobal.forEach((c, h) => ambDoCodigo.set(h, c.amb));
    const posSplit = plano.filter(p => !p.preSplit).map(p => p.f).sort((a, b) => a.gerado - b.gerado);
    posSplit.forEach(f => f.condutores.forEach(c => ambDoCodigo.set(c.h, f.amb)));

    // nome -> ambiente (para ocorrências de quem não está no prontuário daquele arquivo)
    const ambDoNome = new Map();
    const resumo = [];

    for (const passo of plano) {
      const { f, preSplit, cobre } = passo;
      if (passo.velho && !opts.reconstruir) { resumo.push({ arquivo: f.arquivo, ignorado: 'já carregado ou mais antigo que a base atual' }); log('Ignorado (mais antigo que a base já carregada): ' + f.arquivo); continue; }
      log('Processando ' + f.arquivo + ' (' + (preSplit ? 'base sem separação DPO/SDPO' : f.amb) + ', gerada em ' + f.gerado.toISOString().slice(0, 16).replace('T', ' ') + ')…');
      f.condutores.forEach(c => { c.amb = preSplit ? (ambDoCodigo.get(c.h) || ambPorCargo(c.cargo)) : f.amb; ambDoNome.set(norm(c.nome), c.amb); });
      const nomeLocal = new Map(f.condutores.map(c => [norm(c.nome), c.amb]));
      f.ocorrencias.forEach(o => { o.amb = nomeLocal.get(norm(o.nome)) || ambDoNome.get(norm(o.nome)) || (preSplit ? 'DPO' : f.amb); });
      const geradoIso = f.gerado.toISOString(), diaGer = iso(f.gerado);

      for (const A of cobre) {
        const conds = f.condutores.filter(c => c.amb === A);
        const mk = mesFechamento(f.gerado, idx.ult[A]);
        const mkAnt = mesAnterior(mk);

        // fechamento do mês anterior (todos os ambientes: o condutor pode ter mudado de ambiente/filial)
        const antMap = new Map();
        for (const p of (idx.meses[mkAnt] || [])) { const d = await ler('meses', mkAnt + '__' + p); if (d) d.dados.forEach(r => antMap.set(r[0], r)); }
        const mesMap = new Map();
        for (const p of (idx.meses[mk] || [])) { const d = await ler('meses', mk + '__' + p); if (d) d.dados.forEach(r => mesMap.set(r[0], r)); }

        // --- foto atual
        const porParte = new Map();
        for (const c of conds) { const p = partId(A, c.filial); if (!porParte.has(p)) porParte.set(p, { filial: c.filial, l: [] }); porParte.get(p).l.push(c); }
        for (const p of Object.keys(idx.atual)) if (idx.atual[p].amb === A && !porParte.has(p)) { gravar('atual', p, null); delete idx.atual[p]; }
        const mesPartes = new Set(idx.meses[mk] || []);
        for (const p of [...mesPartes]) if (p.startsWith(A + '__') && !porParte.has(p)) { gravar('meses', mk + '__' + p, null); mesPartes.delete(p); }

        for (const [p, { filial, l }] of porParte) {
          gravar('atual', p, { amb: A, filial, gerado: geradoIso, dados: l.map(c => ({ h: c.h, n: c.nome, c: c.cargo, s: c.status, m: c.motivo, f: c.faixa, p: c.pont, d: c.docs })) });
          idx.atual[p] = { amb: A, filial };
          const linhas = l.map(c => {
            const ant = antMap.get(c.h); const prev = atualGlobal.get(c.h); const ex = mesMap.get(c.h);
            let dm = null;
            if (prev && prev.f !== c.faixa && (f.gerado - new Date(prev.gerado)) <= 7 * DIA) dm = diaGer;
            else if (ex && ex[2] === c.faixa) dm = ex[6] || null;
            return [c.h, c.nome, c.faixa, c.pont, ant ? ant[2] : null, ant ? ant[3] : null, dm];
          });
          gravar('meses', mk + '__' + p, { amb: A, filial, mes: mk, gerado: geradoIso, dados: linhas });
          mesPartes.add(p);
        }
        idx.meses[mk] = [...mesPartes].sort();
        idx.amb[A] = { gerado: geradoIso, filiais: [...new Set(conds.map(c => c.filial))].sort() };
        idx.filiais[A] = [...new Set([...(idx.filiais[A] || []), ...conds.map(c => c.filial)])].sort();

        // --- ocorrências: a base nova substitui o período que ela cobre
        const ocA = f.ocorrencias.filter(o => o.amb === A);
        const datas = f.ocorrencias.map(o => o.data).sort();
        const fim = diaGer;
        let ini = iso(new Date(Date.UTC(f.gerado.getUTCFullYear(), f.gerado.getUTCMonth(), f.gerado.getUTCDate()) - 59 * DIA));
        if (datas.length && datas[0] < ini) ini = datas[0];
        const fimReal = datas.length && datas[datas.length - 1] > fim ? datas[datas.length - 1] : fim;
        for (const m of mesesEntre(mesDe(ini), mesDe(fimReal))) {
          const partes = new Map();
          for (const p of (idx.oc[m] || [])) {
            if (!p.startsWith(A + '__')) continue;
            const d = await ler('ocorr', m + '__' + p);
            if (!d) continue;
            const nomes = d.dados.nomes;
            const manter = d.dados.rows.filter(r => r[3] < ini || r[3] > fimReal).map(r => ({ nome: nomes[r[0]], tipo: r[1], oc: r[2], data: r[3], peso: r[4], venc: r[5] }));
            partes.set(p, { filial: d.filial, l: manter });
          }
          for (const o of ocA) {
            if (mesDe(o.data) !== m) continue;
            const p = partId(A, o.filial);
            if (!partes.has(p)) partes.set(p, { filial: o.filial, l: [] });
            partes.get(p).l.push(o);
          }
          const lista = new Set((idx.oc[m] || []).filter(p => !p.startsWith(A + '__')));
          for (const [p, { filial, l }] of partes) {
            if (!l.length) { gravar('ocorr', m + '__' + p, null); continue; }
            const nomes = [...new Set(l.map(o => o.nome))]; const ni = new Map(nomes.map((n, i) => [n, i]));
            l.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
            gravar('ocorr', m + '__' + p, { amb: A, filial, mes: m, dados: { nomes, rows: l.map(o => [ni.get(o.nome), o.tipo, o.oc, o.data, Math.round(o.peso * 10000) / 10000, o.venc]) } });
            lista.add(p);
          }
          if (lista.size) idx.oc[m] = [...lista].sort(); else delete idx.oc[m];
        }
        idx.ult[A] = geradoIso;
        resumo.push({ arquivo: f.arquivo, amb: A, mes: mk, condutores: conds.length, ocorrencias: ocA.length, periodo: ini + ' a ' + fimReal, gerado: geradoIso });
      }
      // a foto desta base passa a ser a "anterior" da próxima
      f.condutores.forEach(c => atualGlobal.set(c.h, { h: c.h, f: c.faixa, amb: c.amb, gerado: geradoIso }));
    }

    // grava em lotes
    const ops = [...pend.values()];
    ops.push({ col: 'config', id: 'indice', data: { json: JSON.stringify(idx), atualizado: new Date().toISOString() } });
    let cargas = await store.get('config', 'cargas'); cargas = cargas && cargas.json ? JSON.parse(cargas.json) : [];
    const quando = new Date().toISOString();
    resumo.filter(r => !r.ignorado).forEach(r => cargas.unshift(Object.assign({ quando, por: opts.usuario || '' }, r)));
    ops.push({ col: 'config', id: 'cargas', data: { json: JSON.stringify(cargas.slice(0, 300)) } });
    log('Gravando ' + ops.length + ' documento(s)…');
    await store.write(ops);
    log('Concluído.');
    return { resumo, idx };
  }

  root.Processa = { lerPlanilha, analisar, carregar, hashCpf, norm, slug, partId, mesAnterior, DOC_ORDEM, indiceVazio, mesFechamento };
})(typeof window !== 'undefined' ? window : globalThis);
