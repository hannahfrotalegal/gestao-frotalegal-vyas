/* Camada de dados: Firebase (produção) ou memória (modo demonstração). Mesma interface para o painel. */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG;
  const DEMO = !CFG.firebase.apiKey || /^COLE/i.test(CFG.firebase.apiKey);
  const masters = CFG.masters.map(m => m.trim().toLowerCase());

  function demoStore() {
    const mem = new Map(); const users = new Map();
    let cur = null, cb = () => {};
    return {
      demo: true,
      async get(col, id) { const v = mem.get(col + '/' + id); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async write(ops) { for (const o of ops) { if (o.data === null) mem.delete(o.col + '/' + o.id); else mem.set(o.col + '/' + o.id, JSON.parse(JSON.stringify(o.data))); } },
      onAuth(f) { cb = f; setTimeout(() => cb(cur), 0); },
      async login(email) { cur = { email: email.trim().toLowerCase() }; cb(cur); },
      async logout() { cur = null; cb(null); },
      async resetSenha() {},
      async perfil(email) { if (masters.includes(email) || !users.size) return { perfil: 'admin', ativo: true, master: masters.includes(email), nome: 'Demonstração' }; return users.get(email) || null; },
      async listarUsuarios() { return [...users.entries()].map(([email, u]) => Object.assign({ email }, u)); },
      async salvarUsuario(email, u) { users.set(email, u); },
      async removerUsuario(email) { users.delete(email); },
      async criarLogin() { return { jaExistia: false }; },
      _mem: mem,
    };
  }

  function firebaseStore() {
    const app = firebase.initializeApp(CFG.firebase);
    const auth = firebase.auth(), db = firebase.firestore();
    return {
      demo: false,
      async get(col, id) { const s = await db.collection(col).doc(id).get(); return s.exists ? s.data() : null; },
      // grava em lotes de até 400 documentos ou ~4 MB (limites do Firestore: 500 operações / 10 MB por lote)
      async write(ops) {
        let lote = [], tam = 0;
        const envia = async () => { if (!lote.length) return; const b = db.batch(); lote.forEach(o => { const r = db.collection(o.col).doc(o.id); if (o.data === null) b.delete(r); else b.set(r, o.data); }); await b.commit(); lote = []; tam = 0; };
        for (const o of ops) {
          const t = o.data ? JSON.stringify(o.data).length : 100;
          if (lote.length >= 400 || tam + t > 4e6) await envia();
          lote.push(o); tam += t;
        }
        await envia();
      },
      onAuth(f) { auth.onAuthStateChanged(u => f(u ? { email: (u.email || '').toLowerCase() } : null)); },
      async login(email, senha) { await auth.signInWithEmailAndPassword(email.trim(), senha); },
      async logout() { await auth.signOut(); },
      async resetSenha(email) { await auth.sendPasswordResetEmail(email.trim()); },
      async perfil(email) {
        let u = null;
        try { const s = await db.collection('usuarios').doc(email).get(); u = s.exists ? s.data() : null; } catch (e) { u = null; }
        if (masters.includes(email)) return Object.assign({ nome: '' }, u || {}, { perfil: 'admin', ativo: true, master: true });
        return u;
      },
      async listarUsuarios() { const q = await db.collection('usuarios').get(); return q.docs.map(d => Object.assign({ email: d.id }, d.data())); },
      async salvarUsuario(email, u) { await db.collection('usuarios').doc(email).set(u); },
      async removerUsuario(email) { await db.collection('usuarios').doc(email).delete(); },
      // cria o login (e-mail/senha) sem derrubar a sessão do admin: usa uma segunda instância do app
      async criarLogin(email, senha) {
        const sec = firebase.apps.find(a => a.name === 'cadastro') || firebase.initializeApp(CFG.firebase, 'cadastro');
        try { await sec.auth().createUserWithEmailAndPassword(email, senha); await sec.auth().signOut(); return { jaExistia: false }; }
        catch (e) { if (e && e.code === 'auth/email-already-in-use') return { jaExistia: true }; throw e; }
      },
    };
  }

  window.Store = DEMO ? demoStore() : firebaseStore();
  window.Store.masters = masters;
})();
