# Plano de Implementação v2 — Lembrador de Contas

> Plano de correções e melhorias estruturado em fases, baseado na revisão de código de **2026-11-23** (pós-execução do `PLANO-IMPLEMENTACAO.md`).
> Cada item contém **alvo** (`arquivo:linha`), **problema**, **mudança proposta**, **critério de aceite** e **verificação**.

---

## Ordem de prioridade

```text
Fase 1 (Bugs críticos) → Fase 2 (Segurança & Sessão) → Fase 3 (Confiabilidade & Notificações)
        → Fase 4 (Frontend, PWA & UX) → Fase 5 (Infraestrutura & Manutenibilidade)
```

**Regra geral:** ao final de cada fase, executar `bun run lint` e `bun test` em `volumes/lembrador-contas/` e garantir tudo verde antes de avançar.

---

## Fase 1 — Bugs críticos · PRIORIDADE MÁXIMA

### 1.1 `billProcessing.js` — Reprocessamento sobrescreve contas já pagas (`PAID` → `UNPAID`)
- **Alvo:** `volumes/lembrador-contas/src/util/billProcessing.js:27-35`
- **Problema:** `ActiveBill.findOneAndUpdate({ name, dueDate }, { ..., status: activeBill.status || 'UNPAID', ... }, { upsert: true })` substitui o documento inteiro e redefine o `status` de contas já pagas para `UNPAID`, além de não atualizar `updated_at`.
- **Mudança:**
  - Usar `$set` para os campos atualizáveis (`users`, `value`, `icon`, `paymentType`, `referencePeriod`, `updated_at: new Date()`).
  - Usar `$setOnInsert: { status: activeBill.status || 'UNPAID', created_at: new Date() }` para preservar `status: 'PAID'` em contas existentes (ou só atualizar `status` quando o atual não for `PAID`).
- **Critério de aceite:** reprocessar um período com conta `PAID` mantém `status: 'PAID'` e atualiza `updated_at`.
- **Verificação:** teste unitário em `billProcessing.test.js`.

### 1.2 `bills.js` + `editBill.ejs` — Fonte de dados `API` quebrada no cadastro e edição
- **Alvo:**
  - `volumes/lembrador-contas/src/routes/bills.js:33-43` (`/add`) e `:64-77` (`/update`)
  - `volumes/lembrador-contas/src/views/bill/editBill.ejs:62-71` e `:101-125`
- **Problema:**
  - Em `bills.js`, `valueSourceId` só trata `EMAIL` vs `TABLE` (`req.body.api` é ignorado).
  - Em `/add`, `req.body.type` não é salvo no `new db.Bill(...)`.
  - Em `editBill.ejs`, não existe o `<select name="api" id="apiOptions">` nem o carregamento via `/apis/listJSON`.
- **Mudança:**
  - Mapear `valueSourceId` via switch/mapa: `EMAIL` → `req.body.email`, `TABLE` → `req.body.table`, `API` → `req.body.api`.
  - Incluir `type: req.body.type` no `POST /bills/add`.
  - Adicionar `apiGroup` / `apiOptions` e handlers correspondentes em `editBill.ejs` (espelhando `newBill.ejs`).
- **Critério de aceite:** criar e editar uma conta com `valueSourceType = 'API'` persiste e exibe corretamente o `valueSourceId` da API selecionada.
- **Verificação:** testes de rota em `bills-routes.test.js`.

### 1.3 `corsanEmailParser.js` — Vazamento de abas no Puppeteer (`page.close()`)
- **Alvo:** `volumes/lembrador-contas/src/parser/corsanEmailParser.js:200-390`
- **Problema:** `browser.newPage()` é aberto, mas `page.close()` nunca é chamado, vazando memória a cada download via navegador.
- **Mudança:** declarar `let page = null;` antes do `try`, atribuir `page = await browser.newPage()` e fechar em `finally { if (page) await page.close().catch(() => {}); }`.
- **Critério de aceite:** toda execução de `downloadPDF` via Puppeteer fecha a aba ao finalizar (sucesso ou erro).
- **Verificação:** teste unitário/revisão em `corsanEmailParser.test.js`.

### 1.4 `sw.js` — `window.atob` inexistente e `POST /push/register` sem CSRF
- **Alvo:**
  - `volumes/lembrador-contas/src/public/sw.js:7` e `:55-81`
  - `volumes/lembrador-contas/src/middleware/csrf.js:17-25` (ou estratégia de renovação)
- **Problema:**
  - `window` não existe em Service Workers (`window.atob` lança `ReferenceError`).
  - No evento `pushsubscriptionchange`, o `fetch('/notifications/push/register', { method: 'POST' })` não possui token CSRF e falha com `403`.
- **Mudança:**
  - Trocar `window.atob` por `self.atob`.
  - Para `pushsubscriptionchange`, obter um token CSRF válido via endpoint leve (ou usar `clients.matchAll()` para delegar a renovação a uma aba aberta, ou aceitar renovação autenticada por sessão + `oldSubscription.endpoint` já existente no banco).
- **Critério de aceite:** `urlB64ToUint8Array` funciona no contexto de Service Worker e a renovação de inscrição não falha por CSRF.
- **Verificação:** revisão + teste do fluxo de push.

### 1.5 `dashboard.js` — Formato invertido de `referencePeriod` em `GET /active-bills/new`
- **Alvo:** `volumes/lembrador-contas/src/routes/dashboard.js:171`
- **Problema:** `new Date().toISOString().slice(0, 7).replace('-', '/')` gera `YYYY/MM` (`2026/11`), mas o sistema usa `MM/YYYY` (`11/2026`).
- **Mudança:** substituir por `` `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}` `` (e padStart também na linha 193).
- **Critério de aceite:** nova conta ativa nasce com `referencePeriod` no formato `MM/YYYY`.
- **Verificação:** teste de rota em `dashboard-routes.test.js`.

### 1.6 `billProcessing.js` & parsers — Padronização de mês (0-based vs 1-based) e último dia do mês
- **Alvo:**
  - `volumes/lembrador-contas/src/util/billProcessing.js:135`, `:144-146`, `:182`, `:222`
  - `volumes/lembrador-contas/src/parser/corsanEmailParser.js:74` e `:634`
  - `volumes/lembrador-contas/src/parser/cpflEmailParser.js:9`, `:13`, `:62`
- **Mudança:**
  - Padronizar `getDateFromPeriod` (ou criar helper explícito) para receber sempre mês 0-based (ou 1-based), corrigindo a divergência entre `findTableBills` e `findEmailBills`/`findApiBills`.
  - Trocar `new Date(period.year, period.month, 31)` por `new Date(period.year, period.month + 1, 0)` em ambos os parsers.
  - Adicionar `setembro: '09'` em `monthMap` no `corsanEmailParser.js:634`.
  - No `cpflEmailParser.js`: checar `if (!messages || messages.length === 0)` na linha 13 e reutilizar `parseBrazilianCurrency` (removendo pontos de milhar `.` antes de trocar `,` por `.`) na linha 62.
- **Critério de aceite:** meses com 28/29/30 dias não invadem o mês seguinte; valores ≥ R\$ 1.000,00 da CPFL são parseados corretamente; setembro é reconhecido na CORSAN.
- **Verificação:** testes unitários em `billProcessing.test.js`, `corsanEmailParser.test.js` e `cpflEmailParser.test.js`.

### 1.7 `auth.js`, `emails.js` e `gmail.js` — Correções pontuais
- **Alvo:**
  - `volumes/lembrador-contas/src/routes/auth.js:41-59`
  - `volumes/lembrador-contas/src/routes/emails.js:103`
  - `volumes/lembrador-contas/src/util/gmail.js:40-72`
- **Mudança:**
  - Em `auth.js`: capturar `const redirectTo = req.session.returnTo || '/'` **antes** de `req.session.regenerate(...)`, validar que `redirectTo` é caminho relativo seguro (`/^\/(?!\/)/`), e tratar o caso de `APP_PASSWORD` não definido no `POST /login`.
  - Em `emails.js`: corrigir ou remover a rota `/get/:id` que renderiza a view inexistente `email/email` (criar a view ou retornar JSON/erro adequado).
  - Em `gmail.js`: reescrever `getAttachmentsSync` usando `Promise.all` nos `parts` filtrados que possuem `attachmentId`, com `return reject(...)` quando não houver anexos.
- **Critério de aceite:** login redireciona corretamente para `returnTo`; `getAttachments` resolve mesmo quando a última `part` não é anexo; nenhuma rota aponta para view inexistente.
- **Verificação:** testes em `auth.test.js`, `emails-routes.test.js` e novo teste de `gmail.js`.

---

## Fase 2 — Segurança e Sessão

### 2.1 `app.js` — `trust proxy`, cookie `secure` e `connect-mongo`
- **Alvo:** `volumes/lembrador-contas/src/app.js:60-108` e `package.json`
- **Mudança:**
  - Adicionar `app.set('trust proxy', 1)` quando atrás de proxy reverso/Cloudflare (configurável via env `TRUST_PROXY=1`).
  - Definir `cookie.secure: process.env.NODE_ENV === 'production'` na sessão.
  - Substituir o `MemoryStore` padrão do `express-session` por `connect-mongo` (usando a conexão existente do Mongoose, com fallback para `MemoryStore` em ambiente de teste).
- **Critério de aceite:** sessões persistem após restart do container e rate limit identifica corretamente o IP real do cliente.
- **Verificação:** `bun test` + teste manual de restart mantendo sessão.

### 2.2 `emails.js` — Restringir rotas de leitura do Gmail a administradores
- **Alvo:** `volumes/lembrador-contas/src/routes/emails.js:78`, `:86`, `:106`
- **Mudança:** adicionar `requireAdmin` em `/unread`, `/get/:id` e `/test/:id`, além de `validateObjectId('id')` em `/test/:id`.
- **Critério de aceite:** usuários não-admin recebem `403` ao tentar acessar rotas de leitura/teste do Gmail.
- **Verificação:** testes em `emails-routes.test.js`.

### 2.3 `billProcessing.js` & `apis.js` — Proteção SSRF e timeout em chamadas `API`
- **Alvo:**
  - `volumes/lembrador-contas/src/routes/apis.js:32-36` e `:56-60`
  - `volumes/lembrador-contas/src/util/billProcessing.js:225-247`
- **Mudança:**
  - Validar que `url` utiliza apenas `http:` ou `https:` e bloquear IPs privados/loopback/link-local (`127.0.0.0/8`, `169.254.169.254`, `10.0.0.0/8`, `::1`, etc.), salvo se explicitamente permitido via env (ex.: `ALLOW_PRIVATE_API_URLS`).
  - Adicionar timeout (`AbortSignal.timeout(10000)`) no `fetch(api.url, fetchOptions)`.
- **Critério de aceite:** URLs inválidas ou internas são rejeitadas; APIs lentas não travam `processBills`.
- **Verificação:** testes em `apis-routes.test.js` e `billProcessing.test.js`.

### 2.4 `auth.js` & `middleware/auth.js` — Logout via `POST`, mensagem genérica e dev mode consistente
- **Alvo:**
  - `volumes/lembrador-contas/src/routes/auth.js:36-45` e `:63-68`
  - `volumes/lembrador-contas/src/middleware/auth.js:16-31`
  - `volumes/lembrador-contas/src/views/templates/navbar.html`
- **Mudança:**
  - Alterar logout para `POST /logout` com token CSRF (formulário no navbar).
  - Unificar mensagem de erro no login para `"E-mail ou senha inválidos."` (evita enumeração de e-mails).
  - Em `requireAdmin`: quando `!APP_PASSWORD` (dev mode sem auth), evitar loop de redirecionamento para `/login`.
- **Critério de aceite:** logout exige `POST` + CSRF; login não vaza existência de e-mail; dev mode não entra em loop de redirect.
- **Verificação:** testes em `auth.test.js` e `auth-integration.test.js`.

### 2.5 `dashboard.js` — Validação de entrada nas rotas de `ActiveBill` e `/deleteProcessed`
- **Alvo:** `volumes/lembrador-contas/src/routes/dashboard.js:181-260`
- **Mudança:**
  - Aplicar `validateBody` em `POST /active-bills/add` e `POST /active-bills/update`.
  - Validar `ObjectId` do `req.body.id` em `/active-bills/update` e sanitizar `value` (aceitar vírgula decimal brasileira e rejeitar `NaN`).
  - Envolver `JSON.parse(req.query.periods)` em `try/catch` em `/deleteProcessed` (retornando `400` se inválido).
- **Critério de aceite:** payloads malformados retornam `400` em vez de `500` ou gravar `NaN`.
- **Verificação:** testes em `dashboard-routes.test.js`.

### 2.6 *(Opcional / evolução)* Senhas individuais com hash por usuário
- **Alvo:** `src/models/User.js`, `src/routes/auth.js`, `src/routes/users.js`
- **Mudança:** adicionar campo `passwordHash` opcional no `User` usando `Bun.password.hash`/`verify` (com fallback para `APP_PASSWORD` durante migração).

---

## Fase 3 — Confiabilidade, Banco e Notificações

### 3.1 `notificationScheduler.js` — Dias reais até vencimento, query filtrada e correção do startup
- **Alvo:** `volumes/lembrador-contas/src/util/notificationScheduler.js:21-50` e `:88-137`
- **Mudança:**
  - Corrigir `waitForConnection`: remover listener `open` quando o timer de fallback disparar (`off('open', handler)`) e garantir execução inicial também quando `readyState === 1`.
  - Substituir `db.BillReminder.find({})` por `db.BillReminder.find({ activeBill: { $in: unpaidBillIds }, notifiedAt: { $ne: null } })`.
  - Calcular dias restantes reais entre hoje e `bill.dueDate` (ex.: `"vence hoje"`, `"vence amanhã"`, `"vence em X dias"`).
  - Só registrar `BillReminder` se pelo menos 1 notificação foi entregue com sucesso.
  - *(Evolução)* Associar `userId` em `PushNotificationSubscription` para notificar apenas os usuários vinculados à conta.
- **Critério de aceite:** texto da notificação reflete os dias reais; inicialização não dispara duplicado; consulta ao banco não carrega histórico inteiro.
- **Verificação:** testes unitários dedicados para `notificationScheduler.js`.

### 3.2 `app.js`, `db.js` e `bin/www` — Healthcheck real e conexão desacoplada do import
- **Alvo:**
  - `volumes/lembrador-contas/src/db.js:25-52`
  - `volumes/lembrador-contas/src/app.js:29-31` e `:110-112`
  - `volumes/lembrador-contas/src/bin/www`
- **Mudança:**
  - Exportar função `connectDB()` em `db.js` e chamá-la no `bin/www` antes de `server.listen()`, removendo `process.exit(1)` do import de `db.js` e corrigindo o `.catch().then()` que logava `"MongoDB connected"` após falha.
  - Atualizar `/health` para verificar `db.Mongoose.connection.readyState === 1` (retornando `503` se desconectado).
  - Remover o bloco duplicado de check de `SESSION_SECRET` no import de `app.js` (mantendo a validação no `bin/www`).
- **Critério de aceite:** importar `app.js` ou `db.js` não inicia conexão nem encerra o processo; `/health` reflete o estado real do banco.
- **Verificação:** testes de boot e `/health`.

### 3.3 `dashboard.js` & `billProcessing.js` — HTTP `409` em concorrência e checagem de `email` ausente
- **Alvo:**
  - `volumes/lembrador-contas/src/util/billProcessing.js:6-11` e `:175-180`
  - `volumes/lembrador-contas/src/routes/dashboard.js:150-154`
- **Mudança:**
  - Fazer `processBills` retornar `{ skipped: true }` (ou lançar erro específico) quando `_processingLock` estiver ativo, e responder `res.status(409).json({ error: 'Processamento já em andamento.' })` na rota.
  - Em `findEmailBills`, checar `if (!email)` antes de chamar `parseEmailData` (igual a `findTableBills` e `findApiBills`).
- **Critério de aceite:** duas chamadas simultâneas a `/dashboard/processBills` retornam `200` e `409`; email excluído não derruba o processamento.
- **Verificação:** testes em `dashboard-routes.test.js` e `billProcessing.test.js`.

### 3.4 Tratar `404` nas rotas `GET /edit/:id`
- **Alvo:** `src/routes/bills.js:50`, `users.js:41`, `tables.js:46`, `emails.js:50`, `apis.js:51`
- **Mudança:** após `findById(req.params.id)`, verificar `if (!doc) return res.status(404).render('error', { message: '...' })`.
- **Critério de aceite:** acessar `/edit/<objectIdInexistente>` retorna página `404` limpa em vez de `500`.
- **Verificação:** testes de rota para cada módulo.

---

## Fase 4 — Frontend, PWA e UX

### 4.1 `main.js` — Corrigir toggle do modo de edição e swipe-to-delete dinâmico
- **Alvo:** `volumes/lembrador-contas/src/public/main.js:64`, `:125`, `:173-215`, `:232-343`
- **Mudança:**
  - Declarar explicitamente `let swRegistration = null;` e `const applicationServerPublicKey = ...`.
  - Em vez de remover a classe `.hidden-edit-mode` dos elementos (o que impede escondê-los de volta), alternar uma classe `edit-mode-active` no `document.body` e controlar a visibilidade via CSS (`.edit-mode-active .hidden-edit-mode { display: ... }`).
  - Trocar o `swipeDeleteRows` estático por delegação de eventos (`document.addEventListener('keydown', ...)` e `document.querySelectorAll('.swipe-delete-row')` sob demanda), garantindo funcionamento em listas carregadas via AJAX.
- **Critério de aceite:** habilitar e desabilitar edição funciona em todas as telas sem recarregar; swipe funciona após trocar filtros no dashboard.
- **Verificação:** teste manual em desktop e mobile + `bun run lint`.

### 4.2 `sw.js` — Suporte offline real (Cache API)
- **Alvo:** `volumes/lembrador-contas/src/public/sw.js`
- **Mudança:** adicionar eventos `install` (pré-cache de CSS, JS, ícones e assets locais `/bootstrap`, `/jquery`, `/popperjs`) e `fetch` (estratégia *cache-first* para estáticos e *network-first* para páginas/API, com limpeza de caches antigos no `activate`).
- **Critério de aceite:** app instalado como PWA carrega assets estáticos sem erros mesmo com rede instável/offline.
- **Verificação:** inspeção no Chrome DevTools → Application → Service Workers / Cache Storage.

### 4.3 `validate.js` — Respostas amigáveis para formulários HTML
- **Alvo:** `volumes/lembrador-contas/src/middleware/validate.js:43-45`
- **Mudança:** verificar `req.accepts(['html', 'json'])`: manter JSON para chamadas AJAX/API e renderizar erro amigável (ou flash message + redirect) para submits de formulário HTML.
- **Critério de aceite:** erro de validação em formulário não exibe JSON cru no navegador.
- **Verificação:** testes em `validate.test.js`.

---

## Fase 5 — Infraestrutura, Dependências e Manutenibilidade

### 5.1 `Dockerfile` & `docker-compose.amd64.yml` — Hardening e otimização
- **Alvo:**
  - `volumes/lembrador-contas/Dockerfile`
  - `docker-compose.amd64.yml`
- **Mudança:**
  - Criar e usar um usuário não-root no `Dockerfile` (ex.: `USER bun`).
  - Remover `bun install` do `command` no `docker-compose.amd64.yml` (já executado no `Dockerfile`).
  - Restringir a porta do MongoDB no compose para `127.0.0.1:27017:27017` (ou remover exposição externa) e configurar credenciais (`MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`).
- **Critério de aceite:** container sobe sem rodar como `root`, restart é imediato e MongoDB não fica exposto na rede externa.
- **Verificação:** `docker compose -f docker-compose.amd64.yml up --build` + `docker exec ... whoami`.

### 5.2 `package.json` — Limpeza e explicitação de dependências
- **Alvo:** `volumes/lembrador-contas/package.json`
- **Mudança:**
  - Confirmar ausência de uso e remover dependências órfãs (`pdf2json`, `morgan`, `open`, `url`).
  - Adicionar `jquery` explicitamente em `dependencies` (hoje depende de instalação transitiva para o mount `/jquery` em `app.js:92`).
- **Critério de aceite:** `bun install` e `bun run build` passam sem dependências implícitas ou não utilizadas.
- **Verificação:** `bun run lint && bun test`.

### 5.3 `googleAuth.js` — Callback OAuth integrado ao Express
- **Alvo:** `volumes/lembrador-contas/src/util/googleAuth.js`, `src/routes/emails.js` (ou `auth.js`), `README.md`
- **Mudança:** alinhar `GOOGLE_OAUTH_REDIRECT_URL` com o `README.md` (`http://localhost:9090/oauth2/callback`) e receber o callback em uma rota protegida por `requireAdmin` no próprio Express, eliminando o servidor HTTP efêmero na porta `9091` e a dependência `server-destroy`.
- **Critério de aceite:** fluxo OAuth funciona atrás do proxy/Docker usando apenas a porta principal `9090`.
- **Verificação:** revisão + teste do fluxo de autorização.

---

## Checklist de execução

- [x] **1.1** `billProcessing.js` — preservar `status: 'PAID'` no upsert
- [x] **1.2** `bills.js` + `editBill.ejs` — suportar `API` e `type`
- [x] **1.3** `corsanEmailParser.js` — fechar `page.close()` em `finally`
- [x] **1.4** `sw.js` — `self.atob` e renovação de push com CSRF
- [x] **1.5** `dashboard.js` — corrigir formato `MM/YYYY` em `active-bills/new`
- [x] **1.6** `billProcessing.js` + parsers — padronizar mês, fim de mês, `setembro`, valores ≥ 1.000
- [x] **1.7** `auth.js`, `emails.js`, `gmail.js` — `returnTo`, view faltante, `getAttachments`
- [x] **2.1** `app.js` — `trust proxy`, `cookie.secure`, `connect-mongo`
- [x] **2.2** `emails.js` — `requireAdmin` nas rotas do Gmail
- [x] **2.3** `billProcessing.js` + `apis.js` — SSRF + timeout no `fetch`
- [x] **2.4** `auth.js` — `POST /logout`, mensagem genérica, dev mode em `requireAdmin`
- [x] **2.5** `dashboard.js` — validação de `ActiveBill` e `/deleteProcessed`
- [x] **3.1** `notificationScheduler.js` — dias reais, query filtrada, startup sem duplicidade
- [x] **3.2** `db.js` + `app.js` + `bin/www` — `connectDB()` no boot e `/health` real
- [x] **3.3** `dashboard.js` + `billProcessing.js` — HTTP `409` no lock e check de `email` ausente
- [x] **3.4** Rotas `GET /edit/:id` — retornar `404` quando registro não existe
- [x] **4.1** `main.js` — corrigir toggle de edição e swipe em listas AJAX
- [x] **4.2** `sw.js` — Cache API para suporte offline
- [x] **4.3** `validate.js` — resposta HTML amigável para formulários
- [x] **5.1** `Dockerfile` + `docker-compose.amd64.yml` — usuário não-root e MongoDB seguro
- [x] **5.2** `package.json` — limpar deps não usadas e declarar `jquery`
- [x] **5.3** `googleAuth.js` — integrar callback OAuth no Express
