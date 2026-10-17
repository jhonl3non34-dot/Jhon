# Publicar o Propósito em Deus em todas as plataformas

## 1. Site (base de tudo)
- Publique o servidor com HTTPS (ex.: VPS com `pm2`, Render, Railway). Veja o README.
- Defina `PUBLIC_URL=https://seudominio.com` e as variáveis SMTP.
- Todas as plataformas abaixo usam esse mesmo endereço.

## 2. Computador (Windows, Mac, Linux)
- Abra o site no Chrome ou no Edge e clique em **Instalar** (ícone na barra de endereço).
- Para publicar na Microsoft Store (Windows) e gerar pacotes Android/iOS: use https://www.pwabuilder.com com a URL do site.

## 3. Android
- Opção A (recomendada para a Play Store): **PWABuilder** gera o pacote AAB com a URL do site.
- Opção B (app nativo com Capacitor):
  ```bash
  cd mobile
  SITE_URL=https://seudominio.com npx cap sync
  npx cap open android   # abre no Android Studio: Build > Generate Signed Bundle (AAB)
  ```
- Requer Android Studio (JDK 17+) e conta de desenvolvedor Google Play (taxa única).

## 4. iPhone e iPad
- Sem loja: abrir no Safari > Compartilhar > **Adicionar à Tela de Início** (iOS 16.4+ para notificações).
- Com App Store (requer Mac com Xcode e conta Apple Developer, anual):
  ```bash
  cd mobile
  SITE_URL=https://seudominio.com npx cap sync
  npx cap open ios       # no Xcode: Product > Archive
  ```

## 5. Ícones e tela inicial do app
- Os ícones estão em `public/media/` e os nativos em `mobile/android` e `mobile/ios`.
- Para trocar o ícone: substitua `mobile/resources/icon.png` e rode `npx @capacitor/assets generate --android --ios`.

## 6. Notificações por plataforma
| Plataforma | Como recebe |
|---|---|
| Chrome/Edge (Windows, Mac, Linux) | Push do servidor, com o site fechado |
| Android (PWA/TWA) | Push do servidor, com o app fechado |
| Android (app Capacitor) | Lembretes locais às 7h, sem internet |
| iPhone (PWA na Tela de Início) | Push do servidor (iOS 16.4+) |
| iOS (app Capacitor) | Lembretes locais às 7h |

---

## Publicação em um serviço com endereço fixo (recomendado)

### Render (mais simples)
1. Crie uma conta em https://render.com e conecte o repositório do projeto (GitHub ou GitLab).
2. Em **New > Blueprint**, escolha o repositório. O Render lê o `render.yaml`.
3. Preencha as variáveis marcadas como `sync: false`: `PUBLIC_URL` e, se for enviar e-mails, as de SMTP.
4. Aguarde o deploy. Você recebe um endereço `https://...onrender.com`. Para usar seu domínio, adicione-o em **Settings > Custom Domains**.
   - Observação: o disco persistente exige plano pago.

### Railway ou VPS com Docker
- Railway: crie um projeto a partir do repositório, adicione um volume em `/app/data` e defina as mesmas variáveis.
- VPS: `docker build -t proposito . && docker run -d -p 80:3000 -v proposito-dados:/app/data --env-file .env proposito`, com HTTPS via Caddy ou Nginx.

### Depois de publicar
- Teste `https://seu-endereco/health` (deve mostrar `"ok": true`).
- Abra o site no celular e no computador, instale e ative as notificações.
- Gere os apps nativos com `SITE_URL` apontando para o endereço final.
