# Sistema do Consultório Dra. Iachel — Desenho

Data: 2026-11-10 · Status: aguardando aprovação

Legenda: itens sem marca foram ditos pelo cliente. Itens marcados **[decisão do construtor]** são escolhas minhas, ainda não confirmadas.

## 1. Intenção

Um sistema web simples para um consultório de medicina geral no Paraguai, usado por uma única profissional. Substitui anotações soltas por três coisas:

1. registrar cada atendimento (dados do paciente, história clínica, fotos/arquivos);
2. guardar o histórico de cada paciente para reconsultas, sem nunca excluir nada;
3. saber quanto entrou e quanto saiu em cada dia de trabalho ("turno"), sem lançar ganhos duas vezes.

Precisa funcionar igualmente bem no celular e no computador, com os mesmos dados nos dois.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos (versão 1)**
- Capa com logomarca, login por e-mail e senha.
- Tela inicial com botões grandes: turno, paciente, arquivados, finanças, sair.
- Abrir e fechar turno; tudo o que acontece fica vinculado ao turno.
- Cadastro e atendimento de paciente com anexos; arquivamento ao salvar.
- Lista de arquivados com reativação; busca em todos os pacientes mostrando o status.
- Histórico de consultas por paciente (consultas antigas só para leitura).
- Finanças: entradas somadas automaticamente a partir dos atendimentos, saídas lançadas à mão, saldo.
- Seletor de idioma Español / Português (BR) em todas as telas.
- Valores em guaraníes (₲).

**Não-objetivos (ficam para depois)**
- Visualização dos valores em reais / cotação. O código de formatação de moeda deve ficar isolado num único módulo para facilitar acrescentar isso.
- Vários usuários, secretária, perfis de acesso.
- Agenda/marcação de consultas, receitas, impressão, relatórios mensais.
- Funcionamento offline.
- Tela pública de cadastro de conta ou "esqueci a senha".

**Anti-objetivos (seria um fracasso mesmo funcionando)**
- Perder ou excluir dados de paciente.
- Dados de paciente acessíveis sem login.
- Telas que exigem zoom ou rolagem lateral no celular.
- Obrigar a lançar o valor do atendimento em dois lugares.

## 3. Tecnologia

- **Frontend:** React + Vite + TypeScript, aplicação de página única (SPA), publicada no **Cloudflare Pages** (escolha do cliente, por permitir uso comercial no plano gratuito).
- **Backend:** **Supabase** — Auth (e-mail/senha), Postgres, Storage. Sem servidor próprio; o frontend fala direto com o Supabase.
- **[decisão do construtor]** React Router para rotas; CSS próprio com variáveis (sem framework de UI pesado); `react-i18next` para os dois idiomas; Vitest para testes de lógica (cálculo de totais, formatação de ₲, regras de turno).
- **[decisão do construtor]** Arquivo `public/_redirects` com `/* /index.html 200` para as rotas da SPA funcionarem no Pages.
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (definidas no Pages e em `.env.local`, nunca commitadas).

## 4. Identidade visual

- Logomarca: `assets/brand/logo.webp` (magenta sobre branco, "Dra. … Iachel — Medicina General").
- Título da capa: **"Consultorio Dra. Iachel"** (ES) / **"Consultório Dra. Iachel"** (PT). O sobrenome é **Iachel**.
- **[decisão do construtor]** Cor principal: o magenta da logo (aprox. `#D6186F`, a amostrar do arquivo), fundo branco/rosa muito claro, texto cinza-escuro. Botões da tela inicial grandes (mín. 56 px de altura), um por linha no celular e em grade de 2–3 colunas no computador.
- **[decisão do construtor]** Layout mobile-first; largura máxima de conteúdo ~960 px no computador.

## 5. Idiomas

- Dois idiomas: `es` e `pt-BR`. Seletor visível em todas as telas, inclusive capa e login.
- **[decisão do construtor]** Padrão: Español. A escolha fica gravada no aparelho (localStorage).
- Só a interface é traduzida; o que a médica digita (história clínica etc.) fica como foi escrito.
- Rótulos em ES: Nombre, Fecha de nacimiento, Número de cédula, Historia clínica, Archivos, Valor cobrado, Guardar y salir, Abrir turno, Cerrar turno, Paciente, Pacientes archivados, Finanzas, Ingresos, Egresos, Saldo, Salir, Reactivar, Buscar.
- Datas em `dd/mm/aaaa`; fuso **[decisão do construtor]** `America/Asuncion`.
- Guaraníes sem casas decimais, separador de milhar com ponto: `₲ 150.000`.

## 6. Telas e fluxo

1. **Capa** (`/`): logo, título, botão Login, seletor de idioma. Se já houver sessão, vai direto à tela inicial.
2. **Login** (`/login`): e-mail, senha, botão Entrar, mensagem de erro clara. Sem cadastro.
3. **Tela inicial** (`/inicio`): indicador de turno (aberto desde HH:MM / nenhum turno aberto) e os botões:
   - **Abrir turno** (vira **Fechar turno** quando há um aberto)
   - **Paciente** (novo atendimento)
   - **Pacientes** (busca + arquivados)
   - **Finanças**
   - **Sair** (encerra a sessão; não fecha o turno)
4. **Paciente / atendimento** (`/paciente/novo`, `/paciente/:id`): ver seção 8.
5. **Pacientes** (`/pacientes`): caixa de busca no topo (nome ou cédula **[decisão do construtor]**), resultados com etiqueta de status (Activo / Archivado). Abaixo, a lista de arquivados em ordem alfabética **[decisão do construtor]**, cada um com botão **Reativar**. Tocar num paciente abre a ficha com o histórico.
6. **Finanças** (`/financas`): ver seção 9.
7. **Fechamento de turno**: tela/modal de resumo — pacientes atendidos, total de entradas, total de saídas, saldo — com botão de confirmar.

Todas as rotas exceto capa e login exigem sessão.

## 7. Turno

- Um turno é o "dia de trabalho": tem hora de abertura e de fechamento.
- **[decisão do construtor]** Só um turno aberto por vez (garantido no banco).
- **[decisão do construtor]** Sem turno aberto não é possível iniciar/finalizar atendimento nem lançar saída; continua sendo possível buscar pacientes, ver históricos e ver turnos passados. Os botões bloqueados explicam o motivo e oferecem "Abrir turno".
- **[decisão do construtor]** O turno não fecha sozinho; se ficar aberto de um dia para o outro, a tela inicial mostra um aviso com a data de abertura.
- **[decisão do construtor]** Ao fechar com pacientes ainda ativos, o sistema avisa quantos são, mas permite fechar; eles continuam ativos e a entrada conta no turno em que o atendimento for finalizado.

## 8. Paciente e consultas

**Conceitos**
- **Paciente**: dados fixos — nome, data de nascimento, número de cédula.
- **Consulta**: uma visita — data, história clínica (texto longo), arquivos, valor cobrado, turno.
- **Status do paciente**: **Ativo** = tem uma consulta em andamento; **Arquivado** = não tem. Nada é excluído; não existe botão de excluir paciente ou consulta.

**Novo paciente**
- Botão Paciente abre o formulário: nome (obrigatório), data de nascimento, cédula, história clínica, arquivos, valor cobrado.
- **[decisão do construtor]** Se a cédula digitada já existir, o sistema avisa e oferece abrir o paciente existente em vez de duplicar.
- Arquivos: fotos ou documentos. No celular, o seletor permite tirar foto na hora. **[decisão do construtor]** Aceita imagens e PDF, até 10 MB cada, vários por consulta; miniaturas para imagens; dá para remover um anexo enquanto a consulta está em andamento.

**Salvar**
- **Guardar y salir**: grava tudo, finaliza a consulta, arquiva o paciente e volta à tela inicial. **[decisão do construtor]** O valor cobrado é obrigatório nesse momento (pode ser 0).
- **[decisão do construtor]** Sair da tela sem finalizar (botão Voltar) guarda o rascunho; o paciente fica **Ativo** e aparece numa pequena lista "Em atendimento" na tela inicial para ser retomado. É isso que dá sentido ao status Ativo.

**Reconsulta (reativar)**
- Reativar um arquivado abre a ficha com os dados fixos preenchidos (editáveis) e uma **consulta nova em branco**.
- Abaixo, as consultas anteriores da mais recente para a mais antiga, resumidas (data, primeiras linhas da história clínica, nº de arquivos, valor). Tocar numa abre o texto completo e os arquivos.
- Consultas finalizadas são **somente leitura**.
- Ao salvar, o paciente volta a Arquivado com mais uma consulta no histórico.

## 9. Finanças

- Mostra o turno aberto (ou, sem turno aberto, o último fechado **[decisão do construtor]**).
- **Entradas**: lista das consultas finalizadas no turno (paciente, hora, valor) e total — calculado automaticamente, nunca digitado aqui.
- **Saídas**: lista + formulário (descrição, valor) e total. **[decisão do construtor]** Uma saída pode ser editada ou removida enquanto o turno está aberto; depois de fechado, o turno é só leitura.
- **Saldo** = entradas − saídas.
- **[decisão do construtor]** Abaixo, "Turnos anteriores": lista com data, entradas, saídas e saldo de cada um; tocar abre o detalhe.
- **[decisão do construtor]** No celular, Entradas e Saídas são duas abas; no computador, duas colunas.

## 10. Dados (Supabase / Postgres)

Todas as tabelas têm `id uuid`, `user_id uuid` (dono, = `auth.uid()`), `created_at`.

- `shifts`: `opened_at`, `closed_at` (nulo = aberto). Índice único parcial em `user_id` onde `closed_at is null`.
- `patients`: `full_name`, `birth_date`, `cedula`. Índice único `(user_id, cedula)` quando a cédula não é nula; índice para busca por nome.
- `consultations`: `patient_id`, `shift_id` (turno em que foi finalizada; nulo enquanto rascunho), `clinical_history text`, `amount_pyg bigint`, `status` (`open` | `closed`), `started_at`, `closed_at`. No máximo uma consulta `open` por paciente (índice único parcial).
- `consultation_files`: `consultation_id`, `storage_path`, `file_name`, `mime_type`, `size_bytes`.
- `expenses`: `shift_id`, `description`, `amount_pyg bigint`.

Status do paciente é derivado: ativo se existe consulta `open`.

**Segurança**
- RLS ligado em todas as tabelas: cada linha só é lida/alterada por `user_id = auth.uid()`. Sem política de `delete` em `patients` e `consultations`.
- Regras no banco (não só na tela): consulta `closed` não pode ser alterada; despesas de turno fechado não podem ser alteradas.
- Storage: bucket **privado** `patient-files`, caminho `{user_id}/{patient_id}/{consultation_id}/{arquivo}`, políticas pelo primeiro segmento; exibição por URLs assinadas de curta duração.
- Conta da médica criada manualmente no painel do Supabase; cadastro público desativado.
- Migrações SQL versionadas em `supabase/migrations/`.

## 11. Erros e estados

- Falha de rede ao salvar: mensagem clara e os dados digitados permanecem na tela; nada se perde em silêncio.
- Upload de arquivo mostra progresso e erro por arquivo.
- Sessão expirada: volta ao login e, depois de entrar, retorna para onde estava.
- Toda lista tem estado vazio com texto explicativo.

## 12. Fica a cargo do construtor

Estrutura de pastas, componentes, nomes internos, detalhes de estilo, biblioteca de formulários (ou nenhuma), forma exata do resumo de fechamento, paginação das listas.

## 13. Pendências do cliente

- Criar (ou autorizar a criação de) projeto no Supabase e no Cloudflare Pages e informar o e-mail de login da médica.
- Confirmar as decisões marcadas acima.
