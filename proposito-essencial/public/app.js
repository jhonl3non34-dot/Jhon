// Front-end: apresentação de abertura, versículo, tarefas, jornada, conta, recuperação de senha e push.
(function () {
  const TAREFAS = [
    'Ler um capítulo da Bíblia',
    'Orar agradecendo por 3 coisas',
    'Orar por uma pessoa específica',
    'Praticar um ato de bondade',
    'Perdoar alguém (ou pedir perdão)',
    'Evitar uma palavra ou hábito que afasta de Deus',
    'Dedicar 15 minutos ao silêncio com Deus',
    'Registrar uma lição que Deus ensinou hoje',
  ];
  const CHAVE_LOCAL = 'estado-local-v2';
  const CAMPOS_PERFIL = ['p-nome', 'p-idade', 'p-historia', 'p-oracao'];
  const DURACAO_IMAGEM_MS = 6500;
  const DURACAO_VIDEO_MAX_MS = 25000;

  const $ = (sel) => document.querySelector(sel);
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const jsonHeaders = { 'Content-Type': 'application/json' };

  // ---------- Estado ----------
  let PASSOS = [];
  let usuario = null;
  let versiculo = null;
  let estado = lerLocal();

  function estadoVazio() { return { tarefas: {}, jornada: [], perfil: {} }; }
  function lerLocal() {
    try { return { ...estadoVazio(), ...JSON.parse(localStorage.getItem(CHAVE_LOCAL)) }; } catch { return estadoVazio(); }
  }
  function estadoEstaVazio(e) {
    return !Object.keys(e.tarefas || {}).length && !(e.jornada || []).length && !Object.values(e.perfil || {}).some(Boolean);
  }

  let timerSync = null;
  function salvarEstado() {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado));
    if (!usuario) return;
    clearTimeout(timerSync);
    $('#status-sync').textContent = 'Salvando...';
    timerSync = setTimeout(async () => {
      try {
        const r = await fetch('/api/estado', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(estado) });
        $('#status-sync').textContent = r.ok ? 'Sincronizado com sua conta.' : 'Não foi possível salvar agora.';
      } catch { $('#status-sync').textContent = 'Sem conexão. Será salvo quando voltar.'; }
    }, 600);
  }

  function tarefasDoDia() {
    const d = hoje();
    if (!estado.tarefas[d] || estado.tarefas[d].length !== TAREFAS.length) {
      estado.tarefas[d] = TAREFAS.map((_, i) => (estado.tarefas[d] || [])[i] === true);
    }
    const dias = Object.keys(estado.tarefas).sort();
    dias.slice(0, Math.max(0, dias.length - 60)).forEach((k) => delete estado.tarefas[k]);
    return estado.tarefas[d];
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.style.display = 'none'), 3000);
  }
  const urlBase64ParaUint8 = (b64) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };

  function irParaAba(aba) {
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba));
    document.querySelectorAll('section').forEach((s) => s.classList.toggle('ativa', s.id === aba));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('nav button').forEach((btn) => btn.addEventListener('click', () => irParaAba(btn.dataset.aba)));

  // ---------- Apresentação de abertura ----------
  let slides = [];
  let indiceSlide = -1;
  let timerSlide = null;
  let videoAtual = null;

  async function carregarSlides() {
    try { slides = (await (await fetch('/api/slides', { cache: 'no-store' })).json()).slides || []; }
    catch { slides = []; }
  }

  function iniciarIntro() {
    if (!slides.length) { $('#intro').classList.add('saindo'); return; }
    const barras = $('#barras-intro');
    barras.innerHTML = slides.map(() => '<span><i></i></span>').join('');
    indiceSlide = -1;
    proximoSlide();
  }

  function limparMidia() {
    clearTimeout(timerSlide);
    if (videoAtual) { videoAtual.pause(); videoAtual.remove(); videoAtual = null; }
    document.querySelectorAll('#intro .midia').forEach((el) => el.remove());
  }

  function proximoSlide() {
    limparMidia();
    indiceSlide++;
    if (indiceSlide >= slides.length) return terminarIntro();

    const s = slides[indiceSlide];
    const intro = $('#intro');
    const barrasEl = document.querySelectorAll('#barras-intro span');
    barrasEl.forEach((el, i) => {
      el.classList.toggle('feito', i < indiceSlide);
      el.classList.toggle('atual', i === indiceSlide);
    });
    const dur = s.tipo === 'imagem' ? (s.duracao || DURACAO_IMAGEM_MS / 1000) * 1000 : DURACAO_VIDEO_MAX_MS;
    barrasEl[indiceSlide].querySelector('i').style.animation = 'none';
    void barrasEl[indiceSlide].querySelector('i').offsetWidth;
    barrasEl[indiceSlide].querySelector('i').style.animation = '';
    barrasEl[indiceSlide].style.setProperty('--dur', dur + 'ms');
    barrasEl.forEach((el) => el.style.setProperty('--dur', dur + 'ms'));

    // Mídia de fundo
    if (s.tipo === 'imagem') {
      const div = document.createElement('div');
      div.className = 'fundo midia';
      div.style.backgroundImage = `url('${s.src}')`;
      intro.insertBefore(div, intro.firstChild);
      requestAnimationFrame(() => requestAnimationFrame(() => div.classList.add('visivel')));
    } else if (s.tipo === 'video') {
      const v = document.createElement('video');
      v.className = 'fundo midia visivel';
      v.src = s.src; v.muted = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.addEventListener('ended', proximoSlide);
      v.addEventListener('error', proximoSlide);
      intro.insertBefore(v, intro.firstChild);
      videoAtual = v;
      v.play().catch(() => {});
    } else if (s.tipo === 'youtube') {
      const f = document.createElement('iframe');
      f.className = 'midia';
      f.allow = 'autoplay; encrypted-media';
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.id)}?autoplay=1&mute=1&controls=0&playsinline=1&loop=0&rel=0&modestbranding=1`;
      intro.insertBefore(f, intro.firstChild);
    }

    // Texto
    const txt = $('#texto-intro');
    txt.classList.remove('visivel');
    setTimeout(() => {
      $('#titulo-intro').textContent = s.titulo || '';
      $('#legenda-intro').textContent = s.texto || '';
      txt.classList.add('visivel');
    }, 350);

    const ultimo = indiceSlide === slides.length - 1;
    $('#botao-entrar').classList.toggle('visivel', ultimo);
    // No último slide não avança sozinho: fica o botão "Entrar no app"
    if (!ultimo) timerSlide = setTimeout(proximoSlide, s.tipo === 'imagem' ? dur : DURACAO_VIDEO_MAX_MS);
  }

  function terminarIntro() {
    limparMidia();
    const intro = $('#intro');
    intro.classList.add('saindo');
    setTimeout(() => intro.remove(), 700);
  }
  $('#btn-pular').addEventListener('click', terminarIntro);
  $('#btn-entrar').addEventListener('click', terminarIntro);
  // Toque na tela avança para o próximo slide (exceto no último)
  $('#intro').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (indiceSlide < slides.length - 1) proximoSlide();
  });

  // ---------- Versículo ----------
  async function carregarVersiculo() {
    try {
      versiculo = await (await fetch('/api/versiculo-do-dia', { cache: 'no-store' })).json();
      $('#versiculo').textContent = '“' + versiculo.texto + '”';
      $('#referencia').textContent = versiculo.ref + ' (ARA)';
      const [y, m, d] = versiculo.data.split('-');
      $('#data-hoje').textContent = `${d}/${m}/${y}`;
    } catch {
      $('#versiculo').textContent = 'Não foi possível carregar o versículo. Tente novamente.';
    }
  }

  // ---------- Tarefas ----------
  function renderTarefas() {
    const marcadas = tarefasDoDia();
    const lista = $('#lista-tarefas');
    lista.innerHTML = '';
    TAREFAS.forEach((texto, i) => {
      const label = document.createElement('label');
      label.className = 'tarefa' + (marcadas[i] ? ' feita' : '');
      label.innerHTML = `<input type="checkbox" ${marcadas[i] ? 'checked' : ''}><span></span>`;
      label.querySelector('span').textContent = texto;
      label.querySelector('input').addEventListener('change', (e) => {
        tarefasDoDia()[i] = e.target.checked;
        salvarEstado();
        renderTarefas();
        renderResumo();
      });
      lista.appendChild(label);
    });
    renderResumo();
  }

  // ---------- Jornada ----------
  async function carregarJornada() {
    PASSOS = (await (await fetch('/api/jornada', { cache: 'no-store' })).json()).passos;
  }
  function renderJornada() {
    const feitos = estado.jornada;
    const lista = $('#lista-jornada');
    lista.innerHTML = '';
    PASSOS.forEach((p, i) => {
      const liberado = i === 0 || feitos.includes(PASSOS[i - 1].id);
      const feito = feitos.includes(p.id);
      const div = document.createElement('div');
      div.className = 'passo' + (feito ? ' feito' : '');
      div.innerHTML = `<h3>Passo ${i + 1}: <span class="t"></span> ${feito ? '✅' : liberado ? '' : '🔒'}</h3><p></p><button class="secundario"></button>`;
      div.querySelector('.t').textContent = p.titulo;
      div.querySelector('p').textContent = p.descricao;
      const btn = div.querySelector('button');
      btn.textContent = feito ? 'Desmarcar' : 'Concluir passo';
      btn.disabled = !liberado && !feito;
      btn.addEventListener('click', () => {
        estado.jornada = feito ? estado.jornada.filter((x) => x !== p.id) : [...estado.jornada, p.id];
        salvarEstado();
        renderJornada();
        if (!feito) toast('Passo concluído! Continue firme. 🙏');
      });
      lista.appendChild(div);
    });
    renderResumo();
  }

  function renderResumo() {
    const feitasT = tarefasDoDia().filter(Boolean).length;
    const pctT = Math.round((feitasT / TAREFAS.length) * 100);
    $('#barra-tarefas').style.width = pctT + '%';
    $('#barra-tarefas-aba').style.width = pctT + '%';
    $('#resumo-tarefas').textContent = `Tarefas de hoje: ${feitasT} de ${TAREFAS.length}`;
    const total = PASSOS.length || 1;
    $('#barra-jornada').style.width = Math.round((estado.jornada.length / total) * 100) + '%';
    $('#resumo-jornada').textContent = `Jornada: ${estado.jornada.length} de ${PASSOS.length} passos concluídos`;
  }

  // ---------- Perfil e conta ----------
  function renderPerfil() {
    CAMPOS_PERFIL.forEach((id) => ($('#' + id).value = estado.perfil[id] || ''));
  }
  $('#btn-salvar-perfil').addEventListener('click', () => {
    CAMPOS_PERFIL.forEach((id) => (estado.perfil[id] = $('#' + id).value.trim()));
    salvarEstado();
    toast(usuario ? 'Perfil salvo.' : 'Perfil salvo neste aparelho. Crie uma conta para sincronizar.');
  });

  function mostrarBloco(id) {
    ['bloco-login', 'bloco-esqueci', 'bloco-redefinir'].forEach((b) => $('#' + b).classList.toggle('oculto', b !== id));
  }
  function renderConta() {
    $('#painel-auth').classList.toggle('oculto', !!usuario);
    $('#painel-perfil').classList.toggle('oculto', !usuario);
    if (usuario) {
      $('#nome-usuario').textContent = usuario.nome;
      $('#status-sync').textContent = 'Sincronizado com sua conta.';
    }
  }

  let modoAuth = 'entrar';
  function setModoAuth(m) {
    modoAuth = m;
    $('#campo-nome').classList.toggle('oculto', m !== 'criar');
    $('#btn-auth').textContent = m === 'criar' ? 'Criar conta' : 'Entrar';
    $('#a-senha').autocomplete = m === 'criar' ? 'new-password' : 'current-password';
    $('#aba-entrar').classList.toggle('primario', m === 'entrar');
    $('#aba-criar').classList.toggle('primario', m === 'criar');
    $('#erro-auth').textContent = '';
  }
  $('#aba-entrar').addEventListener('click', () => setModoAuth('entrar'));
  $('#aba-criar').addEventListener('click', () => setModoAuth('criar'));

  $('#form-auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const corpo = { email: $('#a-email').value.trim(), senha: $('#a-senha').value };
    if (modoAuth === 'criar') corpo.nome = $('#a-nome').value.trim();
    const btn = $('#btn-auth');
    btn.disabled = true;
    try {
      const r = await fetch(modoAuth === 'criar' ? '/api/auth/registrar' : '/api/auth/entrar', {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify(corpo),
      });
      const dados = await r.json();
      if (!r.ok) { $('#erro-auth').textContent = dados.erro || 'Erro ao continuar.'; return; }
      usuario = dados;
      await sincronizarAoEntrar();
      $('#form-auth').reset();
      toast('Bem-vindo(a), ' + usuario.nome + '!');
    } catch {
      $('#erro-auth').textContent = 'Sem conexão com o servidor.';
    } finally { btn.disabled = false; }
  });

  // Recuperação de senha
  $('#btn-esqueci').addEventListener('click', () => { mostrarBloco('bloco-esqueci'); $('#erro-esqueci').textContent = ''; $('#ok-esqueci').textContent = ''; });
  $('#btn-voltar-login').addEventListener('click', () => mostrarBloco('bloco-login'));
  $('#form-esqueci').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#erro-esqueci').textContent = ''; $('#ok-esqueci').textContent = '';
    try {
      const r = await fetch('/api/auth/esqueci', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email: $('#e-email').value.trim() }) });
      const dados = await r.json();
      if (!r.ok) return ($('#erro-esqueci').textContent = dados.erro);
      $('#ok-esqueci').textContent = dados.mensagem;
    } catch { $('#erro-esqueci').textContent = 'Sem conexão com o servidor.'; }
  });

  // Nova senha (link do e-mail: ?reset=TOKEN)
  const parametrosURL = new URLSearchParams(location.search);
  const tokenReset = parametrosURL.get('reset');
  $('#form-redefinir').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#erro-redefinir').textContent = '';
    try {
      const r = await fetch('/api/auth/redefinir', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ token: tokenReset, senha: $('#r-senha').value }) });
      const dados = await r.json();
      if (!r.ok) return ($('#erro-redefinir').textContent = dados.erro);
      toast('Senha criada! Agora entre com a nova senha.');
      history.replaceState(null, '', '/');
      mostrarBloco('bloco-login');
      setModoAuth('entrar');
      irParaAba('perfil');
      $('#painel-auth').classList.remove('oculto');
    } catch { $('#erro-redefinir').textContent = 'Sem conexão com o servidor.'; }
  });

  // Ao entrar: se a conta já tem dados, usa-os; se estiver vazia, envia os dados deste aparelho.
  async function sincronizarAoEntrar() {
    const r = await fetch('/api/estado', { cache: 'no-store' });
    if (r.ok) {
      const remoto = await r.json();
      if (!estadoEstaVazio(remoto)) estado = { ...estadoVazio(), ...remoto };
      else await fetch('/api/estado', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(estado) });
    }
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado));
    renderTudo();
    renderConta();
  }

  $('#btn-sair').addEventListener('click', async () => {
    await fetch('/api/auth/sair', { method: 'POST' });
    usuario = null;
    estado = lerLocal();
    renderTudo();
    renderConta();
    toast('Você saiu da conta.');
  });

  // ---------- Notificações push ----------
  // ---------- Plataforma ----------
  const ehNativo = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const emModoApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  // Lembretes locais no app Android/iOS (funcionam sem internet): 30 dias agendados às 7h
  async function ativarLembretesNativos() {
    const btn = $('#btn-notificar');
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      const perm = await LN.requestPermissions();
      if (perm.display !== 'granted') return toast('Permissão de notificações não concedida.');
      const { versiculos } = await (await fetch('/api/versiculos-proximos?dias=30', { cache: 'no-store' })).json();
      const pendentes = await LN.getPending();
      const antigas = pendentes.notifications.filter((n) => n.id >= 5000 && n.id < 6000);
      if (antigas.length) await LN.cancel({ notifications: antigas });
      const agora = new Date();
      const notificacoes = versiculos.map((v, i) => {
        const [y, m, d] = v.data.split('-').map(Number);
        return { id: 5000 + i, title: 'Palavra do dia — ' + v.ref, body: v.texto, schedule: { at: new Date(y, m - 1, d, 7, 0, 0) } };
      }).filter((n) => n.schedule.at > agora);
      await LN.schedule({ notifications: notificacoes });
      $('#status-notif').textContent = 'Lembretes ativos: você receberá a palavra do dia às 7h neste aparelho.';
      btn.textContent = 'Lembretes ativos';
      btn.disabled = true;
      toast('Lembretes diários ativados! 🔔');
    } catch (err) {
      console.error(err);
      toast('Não foi possível ativar os lembretes.');
    }
  }

  // Botão de instalação (Android, Windows, Mac, Linux) e dica para iPhone
  let promptInstalar = null;
  function configurarInstalacao() {
    const card = $('#card-instalar');
    if (!card) return;
    if (ehNativo() || emModoApp()) { card.classList.add('oculto'); return; }
    if (ehIOS()) $('#dica-ios').classList.remove('oculto');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      promptInstalar = e;
      $('#btn-instalar').classList.remove('oculto');
    });
    $('#btn-instalar').addEventListener('click', async () => {
      if (!promptInstalar) return;
      promptInstalar.prompt();
      const escolha = await promptInstalar.userChoice;
      promptInstalar = null;
      $('#btn-instalar').classList.add('oculto');
      if (escolha.outcome === 'accepted') toast('App instalado! 🙏');
    });
    window.addEventListener('appinstalled', () => card.classList.add('oculto'));
  }

  async function atualizarStatusNotif() {
    const s = $('#status-notif');
    const btn = $('#btn-notificar');
    if (ehNativo()) {
      s.textContent = 'Lembretes diários às 7h neste aparelho (funcionam sem internet).';
      btn.textContent = 'Ativar lembretes diários';
      btn.disabled = false;
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      s.textContent = 'Seu navegador não suporta notificações push. No iPhone, adicione o site à Tela de Início e abra por lá.';
      btn.disabled = true; return;
    }
    if (Notification.permission === 'denied') {
      s.textContent = 'Notificações bloqueadas. Libere nas configurações do navegador.';
      btn.disabled = true; return;
    }
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub && Notification.permission === 'granted') {
      s.textContent = 'Notificações ativadas. Você receberá a palavra do dia às 7h.';
      btn.textContent = 'Notificações ativas';
      btn.disabled = true;
    } else {
      s.textContent = 'Ative para receber a palavra do dia às 7h, mesmo com o site fechado.';
    }
  }

  $('#btn-notificar').addEventListener('click', async () => {
    if (ehNativo()) return ativarLembretesNativos();
    const btn = $('#btn-notificar');
    btn.disabled = true;
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') { toast('Permissão não concedida.'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const { chave } = await (await fetch('/api/push/chave-publica')).json();
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: urlBase64ParaUint8(chave),
      }));
      const r = await fetch('/api/push/inscrever', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ subscription: sub }) });
      if (!r.ok) throw new Error('falha');
      toast('Notificações ativadas! 🔔');
    } catch (err) {
      console.error(err);
      toast('Não foi possível ativar as notificações.');
      btn.disabled = false;
    } finally { atualizarStatusNotif(); }
  });

  function renderTudo() { renderTarefas(); renderJornada(); renderPerfil(); }

  // ---------- Inicialização ----------
  (async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    setModoAuth('entrar');
    if (tokenReset) { mostrarBloco('bloco-redefinir'); irParaAba('perfil'); $('#painel-auth').classList.remove('oculto'); }

    await Promise.all([carregarVersiculo(), carregarJornada(), carregarSlides()]);

    try {
      const r = await fetch('/api/auth/eu', { cache: 'no-store' });
      if (r.ok) {
        usuario = await r.json();
        const rs = await fetch('/api/estado', { cache: 'no-store' });
        if (rs.ok) {
          const remoto = await rs.json();
          if (!estadoEstaVazio(remoto)) estado = { ...estadoVazio(), ...remoto };
          localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado));
        }
      }
    } catch { /* offline: segue com dados locais */ }

    renderTudo();
    renderConta();
    atualizarStatusNotif();
    configurarInstalacao();
    const abaInicial = parametrosURL.get('aba');
    if (abaInicial && $('#' + abaInicial)) irParaAba(abaInicial);
    iniciarIntro();
    // Vira o dia sem precisar recarregar manualmente (só quando a apresentação já terminou)
    setInterval(() => { if (!document.hidden && !$('#intro')) location.reload(); }, 10 * 60 * 1000);
  })();
})();
