# Propósito em Deus

Site com:
- **Início**: versículo bíblico do dia (rotação diária, fuso de Brasília) e notificações.
- **Tarefas do dia**: checklist para uma vida com propósito em Deus (reinicia todo dia).
- **Minha jornada**: passo a passo sequencial de 7 etapas com progresso salvo.
- **Meu perfil**: cadastro simples da pessoa.

## Como rodar
Requisito: Node.js 18 ou superior. Não há dependências para instalar.

```bash
cd site-biblico
PORT=3000 node server.js
```

Acesse `http://localhost:3000`. Verificação de saúde: `/health`.

## Rodar 24 horas por dia
Opções:
1. **VPS** (ex.: Hetzner, DigitalOcean, Oracle Cloud): use `pm2` ou `systemd` para reiniciar automaticamente.
   ```bash
   npm i -g pm2
   pm2 start server.js --name proposito-em-deus
   pm2 save && pm2 startup
   ```
2. **Plataformas de hospedagem** (Render, Railway, Fly.io): suba a pasta e use `node server.js` como comando de start.

Coloque um domínio com HTTPS (ex.: Caddy ou Nginx + Let's Encrypt) apontando para a porta 3000.

## Notificações
- Hoje: a notificação aparece quando o site está aberto e o usuário permitiu notificações.
- Próximo passo para notificações com o site fechado: Web Push (VAPID) com um Service Worker. Pode ser adicionado depois.

## Estrutura
```
server.js          # servidor HTTP e API (versículo do dia, jornada)
public/index.html  # página principal
public/app.js      # lógica do front-end
public/manifest.json, public/icon.svg  # instalação como app no celular
```

Versículos: Almeida Revista e Atualizada (ARA).

---

## Versão 3: banco SQLite, recuperação de senha, slides e visual novo

### Banco de dados
- Usa **SQLite** em `data/proposito.db` (arquivo único, sem servidor de banco).
- Se existir `data/db.json` da versão anterior, ele é migrado automaticamente (vira `db.json.migrado`).
- Faça backup de `data/` (contém o banco, `vapid.json` e `emails.log`).

### Recuperação de senha por e-mail
Configure o envio real com variáveis de ambiente:
```bash
SMTP_HOST=smtp.seudominio.com SMTP_PORT=587 SMTP_SECURE=false \
SMTP_USER=usuario SMTP_PASS=senha SMTP_FROM="Propósito em Deus <nao-responder@seudominio.com>" \
PUBLIC_URL=https://seudominio.com node server.js
```
- Sem `SMTP_HOST`, o e-mail não é enviado: o link fica em `data/emails.log` (útil para testes).
- O link vale 1 hora e só pode ser usado uma vez. Ao trocar a senha, as sessões antigas são encerradas.

### Segurança
- Limite de 5 tentativas de login por IP e e-mail a cada 15 minutos.
- Limite de solicitações de recuperação de senha por IP.

### Slides de abertura
- Edite `public/slides.json`. Cada item pode ser:
  - `{ "tipo": "imagem", "src": "/media/arquivo.jpg", "titulo": "...", "texto": "..." }`
  - `{ "tipo": "video", "src": "/media/video.mp4", "titulo": "...", "texto": "..." }` (coloque o arquivo em `public/media/`)
  - `{ "tipo": "youtube", "id": "ID_DO_VIDEO", "titulo": "...", "texto": "..." }`
- Os vídeos devem ter direitos de uso para a sua comunidade. Verifique a licença antes de publicar.

### Ícone e visual
- Ícone do app: `public/media/icon-1024.png` (tela inicial, instalação e cabeçalho).
- Fundo: `public/media/fundo.jpg`.
