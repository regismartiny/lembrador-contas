# Plano de Implementação — Lembrador de Contas

> Plano de melhoria em etapas, executável por delegação a subagentes.
> Cada tarefa indica o **subagente** recomendado, o **alvo** (arquivo:linha), a **mudança**, o **critério de aceite** e a **verificação**.
>
> Base: revisão de código de 2026-11-14.

---

## 0. Estratégia de subagentes

### Tipos disponíveis

| Subagente | Uso | Contrato de saída |
|---|---|---|
| `cavecrew-investigator` | Localizar definição/chamadas/usos | `path:line — symbol — nota` (comprimido) |
| `cavecrew-builder` | Edição cirúrgica, ≤2 arquivos | `<path:line> — mudança` + `verified:` |
| `cavecrew-reviewer` | Auditar diff/arquivo | `path:line: emoji severidade: problema. fix.` |
| `Explore` | Investigação + comentários de arquitetura | prosa |
| `Code Reviewer` | Revisão profunda com alternativas | prosa |

### Padrão de execução (Locate → fix → verify)

1. **`cavecrew-investigator`** confirma o alvo exato (arquivo:linha).
2. **`cavecrew-builder`** aplica a mudança (1–2 arquivos).
3. **`cavecrew-reviewer`** audita o diff.
4. Thread principal roda `bun test` + `bun run lint` para fechar.

### Regras

- **Nunca** mandar `cavecrew-builder` sem já saber o arquivo:line (senão o builder responde `too-big.`/`ambiguous.`).
- Tarefas de **3+ arquivos / refatoração transversal** → thread principal ou `feature-dev:code-architect`, **não** builder.
- Tarefas independentes podem rodar em **paralelo** (mesma mensagem, múltiplos subagentes).
- Toda fase termina com `bun test` verde + `bun run lint` limpo antes de avançar.

### Ordem de prioridade

```
Fase 1 (bugs críticos)  →  Fase 2 (segurança)  →  Fase 3 (arquitetura)
        →  Fase 4 (frontend)  →  Fase 5 (testes)
```

---

## Fase 0 — Baseline & verificação

**Objetivo:** confirmar o estado atual antes de tocar em nada.

| # | Tarefa | Subagente | Detalhe |
|---|---|---|---|
| 0.1 | Rodar suíte de testes | thread principal | `bun test` — registrar baseline (qtd. de testes, falhas) |
| 0.2 | Rodar lint | thread principal | `bun run lint` — registrar baseline |
| 0.3 | Mapear rotas sem teste | `cavecrew-investigator` | listar `src/routes/*` vs `src/test/*` |
| 0.4 | Confirmar alvos dos bugs | `cavecrew-investigator` | validar as `path:line` listadas na Fase 1 |

**Critério de aceite:** baseline de testes/lint documentado; alvos confirmados.
**Verificação:** `bun test`, `bun run lint`.

---

## Fase 1 — Bugs críticos (correção) · PRIORIDADE MÁXIMA

> Cada item é um alvo cirúrgico (≤2 arquivos) → `cavecrew-builder`.
> Itens independentes podem ser agrupados em paralelo.

### 1.1 `gmail.js` — Promise que nunca resolve (off-by-one)
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/util/gmail.js:65`
- **Mudança:** `if (i == parts.length)` → `if (i === parts.length - 1)`.
- **Critério de aceite:** com anexo, `getAttachments` resolve o Promise.
- **Verificação:** teste unitário de `getAttachments` (ver Fase 5.1).

### 1.2 `dashboard.js` — filtro `CURRENT_AND_FUTURE` errado
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/routes/dashboard.js` (caso `CURRENT_AND_FUTURE`, ~L135–144)
- **Mudança:** substituir `month >= activeMonth && (year >= activeYear || year > activeYear)` por `year > activeYear || (year === activeYear && month >= activeMonth)`.
- **Critério de aceite:** meses do próximo ano menores que o mês atual (ex.: jan/2027 em nov/2026) entram no filtro.
- **Verificação:** teste unitário do `periodFilter` (Fase 5.1).

### 1.3 `dashboard.js` — `/deleteProcessed` apaga tudo
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/routes/dashboard.js` (~L250–255)
- **Mudança:** `db.ActiveBill.deleteMany({})` → `db.ActiveBill.deleteMany({ referencePeriod: { $in: <períodos processados> } })` (ou um filtro explícito de "processados").
- **Critério de aceite:** só remove os períodos processados; UNPAID do mês atual é preservado.
- **Verificação:** teste de rota (Fase 5.1) + revisão `cavecrew-reviewer`.

### 1.4 `dashboard.js` — divisão por zero
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/routes/dashboard.js:92`
- **Mudança:** `bill.value = bill.value / bill.users.length` → guardar contra `users.length === 0` (ex.: `const n = bill.users.length || 1`).
- **Critério de aceite:** sem `NaN` quando `users` vazio.
- **Verificação:** teste unitário.

### 1.5 `emailUtils.js` — aborta no primeiro erro
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/util/emailUtils.js:24`
- **Mudança:** `if (!fullMessage) return` → `if (!fullMessage) continue`.
- **Critério de aceite:** uma mensagem com falha não derruba o lote.
- **Verificação:** teste unitário.

### 1.6 `billProcessing.js` — `require()` em ESM
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/util/billProcessing.js:191`
- **Mudança:** `const parser = require(...)` → `const parser = (await import(...)).default` (a função já é `async`).
- **Critério de aceite:** roda em Bun **e** em Node (`node-start`).
- **Verificação:** `bun test` + smoke `node ./src/bin/www`.

### 1.7 `cpflEmailParser.js` — payload de parte única
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/parser/cpflEmailParser.js:34`
- **Mudança:** reutilizar `findHTMLPart` (do `corsanEmailParser.js`) para localizar a parte HTML em multipart, em vez de `msg.payload.body.data`.
- **Critério de aceite:** e-mail multipart CPFL é parseado.
- **Verificação:** teste unitário com fixture multipart.

**Fim da Fase 1:** `bun test` verde + `bun run lint` limpo. Commit por item (ou agrupado).

---

## Fase 2 — Segurança

### 2.1 CSP (hardening)
- **Subagente:** `Code Reviewer` (decisão) → `cavecrew-builder` (aplicação)
- **Alvo:** `src/app.js:38` (`helmet`), `src/views/*` (scripts inline)
- **Mudança:** mover scripts inline para `src/public/*.js`; habilitar CSP com **nonce** em `helmet`.
- **Critério de aceite:** CSP ativa sem quebrar as views.
- **Verificação:** lint + teste de renderização + check manual de headers.
- **Nota:** transversal (várias views) → não é builder puro; planejar com `Code Reviewer`.

### 2.2 `push/register` — CSRF + público
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/routes/notifications.js:17`, `src/middleware/csrf.js:17`
- **Mudança:** exigir autenticação em `/push/register` (remover do `csrfSkipPaths` e proteger com `requireAuth`/`requireAdmin`).
- **Critério de aceite:** registro de push exige sessão.
- **Verificação:** teste de rota.

### 2.3 `push/send` — sem admin
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/routes/notifications.js:36`
- **Mudança:** adicionar `requireAdmin` em `/push/send`.
- **Critério de aceite:** só admin dispara push manual.
- **Verificação:** teste de rota.

### 2.4 `googleAuth.js` — token fire-and-forget + callback Docker
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/util/googleAuth.js:118` (`storeTokens`), `:59` (`getNewToken`)
- **Mudança:** `storeTokens` retorna Promise e é `await`ada antes de resolver; documentar/ajustar o callback OAuth para Docker (porta exposta).
- **Critério de aceite:** token persistido antes de continuar; fluxo OAuth documentado para container.
- **Verificação:** revisão `cavecrew-reviewer`.

### 2.5 `db.js` — IP hardcoded
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/db.js:26`
- **Mudança:** remover fallback `192.168.2.11`; exigir `MONGODB_IP` (falhar rápido se ausente).
- **Critério de aceite:** sem IP hardcoded no código.
- **Verificação:** lint + teste de boot.

### 2.6 `app.js`/`db.js` — `process.exit` em import
- **Subagente:** `Code Reviewer` (decisão) → `cavecrew-builder`
- **Alvo:** `src/app.js:29`, `src/db.js:42`
- **Mudança:** mover validação de `SESSION_SECRET` e `mongoose.connect` para o boot (`bin/www`), não para o import do módulo.
- **Critério de aceite:** importar `app.js`/`db.js` não mata o processo.
- **Verificação:** teste de import em isolamento.
- **Nota:** transversal → planejar antes.

**Fim da Fase 2:** `bun test` verde + `bun run lint` limpo.

---

## Fase 3 — Arquitetura / manutenabilidade

### 3.1 `processBills` — guarda de concorrência
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/routes/dashboard.js` (rota `processBills`)
- **Mudança:** lock server-side (flag em memória + `res.status(409)` se já em execução).
- **Critério de aceite:** duas abas não processam em paralelo.
- **Verificação:** teste de rota (duplo POST).

### 3.2 `downloads/` — cleanup + Puppeteer reuso
- **Subagente:** `Code Reviewer` (decisão) → `cavecrew-builder`
- **Alvo:** `src/parser/corsanEmailParser.js` (download + Puppeteer)
- **Mudança:** (a) apagar PDFs após parse (ou retenção configurável); (b) reutilizar uma única instância de browser em vez de abrir por PDF.
- **Critério de aceite:** `downloads/` não cresce sem bound; 1 browser reutilizado.
- **Verificação:** revisão + teste de parser.
- **Nota:** transversal → planejar antes.

### 3.3 Remover código morto
- **Subagente:** `cavecrew-investigator` (confirmar usos) → `cavecrew-builder`
- **Alvo:** `src/util/emailUtils.js` (`getAttachmentFromMessage`, `getPDFFromAttachment`)
- **Mudança:** remover funções não usadas (ou mantê-las se 1.1 as tornar vivas — decidir).
- **Critério de aceite:** sem funções exportadas sem uso.
- **Verificação:** `cavecrew-investigator` confirma zero chamadas; lint.

### 3.4 README / OpenAPI em sincronia
- **Subagente:** `cavecrew-builder`
- **Alvo:** `README.md`, `volumes/lembrador-contas/openapi.yaml`
- **Mudança:** atualizar "19 test files" → número real; `openapi` version `0.2` → `0.3`; alinhar rotas.
- **Critério de aceite:** docs refletem o código.
- **Verificação:** visual.

**Fim da Fase 3:** `bun test` verde + `bun run lint` limpo.

---

## Fase 4 — Frontend

### 4.1 CDN → assets locais
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/views/templates/scripts.html`
- **Mudança:** apontar jQuery/Bootstrap/Popper/jquery-mask para os caminhos locais já servidos em `app.js` (`/jquery`, `/bootstrap`, etc.), removendo CDNs.
- **Critério de aceite:** app funciona offline (PWA).
- **Verificação:** teste de renderização + check offline.

### 4.2 `window.__USER_EMAIL__` no DOM
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/views/partials/header.ejs:18`
- **Mudança:** expor o e-mail via `res.locals` (já usado para CSRF) em vez de injetar no HTML.
- **Critério de aceite:** e-mail não aparece como literal no HTML.
- **Verificação:** teste de renderização.

**Fim da Fase 4:** `bun test` verde + `bun run lint` limpo.

---

## Fase 5 — Testes

### 5.1 Cobertura de rotas faltantes
- **Subagente:** `cavecrew-builder` (1 arquivo de teste por rota)
- **Alvo:** `src/test/*` — adicionar para `users`, `tables`, `apis`, `htmlparser`
- **Mudança:** testes de rota com mock de Mongo (mesmo padrão dos existentes).
- **Critério de aceite:** todas as rotas têm teste.
- **Verificação:** `bun test --coverage`.

### 5.2 Testes dos bugs da Fase 1
- **Subagente:** `cavecrew-builder`
- **Alvo:** `src/test/*`
- **Mudança:** casos de teste específicos para 1.1–1.7 (off-by-one, filtro de período, delete filtrado, div/zero, continue, import ESM, multipart).
- **Critério de aceite:** cada bug da Fase 1 tem um teste que falharia sem o fix.
- **Verificação:** `bun test`.

### 5.3 E2E (fluxo completo)
- **Subagente:** `Code Reviewer` (design) → thread principal
- **Alvo:** novo `src/test/e2e.*`
- **Mudança:** fluxo login → dashboard → `processBills` com mocks.
- **Critério de aceite:** um teste de ponta a ponta do fluxo principal.
- **Verificação:** `bun test`.

**Fim da Fase 5:** cobertura aumentada; `bun test` verde.

---

## Resumo de paralelização

| Grupo | Tarefas independentes (paralelizáveis) |
|---|---|
| Fase 1 | 1.1, 1.4, 1.5, 1.6 (alvos distintos) |
| Fase 1 | 1.2, 1.3, 1.7 (mesmo arquivo `dashboard.js`/parser → sequenciar 1.2/1.3) |
| Fase 2 | 2.2, 2.3, 2.5 (alvos distintos) |
| Fase 5 | 5.1, 5.2 (arquivos de teste distintos) |

> Conflito de arquivo: **não** paralelizar duas edições no mesmo arquivo na mesma leva.

---

## Riscos & notas

- **1.3 (delete)** e **2.6 (process.exit em import)** são os de maior impacto em produção — validar com `cavecrew-reviewer` antes de commit.
- **2.1 (CSP)** e **3.2 (Puppeteer/downloads)** são transversais: usar `Code Reviewer` para o design, depois `cavecrew-builder` por fatia.
- Todo item que tocar em segurança (Fase 2) deve ter revisão `cavecrew-reviewer` obrigatória.
- Manter `bun test` + `bun run lint` verdes ao fim de **cada** fase.

---

## Checklist de execução (sugestão de commits)

- [ ] Fase 0: baseline registrado
- [ ] 1.1 gmail off-by-one
- [ ] 1.2 dashboard filtro período
- [ ] 1.3 dashboard delete filtrado
- [ ] 1.4 dashboard div/zero
- [ ] 1.5 emailUtils continue
- [ ] 1.6 billProcessing import ESM
- [ ] 1.7 cpfl multipart
- [ ] 2.1 CSP
- [ ] 2.2 push/register auth
- [ ] 2.3 push/send admin
- [ ] 2.4 googleAuth token/callback
- [ ] 2.5 db.js IP
- [ ] 2.6 process.exit em boot
- [ ] 3.1 processBills lock
- [ ] 3.2 downloads cleanup + browser reuso
- [ ] 3.3 código morto
- [ ] 3.4 docs sync
- [ ] 4.1 assets locais
- [ ] 4.2 e-mail via locals
- [ ] 5.1 rotas sem teste
- [ ] 5.2 testes dos bugs
- [ ] 5.3 e2e
