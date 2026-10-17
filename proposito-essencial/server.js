// Servidor do site "Propósito em Deus" (v3)
// Banco SQLite, contas, recuperação de senha, limite de tentativas,
// notificações Web Push (site fechado), envio diário às 7h (Brasília) e apresentação de slides.
// Uso: npm install && PORT=3000 node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TIMEZONE = 'America/Sao_Paulo';
const HORA_ENVIO = 7;
const JANELA_ENVIO_FIM = 12;
const SESSAO_DIAS = 30;
const RESET_HORAS = 1;
const LIMITE_CORPO = 200 * 1024;
const LIMITE_TENTATIVAS = 5;          // por IP+e-mail
const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Versículos (Almeida Revista e Atualizada - ARA) ----------
const VERSICULOS = [
  { ref: 'Salmos 23:1', texto: 'O Senhor é o meu pastor; nada me faltará.' },
  { ref: 'Provérbios 3:5-6', texto: 'Confia no Senhor de todo o teu coração, e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.' },
  { ref: 'Filipenses 4:13', texto: 'Posso todas as coisas naquele que me fortalece.' },
  { ref: 'Jeremias 29:11', texto: 'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor; pensamentos de paz, e não de mal, para vos dar o fim que esperais.' },
  { ref: 'Romanos 8:28', texto: 'E sabemos que todas as coisas contribuem juntamente para o bem daqueles que amam a Deus, daqueles que são chamados segundo o seu propósito.' },
  { ref: 'Isaías 40:31', texto: 'Mas os que esperam no Senhor renovarão as forças, subirão com asas como águias; correrão, e não se cansarão; caminharão, e não se fatigarão.' },
  { ref: 'Mateus 6:33', texto: 'Mas buscai primeiro o reino de Deus, e a sua justiça, e todas estas coisas vos serão acrescentadas.' },
  { ref: 'Salmos 46:1', texto: 'Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.' },
  { ref: 'Gálatas 5:22-23', texto: 'Mas o fruto do Espírito é: amor, gozo, paz, longanimidade, benignidade, bondade, fidelidade, mansidão, domínio próprio.' },
  { ref: '2 Timóteo 1:7', texto: 'Porque Deus não nos deu espírito de covardia, mas de poder, de amor e de moderação.' },
  { ref: 'Salmos 118:24', texto: 'Este é o dia que fez o Senhor; regozijemo-nos e alegremo-nos nele.' },
  { ref: 'Lamentações 3:22-23', texto: 'As misericórdias do Senhor são a causa de não sermos consumidos, porque as suas misericórdias não têm fim. Novas são cada manhã; grande é a tua fidelidade.' },
  { ref: 'Josué 1:9', texto: 'Não to mandei eu? Esforça-te e tem bom ânimo; não te espantes, nem te assustes, porque o Senhor teu Deus é contigo por onde quer que andares.' },
  { ref: '1 Pedro 5:7', texto: 'Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.' },
  { ref: 'Mateus 11:28', texto: 'Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos aliviarei.' },
];

// ---------- Jornada passo a passo ----------
const JORNADA = [
  { id: 'j1', titulo: 'Conhecer a Deus', descricao: 'Comece lendo João 1:1-14 e reconhecendo quem Jesus é.' },
  { id: 'j2', titulo: 'Arrependimento e perdão', descricao: 'Leia Salmos 51 e entregue a Deus o que pesa no seu coração.' },
  { id: 'j3', titulo: 'Fé e confiança', descricao: 'Leia Hebreus 11 e registre uma promessa de Deus em que quer confiar.' },
  { id: 'j4', titulo: 'Oração diária', descricao: 'Pratique 10 minutos de oração todos os dias durante uma semana.' },
  { id: 'j5', titulo: 'Palavra de Deus', descricao: 'Leia o Evangelho de João, um capítulo por dia.' },
  { id: 'j6', titulo: 'Batismo e comunhão', descricao: 'Converse com um líder da sua igreja sobre batismo e vida em comunidade.' },
  { id: 'j7', titulo: 'Propósito e serviço', descricao: 'Identifique seus dons e um modo prático de servir ao próximo.' },
];

// ---------- Banco de dados (SQLite) ----------
const banco = new Database(path.join(DATA_DIR, 'proposito.db'));
banco.pragma('journal_mode = WAL');
banco.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    salt TEXT NOT NULL, hash TEXT NOT NULL, criado TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, criada INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS estados (
    usuario_id TEXT PRIMARY KEY, dados TEXT NOT NULL, atualizado TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inscricoes (
    endpoint TEXT PRIMARY KEY, subscription TEXT NOT NULL, usuario_id TEXT, criada TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS redefinicoes (
    token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, expira INTEGER NOT NULL, usado INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY, valor TEXT
  );
`);

const q = {
  usuarioPorEmail: banco.prepare('SELECT * FROM usuarios WHERE email = ?'),
  usuarioPorId: banco.prepare('SELECT * FROM usuarios WHERE id = ?'),
  inserirUsuario: banco.prepare('INSERT INTO usuarios (id, nome, email, salt, hash, criado) VALUES (?, ?, ?, ?, ?, ?)'),
  atualizarSenha: banco.prepare('UPDATE usuarios SET salt = ?, hash = ? WHERE id = ?'),
  inserirSessao: banco.prepare('INSERT INTO sessoes (token, usuario_id, criada) VALUES (?, ?, ?)'),
  sessao: banco.prepare('SELECT * FROM sessoes WHERE token = ?'),
  apagarSessao: banco.prepare('DELETE FROM sessoes WHERE token = ?'),
  apagarSessoesUsuario: banco.prepare('DELETE FROM sessoes WHERE usuario_id = ?'),
  estado: banco.prepare('SELECT dados FROM estados WHERE usuario_id = ?'),
  salvarEstado: banco.prepare('INSERT INTO estados (usuario_id, dados, atualizado) VALUES (?, ?, ?) ON CONFLICT(usuario_id) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado'),
  salvarInscricao: banco.prepare('INSERT INTO inscricoes (endpoint, subscription, usuario_id, criada) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET subscription = excluded.subscription, usuario_id = excluded.usuario_id'),
  apagarInscricao: banco.prepare('DELETE FROM inscricoes WHERE endpoint = ?'),
  todasInscricoes: banco.prepare('SELECT endpoint, subscription FROM inscricoes'),
  contarInscricoes: banco.prepare('SELECT COUNT(*) AS n FROM inscricoes'),
  inserirRedefinicao: banco.prepare('INSERT INTO redefinicoes (token_hash, usuario_id, expira, usado) VALUES (?, ?, ?, 0)'),
  redefinicao: banco.prepare('SELECT * FROM redefinicoes WHERE token_hash = ?'),
  marcarRedefinicaoUsada: banco.prepare('UPDATE redefinicoes SET usado = 1 WHERE token_hash = ?'),
  getConfig: banco.prepare('SELECT valor FROM configuracoes WHERE chave = ?'),
  setConfig: banco.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'),
};

// Migração única do db.json (versão 2) para o SQLite
const ARQUIVO_JSON_ANTIGO = path.join(DATA_DIR, 'db.json');
if (fs.existsSync(ARQUIVO_JSON_ANTIGO)) {
  const antigo = JSON.parse(fs.readFileSync(ARQUIVO_JSON_ANTIGO, 'utf8'));
  banco.transaction(() => {
    for (const u of antigo.usuarios || []) {
      if (!q.usuarioPorId.get(u.id)) {
        q.inserirUsuario.run(u.id, u.nome, u.email, u.salt, u.hash, u.criado || new Date().toISOString());
        if (u.estado) q.salvarEstado.run(u.id, JSON.stringify(u.estado), new Date().toISOString());
      }
    }
    for (const [token, s] of Object.entries(antigo.sessoes || {})) q.inserirSessao.run(token, s.usuarioId, s.criada);
    for (const [endpoint, r] of Object.entries(antigo.inscricoes || {})) {
      q.salvarInscricao.run(endpoint, JSON.stringify(r.subscription), r.usuarioId, r.criada || new Date().toISOString());
    }
    if (antigo.ultimoEnvio) q.setConfig.run('ultimo_envio', antigo.ultimoEnvio);
  })();
  fs.renameSync(ARQUIVO_JSON_ANTIGO, path.join(DATA_DIR, 'db.json.migrado'));
  console.log('Dados da versão anterior migrados para SQLite.');
}

// ---------- Chaves VAPID (Web Push) ----------
let vapid;
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else if (fs.existsSync(VAPID_FILE)) {
  vapid = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
} else {
  vapid = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid, null, 2));
}
webpush.setVapidDetails(process.env.VAPID_CONTATO || 'mailto:contato@proposito.local', vapid.publicKey, vapid.privateKey);

// ---------- E-mail (SMTP real se configurado; senão, grava em data/emails.log) ----------
let transporte = null;
if (process.env.SMTP_HOST) {
  const nodemailer = require('nodemailer');
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
async function enviarEmail(para, assunto, texto) {
  if (transporte) {
    await transporte.sendMail({ from: process.env.SMTP_FROM || 'Propósito em Deus <nao-responder@proposito.local>', to: para, subject: assunto, text: texto });
    return;
  }
  fs.appendFileSync(path.join(DATA_DIR, 'emails.log'), `---- ${new Date().toISOString()} | para: ${para}\nAssunto: ${assunto}\n${texto}\n\n`);
  console.log(`[E-mail simulado para ${para}] ${assunto}`);
}

// ---------- Utilitários ----------
const TZ_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false });
function agoraBrasilia() {
  const p = Object.fromEntries(TZ_FMT.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24 };
}
function versiculoDoDia(dataISO = agoraBrasilia().data) {
  const [y, m, d] = dataISO.split('-').map(Number);
  const dias = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const idx = ((dias % VERSICULOS.length) + VERSICULOS.length) % VERSICULOS.length;
  return { data: dataISO, ...VERSICULOS[idx] };
}
function enviarJSON(res, status, obj, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.webp': 'image/webp',
};
function servirArquivo(req, res, urlPath) {
  const alvo = urlPath === '/' ? '/index.html' : urlPath;
  const caminho = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(alvo)));
  if (!caminho.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Proibido'); }
  fs.stat(caminho, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    const nome = path.basename(caminho);
    const cache = nome === 'sw.js' || nome === 'index.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(caminho)] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': st.size });
    fs.createReadStream(caminho).pipe(res);
  });
}
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0; const pedacos = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > LIMITE_CORPO) { reject(Object.assign(new Error('Corpo muito grande'), { status: 413 })); req.destroy(); }
      else pedacos.push(c);
    });
    req.on('end', () => {
      if (!pedacos.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(pedacos).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const ipDe = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'ip';
const baseUrl = (req) => process.env.PUBLIC_URL || `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers.host}`;

// ---------- Limite de tentativas (memória) ----------
const tentativas = new Map();
function bloqueado(chave) {
  const agora = Date.now();
  const lista = (tentativas.get(chave) || []).filter((t) => agora - t < JANELA_TENTATIVAS_MS);
  tentativas.set(chave, lista);
  return lista.length >= LIMITE_TENTATIVAS;
}
function registrarFalha(chave) {
  tentativas.set(chave, [...(tentativas.get(chave) || []), Date.now()]);
}

// ---------- Senhas e sessões ----------
const hashSenha = (senha, salt) => crypto.scryptSync(senha, salt, 64).toString('hex');
function senhaCorreta(senha, usuario) {
  const h = Buffer.from(hashSenha(senha, usuario.salt), 'hex');
  const esperado = Buffer.from(usuario.hash, 'hex');
  return h.length === esperado.length && crypto.timingSafeEqual(h, esperado);
}
function criarHashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashSenha(senha, salt) };
}
function lerCookie(req, nome) {
  const par = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(nome + '='));
  return par ? decodeURIComponent(par.slice(nome.length + 1)) : null;
}
function usuarioDaSessao(req) {
  const token = lerCookie(req, 'sid');
  if (!token) return null;
  const s = q.sessao.get(token);
  if (!s) return null;
  if (Date.now() - s.criada > SESSAO_DIAS * 86400000) { q.apagarSessao.run(token); return null; }
  return q.usuarioPorId.get(s.usuario_id) || null;
}
function criarSessao(req, usuario) {
  const token = crypto.randomBytes(32).toString('hex');
  q.inserirSessao.run(token, usuario.id, Date.now());
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSAO_DIAS * 86400}${secure}`;
}

// ---------- Estado do usuário ----------
function estadoVazio() { return { tarefas: {}, jornada: [], perfil: {} }; }
function sanitizarEstado(e) {
  const limpo = estadoVazio();
  if (!e || typeof e !== 'object') return limpo;
  if (e.tarefas && typeof e.tarefas === 'object') {
    for (const d of Object.keys(e.tarefas).sort().slice(-60)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Array.isArray(e.tarefas[d])) limpo.tarefas[d] = e.tarefas[d].slice(0, 20).map((x) => x === true);
    }
  }
  const ids = new Set(JORNADA.map((p) => p.id));
  if (Array.isArray(e.jornada)) limpo.jornada = e.jornada.filter((id) => ids.has(id));
  if (e.perfil && typeof e.perfil === 'object') {
    for (const k of ['p-nome', 'p-idade', 'p-historia', 'p-oracao']) {
      limpo.perfil[k] = typeof e.perfil[k] === 'string' ? e.perfil[k].slice(0, 1000) : '';
    }
  }
  return limpo;
}
const estadoEstaVazio = (e) => !Object.keys(e.tarefas || {}).length && !(e.jornada || []).length && !Object.values(e.perfil || {}).some(Boolean);

// ---------- Notificações push ----------
async function enviarVersiculoParaTodos() {
  const v = versiculoDoDia();
  const payload = JSON.stringify({ title: 'Palavra do dia — ' + v.ref, body: v.texto, url: '/' });
  for (const linha of q.todasInscricoes.all()) {
    try {
      await webpush.sendNotification(JSON.parse(linha.subscription), payload, { TTL: 60 * 60 * 12 });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) q.apagarInscricao.run(linha.endpoint);
      else console.error('Falha ao enviar push:', err.statusCode || err.message);
    }
  }
  console.log(`Versículo enviado para ${q.contarInscricoes.get().n} inscrição(ões).`);
}
let enviando = false;
async function checarEnvioDiario() {
  if (enviando) return;
  const { data, hora } = agoraBrasilia();
  const ultimo = q.getConfig.get('ultimo_envio');
  if (hora >= HORA_ENVIO && hora < JANELA_ENVIO_FIM && (!ultimo || ultimo.valor !== data)) {
    enviando = true;
    try {
      q.setConfig.run('ultimo_envio', data); // marca antes para evitar envio duplicado
      await enviarVersiculoParaTodos();
    } finally { enviando = false; }
  }
}
setInterval(checarEnvioDiario, 30 * 1000);
checarEnvioDiario();

// ---------- Slides (imagens e vídeos) ----------
function listarSlides() {
  const arquivo = path.join(PUBLIC_DIR, 'slides.json');
  if (!fs.existsSync(arquivo)) return [];
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return []; }
}

// ---------- Servidor HTTP ----------
const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/health') return enviarJSON(res, 200, { ok: true, agora: new Date().toISOString(), inscricoes: q.contarInscricoes.get().n });
    if (p === '/api/versiculo-do-dia') return enviarJSON(res, 200, versiculoDoDia());
    if (p === '/api/jornada') return enviarJSON(res, 200, { passos: JORNADA });
    if (p === '/api/slides') return enviarJSON(res, 200, { slides: listarSlides() });
    if (p === '/api/versiculos-proximos') {
      const dias = Math.min(60, Math.max(1, Number(url.searchParams.get('dias')) || 30));
      const { data } = agoraBrasilia();
      const [y, m, d] = data.split('-').map(Number);
      const lista = [];
      for (let i = 0; i < dias; i++) {
        const dt = new Date(Date.UTC(y, m - 1, d + i));
        const iso = dt.toISOString().slice(0, 10);
        lista.push(versiculoDoDia(iso));
      }
      return enviarJSON(res, 200, { versiculos: lista });
    }
    if (p === '/api/push/chave-publica') return enviarJSON(res, 200, { chave: vapid.publicKey });

    // ----- Conta -----
    if (p === '/api/auth/registrar' && req.method === 'POST') {
      const { nome = '', email = '', senha = '' } = await lerCorpo(req);
      const emailN = String(email).trim().toLowerCase();
      if (String(nome).trim().length < 2) return enviarJSON(res, 400, { erro: 'Informe seu nome.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailN)) return enviarJSON(res, 400, { erro: 'E-mail inválido.' });
      if (String(senha).length < 6) return enviarJSON(res, 400, { erro: 'A senha deve ter pelo menos 6 caracteres.' });
      if (q.usuarioPorEmail.get(emailN)) return enviarJSON(res, 409, { erro: 'Este e-mail já está cadastrado.' });
      const { salt, hash } = criarHashSenha(String(senha));
      const id = crypto.randomUUID();
      q.inserirUsuario.run(id, String(nome).trim().slice(0, 80), emailN, salt, hash, new Date().toISOString());
      const usuario = q.usuarioPorId.get(id);
      return enviarJSON(res, 201, { nome: usuario.nome, email: usuario.email }, { 'Set-Cookie': criarSessao(req, usuario) });
    }

    if (p === '/api/auth/entrar' && req.method === 'POST') {
      const { email = '', senha = '' } = await lerCorpo(req);
      const emailN = String(email).trim().toLowerCase();
      const chave = ipDe(req) + '|' + emailN;
      if (bloqueado(chave)) return enviarJSON(res, 429, { erro: 'Muitas tentativas. Aguarde 15 minutos ou recupere sua senha.' });
      const usuario = q.usuarioPorEmail.get(emailN);
      if (!usuario || !senhaCorreta(String(senha), usuario)) {
        registrarFalha(chave);
        return enviarJSON(res, 401, { erro: 'E-mail ou senha incorretos.' });
      }
      tentativas.delete(chave);
      return enviarJSON(res, 200, { nome: usuario.nome, email: usuario.email }, { 'Set-Cookie': criarSessao(req, usuario) });
    }

    if (p === '/api/auth/sair' && req.method === 'POST') {
      const token = lerCookie(req, 'sid');
      if (token) q.apagarSessao.run(token);
      return enviarJSON(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' });
    }

    if (p === '/api/auth/eu') {
      const u = usuarioDaSessao(req);
      return u ? enviarJSON(res, 200, { nome: u.nome, email: u.email }) : enviarJSON(res, 401, { erro: 'Não autenticado' });
    }

    // ----- Recuperação de senha -----
    if (p === '/api/auth/esqueci' && req.method === 'POST') {
      const { email = '' } = await lerCorpo(req);
      const emailN = String(email).trim().toLowerCase();
      const chave = 'reset|' + ipDe(req);
      if (bloqueado(chave)) return enviarJSON(res, 429, { erro: 'Muitas solicitações. Tente novamente mais tarde.' });
      registrarFalha(chave);
      const usuario = q.usuarioPorEmail.get(emailN);
      if (usuario) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        q.inserirRedefinicao.run(tokenHash, usuario.id, Date.now() + RESET_HORAS * 3600000);
        const link = `${baseUrl(req)}/?reset=${token}`;
        await enviarEmail(usuario.email, 'Redefinir sua senha — Propósito em Deus',
          `Olá, ${usuario.nome}!\n\nPara criar uma nova senha, acesse o link abaixo (válido por ${RESET_HORAS} hora):\n${link}\n\nSe você não pediu isso, ignore este e-mail.`);
      }
      // Resposta igual existindo ou não o e-mail (evita revelar cadastros)
      return enviarJSON(res, 200, { ok: true, mensagem: 'Se o e-mail estiver cadastrado, você receberá o link para redefinir a senha.' });
    }

    if (p === '/api/auth/redefinir' && req.method === 'POST') {
      const { token = '', senha = '' } = await lerCorpo(req);
      if (String(senha).length < 6) return enviarJSON(res, 400, { erro: 'A senha deve ter pelo menos 6 caracteres.' });
      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
      const r = q.redefinicao.get(tokenHash);
      if (!r || r.usado || r.expira < Date.now()) return enviarJSON(res, 400, { erro: 'Link inválido ou expirado. Solicite um novo.' });
      const { salt, hash } = criarHashSenha(String(senha));
      banco.transaction(() => {
        q.atualizarSenha.run(salt, hash, r.usuario_id);
        q.marcarRedefinicaoUsada.run(tokenHash);
        q.apagarSessoesUsuario.run(r.usuario_id); // encerra sessões antigas
      })();
      return enviarJSON(res, 200, { ok: true });
    }

    // ----- Estado sincronizado -----
    if (p === '/api/estado') {
      const u = usuarioDaSessao(req);
      if (!u) return enviarJSON(res, 401, { erro: 'Faça login para sincronizar.' });
      if (req.method === 'GET') {
        const linha = q.estado.get(u.id);
        return enviarJSON(res, 200, linha ? JSON.parse(linha.dados) : estadoVazio());
      }
      if (req.method === 'PUT') {
        const limpo = sanitizarEstado(await lerCorpo(req));
        q.salvarEstado.run(u.id, JSON.stringify(limpo), new Date().toISOString());
        return enviarJSON(res, 200, { ok: true });
      }
    }

    // ----- Notificações -----
    if (p === '/api/push/inscrever' && req.method === 'POST') {
      const { subscription } = await lerCorpo(req);
      if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.keys) {
        return enviarJSON(res, 400, { erro: 'Inscrição inválida.' });
      }
      const u = usuarioDaSessao(req);
      q.salvarInscricao.run(subscription.endpoint, JSON.stringify(subscription), u ? u.id : null, new Date().toISOString());
      return enviarJSON(res, 201, { ok: true });
    }
    if (p === '/api/push/cancelar' && req.method === 'POST') {
      const { endpoint = '' } = await lerCorpo(req);
      q.apagarInscricao.run(String(endpoint));
      return enviarJSON(res, 200, { ok: true });
    }

    if (req.method === 'GET') return servirArquivo(req, res, p);
    return enviarJSON(res, 404, { erro: 'Rota não encontrada' });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    return enviarJSON(res, status, { erro: status === 500 ? 'Erro interno' : err.message });
  }
});

servidor.listen(PORT, '0.0.0.0', () => console.log(`Propósito em Deus rodando em http://0.0.0.0:${PORT}`));
