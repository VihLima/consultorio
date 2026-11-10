# Consultório Dra. Iachel

Sistema web do consultório da Dra. Iachel: turnos de atendimento, pacientes,
consultas com história clínica e arquivos, e finanças por turno (entradas,
saídas e saldo em guaraníes). Interface em espanhol (padrão) e português.

Feito com React 18 + Vite + TypeScript; os dados ficam no Supabase (banco,
login e arquivos) e o site é publicado no Cloudflare Pages.

## Primeira configuração

1. Instale o [Node.js](https://nodejs.org/) 22 (ou 20.19+).
2. Configure o Supabase seguindo [docs/setup-supabase.md](docs/setup-supabase.md)
   (projeto, migração do banco, usuário da médica e o arquivo `.env.local`).
3. Instale as dependências:

   ```
   npm install
   ```

## Rodar no computador

```
npm run dev
```

Abra o endereço mostrado no terminal (normalmente <http://localhost:5173>).

## Testes e build

```
npm test          # testes automáticos
npm run build     # checagem de tipos + versão de produção na pasta dist
```

## Publicar no Cloudflare Pages

1. No painel da Cloudflare, abra **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** e escolha este repositório.
2. Em **Build settings**:
   - **Framework preset**: `None` (ou `Vite`)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Em **Environment variables** (Production e Preview), cadastre:
   - `VITE_SUPABASE_URL` — a Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` — a chave **anon public** (ou publishable)

   Nunca use a chave `service_role` / secret. As variáveis entram no build:
   depois de mudá-las, faça um novo deploy (**Deployments** → **Retry deployment**).
4. Clique em **Save and Deploy**. Ao terminar, o Pages mostra a URL do site
   (ex.: `https://consultorio-iachel.pages.dev`).
5. No Supabase, abra **Authentication** → **URL Configuration**:
   - em **Site URL**, coloque a URL do Pages;
   - em **Redirect URLs**, adicione a mesma URL (e o domínio próprio, se houver).
6. Abra a URL, entre com o e-mail e a senha da médica e confira a tela inicial.

O arquivo `public/_redirects` faz o Pages devolver o app em qualquer endereço
(ex.: ao recarregar `/financas`), então não é preciso configurar nada a mais
para as rotas.

## Estrutura

- `src/pages` — telas; `src/components` — partes reutilizadas
- `src/data` — acesso ao Supabase; `src/lib` — dinheiro, datas, totais e utilitários
- `src/i18n` — textos em `es.json` e `pt-BR.json` (sempre as mesmas chaves nos dois)
- `src/styles` — cores e medidas em `tokens.css`, estilos em `app.css`
- `supabase/migrations` — banco, regras de segurança e armazenamento de arquivos
