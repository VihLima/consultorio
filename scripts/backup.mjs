// Cópia completa do consultório: todas as tabelas (JSON) e todos os arquivos
// dos pacientes (fotos e PDFs), numa pasta com a data dentro de `backups/`.
//
// Uso:  npm run backup
//
// Precisa, no `.env.local`, de VITE_SUPABASE_URL (já existe) e de
// SUPABASE_SECRET_KEY — a chave "secret" / "service_role" do projeto. Ela lê
// tudo, ignorando as regras de segurança: NUNCA a escreva com o prefixo VITE_
// (iria para o site) e nunca a coloque no git.
//
// Enquanto a cópia não termina, a pasta tem um arquivo BACKUP-INCOMPLETO.txt;
// ele só é apagado quando tudo foi copiado e conferido.
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLES = [
  'shifts',
  'patients',
  'consultations',
  'consultation_files',
  'expenses',
  'payments',
  'appointments',
];
const BUCKET = 'patient-files';
const PAGE = 1000;
const INCOMPLETE_MARKER = 'BACKUP-INCOMPLETO.txt';

async function readEnvFile(name) {
  let text;
  try {
    text = await readFile(path.join(ROOT, name), 'utf8');
  } catch {
    return {};
  }
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** 'service_role' for a key that bypasses RLS, 'anon' for the public one, null if unknown. */
function keyRole(key) {
  if (key.startsWith('sb_secret_')) return 'service_role';
  if (key.startsWith('sb_publishable_')) return 'anon';
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`\nERRO: ${message}`);
  process.exit(1);
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

async function fetchTable(supabase, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`tabela ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Every object of the bucket under `prefix`, as { path, size }. */
async function listObjects(supabase, prefix = '') {
  const found = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`listar arquivos em "${prefix}": ${error.message}`);
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) found.push(...(await listObjects(supabase, full)));
      else found.push({ path: full, size: entry.metadata?.size ?? null });
    }
    if (data.length < PAGE) return found;
  }
}

async function listUsers(supabase) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`listar usuários: ${error.message}`);
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at })));
    if (data.users.length < PAGE) return users;
  }
}

async function main() {
  const env = { ...(await readEnvFile('.env')), ...(await readEnvFile('.env.local')), ...process.env };
  const url = env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;

  if (env.VITE_SUPABASE_SECRET_KEY) {
    fail('existe VITE_SUPABASE_SECRET_KEY: com o prefixo VITE_ a chave secreta vai para o site. Renomeie para SUPABASE_SECRET_KEY.');
  }
  if (!url) fail('falta VITE_SUPABASE_URL no .env.local.');
  if (!key) {
    fail(
      'falta SUPABASE_SECRET_KEY no .env.local.\n' +
        'Copie a chave "secret" (sb_secret_...) em Supabase → Project Settings → API Keys\n' +
        'e adicione a linha  SUPABASE_SECRET_KEY=...  ao .env.local (sem o prefixo VITE_).',
    );
  }
  if (keyRole(key) !== 'service_role') {
    fail(
      'SUPABASE_SECRET_KEY não é a chave secreta (parece ser a pública/anon).\n' +
        'Com a chave pública o backup sairia vazio. Use a chave "secret" / "service_role".',
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const base = path.resolve(env.BACKUP_DIR || path.join(ROOT, 'backups'));
  // No rename at the end: on Windows any program watching the folder (a dev
  // server, an editor, the search indexer) makes renaming it fail. A marker
  // file says the copy is unfinished; it is removed only when all is done.
  const workDir = path.join(base, timestamp());
  const marker = path.join(workDir, INCOMPLETE_MARKER);
  const filesDir = path.join(workDir, 'arquivos');
  await mkdir(path.join(workDir, 'tabelas'), { recursive: true });
  await mkdir(filesDir, { recursive: true });
  await writeFile(
    marker,
    'Esta cópia NÃO terminou. Não confie nela; rode "npm run backup" de novo.\r\n',
  );

  const counts = {};
  let storedPaths = [];
  for (const table of TABLES) {
    const rows = await fetchTable(supabase, table);
    counts[table] = rows.length;
    if (table === 'consultation_files') storedPaths = rows.map((r) => r.storage_path);
    await writeFile(path.join(workDir, 'tabelas', `${table}.json`), JSON.stringify(rows, null, 2));
    console.log(`tabela ${table}: ${rows.length} linha(s)`);
  }

  const users = await listUsers(supabase);
  await writeFile(path.join(workDir, 'usuarios.json'), JSON.stringify(users, null, 2));

  const objects = await listObjects(supabase);
  let bytes = 0;
  for (const [index, object] of objects.entries()) {
    const target = path.resolve(filesDir, object.path);
    if (!target.startsWith(filesDir + path.sep)) {
      throw new Error(`caminho de arquivo inesperado: ${object.path}`);
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(object.path);
    if (error) throw new Error(`baixar ${object.path}: ${error.message}`);
    const content = Buffer.from(await data.arrayBuffer());
    if (object.size !== null && content.length !== object.size) {
      throw new Error(`${object.path}: baixou ${content.length} bytes, esperado ${object.size}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    bytes += content.length;
    console.log(`arquivo ${index + 1}/${objects.length}: ${object.path}`);
  }

  // Rows whose file is no longer in Storage: nothing to copy, but worth knowing.
  const copied = new Set(objects.map((o) => o.path));
  const missing = storedPaths.filter((p) => !copied.has(p));

  await writeFile(
    path.join(workDir, 'manifesto.json'),
    JSON.stringify(
      {
        criado_em: new Date().toISOString(),
        projeto: new URL(url).host,
        linhas_por_tabela: counts,
        usuarios: users.length,
        arquivos: objects.length,
        bytes_de_arquivos: bytes,
        arquivos_registrados_mas_ausentes: missing,
        observacao:
          'Para restaurar: rode as migrations de supabase/migrations e insira os JSON na ordem ' +
          'shifts, patients, consultations, consultation_files, expenses, payments, appointments. ' +
          'Em patients, omita cedula_norm e full_name_search (colunas geradas).',
      },
      null,
      2,
    ),
  );

  await unlink(marker);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\nBackup completo: ${total} linha(s), ${objects.length} arquivo(s), ${(bytes / 1048576).toFixed(1)} MB`);
  console.log(`Pasta: ${workDir}`);
  if (missing.length > 0) {
    console.warn(`AVISO: ${missing.length} arquivo(s) registrados no banco não existem mais no Storage (lista no manifesto.json).`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
