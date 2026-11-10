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
