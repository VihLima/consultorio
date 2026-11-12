# Configurar o Supabase

Passo a passo para preparar o banco, o login e o armazenamento de arquivos do
Consultório Dra. Iachel. Faça uma única vez, antes do primeiro uso.

## 1. Criar o projeto

1. Entre em <https://supabase.com/dashboard> e clique em **New project**.
2. Escolha um nome (ex.: `consultorio-iachel`), uma senha forte para o banco
   (guarde-a num lugar seguro) e a região mais próxima (ex.: **South America (São Paulo)**).
3. Aguarde o projeto terminar de ser criado.

## 2. Rodar a migração

1. No menu lateral, abra **SQL Editor** → **New query**.
2. Cole todo o conteúdo de `supabase/migrations/0001_init.sql` e clique em **Run**.
   Depois, uma por vez e cada uma numa nova query, faça o mesmo com as outras, em ordem:
   `0002_patient_notes.sql`, `0003_patient_phone.sql`, `0004_payments.sql`,
   `0005_appointments.sql` e `0006_appointment_service.sql` (tipo do agendamento).
   Quem já rodou as anteriores só precisa rodar as que faltam; rodar de novo não estraga nada.
   O SQL Editor pode pedir para confirmar uma "destructive operation" (o script
   tem comandos `drop policy`, que recriam as regras de segurança): é esperado,
   confirme.
3. Deve aparecer "Success. No rows returned".

Isso cria as tabelas (`shifts`, `patients`, `consultations`,
`consultation_files`, `expenses`), as regras de segurança (RLS), as travas
(consulta finalizada e turno fechado não podem ser alterados), a função
`close_consultation` e o bucket privado `patient-files` com suas políticas.
O script pode ser rodado de novo sem problema.

Confira em **Storage** que o bucket `patient-files` existe, está marcado como
privado, com limite de 10 MB e tipos `image/*` e `application/pdf`.

## 3. Desativar o cadastro público

1. Abra **Authentication** → **Sign In / Providers** (em versões antigas do
   painel: **Authentication** → **Providers** / **Settings**).
2. Desligue **Allow new users to sign up** e salve.

Assim ninguém consegue criar conta pelo site; só a conta criada no passo 4 entra.

## 4. Criar o usuário da médica

1. Abra **Authentication** → **Users** → **Add user** → **Create new user**.
2. Informe o e-mail e a senha da Dra. Iachel.
3. Marque **Auto Confirm User** e clique em **Create user**.

Não existe "esqueci a senha" no sistema: para trocar a senha, use este mesmo
painel (menu do usuário → **Reset password** / editar).

## 5. Copiar URL e chave para o `.env.local`

1. Abra **Project Settings** → **API** (ou **Data API** / **API Keys**, conforme
   a versão do painel).
2. Copie a **Project URL** e a chave **anon public** (nos painéis novos ela
   pode aparecer como **publishable key**, começando com `sb_publishable_`; as
   duas funcionam).
3. Na raiz do projeto, crie o arquivo `.env.local` (ele nunca vai para o git):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=cole-a-chave-aqui
```

Nunca use a chave **service_role** / **secret** no front: ela ignora a segurança.
No Cloudflare Pages, cadastre as mesmas duas variáveis em
**Settings** → **Environment variables**.

## 6. Verificações rápidas (opcional, recomendado)

Faça logo depois de criar o usuário, com o banco ainda vazio.

O SQL Editor roda como o usuário administrador `postgres`, para quem
`auth.uid()` é nulo. Por isso os comandos abaixo informam o `user_id`
explicitamente, pegando o id da médica em `auth.users`. Rode **um bloco de
cada vez** (selecione o trecho e clique em **Run**, ou cole um por vez).

### 6.1 Só um turno aberto por vez

Bloco 1 — deve funcionar (abre um turno):

```sql
insert into public.shifts (user_id)
select id from auth.users order by created_at limit 1;
```

Bloco 2 — deve **falhar** com
`duplicate key value violates unique constraint "shifts_one_open"`:

```sql
insert into public.shifts (user_id)
select id from auth.users order by created_at limit 1;
```

### 6.2 Cédula repetida com formatação diferente

Bloco 3 — deve funcionar:

```sql
insert into public.patients (user_id, full_name, cedula)
select id, 'Teste Uno', '1.234.567' from auth.users order by created_at limit 1;
```

Bloco 4 — deve **falhar** com
`duplicate key value violates unique constraint "patients_cedula"`
(as duas cédulas viram `1234567` na coluna `cedula_norm`):

```sql
insert into public.patients (user_id, full_name, cedula)
select id, 'Teste Dos', '1234567' from auth.users order by created_at limit 1;
```

### 6.3 Limpar os dados de teste

Bloco 5 — apaga o turno e o paciente de teste (só faça isso enquanto o banco
ainda não tem dados reais):

```sql
delete from public.patients where full_name in ('Teste Uno', 'Teste Dos');
delete from public.shifts;
```

Pronto: abra o sistema, entre com o e-mail e a senha da médica e use
normalmente.

## 7. Primeira execução — o que conferir

Antes de atender o primeiro paciente de verdade, confira nesta ordem:

1. **Banco e arquivos.** Rode a migração (seção 2) e as verificações da
   seção 6. Em **Storage**, confirme que o bucket `patient-files` está
   **privado**, com limite de **10 MB** e tipos `image/*` e `application/pdf`.
2. **Abrir turno.** Entre no sistema e toque **Abrir turno** uma vez. Se der
   erro, a correção é trocar `insert({})` por `insert({ closed_at: null })` na
   função `openShift` de `src/data/shifts.ts` e publicar de novo.
3. **Fluxo completo de um paciente.** Toque **Paciente**, crie um paciente
   novo, anexe uma foto e um PDF, escreva algo na história clínica, informe o
   valor `150.000` e toque **Guardar y salir**. Em **Finanzas** deve aparecer
   **₲ 150.000** nos ingresos do turno. Em **Pacientes**, o paciente deve
   estar na lista de arquivados; toque **Reactivar** e confira que abre uma
   consulta nova em branco (e as anteriores no histórico, com os arquivos).
4. **Sem turno aberto.** Feche o turno. Abra um paciente ativo (da lista "En
   atención") e toque **Guardar y salir**: deve aparecer o aviso com o botão
   **Abrir turno**. Depois, numa aba que ficou aberta em **Finanzas** de antes
   do fechamento, tente lançar um egreso: deve aparecer a mensagem de turno
   fechado (somente leitura) e nada é gravado.
5. **Separação entre contas.** Crie uma segunda conta em **Authentication** →
   **Users** → **Add user**, entre com ela e confirme que ela vê **zero**
   pacientes e zero turnos. Confirme também que um arquivo não abre sem login:
   o endereço público
   `https://SEU-PROJETO.supabase.co/storage/v1/object/public/patient-files/<caminho>`
   deve dar erro (o bucket é privado). Os links que o sistema gera ao tocar no
   nome do arquivo são assinados e valem só 10 minutos. No fim, apague a conta
   de teste em **Authentication** → **Users**.
6. **Cloudflare Pages.** No site publicado, entre em **Finanzas** e recarregue
   a página (F5 / puxar para baixo no celular): `/financas` deve abrir normalmente,
   sem "página não encontrada".

## 8. Backups e pausa do projeto

**Isto é importante: o sistema guarda prontuários e finanças.**

No plano gratuito (Free) do Supabase:

- o projeto é **pausado depois de cerca de 7 dias sem uso**. Enquanto estiver
  pausado, o sistema não funciona (o login e as telas dão erro). Para voltar,
  entre em <https://supabase.com/dashboard>, abra o projeto e clique em
  **Restore project**; leva alguns minutos. Os dados não se perdem com a pausa;
- **não há backups automáticos para baixar**. Se algo der errado no projeto,
  não existe uma cópia que você possa recuperar sozinha.

Escolha uma das duas opções:

### Opção A — Plano Pro (recomendado)

Em **Organization settings** → **Billing**, mude para o plano **Pro**. Ele
inclui **backups diários** (restauráveis em **Database** → **Backups**) e o
projeto **não é pausado**. Mesmo assim, uma cópia própria de vez em quando
(opção B) não faz mal.

### Cópia com um comando (`npm run backup`)

Quem mantém o sistema pode copiar tudo de uma vez, no computador onde está o
projeto:

1. Uma única vez: em **Project Settings** → **API Keys**, copie a chave
   **secret** (`sb_secret_...`; nos painéis antigos, **service_role**) e
   adicione ao `.env.local` a linha `SUPABASE_SECRET_KEY=...`. **Sem** o
   prefixo `VITE_`: essa chave lê tudo e não pode ir para o site nem para o git.
2. Rode `npm run backup`.

O comando cria `backups/AAAA-MM-DD_HHMM/` com as sete tabelas em JSON, a lista
de usuários, todos os arquivos dos pacientes e um `manifesto.json` com as
contagens. Se algo falhar, o comando termina com erro e a pasta fica com um
arquivo `BACKUP-INCOMPLETO.txt`: não confie nessa cópia. A pasta `backups` está fora do git; são dados de pacientes,
guarde uma cópia também fora deste computador. Rodar toda semana também evita
a pausa do projeto.

### Opção B — Rotina de cópia manual (plano gratuito)

Faça **pelo menos uma vez por semana** (o uso semanal também evita a pausa) e
guarde as cópias num lugar seguro e privado (ex.: um disco externo ou uma
pasta de nuvem com acesso só seu — são dados de pacientes).

1. **Banco de dados** — escolha um dos jeitos:
   - **Pelo painel (mais simples):** abra **Table Editor**, escolha cada
     tabela (`patients`, `consultations`, `consultation_files`, `shifts`,
     `expenses`) e use **Export** → **Export table as CSV**. Guarde os cinco
     arquivos numa pasta com a data (ex.: `backup-2026-11-17`).
   - **Com `pg_dump` (cópia completa, restaurável):** em **Project Settings** →
     **Database** → **Connection string** (ou o botão **Connect** no topo do
     painel), copie a conexão do modo **Session pooler**. Com o PostgreSQL
     (versão 17 ou mais nova) instalado no computador, rode:

     ```
     pg_dump "postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" --schema=public --no-owner --file=backup-2026-11-17.sql
     ```

     (troque pela sua conexão; a senha é a do banco, criada no passo 1 da
     seção 1). O arquivo tem as tabelas e os dados. Restaurar a partir dele é
     uma tarefa técnica (peça ajuda a quem mantém o sistema); o importante é
     ter a cópia.
2. **Arquivos (fotos e PDFs)** — em **Storage** → `patient-files`, entre nas
   pastas e baixe os arquivos (botão **Download**). As pastas seguem
   `{usuário}/{paciente}/{consulta}/`; baixe a pasta inteira de cada
   paciente novo desde a última cópia. Com muitos arquivos, a Supabase CLI
   copia tudo de uma vez (comando ainda marcado como experimental pela
   Supabase; se mudar, consulte `npx supabase storage cp --help`):

   ```
   npx supabase login
   npx supabase link --project-ref SEU-PROJETO
   npx supabase storage cp -r ss:///patient-files ./backup-2026-11-17/arquivos --experimental
   ```
3. Confira que a pasta da cópia tem os cinco CSV (ou o `.sql`) e os arquivos,
   e anote a data da última cópia.
