/* Gestão Frota Legal — Grupo Vyas · painel (telas, filtros, administração) */
(function () {
  'use strict';
  const S = window.Store, P = window.Processa;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };

  const FAIXAS = ['Verde', 'Amarela', 'Laranja', 'Vermelha', 'Roxa'];
  const COR = { Verde: '#5fae3e', Amarela: '#e9a71a', Laranja: '#ea6f2d', Vermelha: '#d94a4a', Roxa: '#6d1a8a', Liberado: '#5fae3e', Bloqueado: '#d64545', 'Atenção': '#e9a71a' };
  const DOC_ORDEM = P.DOC_ORDEM;
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const AMBS = ['DPO', 'SDPO'];

  // ---------------------------------------------------------------- formatação
  const pct = (a, b) => b ? (a / b * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '0,0%';
  const pct2 = (a, b) => b ? (a / b * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—';
  const n2 = v => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n0 = v => (v || 0).toLocaleString('pt-BR');
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const mesBR = mk => MESES[+mk.slice(5, 7) - 1] + ' ' + mk.slice(0, 4);
  const dtHoraBR = isoStr => { if (!isoStr) return ''; const d = new Date(isoStr); const p = x => String(x).padStart(2, '0'); return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()); };
  const localBR = isoStr => isoStr ? new Date(isoStr).toLocaleString('pt-BR') : '';
  const tc = s => String(s || '').toLowerCase().replace(/(^|[\s(/-])(\S)/g, (m, a, b) => a + b.toUpperCase());
  const addDias = (isoDia, n) => new Date(Date.parse(isoDia + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const difDias = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
  const chipFx = f => f ? '<span class="chip" style="background:' + (COR[f] || '#999') + '">' + esc(f) + '</span>' : '';

  // ---------------------------------------------------------------- estado
  let USER = null, IDX = null;
  const DATA = { conds: [], meses: null, oc: null };
  let PAGE = 'vg';
  const F = { amb: new Set(), fil: new Set(), doc: new Set(), cond: new Set(), per: '60' };
  const isAdmin = () => !!USER && USER.p.perfil === 'admin';
  function ve(amb, fil) {
    if (isAdmin()) return true;
    const a = (USER.p.acessos || {})[amb];
    return !!a && (a.includes('*') || a.includes(fil));
  }
  const loading = on => $('carregando').classList.toggle('hidden', !on);

  // ---------------------------------------------------------------- login
  if (S.demo) $('lgDemo').classList.remove('hidden');
  function mostrarLogin(msg) {
    $('app').classList.add('hidden'); $('login').classList.remove('hidden');
    $('lgMsg').className = 'msg err'; $('lgMsg').textContent = msg || '';
    setTimeout(() => $('lgMail').focus(), 30);
  }
  $('lgForm').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('lgMail').value.trim().toLowerCase(), s = $('lgPass').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { $('lgMsg').className = 'msg err'; $('lgMsg').textContent = 'Informe um e-mail válido.'; return; }
    if (!S.demo && !s) { $('lgMsg').className = 'msg err'; $('lgMsg').textContent = 'Informe a senha.'; return; }
    $('lgBtn').disabled = true; $('lgMsg').textContent = '';
    try { await S.login(m, s); }
    catch (err) {
      $('lgMsg').className = 'msg err';
      $('lgMsg').textContent = /invalid|wrong-password|user-not-found|invalid-credential/.test(err.code || '') ? 'E-mail ou senha incorretos.' : /too-many/.test(err.code || '') ? 'Muitas tentativas. Aguarde alguns minutos ou redefina a senha.' : 'Não foi possível entrar: ' + (err.message || err);
    } finally { $('lgBtn').disabled = false; }
  });
  $('lgEsqueci').onclick = async () => {
    const m = $('lgMail').value.trim();
    if (!m) { $('lgMsg').className = 'msg err'; $('lgMsg').textContent = 'Digite seu e-mail acima e clique de novo em "Esqueci minha senha".'; return; }
    try { await S.resetSenha(m); } catch (e) { /* não revela se o e-mail existe */ }
    $('lgMsg').className = 'msg ok'; $('lgMsg').textContent = 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.';
  };
  $('btnSair').onclick = () => S.logout();

  S.onAuth(async u => {
    if (!u) { USER = null; mostrarLogin(''); return; }
    loading(true);
    try {
      const p = await S.perfil(u.email);
      if (!p || !p.ativo) { await S.logout(); mostrarLogin('Este e-mail não tem acesso ativo ao painel. Fale com a Demarco.'); return; }
      if (p.perfil !== 'admin' && !Object.values(p.acessos || {}).some(l => l && l.length)) { await S.logout(); mostrarLogin('Seu acesso ainda não tem ambiente/filial liberado. Fale com a Demarco.'); return; }
      USER = { email: u.email, p };
      await carregarBase();
      $('login').classList.add('hidden'); $('app').classList.remove('hidden');
      $('uMail').textContent = u.email; $('uPerfil').textContent = isAdmin() ? 'Administrador' : 'Usuário';
      PAGE = !IDX && isAdmin() ? 'bs' : 'vg';
      render();
    } catch (e) { console.error(e); await S.logout(); mostrarLogin('Erro ao carregar o painel: ' + (e.message || e)); }
    finally { loading(false); }
  });

  // ---------------------------------------------------------------- dados
  function partesVisiveis() { return IDX ? Object.entries(IDX.atual).filter(([p, v]) => ve(v.amb, v.filial)).map(([p, v]) => Object.assign({ id: p }, v)) : []; }
  async function carregarBase() {
    const d = await S.get('config', 'indice');
    IDX = d && d.json ? JSON.parse(d.json) : null;
    DATA.conds = []; DATA.meses = null; DATA.oc = null;
    if (!IDX) return;
    const docs = await Promise.all(partesVisiveis().map(p => S.get('atual', p.id)));
    for (const doc of docs) {
      if (!doc) continue;
      const base = doc.gerado.slice(0, 10);
      JSON.parse(doc.json).forEach(c => DATA.conds.push(Object.assign(c, { amb: doc.amb, filial: doc.filial, base })));
    }
    filtraPedidosPorAcesso();
  }
  async function carregarMeses() {
    if (DATA.meses) return;
    loading(true);
    const pedidos = [];
    for (const mk in IDX.meses) for (const p of IDX.meses[mk]) pedidos.push({ mk, p });
    const docs = await Promise.all(pedidos.map(x => S.get('meses', x.mk + '__' + x.p).catch(() => null)));
    DATA.meses = [];
    docs.forEach(doc => { if (!doc || !ve(doc.amb, doc.filial)) return; JSON.parse(doc.json).forEach(r => DATA.meses.push({ amb: doc.amb, filial: doc.filial, mes: doc.mes, h: r[0], n: r[1], f: r[2], p: r[3], fa: r[4], pa: r[5], dm: r[6] })); });
    loading(false);
  }
  async function carregarOc() {
    if (DATA.oc) return;
    loading(true);
    const pedidos = [];
    for (const m in IDX.oc) for (const p of IDX.oc[m]) pedidos.push(m + '__' + p);
    const docs = await Promise.all(pedidos.map(id => S.get('ocorr', id).catch(() => null)));
    DATA.oc = [];
    docs.forEach(doc => { if (!doc || !ve(doc.amb, doc.filial)) return; const d = JSON.parse(doc.json); d.rows.forEach(r => DATA.oc.push({ amb: doc.amb, filial: doc.filial, nome: d.nomes[r[0]], tipo: r[1], oc: r[2], data: r[3], peso: r[4], venc: r[5] })); });
    loading(false);
  }
  // Para usuários restritos, só pedimos ao banco documentos de partes visíveis (as regras recusariam o resto)
  function filtraPedidosPorAcesso() {
    if (isAdmin() || !IDX) return;
    const vis = new Set(Object.keys(IDX.atual).filter(p => ve(IDX.atual[p].amb, IDX.atual[p].filial)));
    // partes que já não existem na foto atual: decide pela regra de nome da filial guardada no índice
    const filialDe = p => { const a = IDX.atual[p]; if (a) return a; const amb = p.split('__')[0]; const fil = (IDX.filiais[amb] || []).find(f => P.partId(amb, f) === p); return { amb, filial: fil || '' }; };
    for (const mk in IDX.meses) IDX.meses[mk] = IDX.meses[mk].filter(p => { const a = filialDe(p); return ve(a.amb, a.filial); });
    for (const m in IDX.oc) IDX.oc[m] = IDX.oc[m].filter(p => { const a = filialDe(p); return ve(a.amb, a.filial); });
  }

  // ---------------------------------------------------------------- regras de documentos
  const docFiltro = () => F.doc.size ? DOC_ORDEM.filter(d => F.doc.has(d)) : DOC_ORDEM;
  function aplic(c, docs) { return (docs || DOC_ORDEM).filter(k => c.d[k] && c.d[k][0] !== 'N/A' && c.d[k][0] !== 'NO').map(k => [k, c.d[k][0], c.d[k][1]]); }
  const vencidos = (c, docs) => aplic(c, docs).filter(([k, st, v]) => v && v < c.base);
  const vencendo = (c, docs) => { const lim = addDias(c.base, 30); return aplic(c, docs).filter(([k, st, v]) => v && v >= c.base && v <= lim); };
  const reprovados = (c, docs) => aplic(c, docs).filter(([k, st]) => st === 'RV');
  const pendentes = (c, docs) => aplic(c, docs).filter(([k, st]) => st === 'NOK' || st === 'AV');
  const ok100 = (c, docs) => aplic(c, docs).every(([k, st]) => st === 'OK');
  const motivoFaixa = c => P.norm(c.m) === 'BLOQUEIO POR FAIXA';
  const bloqDoc = c => c.s === 'Bloqueado' && !!c.m && !motivoFaixa(c);
  const bloqFaixa = c => c.s === 'Bloqueado' && motivoFaixa(c) && !pendentes(c).length && !vencidos(c).length && !reprovados(c).length;
  const critica = c => c.f === 'Vermelha' || c.f === 'Roxa';

  function condsFiltrados() { return DATA.conds.filter(c => (!F.amb.size || F.amb.has(c.amb)) && (!F.fil.size || F.fil.has(c.filial))); }

  // ---------------------------------------------------------------- componentes
  function multi(label, opcoes, sel, onChange, busca) {
    const box = el('div', { class: 'f' }); box.appendChild(el('label', null, esc(label)));
    const ms = el('div', { class: 'ms' });
    const txt = () => !sel.size ? 'Todos' : sel.size === 1 ? (opcoes.find(o => o.v === [...sel][0]) || { t: [...sel][0] }).t : sel.size + ' selecionados';
    const bt = el('button', { type: 'button' }, '<span>' + esc(txt()) + '</span><span>&#8964;</span>');
    const pn = el('div', { class: 'pn' });
    function desenha(q) {
      pn.querySelectorAll('label').forEach(l => l.remove());
      const all = el('label', { class: 'all' }, '<input type="checkbox"' + (!sel.size ? ' checked' : '') + '> Selecionar tudo');
      all.querySelector('input').onchange = () => { sel.clear(); desenha(q); onChange(); bt.firstChild.textContent = txt(); };
      pn.appendChild(all);
      opcoes.filter(o => !q || P.norm(o.t).includes(P.norm(q))).forEach(o => {
        const l = el('label', null, '<input type="checkbox"' + (sel.has(o.v) ? ' checked' : '') + '> ' + esc(o.t));
        l.querySelector('input').onchange = ev => { if (ev.target.checked) sel.add(o.v); else sel.delete(o.v); if (sel.size === opcoes.length) sel.clear(); all.querySelector('input').checked = !sel.size; bt.firstChild.textContent = txt(); onChange(); };
        pn.appendChild(l);
      });
    }
    if (busca) { const i = el('input', { type: 'text', placeholder: 'Pesquisar' }); i.oninput = () => desenha(i.value); pn.appendChild(i); }
    desenha('');
    bt.onclick = e => { e.stopPropagation(); document.querySelectorAll('.ms.open').forEach(x => x !== ms && x.classList.remove('open')); ms.classList.toggle('open'); };
    pn.onclick = e => e.stopPropagation();
    ms.append(bt, pn); box.appendChild(ms); return box;
  }
  document.addEventListener('click', () => document.querySelectorAll('.ms.open').forEach(x => x.classList.remove('open')));

  /* tabela ordenável: cols [{t, k, cls, fmt(v,row), sort:'n'|'s'}] */
  function tabela(cols, rows, opts) {
    opts = opts || {};
    const w = el('div', { class: 'tw' });
    let ord = opts.ord || null; // {k, dir}
    function draw() {
      let rs = rows.slice();
      if (ord) {
        const c = cols.find(x => x.k === ord.k) || {};
        const kf = c.sk || (r => r[ord.k]);
        rs.sort((a, b) => { let x = kf(a), y = kf(b); if (x == null) x = ''; if (y == null) y = ''; const r = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y), 'pt-BR'); return ord.dir * r || (opts.tie ? opts.tie(a, b) : 0); });
      }
      const th = cols.map(c => '<th class="' + (c.cls || '') + '" data-k="' + c.k + '">' + esc(c.t) + (ord && ord.k === c.k ? '<span class="ar">' + (ord.dir > 0 ? '&#9650;' : '&#9660;') + '</span>' : '') + '</th>').join('');
      const body = rs.length ? rs.map(r => '<tr>' + cols.map(c => '<td class="' + (c.cls || '') + '">' + (c.fmt ? c.fmt(r[c.k], r) : esc(r[c.k])) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + cols.length + '"><div class="vazio">Nenhum registro</div></td></tr>';
      const foot = opts.foot ? '<tfoot><tr>' + cols.map(c => '<td class="' + (c.cls || '') + '">' + (opts.foot[c.k] != null ? opts.foot[c.k] : '') + '</td>').join('') + '</tr></tfoot>' : '';
      w.innerHTML = '<table class="t"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody>' + foot + '</table>';
      w.querySelectorAll('th').forEach(t => t.onclick = () => { const k = t.dataset.k; ord = ord && ord.k === k ? { k, dir: -ord.dir } : { k, dir: (cols.find(c => c.k === k).num ? -1 : 1) }; draw(); });
    }
    draw(); return w;
  }
  function painel(titulo, conteudo, cls, sub) { const p = el('div', { class: 'panel ' + (cls || '') }); p.appendChild(el('h3', null, esc(titulo) + (sub ? '<small>' + esc(sub) + '</small>' : ''))); p.appendChild(conteudo); return p; }
  function hbar(itens) {
    const max = Math.max(1, ...itens.map(i => i.v));
    const d = el('div', { class: 'hb' });
    d.innerHTML = itens.map(i => '<div class="r"><span>' + esc(i.t) + '</span><div class="b"><i style="width:' + (i.v / max * 82) + '%;background:' + i.cor + '"></i>' + n0(i.v) + '</div></div>').join('');
    return d;
  }
  function kpi(l, v, sub, frac, cor, onInfo) {
    const k = el('div', { class: 'kpi' + (onInfo ? ' clic' : '') });
    k.innerHTML = '<div class="l">' + l + '</div><div class="v">' + v + '</div><div class="tr"><i style="width:' + Math.min(100, frac * 100) + '%;background:' + cor + '"></i></div><div class="s">' + sub + '</div>';
    if (onInfo) { const b = el('button', { class: 'info', title: 'Ver os casos', type: 'button' }, 'i'); b.onclick = e => { e.stopPropagation(); onInfo(); }; k.appendChild(b); k.onclick = onInfo; }
    return k;
  }
  function modal(titulo, cols, rows, ord) {
    $('mdTit').textContent = titulo; const b = $('mdBody'); b.innerHTML = ''; b.appendChild(tabela(cols, rows, { ord })); $('modal').classList.remove('hidden');
  }
  $('mdFechar').onclick = $('mdVoltar').onclick = () => $('modal').classList.add('hidden');
  $('modal').onclick = e => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('modal').classList.add('hidden'); });

  // ---------------------------------------------------------------- navegação
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h8l4 4v6"/><path d="M6 2v20h7"/><circle cx="17" cy="17" r="4"/><path d="M15.5 17l1 1 2-2"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2.4.6 4 2.3 4 5.2"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></svg>',
  };
  const TITULO = { vg: 'Visão Geral', gd: 'Gestão Documental', pvg: 'Prontuário de Condutores | Visão Geral', pev: 'Prontuário de Condutores | Evolução', us: 'Administração | Usuários', bs: 'Administração | Bases' };
  function nav() {
    const n = $('nav'); n.innerHTML = '';
    const b = (pg, ic, t, extra) => { const x = el('button', { class: PAGE === pg || (extra && extra.includes(PAGE)) ? 'on' : '' }, ICON[ic] + '<span>' + t + '</span>' + (extra ? '<span class="chev">' + (extra.includes(PAGE) ? '&#8964;' : '&#8250;') + '</span>' : '')); x.onclick = () => ir(pg); return x; };
    n.append(b('vg', 'home', 'Visão Geral'), b('gd', 'doc', 'Gestão Documental'), b('pvg', 'user', 'Prontuário de<br>Condutores', ['pvg', 'pev']));
    if (PAGE === 'pvg' || PAGE === 'pev') {
      const s = el('div', { class: 'sub' });
      [['pvg', 'Visão Geral'], ['pev', 'Evolução']].forEach(([pg, t]) => { const x = el('button', { class: PAGE === pg ? 'on' : '' }, t); x.onclick = () => ir(pg); s.appendChild(x); });
      n.appendChild(s);
    }
    if (isAdmin()) { n.appendChild(el('div', { class: 'grp' }, 'Administração')); n.append(b('us', 'users', 'Usuários'), b('bs', 'up', 'Bases')); }
  }
  async function ir(pg) { PAGE = pg; if (pg === 'pvg' && IDX) await carregarOc(); if (pg === 'pev' && IDX) await carregarMeses(); render(); window.scrollTo(0, 0); }

  function filtros() {
    const f = $('filtros'); f.innerHTML = '';
    if (PAGE === 'us' || PAGE === 'bs' || !IDX) { f.classList.add('hidden'); return; }
    f.classList.remove('hidden');
    const partes = partesVisiveis();
    const ambs = AMBS.filter(a => partes.some(p => p.amb === a));
    [...F.amb].forEach(a => { if (!ambs.includes(a)) F.amb.delete(a); });
    const fils = [...new Set(partes.filter(p => !F.amb.size || F.amb.has(p.amb)).map(p => p.filial))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    [...F.fil].forEach(x => { if (!fils.includes(x)) F.fil.delete(x); });
    f.appendChild(multi('Ambiente', ambs.map(a => ({ v: a, t: a })), F.amb, () => { filtros(); pagina(); }));
    f.appendChild(multi('Filial', fils.map(x => ({ v: x, t: x })), F.fil, pagina));
    if (PAGE === 'gd') f.appendChild(multi('Documento', DOC_ORDEM.map(d => ({ v: d, t: d })), F.doc, pagina));
    if (PAGE === 'pev' && DATA.meses) {
      const vis = DATA.meses.filter(r => (!F.amb.size || F.amb.has(r.amb)) && (!F.fil.size || F.fil.has(r.filial)));
      const nomes = new Map(); vis.forEach(r => nomes.set(r.h, tc(r.n)));
      const ops = [...nomes].map(([v, t]) => ({ v, t })).sort((a, b) => a.t.localeCompare(b.t, 'pt-BR'));
      f.appendChild(multi('Condutor', ops, F.cond, pagina, true));
    }
    if (PAGE === 'pvg') {
      const box = el('div', { class: 'f' }, '<label>Período das ocorrências</label>');
      const s = el('select', { class: 'ms', style: 'padding:6px 8px;border:1px solid #c9d1d9;border-radius:3px;font-size:12px;min-width:170px' });
      const meses = Object.keys(IDX.oc || {}).sort().reverse();
      s.innerHTML = '<option value="60">Últimos 60 dias</option>' + meses.map(m => '<option value="' + m + '">' + mesBR(m) + '</option>').join('') + '<option value="tudo">Todo o histórico</option>';
      s.value = F.per; s.onchange = () => { F.per = s.value; pagina(); };
      box.appendChild(s); f.appendChild(box);
    }
  }
  function rodape() {
    const ambs = [...new Set(partesVisiveis().map(p => p.amb))];
    const g = ambs.map(a => IDX && IDX.amb[a] && IDX.amb[a].gerado).filter(Boolean).sort().pop();
    $('ultAtual').innerHTML = esc(g ? 'Última Atualização: ' + dtHoraBR(g) : 'Nenhuma base carregada ainda') + (S.demo ? '<span class="badge-demo">Modo demonstração — nada é gravado</span>' : '');
  }
  function render() { nav(); $('subtitulo').textContent = TITULO[PAGE]; filtros(); pagina(); rodape(); }
  function pagina() {
    const pg = $('page'); pg.innerHTML = '';
    if (!IDX && PAGE !== 'us' && PAGE !== 'bs') { pg.appendChild(el('div', { class: 'card', style: 'padding:30px;text-align:center' }, isAdmin() ? 'Nenhuma base carregada ainda. Vá em <b>Administração › Bases</b> para enviar os arquivos.' : 'Nenhuma base carregada ainda.')); return; }
    ({ vg: pgVisaoGeral, gd: pgDocumental, pvg: pgProntuario, pev: pgEvolucao, us: pgUsuarios, bs: pgBases })[PAGE](pg);
  }

  // ---------------------------------------------------------------- Visão Geral
  const colsCasos = det => [{ t: 'Condutor', k: 'n', fmt: v => esc(tc(v)) }, { t: 'Filial', k: 'filial' }, { t: 'Ambiente', k: 'amb' }, { t: det, k: 'det', fmt: v => v }];
  function pgVisaoGeral(pg) {
    const C = condsFiltrados(), T = C.length;
    const g = el('div', { class: 'g-vg' });
    g.appendChild(el('div', { class: 'big' }, '<div class="l">Total de<br>condutores</div><div class="v">' + n0(T) + '</div><div class="s">condutores ativos</div><div class="bar" style="margin-top:14px"></div>'));
    const kg = el('div', { class: 'kg' });
    const caso = (titulo, lista, det) => () => modal(titulo, colsCasos(det.t), lista.map(c => Object.assign({}, c, { det: det.f(c) })), { k: 'n', dir: 1 });
    const ok = C.filter(c => ok100(c));
    const venc = C.filter(c => vencidos(c).length), rep = C.filter(c => reprovados(c).length), vcd = C.filter(c => vencendo(c).length);
    const bd = C.filter(bloqDoc), bf = C.filter(bloqFaixa), cr = C.filter(critica), vd = C.filter(c => c.f === 'Verde'), zero = C.filter(c => !c.p);
    const docsTxt = l => l.map(([k, st, v]) => esc(k) + (v ? ' <small>(' + dBR(v) + ')</small>' : '')).join(', ');
    kg.append(
      kpi('Documentação<br>100% aderente', pct(ok.length, T), ok.length + ' de ' + T, ok.length / (T || 1), COR.Verde),
      kpi('Com pelo menos 1<br>documento vencido', pct(venc.length, T), venc.length + ' de ' + T, venc.length / (T || 1), COR.Bloqueado, caso('Condutores com pelo menos 1 Documento Vencido', venc, { t: 'Documento (vencimento)', f: c => docsTxt(vencidos(c)) })),
      kpi('Com pelo menos 1<br>documento reprovado', pct(rep.length, T), rep.length + ' de ' + T, rep.length / (T || 1), COR.Bloqueado, caso('Condutores com pelo menos 1 Documento Reprovado', rep, { t: 'Documento', f: c => docsTxt(reprovados(c)) })),
      kpi('Documentos vencendo<br>em até 30 dias', pct(vcd.length, T), vcd.length + ' de ' + T, vcd.length / (T || 1), COR['Atenção']),
      kpi('Bloqueados só por<br>documentação', pct(bd.length, T), bd.length + ' de ' + T, bd.length / (T || 1), '#1f4e79', caso('Condutores Bloqueados por Documentação', bd, { t: 'Motivo', f: c => esc(c.m) })),
      kpi('Bloqueados só por<br>faixa de prontuário', pct(bf.length, T), bf.length + ' de ' + T, bf.length / (T || 1), '#1f4e79', caso('Condutores Bloqueados só por Faixa de Prontuário', bf, { t: 'Faixa · Pontuação', f: c => chipFx(c.f) + ' ' + n2(c.p) })),
      kpi('Faixas críticas<br>(vermelha e roxa)', n0(cr.length), pct(cr.length, T) + ' dos ativos', cr.length / (T || 1), COR.Roxa, caso('Condutores em Faixa Crítica (Vermelha e Roxa)', cr, { t: 'Faixa · Pontuação', f: c => chipFx(c.f) + ' ' + n2(c.p) })),
      kpi('Condutores na<br>faixa verde', n0(vd.length), pct(vd.length, T) + ' dos ativos', vd.length / (T || 1), COR.Verde),
      kpi('Condutores com<br>0 pontos', n0(zero.length), pct(zero.length, T) + ' dos ativos', zero.length / (T || 1), '#1f4e79'),
    );
    g.appendChild(kg);
    const stc = s => C.filter(c => c.s === s).length;
    g.appendChild(painel('Condutores por Status', hbar(['Liberado', 'Bloqueado', 'Atenção'].map(s => ({ t: s, v: stc(s), cor: COR[s] }))), 'ch'));
    g.appendChild(painel('Condutores por Faixa', hbar(FAIXAS.map(f => ({ t: f, v: C.filter(c => c.f === f).length, cor: COR[f] }))), 'ch'));
    pg.appendChild(g);

    const r2 = el('div', { class: 'g-row', style: 'grid-template-columns:1fr 1fr' });
    const fils = [...new Set(C.map(c => c.filial))];
    const lib = fils.map(f => ({ filial: f, v: C.filter(c => c.filial === f && c.s === 'Liberado').length }));
    r2.appendChild(painel('Ranking de Condutores Liberados por Filial', tabela([{ t: 'Filial', k: 'filial' }, { t: 'Condutores Liberados', k: 'v', cls: 'n', num: 1 }], lib, { ord: { k: 'v', dir: -1 }, foot: { filial: 'Total', v: n0(stc('Liberado')) } }), 'h-270'));
    const dist = fils.map(f => { const r = { filial: f, tot: 0 }; FAIXAS.forEach(x => { r[x] = C.filter(c => c.filial === f && c.f === x).length; r.tot += r[x]; }); return r; });
    const foot = { filial: 'Total', tot: n0(T) }; FAIXAS.forEach(x => foot[x] = n0(C.filter(c => c.f === x).length));
    r2.appendChild(painel('Distribuição de faixas por filial', tabela([{ t: 'Filial', k: 'filial', cls: 'vl' }].concat(FAIXAS.map(x => ({ t: x, k: x, cls: 'c', num: 1, fmt: v => v || '' }))).concat([{ t: 'Total', k: 'tot', cls: 'c', num: 1, fmt: v => '<b>' + v + '</b>' }]), dist, { ord: { k: 'filial', dir: 1 }, foot }), 'h-270'));
    pg.appendChild(r2);
  }

  // ---------------------------------------------------------------- Gestão Documental
  function pgDocumental(pg) {
    const C = condsFiltrados(), T = C.length, D = docFiltro();
    const r1 = el('div', { class: 'g-row g-gd h-300' });
    const st = el('div', { class: 'stack' });
    st.appendChild(el('div', { class: 'big', style: 'flex:1' }, '<div class="l">Total de<br>condutores</div><div class="v" style="font-size:44px">' + n0(T) + '</div><div class="s">condutores ativos</div>'));
    const ok = C.filter(c => ok100(c, D)).length;
    st.appendChild(kpi('Documentação<br>100% aderente', pct(ok, T), ok + ' de ' + T, ok / (T || 1), COR.Verde));
    r1.appendChild(st);
    let tOk = 0, tAp = 0;
    const ad = D.map(d => { let o = 0, a = 0; C.forEach(c => { const x = c.d[d]; if (!x || x[0] === 'N/A' || x[0] === 'NO') return; a++; if (x[0] === 'OK') o++; }); tOk += o; tAp += a; return { doc: d, v: a ? o / a : null, o, a }; });
    r1.appendChild(painel('Aderência por Documento', tabela([{ t: 'Documento', k: 'doc', cls: 'c' }, { t: '%', k: 'v', cls: 'n', num: 1, fmt: (v, r) => '<span title="' + r.o + ' de ' + r.a + ' aplicáveis">' + (v == null ? '—' : pct2(r.o, r.a)) + '</span>' }], ad, { ord: { k: 'v', dir: -1 }, foot: { doc: 'Total', v: pct2(tOk, tAp) } })));
    const rowsDoc = fn => { const out = []; C.forEach(c => fn(c, D).forEach(([k, s, v]) => out.push({ n: c.n, filial: c.filial, doc: k, st: s, val: v, base: c.base }))); return out; };
    const stTxt = { NOK: 'Ausente/vencido', AV: 'Aguardando validação', RV: 'Reprovado' };
    r1.appendChild(painel('Documentos Pendentes', tabela([{ t: 'Condutor', k: 'n', fmt: v => esc(tc(v)) }, { t: 'Documento', k: 'doc', cls: 'c' }, { t: 'Situação', k: 'st', fmt: (v, r) => esc(v === 'NOK' ? (r.val ? 'Vencido' : 'Ausente') : stTxt[v] || v) }, { t: 'Filial', k: 'filial' }], rowsDoc(pendentes), { ord: { k: 'n', dir: 1 } })));
    r1.appendChild(painel('Documentos Reprovados', tabela([{ t: 'Condutor', k: 'n', fmt: v => esc(tc(v)) }, { t: 'Documento', k: 'doc', cls: 'c' }, { t: 'Filial', k: 'filial' }], rowsDoc(reprovados), { ord: { k: 'n', dir: 1 } })));
    pg.appendChild(r1);
    const r2 = el('div', { class: 'g-row h-300', style: 'grid-template-columns:1fr 1fr' });
    const vc = rowsDoc(vencidos).map(r => Object.assign(r, { dias: difDias(r.val, r.base) }));
    r2.appendChild(painel('Documentos Vencidos', tabela([{ t: 'Condutor', k: 'n', fmt: v => esc(tc(v)) }, { t: 'Filial', k: 'filial' }, { t: 'Documento', k: 'doc', cls: 'c' }, { t: 'Vencimento', k: 'val', cls: 'c', fmt: dBR }, { t: 'Dias Vencido', k: 'dias', cls: 'n', num: 1 }], vc, { ord: { k: 'dias', dir: 1 } })));
    const vd = rowsDoc(vencendo).map(r => Object.assign(r, { dias: difDias(r.val, r.base) }));
    r2.appendChild(painel('Documentos Vencendo (30 dias)', tabela([{ t: 'Condutor', k: 'n', fmt: v => esc(tc(v)) }, { t: 'Filial', k: 'filial' }, { t: 'Documento', k: 'doc', cls: 'c' }, { t: 'Vencimento', k: 'val', cls: 'c', fmt: dBR }, { t: 'Dias pro Vencimento', k: 'dias', cls: 'n', num: 1 }], vd, { ord: { k: 'dias', dir: 1 } })));
    pg.appendChild(r2);
  }

  // ---------------------------------------------------------------- Prontuário · Visão Geral
  function pgProntuario(pg) {
    const C = condsFiltrados(), T = C.length;
    const fx = el('div', { class: 'fx-cards' });
    FAIXAS.forEach(f => { const n = C.filter(c => c.f === f).length; fx.appendChild(el('div', { class: 'fx' }, '<div class="t"><span><b style="background:' + COR[f] + '"></b>' + f + '</span><small>do total</small></div><div class="vv"><span class="v">' + n0(n) + '</span><span class="p">' + pct(n, T) + '</span></div><div class="kpi" style="padding:0"><div class="tr"><i style="width:' + (n / (T || 1) * 100) + '%;background:' + COR[f] + '"></i></div></div>')); });
    pg.appendChild(fx);

    let O = (DATA.oc || []).filter(o => (!F.amb.size || F.amb.has(o.amb)) && (!F.fil.size || F.fil.has(o.filial)));
    const ref = Object.values(IDX.amb).map(a => a.gerado.slice(0, 10)).sort().pop();
    let perTxt;
    if (F.per === '60') { const ini = addDias(ref, -59); O = O.filter(o => o.data >= ini && o.data <= ref); perTxt = dBR(ini) + ' a ' + dBR(ref); }
    else if (F.per === 'tudo') { perTxt = 'todo o histórico'; }
    else { O = O.filter(o => o.data.slice(0, 7) === F.per); perTxt = mesBR(F.per); }
    const ag = new Map();
    O.forEach(o => { const k = o.filial + '|' + o.oc; const a = ag.get(k) || { filial: o.filial, oc: o.oc, q: 0, pts: 0 }; a.q++; a.pts += o.peso; ag.set(k, a); });
    const AG = [...ag.values()];
    const r1 = el('div', { class: 'g-row h-270', style: 'grid-template-columns:1fr 1fr' });
    r1.appendChild(painel('Ranking de Ocorrências por Quantidade', tabela([{ t: 'Filial', k: 'filial' }, { t: 'Ocorrência', k: 'oc' }, { t: 'Qtd', k: 'q', cls: 'n', num: 1, fmt: n0 }], AG, { ord: { k: 'q', dir: -1 }, foot: { filial: 'Total', q: n0(O.length) } }), '', perTxt));
    r1.appendChild(painel('Ranking de Ocorrências por Pontos Gerados', tabela([{ t: 'Filial', k: 'filial' }, { t: 'Ocorrência', k: 'oc' }, { t: 'Pontos', k: 'pts', cls: 'n', num: 1, fmt: n2 }], AG.filter(a => a.pts > 0), { ord: { k: 'pts', dir: -1 }, foot: { filial: 'Total', pts: n2(O.reduce((s, o) => s + o.peso, 0)) } }), '', perTxt));
    pg.appendChild(r1);

    const r2 = el('div', { class: 'g-row h-270', style: 'grid-template-columns:1fr 1.15fr 1.15fr' });
    const fils = [...new Set(C.map(c => c.filial))].map(f => { const l = C.filter(c => c.filial === f); return { filial: f, v: l.reduce((s, c) => s + (c.p || 0), 0) / l.length }; });
    r2.appendChild(painel('Pontuação por Filial (Média)', tabela([{ t: 'Filial', k: 'filial' }, { t: 'Pontuação', k: 'v', cls: 'n', num: 1, fmt: n2 }], fils, { ord: { k: 'v', dir: -1 } })));
    const colsC = [{ t: 'Filial', k: 'filial' }, { t: 'Condutor', k: 'n', fmt: v => esc(tc(v)) }, { t: 'Pontuação', k: 'p', cls: 'n', num: 1, fmt: n2 }];
    r2.appendChild(painel('Pontuação por Condutor', tabela(colsC, C, { ord: { k: 'p', dir: -1 } })));
    r2.appendChild(painel('Condutores Críticos', tabela(colsC.concat([{ t: 'Faixa', k: 'f', fmt: chipFx }]), C.filter(critica), { ord: { k: 'p', dir: -1 } }), '', '(Faixa Vermelha e Roxa)'));
    pg.appendChild(r2);
  }

  // ---------------------------------------------------------------- Prontuário · Evolução
  function pgEvolucao(pg) {
    const R = (DATA.meses || []).filter(r => (!F.amb.size || F.amb.has(r.amb)) && (!F.fil.size || F.fil.has(r.filial)) && (!F.cond.size || F.cond.has(r.h)));
    const meses = [...new Set(R.map(r => r.mes))].sort();
    const cont = meses.map(m => FAIXAS.map(f => R.filter(r => r.mes === m && r.f === f).length));
    const max = Math.max(1, ...cont.flat());
    const ch = el('div', { class: 'evo' });
    ch.innerHTML = '<div class="lg">' + FAIXAS.map(f => '<span><i style="background:' + COR[f] + '"></i>' + f + '</span>').join('') + '</div><div class="cols">' +
      meses.map((m, i) => '<div class="m"><div class="bs">' + cont[i].map((v, j) => '<div class="bb"><span>' + v + '</span><i style="height:' + (v / max * 88) + '%;background:' + COR[FAIXAS[j]] + '"></i></div>').join('') + '</div><div class="ml">' + mesBR(m) + '</div></div>').join('') + '</div>';
    pg.appendChild(el('div', { class: 'g-row' })).appendChild(painel('Evolução de Faixas', ch));
    const cols = [
      { t: 'Condutor', k: 'n', fmt: v => esc(tc(v)) }, { t: 'Filial', k: 'filial' }, { t: 'Mês', k: 'mes', fmt: mesBR },
      { t: 'Faixa Mês Anterior', k: 'fa', cls: 'c', fmt: v => esc(v || '—') }, { t: 'Faixa Mês Atual', k: 'f', cls: 'c' },
      { t: 'Data Mudança', k: 'dm', cls: 'c', fmt: dBR }, { t: 'Pontuação Mês Anterior', k: 'pa', cls: 'n', num: 1, fmt: v => v == null ? '—' : n2(v) }, { t: 'Pontuação Mês Atual', k: 'p', cls: 'n', num: 1, fmt: n2 },
    ];
    const p = painel('', tabela(cols, R, { ord: { k: 'mes', dir: -1 }, tie: (a, b) => String(a.n).localeCompare(String(b.n), 'pt-BR') }), 'h-360');
    p.querySelector('h3').remove();
    pg.appendChild(p);
  }

  // ---------------------------------------------------------------- Administração · Usuários
  async function pgUsuarios(pg) {
    let lista = [];
    try { lista = await S.listarUsuarios(); } catch (e) { pg.appendChild(el('div', { class: 'aviso' }, 'Não foi possível ler os usuários: ' + esc(e.message || e))); }
    const filiaisDe = a => [...new Set([...((IDX && IDX.filiais[a]) || [])])].sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const g = el('div', { class: 'adm-grid' });
    const form = el('div', { class: 'panel' });
    let EDIT = null;
    form.innerHTML = '<h3 id="uTit">Adicionar usuário</h3>' +
      '<div class="fld"><label>E-mail de login</label><input id="uEmail" type="email" placeholder="nome@empresa.com.br"></div>' +
      '<div class="fld"><label>Nome</label><input id="uNome" type="text" placeholder="Nome e área"></div>' +
      '<div class="fld" id="uSenhaBox"><label>Senha inicial (mín. 6 caracteres)</label><input id="uSenha" type="text" autocomplete="new-password"></div>' +
      '<div class="fld"><label>Perfil</label><select id="uPerf"><option value="usuario">Usuário — só visualiza o que for liberado</option><option value="admin">Administrador — vê tudo, cadastra usuários e envia bases</option></select></div>' +
      '<div id="uAcc"></div>' +
      '<div class="fld"><label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="uAtivo" checked style="width:auto"> Acesso ativo</label></div>' +
      '<div style="display:flex;gap:8px"><button class="btn" id="uSalvar">Salvar</button><button class="btn ghost" id="uLimpar">Limpar</button></div><div class="msg" id="uMsg"></div>';
    g.appendChild(form);
    const lp = el('div', { class: 'panel' }); lp.appendChild(el('h3', null, 'Usuários cadastrados')); const lw = el('div', { class: 'tw' }); lp.appendChild(lw); g.appendChild(lp);
    pg.appendChild(g);
    const q = s => form.querySelector(s);
    let ACC = {};
    function desenhaAcc() {
      const box = q('#uAcc'); box.innerHTML = '';
      if (q('#uPerf').value === 'admin') return;
      box.appendChild(el('div', { style: 'font-size:12px;font-weight:600;color:#3c4752;margin-bottom:6px' }, 'Ambientes e filiais liberados'));
      AMBS.forEach(a => {
        const cur = ACC[a]; const fils = filiaisDe(a);
        const d = el('div', { class: 'acc' });
        d.innerHTML = '<label class="hd"><input type="checkbox"' + (cur ? ' checked' : '') + '> ' + a + '</label>' + (cur ?
          '<div class="op"><label><input type="radio" name="r' + a + '" value="todas"' + (cur.includes('*') ? ' checked' : '') + '> Todas as filiais <small style="color:var(--muted)">(inclui filiais novas)</small></label>' +
          '<label><input type="radio" name="r' + a + '" value="esp"' + (!cur.includes('*') ? ' checked' : '') + (fils.length ? '' : ' disabled') + '> Filiais específicas</label></div>' +
          (!cur.includes('*') ? '<div class="fl">' + fils.map(f => '<label style="display:flex;gap:7px;padding:2px 0;font-size:12.5px"><input type="checkbox" value="' + esc(f) + '"' + (cur.includes(f) ? ' checked' : '') + '> ' + esc(f) + '</label>').join('') + '</div>' : '') : '');
        d.querySelector('.hd input').onchange = e => { if (e.target.checked) ACC[a] = ['*']; else delete ACC[a]; desenhaAcc(); };
        d.querySelectorAll('input[type=radio]').forEach(r => r.onchange = () => { ACC[a] = r.value === 'todas' ? ['*'] : []; desenhaAcc(); });
        d.querySelectorAll('.fl input').forEach(c => c.onchange = () => { ACC[a] = [...d.querySelectorAll('.fl input:checked')].map(x => x.value); });
        box.appendChild(d);
      });
    }
    function limpar() { EDIT = null; ACC = {}; q('#uTit').textContent = 'Adicionar usuário'; q('#uEmail').value = ''; q('#uEmail').disabled = false; q('#uNome').value = ''; q('#uSenha').value = ''; q('#uSenhaBox').classList.remove('hidden'); q('#uPerf').value = 'usuario'; q('#uAtivo').checked = true; desenhaAcc(); }
    function editar(u) { EDIT = u.email; ACC = JSON.parse(JSON.stringify(u.acessos || {})); q('#uTit').textContent = 'Editar usuário'; q('#uEmail').value = u.email; q('#uEmail').disabled = true; q('#uNome').value = u.nome || ''; q('#uSenhaBox').classList.add('hidden'); q('#uPerf').value = u.perfil || 'usuario'; q('#uAtivo').checked = !!u.ativo; desenhaAcc(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    const msg = (t, ok) => { q('#uMsg').className = 'msg ' + (ok ? 'ok' : 'err'); q('#uMsg').textContent = t; };
    q('#uPerf').onchange = desenhaAcc;
    q('#uLimpar').onclick = () => { limpar(); msg('', true); };
    q('#uSalvar').onclick = async () => {
      const email = q('#uEmail').value.trim().toLowerCase(), perfil = q('#uPerf').value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msg('E-mail inválido.');
      if (!EDIT && lista.some(u => u.email === email)) return msg('Este e-mail já está cadastrado — use Editar.');
      const acessos = {};
      if (perfil !== 'admin') {
        for (const a of AMBS) if (ACC[a]) { if (!ACC[a].length) return msg('Em ' + a + ', marque pelo menos uma filial ou "Todas as filiais".'); acessos[a] = ACC[a]; }
        if (!Object.keys(acessos).length) return msg('Libere pelo menos um ambiente.');
      }
      if (EDIT === USER.email && !q('#uAtivo').checked) return msg('Você não pode desativar o próprio acesso.');
      const senha = q('#uSenha').value;
      if (!EDIT && senha.length < 6) return msg('A senha inicial precisa ter pelo menos 6 caracteres.');
      q('#uSalvar').disabled = true;
      try {
        let aviso = '';
        if (!EDIT) { const r = await S.criarLogin(email, senha); if (r.jaExistia) aviso = ' Este e-mail já tinha login: a senha anterior foi mantida (use "Redefinir senha" se precisar).'; }
        const ant = lista.find(u => u.email === email) || {};
        await S.salvarUsuario(email, { nome: q('#uNome').value.trim(), perfil, ativo: q('#uAtivo').checked, acessos, criadoEm: ant.criadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString(), atualizadoPor: USER.email });
        lista = await S.listarUsuarios(); limpar(); desenhaLista(); msg((EDIT ? 'Usuário atualizado.' : 'Usuário criado. Passe a senha inicial para a pessoa por um canal seguro.') + aviso, true);
      } catch (e) { msg('Erro ao salvar: ' + (e.message || e)); }
      finally { q('#uSalvar').disabled = false; }
    };
    const accTxt = u => u.perfil === 'admin' ? '<span class="tag adm">tudo</span>' : AMBS.filter(a => (u.acessos || {})[a]).map(a => '<span class="tag"><b>' + a + ':</b> ' + (u.acessos[a].includes('*') ? 'todas' : u.acessos[a].map(esc).join(', ')) + '</span>').join('<br>');
    function desenhaLista() {
      const fixos = S.masters.filter(m => !lista.some(u => u.email === m)).map(m => ({ email: m, nome: '', perfil: 'admin', ativo: true, fixo: true }));
      const rows = fixos.concat(lista.map(u => Object.assign({ fixo: S.masters.includes(u.email) }, u)));
      lw.innerHTML = '<table class="t"><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Acesso</th><th>Situação</th><th></th></tr></thead><tbody>' +
        rows.map((u, i) => '<tr><td><b>' + esc(u.email) + '</b></td><td>' + esc(u.nome) + '</td><td>' + (u.perfil === 'admin' ? '<span class="tag adm">Admin' + (u.fixo ? ' fixo' : '') + '</span>' : 'Usuário') + '</td><td>' + accTxt(u) + '</td>' +
          '<td><span class="st ' + (u.ativo ? 'on' : 'off') + '">' + (u.ativo ? 'Ativo' : 'Desativado') + '</span></td><td class="acts">' +
          (u.fixo ? '<button data-a="rs" data-i="' + i + '">Redefinir senha</button>' : '<button data-a="ed" data-i="' + i + '">Editar</button><button data-a="tg" data-i="' + i + '">' + (u.ativo ? 'Desativar' : 'Ativar') + '</button><button data-a="rs" data-i="' + i + '">Redefinir senha</button>' + (u.email === USER.email ? '' : '<button class="dang" data-a="rm" data-i="' + i + '">Remover</button>')) + '</td></tr>').join('') + '</tbody></table>' +
        '<div class="aviso" style="margin-top:12px">Remover tira o acesso ao painel na hora, mas o login (e-mail/senha) continua existindo no Firebase. Para apagar o login de vez: Console do Firebase › Authentication.</div>';
      lw.querySelectorAll('button').forEach(b => b.onclick = async () => {
        const u = rows[+b.dataset.i];
        try {
          if (b.dataset.a === 'ed') editar(u);
          if (b.dataset.a === 'tg') { if (u.email === USER.email) return msg('Você não pode desativar o próprio acesso.'); const { email, fixo, ...rest } = u; await S.salvarUsuario(email, Object.assign(rest, { ativo: !u.ativo, atualizadoEm: new Date().toISOString(), atualizadoPor: USER.email })); lista = await S.listarUsuarios(); desenhaLista(); msg(u.ativo ? 'Acesso desativado.' : 'Acesso reativado.', true); }
          if (b.dataset.a === 'rs') { await S.resetSenha(u.email); msg('E-mail de redefinição de senha enviado para ' + u.email + '.', true); }
          if (b.dataset.a === 'rm') { if (!b.classList.contains('conf')) { b.classList.add('conf'); b.textContent = 'Confirmar remoção'; return; } await S.removerUsuario(u.email); lista = await S.listarUsuarios(); desenhaLista(); msg('Usuário removido.', true); }
        } catch (e) { msg('Erro: ' + (e.message || e)); }
      });
    }
    limpar(); desenhaLista();
  }

  // ---------------------------------------------------------------- Administração · Bases
  async function pgBases(pg) {
    const up = el('div', { class: 'panel', style: 'margin-bottom:14px' });
    up.innerHTML = '<h3 style="text-align:left">Enviar bases do Frota Legal</h3>' +
      '<div style="font-size:13px;color:#4a5662;margin-bottom:10px;line-height:1.5">Selecione os arquivos <b>Prontuário de Condutores</b> exportados do Frota Legal (o ideal é <b>DPO e SDPO juntos</b>). O painel identifica o ambiente pelo próprio arquivo, substitui a foto atual e acumula as ocorrências e o histórico de faixas. Arquivos antigos também podem ser enviados — são processados em ordem de data de geração.</div>' +
      '<label class="drop" id="bDrop"><input type="file" id="bFile" accept=".xlsx" multiple class="hidden"><b>Clique para escolher</b> ou arraste os arquivos .xlsx aqui</label>' +
      '<div id="bPrev"></div>';
    pg.appendChild(up);
    const hist = el('div', { class: 'panel h-360' }); hist.appendChild(el('h3', { style: 'text-align:left' }, 'Últimas cargas')); pg.appendChild(hist);
    async function desenhaHist() {
      hist.querySelectorAll('.tw,.vazio').forEach(x => x.remove());
      let c = []; try { const d = await S.get('config', 'cargas'); c = d && d.json ? JSON.parse(d.json) : []; } catch (e) { }
      hist.appendChild(tabela([{ t: 'Enviada em', k: 'quando', fmt: localBR }, { t: 'Por', k: 'por' }, { t: 'Arquivo', k: 'arquivo' }, { t: 'Ambiente', k: 'amb', cls: 'c' }, { t: 'Gerada no Frota Legal', k: 'gerado', fmt: dtHoraBR }, { t: 'Mês do histórico', k: 'mes', fmt: v => v ? mesBR(v) : '' }, { t: 'Condutores', k: 'condutores', cls: 'n', num: 1 }, { t: 'Ocorrências', k: 'ocorrencias', cls: 'n', num: 1 }, { t: 'Período das ocorrências', k: 'periodo', fmt: v => esc((v || '').split(' a ').map(dBR).join(' a ')) }], c.slice(0, 100), { ord: { k: 'quando', dir: -1 } }));
    }
    desenhaHist();

    const prev = up.querySelector('#bPrev'), inp = up.querySelector('#bFile'), drop = up.querySelector('#bDrop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); ler([...e.dataTransfer.files]); });
    inp.onchange = () => { ler([...inp.files]); inp.value = ''; };

    async function ler(files) {
      prev.innerHTML = '<div class="msg">Lendo arquivos…</div>';
      const lidos = [], erros = [];
      for (const f of files) {
        try { const buf = new Uint8Array(await f.arrayBuffer()); lidos.push(P.lerPlanilha(buf, f.name, XLSX)); }
        catch (e) { erros.push(f.name + ': ' + (e.message || e)); }
      }
      const { plano } = await P.analisar(lidos, IDX);
      prev.innerHTML = '';
      if (erros.length) prev.appendChild(el('div', { class: 'aviso' }, '<b>Arquivo(s) recusado(s):</b><br>' + erros.map(esc).join('<br>')));
      if (!lidos.length) return;
      const linhas = plano.map(p => {
        const ds = p.f.ocorrencias.map(o => o.data).sort();
        return { arquivo: p.f.arquivo, amb: p.preSplit ? 'DPO + SDPO (reclassifica)' : p.f.amb, gerado: p.f.gerado.toISOString(), cond: p.f.condutores.length, oc: p.f.ocorrencias.length, per: ds.length ? dBR(ds[0]) + ' a ' + dBR(ds[ds.length - 1]) : '—', sit: p.velho ? '<span style="color:var(--vermelho)">Já carregada (ou mais antiga que a atual) — será ignorada</span>' : 'OK', ign: p.f.ignorados.length };
      });
      prev.appendChild(el('h3', { style: 'text-align:left;margin-top:16px' }, 'Conferência antes de publicar'));
      prev.appendChild(tabela([{ t: 'Arquivo', k: 'arquivo' }, { t: 'Ambiente', k: 'amb' }, { t: 'Gerada em', k: 'gerado', fmt: dtHoraBR }, { t: 'Condutores', k: 'cond', cls: 'n' }, { t: 'Ocorrências', k: 'oc', cls: 'n' }, { t: 'Período das ocorrências', k: 'per' }, { t: 'Situação', k: 'sit', fmt: v => v }], linhas, { ord: { k: 'gerado', dir: 1 } }));
      const avisos = [];
      const novas = [...new Set(plano.flatMap(p => p.novas))];
      if (novas.length) avisos.push('<b>Filial nova:</b> ' + novas.map(esc).join(', ') + '. Ela entra automaticamente para quem tem acesso a "Todas as filiais". Confira se não é um cadastro de teste.');
      const ign = lidos.reduce((s, l) => s + l.ignorados.length, 0);
      if (ign) avisos.push(ign + ' cadastro(s) de teste (matrícula "teste") ignorado(s), com as ocorrências deles.');
      const ambsLote = new Set(plano.filter(p => !p.preSplit && !p.velho).map(p => p.f.amb));
      if (ambsLote.size === 1 && IDX && Object.keys(IDX.amb).length > 1) avisos.push('Só foi enviada a base <b>' + [...ambsLote][0] + '</b>. A outra continua com a data anterior.');
      if (plano.some(p => p.preSplit)) avisos.push('Há base(s) anterior(es) à separação DPO/SDPO: cada condutor é colocado no ambiente em que aparece nas bases mais recentes; quem já saiu é classificado pelo cargo (Vendedor/Coordenador de Operações/Administrativo → SDPO; demais → DPO).');
      avisos.forEach(a => prev.appendChild(el('div', { class: 'aviso' }, a)));
      const velhos = plano.filter(p => p.velho).length;
      const rec = el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:13px;margin:10px 0' }, '<input type="checkbox" id="bRec"> <span><b>Reconstruir o histórico do zero</b> com estes arquivos (apaga todos os dados atuais do painel antes de carregar)</span>');
      prev.appendChild(rec);
      if (velhos) prev.appendChild(el('div', { class: 'aviso' }, 'Para incluir as bases mais antigas que a atual, marque "Reconstruir o histórico do zero" e envie <b>todas</b> as bases juntas (antigas e a mais recente).'));
      const bt = el('button', { class: 'btn' }, 'Publicar no painel'); prev.appendChild(bt);
      const log = el('div', { class: 'log hidden' }); prev.appendChild(log);
      bt.onclick = async () => {
        const reconstruir = rec.querySelector('input').checked;
        if (reconstruir && !confirm('Apagar todos os dados do painel e recarregar a partir destes ' + lidos.length + ' arquivo(s)?')) return;
        if (!reconstruir && plano.every(p => p.velho)) { log.classList.remove('hidden'); log.textContent = 'Nada a publicar: todas as bases são mais antigas que as já carregadas.'; return; }
        bt.disabled = true; log.classList.remove('hidden'); log.textContent = '';
        const w = t => { log.textContent += t + '\n'; log.scrollTop = log.scrollHeight; };
        try {
          await P.carregar(lidos, S, { reconstruir, usuario: USER.email }, w);
          await carregarBase();
          prev.appendChild(el('div', { class: 'ok-box' }, 'Bases publicadas. As telas já mostram os dados novos.'));
          rodape(); desenhaHist();
        } catch (e) { console.error(e); w('ERRO: ' + (e.message || e)); bt.disabled = false; }
      };
    }
  }

})();
