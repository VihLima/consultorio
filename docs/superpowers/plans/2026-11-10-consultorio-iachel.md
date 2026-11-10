# Sistema do Consultório Dra. Iachel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicação web responsiva (celular + computador) para um consultório de uma única médica: turnos, atendimentos com anexos, histórico de pacientes e finanças em guaraníes, em ES e PT-BR.

**Architecture:** SPA React + Vite + TypeScript publicada no Cloudflare Pages, falando direto com o Supabase (Auth, Postgres com RLS, Storage privado). Regras de negócio críticas (um turno aberto, consulta fechada imutável, turno fechado imutável) são garantidas no banco; a lógica pura (dinheiro, datas, totais, validações) vive em `src/lib` com testes unitários; o acesso a dados vive em `src/data`, um arquivo por entidade.

**Tech Stack:** React 18, Vite, TypeScript, React Router 6, `@supabase/supabase-js` v2, `react-i18next`, Vitest, CSS próprio com variáveis.

**Spec:** `docs/superpowers/specs/2026-11-10-consultorio-iachel-design.md`

## Global Constraints

- Sobrenome é **Iachel**. Título: `Consultorio Dra. Iachel` (es) / `Consultório Dra. Iachel` (pt-BR).
- Idiomas `es` (padrão) e `pt-BR`; escolha gravada em `localStorage` na chave `lang`. Nenhum texto de interface fora dos arquivos de tradução.
- Moeda: guaraníes, inteiros (`bigint` no banco, `number` no front), formato `₲ 150.000`. Toda formatação/parse de dinheiro passa por `src/lib/money.ts` (ponto único para a futura visualização em reais).
- Datas `dd/mm/aaaa`, horas `HH:MM`, fuso `America/Asuncion`.
- Nada é excluído: não existe UI nem política de `delete` para `patients` e `consultations`.
- Toda rota exceto `/` e `/login` exige sessão.
- Mobile-first: sem rolagem horizontal a 360 px; alvos de toque ≥ 56 px nos botões da tela inicial; conteúdo com largura máxima de 960 px.
- Cor principal `--brand: #D6186F` (ajustar ao amostrar a logo), definida só em `src/styles/tokens.css`.
- Arquivos: imagens (`image/*`) e `application/pdf`, máx. 10 MB (`10 * 1024 * 1024`) cada; bucket privado `patient-files`; caminho `{user_id}/{patient_id}/{consultation_id}/{uuid}-{nome}`.
- Segredos só em `.env.local` / variáveis do Pages: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. `.env.local` no `.gitignore`.
- Sem cadastro público e sem "esqueci a senha".
- Commits frequentes, um por tarefa no mínimo, terminando com a linha `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. **Valor digitado com separadores** (`150.000`, `150 000`, `₲150.000`, `150,000`): deve virar `150000`, nunca `150`. → teste em Task 1 (`parsePyg`).
2. **Duplo toque em "Guardar y salir"** ou em "Abrir turno": não pode criar duas consultas/turnos nem contar a entrada duas vezes. → índices únicos parciais em Task 2 + botão desabilitado durante envio e teste de `useSubmitOnce` em Task 6.
3. **Cédula com formatação diferente** (`1.234.567` vs `1234567` vs espaços): deve ser reconhecida como a mesma pessoa. → teste em Task 6 (`normalizeCedula`), coluna normalizada em Task 2.
4. **Falha de rede ou sessão expirada ao salvar**: o texto da história clínica não pode se perder. → rascunho local em Task 6 (`draftStore`, com teste).
5. **Turno aberto esquecido de um dia para o outro**: a tela inicial avisa com a data de abertura; as entradas não "somem". → teste em Task 5 (`isStaleShift`).

## File Structure

```
index.html
package.json · vite.config.ts · tsconfig.json · .gitignore · .env.example · README.md
public/_redirects            # "/* /index.html 200"
public/logo.webp             # cópia de assets/brand/logo.webp
supabase/migrations/0001_init.sql
src/main.tsx                 # monta App, importa i18n e estilos
src/App.tsx                  # rotas
src/styles/tokens.css        # variáveis (cores, espaçamentos, raio)
src/styles/app.css           # layout base, botões, formulários, listas
src/lib/money.ts             # formatPyg, parsePyg
src/lib/dates.ts             # formatDate, formatTime, isStaleShift, TZ
src/lib/totals.ts            # shiftTotals
src/lib/patients.ts          # normalizeCedula, normalizeSearch, patientStatus
src/lib/files.ts             # validateFile, buildStoragePath
src/lib/draftStore.ts        # rascunho local da consulta
src/lib/useSubmitOnce.ts     # hook anti duplo envio
src/lib/supabase.ts          # cliente
src/lib/types.ts             # tipos das entidades
src/i18n/index.ts · es.json · pt-BR.json
src/auth/AuthProvider.tsx · RequireAuth.tsx
src/data/shifts.ts · patients.ts · consultations.ts · files.ts · expenses.ts
src/components/Layout.tsx · LanguageSwitcher.tsx · ShiftSummary.tsx
src/components/FileUploader.tsx · ConsultationHistory.tsx · StatusBadge.tsx
src/pages/Cover.tsx · Login.tsx · Home.tsx · PatientForm.tsx
src/pages/Patients.tsx · Finances.tsx · ShiftDetail.tsx
```

Testes ficam ao lado do arquivo (`money.test.ts` etc.).

---

### Task 1: Projeto base e biblioteca de formatação

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `.env.example`, `public/_redirects`, `public/logo.webp`, `src/main.tsx`, `src/App.tsx`, `src/lib/money.ts`, `src/lib/dates.ts`, `src/lib/types.ts`
- Test: `src/lib/money.test.ts`, `src/lib/dates.test.ts`

**Interfaces:**
- Produces:
  - `formatPyg(amount: number): string` → `"₲ 150.000"`
  - `parsePyg(input: string): number | null` (null se vazio/inválido/negativo)
  - `TZ = 'America/Asuncion'`
  - `formatDate(iso: string): string` → `dd/mm/aaaa`; `formatTime(iso: string): string` → `HH:MM`
  - Tipos em `types.ts`: `Shift {id, opened_at, closed_at: string|null}`, `Patient {id, full_name, birth_date: string|null, cedula: string|null}`, `Consultation {id, patient_id, shift_id: string|null, clinical_history: string, amount_pyg: number|null, status: 'open'|'closed', started_at, closed_at: string|null}`, `ConsultationFile {id, consultation_id, storage_path, file_name, mime_type, size_bytes}`, `Expense {id, shift_id, description, amount_pyg, created_at}`

- [ ] **Step 1:** `git init`; criar o projeto com `npm create vite@latest . -- --template react-ts` (aceitar pasta não vazia, preservar `docs/` e `assets/`); instalar `react-router-dom @supabase/supabase-js i18next react-i18next` e dev `vitest`. Scripts: `dev`, `build`, `preview`, `test` (`vitest run`). `.gitignore` inclui `node_modules`, `dist`, `.env.local`. `.env.example` com as duas variáveis vazias. `public/_redirects` com `/* /index.html 200`. Copiar a logo para `public/logo.webp`.
- [ ] **Step 2: Testes de dinheiro (falhando)**

```ts
// src/lib/money.test.ts
expect(formatPyg(150000)).toBe('₲ 150.000');
expect(formatPyg(0)).toBe('₲ 0');
expect(formatPyg(1234567)).toBe('₲ 1.234.567');
expect(parsePyg('150.000')).toBe(150000);
expect(parsePyg('150 000')).toBe(150000);
expect(parsePyg('₲150.000')).toBe(150000);
expect(parsePyg('150,000')).toBe(150000);
expect(parsePyg('0')).toBe(0);
expect(parsePyg('')).toBeNull();
expect(parsePyg('abc')).toBeNull();
expect(parsePyg('-500')).toBeNull();
```

- [ ] **Step 3: Testes de data (falhando)**

```ts
// src/lib/dates.test.ts — 2026-11-10T03:30:00Z é 00:30 de 10/11 em Assunção (UTC-3)
expect(formatDate('2026-11-10T03:30:00Z')).toBe('10/11/2026');
expect(formatTime('2026-11-10T03:30:00Z')).toBe('00:30');
expect(formatDate('2026-11-10T02:30:00Z')).toBe('09/11/2026');
```

- [ ] **Step 4:** `npm test` → falha por funções inexistentes.
- [ ] **Step 5:** Implementar `money.ts` (parse = remover tudo que não é dígito, exceto rejeitar sinal `-` e strings sem dígito) e `dates.ts` (`Intl.DateTimeFormat('es-PY', { timeZone: TZ, ... })`), e `types.ts`.
- [ ] **Step 6:** `npm test` → passa; `npm run build` → sem erros.
- [ ] **Step 7:** Commit `chore: scaffold project and formatting library`.

---

### Task 2: Banco de dados, RLS e Storage

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `README.md` (seção "Configurar o Supabase")

**Interfaces:**
- Produces (nomes que o front usa): tabelas `shifts`, `patients`, `consultations`, `consultation_files`, `expenses`; bucket `patient-files`; coluna gerada `patients.cedula_norm`; RPC `close_consultation(p_consultation_id uuid, p_amount bigint)`.

- [ ] **Step 1: Escrever a migração** com:
  - Todas as tabelas: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users`, `created_at timestamptz not null default now()`.
  - `shifts`: `opened_at timestamptz not null default now()`, `closed_at timestamptz`. `create unique index shifts_one_open on shifts(user_id) where closed_at is null`.
  - `patients`: `full_name text not null check (length(trim(full_name)) > 0)`, `birth_date date`, `cedula text`, `cedula_norm text generated always as (nullif(regexp_replace(coalesce(cedula,''), '[^0-9A-Za-z]', '', 'g'), '')) stored`. `create unique index patients_cedula on patients(user_id, cedula_norm) where cedula_norm is not null`. Índice em `lower(full_name)`.
  - `consultations`: `patient_id uuid not null references patients`, `shift_id uuid references shifts`, `clinical_history text not null default ''`, `amount_pyg bigint check (amount_pyg >= 0)`, `status text not null default 'open' check (status in ('open','closed'))`, `started_at timestamptz not null default now()`, `closed_at timestamptz`. `check (status = 'open' or (shift_id is not null and amount_pyg is not null and closed_at is not null))`. `create unique index consultations_one_open on consultations(patient_id) where status = 'open'`.
  - `consultation_files`: `consultation_id uuid not null references consultations`, `storage_path text not null unique`, `file_name text not null`, `mime_type text not null`, `size_bytes bigint not null check (size_bytes <= 10485760)`.
  - `expenses`: `shift_id uuid not null references shifts`, `description text not null check (length(trim(description)) > 0)`, `amount_pyg bigint not null check (amount_pyg > 0)`.
  - RLS habilitado em todas; políticas `select/insert/update` com `user_id = auth.uid()` (using e with check). `delete` apenas em `expenses` e `consultation_files`. Nenhum `delete` em `patients`, `consultations`, `shifts`.
  - Trigger `consultations_immutable_when_closed` (before update): se `old.status = 'closed'` → `raise exception 'consultation_closed'`.
  - Trigger em `consultation_files` (before insert/delete): se a consulta está `closed` → `raise exception 'consultation_closed'`.
  - Trigger em `expenses` (before insert/update/delete): se o turno tem `closed_at` não nulo → `raise exception 'shift_closed'`.
  - Trigger em `shifts` (before update): se `old.closed_at is not null` → `raise exception 'shift_closed'`.
  - Função `close_consultation` (`security invoker`): busca o turno aberto do usuário (senão `raise exception 'no_open_shift'`), e faz `update consultations set status='closed', amount_pyg=p_amount, shift_id=<turno>, closed_at=now() where id=p_consultation_id and status='open'`; se nenhuma linha afetada → `raise exception 'consultation_not_open'`.
  - Storage: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('patient-files','patient-files', false, 10485760, array['image/*','application/pdf'])`; políticas em `storage.objects` para `select/insert/delete` com `bucket_id = 'patient-files' and (storage.foldername(name))[1] = auth.uid()::text`.
- [ ] **Step 2: README** — passos: criar projeto Supabase, rodar a migração no SQL Editor, desativar "Allow new users to sign up", criar o usuário da médica em Authentication → Users, copiar URL e anon key para `.env.local`.
- [ ] **Step 3: Verificar** — com o projeto Supabase disponível, aplicar a migração e rodar no SQL Editor: abrir dois turnos seguidos (o segundo deve falhar com violação de `shifts_one_open`); inserir duas cédulas `1.234.567` e `1234567` (a segunda deve falhar). Sem projeto disponível, registrar no relatório que a migração não foi executada.
- [ ] **Step 4:** Commit `feat: database schema, RLS and storage policies`.

---

### Task 3: Idiomas, tema, layout e capa

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/es.json`, `src/i18n/pt-BR.json`, `src/styles/tokens.css`, `src/styles/app.css`, `src/components/Layout.tsx`, `src/components/LanguageSwitcher.tsx`, `src/pages/Cover.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- Produces: `<Layout title?: string, back?: string>` (cabeçalho com logo pequena, botão voltar opcional, `LanguageSwitcher`, conteúdo centrado máx. 960 px); `<LanguageSwitcher />`; chaves de tradução agrupadas por tela: `common.*`, `cover.*`, `login.*`, `home.*`, `shift.*`, `patient.*`, `patients.*`, `finances.*`, `errors.*`.

- [ ] **Step 1: Teste de paridade (falhando)**

```ts
// src/i18n/i18n.test.ts — achata as chaves dos dois JSON
expect(flatKeys(ptBR).sort()).toEqual(flatKeys(es).sort());
expect(es.cover.title).toBe('Consultorio Dra. Iachel');
expect(ptBR.cover.title).toBe('Consultório Dra. Iachel');
```

- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Criar os dois JSON com todas as chaves de todas as telas do spec (seção 5 traz os rótulos ES: Nombre, Fecha de nacimiento, Número de cédula, Historia clínica, Archivos, Valor cobrado, Guardar y salir, Abrir turno, Cerrar turno, Paciente, Pacientes archivados, Finanzas, Ingresos, Egresos, Saldo, Salir, Reactivar, Buscar; status `Activo`/`Archivado`; PT: Ativo/Arquivado, Entradas/Saídas etc.). `i18n/index.ts`: idioma inicial = `localStorage.lang` ou `es`; ao trocar, grava `lang` e atualiza `document.documentElement.lang`.
- [ ] **Step 4:** `tokens.css` (`--brand`, `--brand-soft`, `--bg`, `--text`, `--muted`, `--danger`, `--radius`, `--tap: 56px`) e `app.css` (reset, tipografia, `.btn`, `.btn-primary`, `.btn-big`, `.field`, `.card`, `.list`, `.badge`, grade da home: 1 coluna < 640 px, 2 colunas ≥ 640 px, 3 colunas ≥ 900 px).
- [ ] **Step 5:** `Cover.tsx` na rota `/`: logo (`/logo.webp`, largura máx. 420 px), título `cover.title`, botão Login → `/login`, seletor de idioma.
- [ ] **Step 6:** `npm test` passa. `npm run dev`, abrir no navegador a 375 px e em tela larga: logo e botão visíveis sem rolagem lateral; trocar idioma muda o título e persiste após recarregar.
- [ ] **Step 7:** Commit `feat: i18n, theme, layout and cover page`.

---

### Task 4: Login e proteção de rotas

**Files:**
- Create: `src/lib/supabase.ts`, `src/auth/AuthProvider.tsx`, `src/auth/RequireAuth.tsx`, `src/pages/Login.tsx`
- Modify: `src/App.tsx`, `src/pages/Cover.tsx`

**Interfaces:**
- Produces: `supabase` (cliente); `useAuth(): { session: Session | null, loading: boolean, signIn(email, password): Promise<{ error: string | null }>, signOut(): Promise<void> }`; `<RequireAuth>` redireciona para `/login` guardando a rota de origem em `location.state.from`.
- Rotas finais em `App.tsx`: `/`, `/login`, e protegidas `/inicio`, `/paciente/novo`, `/paciente/:id`, `/pacientes`, `/financas`, `/turnos/:id`.

- [ ] **Step 1:** `supabase.ts` cria o cliente a partir das variáveis `VITE_*`; se faltarem, lança erro com mensagem clara.
- [ ] **Step 2:** `AuthProvider` usa `getSession` + `onAuthStateChange`. `signIn` devolve `errors.invalidCredentials` para credenciais erradas e `errors.network` para falha de rede (chaves de tradução, não texto cru do Supabase).
- [ ] **Step 3:** `Login.tsx`: campos e-mail (`type=email`, `autocomplete=username`) e senha (`autocomplete=current-password`), botão desabilitado durante o envio, erro abaixo do formulário. Sucesso → `state.from` ou `/inicio`.
- [ ] **Step 4:** `Cover`: com sessão ativa, redireciona para `/inicio`.
- [ ] **Step 5: Verificar no navegador** com a conta de teste do `.env.local`/README: senha errada mostra erro traduzido; login correto leva a `/inicio`; abrir `/financas` sem sessão leva ao login e, após entrar, volta a `/financas`.
- [ ] **Step 6:** Commit `feat: login and protected routes`.

---

### Task 5: Turnos e tela inicial

**Files:**
- Create: `src/data/shifts.ts`, `src/pages/Home.tsx`
- Modify: `src/lib/dates.ts`, `src/lib/dates.test.ts`

**Interfaces:**
- Consumes: `supabase`, `Shift`, `formatDate`, `formatTime`, `useAuth`.
- Produces:
  - `getOpenShift(): Promise<Shift | null>`
  - `openShift(): Promise<Shift>` (se o índice único rejeitar, devolve o turno já aberto em vez de erro)
  - `closeShift(id: string): Promise<Shift>`
  - `listClosedShifts(): Promise<Shift[]>` (mais recente primeiro)
  - `getShift(id: string): Promise<Shift>`
  - `isStaleShift(openedAtIso: string, nowIso: string): boolean` — true se a data de abertura em `America/Asuncion` é anterior à data atual no mesmo fuso.

- [ ] **Step 1: Teste (falhando)**

```ts
expect(isStaleShift('2026-11-09T20:00:00Z', '2026-11-10T12:00:00Z')).toBe(true);
expect(isStaleShift('2026-11-10T11:00:00Z', '2026-11-10T22:00:00Z')).toBe(false);
// 02:30Z de 10/11 ainda é 09/11 em Assunção
expect(isStaleShift('2026-11-10T02:30:00Z', '2026-11-10T12:00:00Z')).toBe(true);
```

- [ ] **Step 2:** `npm test` → falha; implementar `isStaleShift`; `npm test` → passa.
- [ ] **Step 3:** Implementar `data/shifts.ts`.
- [ ] **Step 4:** `Home.tsx` (`/inicio`): faixa de estado do turno (`shift.openSince` com hora, ou `shift.none`; aviso `shift.staleWarning` com a data quando `isStaleShift`); botões grandes na ordem: Abrir/Fechar turno, Paciente, Pacientes, Finanças, Sair. Sem turno aberto, "Paciente" abre um aviso `shift.requiredToAttend` com atalho "Abrir turno". "Fechar turno" navega para `/financas?fechar=1` (o resumo é da Task 8; até lá, fecha direto com confirmação simples). Reservar a seção "Em atendimento" (preenchida na Task 6). "Sair" chama `signOut` e vai para `/`.
- [ ] **Step 5: Verificar no navegador:** abrir turno mostra a hora; dois cliques rápidos em "Abrir turno" resultam em um único turno; recarregar mantém o estado; a 375 px os botões ficam um por linha, em tela larga em grade.
- [ ] **Step 6:** Commit `feat: shifts and home screen`.

---

### Task 6: Paciente, consulta e anexos

**Files:**
- Create: `src/lib/patients.ts`, `src/lib/files.ts`, `src/lib/draftStore.ts`, `src/lib/useSubmitOnce.ts`, `src/data/patients.ts`, `src/data/consultations.ts`, `src/data/files.ts`, `src/components/FileUploader.tsx`, `src/pages/PatientForm.tsx`
- Modify: `src/pages/Home.tsx` (lista "Em atendimento")
- Test: `src/lib/patients.test.ts`, `src/lib/files.test.ts`, `src/lib/draftStore.test.ts`, `src/lib/useSubmitOnce.test.ts`

**Interfaces:**
- Consumes: `getOpenShift`, `parsePyg`, `formatPyg`, tipos, `Layout`.
- Produces:
  - `normalizeCedula(input: string): string | null` (só letras/dígitos; vazio → null)
  - `validateFile(file: { type: string; size: number }): 'ok' | 'type' | 'size'`
  - `buildStoragePath(userId, patientId, consultationId, fileName, uuid): string`
  - `draftStore.save(key: string, draft: { clinical_history: string; amount: string }): void`, `.load(key): draft | null`, `.clear(key): void` (localStorage, chave `draft:{consultationId|'new'}`)
  - `useSubmitOnce<T>(fn: () => Promise<T>): { run(): Promise<T | undefined>; busy: boolean }` — chamadas durante `busy` são ignoradas
  - `createPatient(input: { full_name: string; birth_date: string | null; cedula: string | null }): Promise<Patient>`
  - `updatePatient(id, input): Promise<Patient>`; `getPatient(id): Promise<Patient>`
  - `findPatientByCedula(cedula: string): Promise<Patient | null>`
  - `getOpenConsultation(patientId): Promise<Consultation | null>`
  - `startConsultation(patientId): Promise<Consultation>` (se já existir uma aberta, devolve essa)
  - `saveConsultationDraft(id, clinical_history: string): Promise<void>`
  - `closeConsultation(id, amount: number): Promise<void>` (RPC `close_consultation`)
  - `listActivePatients(): Promise<Array<Patient & { consultation_id: string }>>`
  - `uploadFile(consultation: Consultation, file: File, onProgress?): Promise<ConsultationFile>`, `listFiles(consultationId): Promise<ConsultationFile[]>`, `removeFile(file: ConsultationFile): Promise<void>`, `getSignedUrl(path: string): Promise<string>` (validade 10 min)

- [ ] **Step 1: Testes (falhando)**

```ts
// patients.test.ts
expect(normalizeCedula('1.234.567')).toBe('1234567');
expect(normalizeCedula(' 1 234 567 ')).toBe('1234567');
expect(normalizeCedula('')).toBeNull();
expect(normalizeCedula(' . ')).toBeNull();
// files.test.ts
expect(validateFile({ type: 'image/jpeg', size: 1000 })).toBe('ok');
expect(validateFile({ type: 'application/pdf', size: 10485760 })).toBe('ok');
expect(validateFile({ type: 'application/pdf', size: 10485761 })).toBe('size');
expect(validateFile({ type: 'application/zip', size: 10 })).toBe('type');
expect(buildStoragePath('u', 'p', 'c', 'Foto 1.jpg', 'x')).toBe('u/p/c/x-Foto_1.jpg');
// draftStore.test.ts
draftStore.save('k', { clinical_history: 'dolor', amount: '150.000' });
expect(draftStore.load('k')).toEqual({ clinical_history: 'dolor', amount: '150.000' });
draftStore.clear('k'); expect(draftStore.load('k')).toBeNull();
// useSubmitOnce.test.ts — fn pendente; chamar run() duas vezes
expect(fn).toHaveBeenCalledTimes(1);
```

(`buildStoragePath` troca por `_` tudo que não for `[A-Za-z0-9._-]`. Para o teste do hook, adicionar `@testing-library/react` e `jsdom` como dev deps.)

- [ ] **Step 2:** `npm test` → falha; implementar os quatro módulos de `lib`; `npm test` → passa.
- [ ] **Step 3:** Implementar `data/patients.ts`, `data/consultations.ts`, `data/files.ts`.
- [ ] **Step 4:** `PatientForm.tsx`:
  - `/paciente/novo`: campos nome (obrigatório), data de nascimento (`type=date`), cédula, história clínica (`textarea` que cresce), arquivos, valor cobrado (`inputmode=numeric`, mostra o valor formatado ao sair do campo). Ao sair do campo cédula, `findPatientByCedula`; se existir, aviso `patient.duplicate` com botão para abrir o existente. Paciente e consulta são criados no primeiro salvamento (rascunho ou final) ou no primeiro anexo.
  - `/paciente/:id`: carrega paciente + consulta aberta; dados fixos editáveis; se não houver consulta aberta mostra só a ficha (o histórico e o botão Reativar entram na Task 7).
  - **Guardar y salir**: valida nome e valor (`parsePyg` ≠ null) → grava paciente, `saveConsultationDraft`, `closeConsultation`, `draftStore.clear`, navega para `/inicio`. Usa `useSubmitOnce`. Erro `no_open_shift` → mensagem `shift.requiredToAttend`.
  - **Voltar**: grava rascunho no servidor (se houver nome) e volta; paciente fica ativo.
  - A cada alteração de história/valor, `draftStore.save` (debounce 500 ms); ao abrir, se existir rascunho local mais novo que o do servidor, restaura. Falha ao salvar: mensagem `errors.saveFailed`, permanece na tela com tudo preenchido.
- [ ] **Step 5:** `FileUploader.tsx`: `<input type="file" multiple accept="image/*,application/pdf">` (no celular oferece câmera), validação por `validateFile` com mensagens `errors.fileType` / `errors.fileSize`, progresso e erro por arquivo, miniatura para imagens (URL assinada), ícone para PDF, botão remover (só com consulta aberta).
- [ ] **Step 6:** `Home.tsx`: seção "Em atendimento" com `listActivePatients()`; tocar abre `/paciente/:id`.
- [ ] **Step 7: Verificar no navegador:** criar paciente com foto e PDF, valor `150.000` → volta à home; criar outro, tocar Voltar → aparece em "Em atendimento"; reabrir e finalizar; digitar a mesma cédula com pontos em novo paciente → aviso de duplicado; com a rede desligada (DevTools offline) "Guardar y salir" mostra erro e mantém o texto, e recarregar a página restaura o texto.
- [ ] **Step 8:** Commit `feat: patient form, consultations and attachments`.

---

### Task 7: Lista de pacientes, busca, reativação e histórico

**Files:**
- Create: `src/pages/Patients.tsx`, `src/components/StatusBadge.tsx`, `src/components/ConsultationHistory.tsx`
- Modify: `src/lib/patients.ts`, `src/lib/patients.test.ts`, `src/data/patients.ts`, `src/data/consultations.ts`, `src/pages/PatientForm.tsx`

**Interfaces:**
- Consumes: tudo da Task 6.
- Produces:
  - `normalizeSearch(input: string): string` (trim, minúsculas, sem acentos)
  - `patientStatus(hasOpenConsultation: boolean): 'active' | 'archived'`
  - `searchPatients(query: string): Promise<Array<Patient & { status: 'active' | 'archived' }>>` — por nome (`ilike`) ou `cedula_norm` (prefixo), limite 50
  - `listArchivedPatients(): Promise<Patient[]>` — sem consulta aberta, ordem alfabética
  - `listClosedConsultations(patientId): Promise<Array<Consultation & { file_count: number }>>` — mais recente primeiro
  - `<StatusBadge status />`, `<ConsultationHistory patientId />`

- [ ] **Step 1: Teste (falhando)**

```ts
expect(normalizeSearch('  José Ñandú ')).toBe('jose nandu');
expect(patientStatus(true)).toBe('active');
expect(patientStatus(false)).toBe('archived');
```

- [ ] **Step 2:** `npm test` → falha; implementar; passa.
- [ ] **Step 3:** Implementar as três consultas de dados.
- [ ] **Step 4:** `Patients.tsx` (`/pacientes`): caixa de busca (debounce 300 ms). Com texto → resultados com `StatusBadge`. Sem texto → lista de arquivados, cada linha com nome, cédula e botão **Reativar**. Estados vazios traduzidos. Tocar na linha abre `/paciente/:id`.
- [ ] **Step 5:** Reativar: exige turno aberto (senão aviso `shift.requiredToAttend`), chama `startConsultation` e navega para `/paciente/:id`. Em `PatientForm`, quando o paciente não tem consulta aberta, mostrar botão Reativar no lugar dos campos da consulta.
- [ ] **Step 6:** `ConsultationHistory` abaixo do formulário em `/paciente/:id`: cartões com data, 2 primeiras linhas da história, nº de arquivos, valor (`formatPyg`); tocar expande texto completo e arquivos (abrem por URL assinada em nova aba). Tudo somente leitura.
- [ ] **Step 7: Verificar no navegador:** buscar por parte do nome e por cédula com e sem pontos; resultado mostra Activo/Archivado corretos; reativar paciente arquivado abre consulta em branco com dados fixos preenchidos e a consulta anterior no histórico; finalizar → o histórico passa a ter duas consultas.
- [ ] **Step 8:** Commit `feat: patient list, search, reactivation and history`.

---

### Task 8: Finanças e fechamento de turno

**Files:**
- Create: `src/lib/totals.ts`, `src/data/expenses.ts`, `src/components/ShiftSummary.tsx`, `src/pages/Finances.tsx`, `src/pages/ShiftDetail.tsx`
- Modify: `src/data/consultations.ts`, `src/pages/Home.tsx`
- Test: `src/lib/totals.test.ts`

**Interfaces:**
- Consumes: `getOpenShift`, `closeShift`, `listClosedShifts`, `getShift`, `formatPyg`, `parsePyg`, `useSubmitOnce`.
- Produces:
  - `shiftTotals(incomes: number[], expenses: number[]): { income: number; expense: number; balance: number }`
  - `listShiftIncomes(shiftId): Promise<Array<{ consultation_id: string; patient_name: string; closed_at: string; amount_pyg: number }>>`
  - `listExpenses(shiftId): Promise<Expense[]>`, `addExpense(shiftId, description: string, amount: number): Promise<Expense>`, `updateExpense(id, description, amount): Promise<Expense>`, `removeExpense(id): Promise<void>`
  - `listShiftSummaries(): Promise<Array<Shift & { income: number; expense: number; balance: number }>>`
  - `<ShiftSummary shiftId readOnly? />` — entradas, saídas, totais

- [ ] **Step 1: Teste (falhando)**

```ts
expect(shiftTotals([150000, 200000], [50000])).toEqual({ income: 350000, expense: 50000, balance: 300000 });
expect(shiftTotals([], [])).toEqual({ income: 0, expense: 0, balance: 0 });
expect(shiftTotals([0], [80000])).toEqual({ income: 0, expense: 80000, balance: -80000 });
```

- [ ] **Step 2:** `npm test` → falha; implementar; passa.
- [ ] **Step 3:** Implementar `data/expenses.ts` e as consultas de entradas/resumos.
- [ ] **Step 4:** `Finances.tsx` (`/financas`): mostra o turno aberto, ou o último fechado se não houver aberto (com rótulo dizendo qual). Três cartões de total (Ingresos, Egresos, Saldo; saldo negativo em `--danger`). Entradas: lista só leitura. Saídas: lista + formulário (descrição, valor), editar/remover apenas com turno aberto. Celular: abas Ingresos/Egresos; ≥ 900 px: duas colunas. Abaixo, "Turnos anteriores" (data, entradas, saídas, saldo) → `/turnos/:id`.
- [ ] **Step 5:** `ShiftDetail.tsx` (`/turnos/:id`): `ShiftSummary` somente leitura.
- [ ] **Step 6:** Fechamento: `/financas?fechar=1` (vindo do botão da home) abre o resumo — pacientes atendidos (contagem), entradas, saídas, saldo, e aviso `shift.activePatientsWarning` com a quantidade de pacientes ainda ativos — com botões Confirmar (`closeShift`, volta a `/inicio`) e Cancelar. Remover o fechamento provisório da Task 5.
- [ ] **Step 7: Verificar no navegador:** os totais batem com os atendimentos feitos nas tarefas anteriores; lançar saída `50.000` atualiza saldo; fechar turno mostra resumo correto; depois de fechado, o formulário de saídas some e o turno aparece em "Turnos anteriores"; um atendimento não é contado duas vezes.
- [ ] **Step 8:** Commit `feat: finances and shift closing`.

---

### Task 9: Acabamento, responsividade e publicação

**Files:**
- Modify: `README.md`, `src/styles/app.css`, o que a revisão apontar

- [ ] **Step 1:** Percorrer todas as telas a 360 px, 768 px e 1280 px, em ES e PT-BR: sem rolagem lateral, sem texto cortado, botões da home ≥ 56 px, foco de teclado visível, todo `input` com `label`.
- [ ] **Step 2:** Procurar texto fixo fora dos JSON de tradução (`grep` por strings em `src/pages` e `src/components`) e mover para as traduções; o teste de paridade deve continuar passando.
- [ ] **Step 3:** Conferir os estados vazios e as mensagens de erro de cada lista/formulário; sessão expirada devolve ao login e retorna à rota original.
- [ ] **Step 4:** Amostrar o magenta real da logo e ajustar `--brand` se diferir de `#D6186F`.
- [ ] **Step 5:** README, seção "Publicar no Cloudflare Pages": build command `npm run build`, output `dist`, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, e adicionar a URL do Pages em Supabase → Authentication → URL Configuration.
- [ ] **Step 6:** `npm test` e `npm run build` passam sem avisos de tipo.
- [ ] **Step 7:** Commit `chore: polish, responsive pass and deploy docs`.

---

## Dependências externas (do cliente)

Para as verificações das Tasks 2 e 4 em diante é preciso um projeto Supabase (URL + anon key em `.env.local`) e uma conta de teste. A publicação no Cloudflare Pages (Task 9) é feita pelo cliente ou com a autorização dele; o plano entrega o projeto pronto para publicar.
