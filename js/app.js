
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { config } from './config.js';

const $ = (id) => document.getElementById(id);
const show = (id, visible) => $(id).classList.toggle('hidden', !visible);

const availabilityNames = {
  pendente: 'A procurar',
  sim: 'No IPTV',
  nao: 'Não encontrado'
};

const progressNames = {
  quero: 'Quero assistir',
  assistindo: 'Assistindo',
  assistido: 'Já assistimos'
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

function validUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function message(id, text) {
  $(id).textContent = text;
}

function errorText(error) {
  return error?.message || 'Ocorreu um erro. Tente novamente.';
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

let db;
let items = [];
let selectedTmdb = null;
let searchTimer;
let searchVersion = 0;

function clearPoster() {
  selectedTmdb = null;
  $('poster-preview').replaceChildren();
  show('poster-preview', false);
}

function displayPoster(result, automatic = false) {
  const preview = $('poster-preview');
  preview.replaceChildren();

  const image = document.createElement('img');
  image.src = `https://image.tmdb.org/t/p/w185${result.poster_path}`;
  image.alt = `Capa de ${result.title}`;
  image.loading = 'lazy';

  const details = document.createElement('div');

  const title = document.createElement('strong');
  title.textContent = result.title;

  const description = document.createElement('p');
  description.textContent = automatic
    ? '✓ Capa encontrada automaticamente'
    : '✓ Capa selecionada';

  details.append(title, description);
  preview.append(image, details);

  selectedTmdb = {
    id: result.id,
    poster_path: result.poster_path
  };

  show('poster-preview', true);
}

function resetSearch() {
  clearTimeout(searchTimer);
  searchVersion++;
  clearPoster();
  $('tmdb-results').replaceChildren();
  show('tmdb-results', false);
}

function scheduleTmdbSearch() {
  resetSearch();

  const title = $('title').value.trim();

  if (title.length < 3) return;

  const version = searchVersion;
  const kind = $('kind').value;

  searchTimer = setTimeout(() => {
    void searchTmdb(title, kind, version);
  }, 700);
}

async function searchTmdb(title, kind, version) {
  const results = $('tmdb-results');

  results.textContent = 'Procurando capa...';
  show('tmdb-results', true);

  try {
    const { data, error } = await db.functions.invoke('buscar-tmdb', {
      body: { query: title, kind }
    });

    if (version !== searchVersion) return;

    if (error) {
      let detail = error.message;

      if (error.context instanceof Response) {
        try {
          const body = await error.context.json();
          detail = body.error || body.message || detail;
        } catch {
          detail = `Erro HTTP ${error.context.status}`;
        }
      }

      throw new Error(detail);
    }

    if (data?.error) throw new Error(data.error);

    if (!Array.isArray(data?.results)) {
      throw new Error('Resposta inválida da API.');
    }

    results.replaceChildren();

    const matches = data.results.filter(
      (item) => item.title && item.poster_path
    );

    if (!matches.length) {
      results.textContent =
        'Nenhuma capa encontrada. Você pode cadastrar manualmente.';
      return;
    }

    const exactMatches = matches.filter(
      (item) => normalizeTitle(item.title) === normalizeTitle(title)
    );

    if (exactMatches.length === 1) {
      displayPoster(exactMatches[0], true);
      show('tmdb-results', false);
      return;
    }

    const hint = document.createElement('p');
    hint.textContent = 'Encontramos estas opções. Escolha a capa correta:';
    results.append(hint);

    for (const result of matches.slice(0, 5)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tmdb-option';

      const image = document.createElement('img');
      image.src = `https://image.tmdb.org/t/p/w92${result.poster_path}`;
      image.alt = `Capa de ${result.title}`;
      image.loading = 'lazy';

      const details = document.createElement('span');
      details.className = 'tmdb-meta';

      const name = document.createElement('span');
      name.className = 'tmdb-name';
      name.textContent = result.title;

      const year = document.createElement('span');
      year.className = 'tmdb-year';
      year.textContent =
        (result.release_date || '').slice(0, 4) || 'Ano não informado';

      const overview = document.createElement('span');
      overview.className = 'tmdb-overview';
      overview.textContent =
        result.overview || 'Sinopse não disponível.';

      details.append(name, year, overview);
      button.append(image, details);

      button.addEventListener('click', () => {
        clearTimeout(searchTimer);
        searchVersion++;

        $('title').value = result.title;
        displayPoster(result);

        results.replaceChildren();
        show('tmdb-results', false);
      });

      results.append(button);
    }
  } catch (error) {
    if (version !== searchVersion) return;

    console.error('Erro na busca TMDB:', error);
    results.textContent =
      `Busca indisponível: ${errorText(error)}. O cadastro manual continua disponível.`;
  }
}

async function load() {
  const { data, error } = await db
    .from('titles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    message('list-feedback', `Erro ao carregar: ${errorText(error)}`);
    return;
  }

  items = data || [];
  message('list-feedback', '');
  render();
}

function render() {
  $('count-all').textContent = items.length;
  $('count-found').textContent =
    items.filter((item) => item.availability === 'sim').length;
  $('count-watched').textContent =
    items.filter((item) => item.progress === 'assistido').length;

  const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const filter = $('filter').value;

  const visible = items.filter((item) => {
    const matchesTitle = item.title
      .toLocaleLowerCase('pt-BR')
      .includes(term);

    const matchesFilter =
      filter === 'todos' ||
      (['pendente', 'sim', 'nao'].includes(filter)
        ? item.availability === filter
        : item.progress === filter);

    return matchesTitle && matchesFilter;
  });

  const container = $('items');
  container.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nenhuma indicação encontrada.';
    container.append(empty);
    return;
  }

  for (const item of visible) {
    const poster =
      item.poster_path &&
      /^\/[\w/-]+\.(jpg|png|webp)$/i.test(item.poster_path)
        ? `<img src="https://image.tmdb.org/t/p/w342${item.poster_path}"
             alt="Capa de ${escapeHtml(item.title)}" loading="lazy">`
        : '🍿';

    const reel = validUrl(item.reel_url);

    const card = document.createElement('article');
    card.className = 'item';

    card.innerHTML = `
      <div class="poster">${poster}</div>
      <div class="item-body">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${item.kind === 'serie' ? 'Série' : 'Filme'}</p>
        <div class="pills">
          <span class="pill ${item.availability === 'sim' ? 'ok' : ''}">
            ${availabilityNames[item.availability] || 'A procurar'}
          </span>
          <span class="pill">
            ${progressNames[item.progress] || 'Quero assistir'}
          </span>
        </div>
        ${reel ? `
          <p>
            <a href="${escapeHtml(reel)}"
               target="_blank" rel="noopener noreferrer">
              Ver indicação ↗
            </a>
          </p>
        ` : ''}
        <button class="button secondary edit" type="button">
          Editar
        </button>
      </div>
    `;

    card.querySelector('.edit').addEventListener(
      'click',
      () => openEdit(item.id)
    );

    container.append(card);
  }
}

async function setAuth(session) {
  const logged = Boolean(session);

  show('auth', !logged);
  show('app', logged);
  show('logout', logged);

  if (logged) {
    await load();
  } else {
    items = [];
  }
}

async function submitAuth(event) {
  event.preventDefault();

  message('auth-feedback', 'Entrando...');

  const { error } = await db.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value
  });

  message(
    'auth-feedback',
    error ? errorText(error) : 'Login realizado.'
  );
}

async function signup() {
  const email = $('email').value.trim();
  const password = $('password').value;

  if (!email || password.length < 8) {
    message('auth-feedback', 'Informe e-mail e senha de pelo menos 8 caracteres.');
    return;
  }

  const { error } = await db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: location.origin + location.pathname
    }
  });

  message(
    'auth-feedback',
    error ? errorText(error) : 'Confira seu e-mail, se necessário.'
  );
}

async function addItem(event) {
  event.preventDefault();

  const title = $('title').value.trim();
  if (!title) return;

  $('add-button').disabled = true;

  const { error } = await db.from('titles').insert({
    title,
    kind: $('kind').value,
    reel_url: $('reel').value.trim() || null,
    note: $('note').value.trim() || null,
    availability: $('availability').value,
    progress: $('progress').value,
    tmdb_id: selectedTmdb?.id || null,
    poster_path: selectedTmdb?.poster_path || null
  });

  $('add-button').disabled = false;

  if (error) {
    message('list-feedback', `Erro ao salvar: ${errorText(error)}`);
    return;
  }

  $('add-form').reset();
  resetSearch();

  await load();
  message('list-feedback', 'Indicação salva com sucesso!');
}

function openEdit(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item) return;

  $('edit-id').value = item.id;
  $('edit-title').value = item.title;
  $('edit-availability').value = item.availability;
  $('edit-progress').value = item.progress;
  $('edit-note').value = item.note || '';
  $('edit-reel').value = item.reel_url || '';

  $('edit-dialog').showModal();
}

async function updateItem(event) {
  event.preventDefault();

  const { error } = await db
    .from('titles')
    .update({
      title: $('edit-title').value.trim(),
      availability: $('edit-availability').value,
      progress: $('edit-progress').value,
      note: $('edit-note').value.trim() || null,
      reel_url: $('edit-reel').value.trim() || null
    })
    .eq('id', $('edit-id').value);

  if (error) {
    alert(`Erro ao salvar: ${errorText(error)}`);
    return;
  }

  $('edit-dialog').close();
  await load();
}

async function deleteItem() {
  if (!confirm('Excluir esta indicação para os dois?')) return;

  const { error } = await db
    .from('titles')
    .delete()
    .eq('id', $('edit-id').value);

  if (error) {
    alert(`Erro ao excluir: ${errorText(error)}`);
    return;
  }

  $('edit-dialog').close();
  await load();
}

function randomPick() {
  const eligible = items.filter(
    (item) =>
      item.availability === 'sim' &&
      item.progress !== 'assistido'
  );

  if (!eligible.length) {
    message('list-feedback', 'Marquem filmes disponíveis no IPTV para sortear.');
    return;
  }

  const index = Math.floor(Math.random() * eligible.length);
  message('list-feedback', `Que tal assistir: ${eligible[index].title}?`);
}

async function init() {
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    show('setup', true);
    return;
  }

  db = createClient(
    config.supabaseUrl,
    config.supabasePublishableKey
  );

  const preview = document.createElement('div');
  preview.id = 'poster-preview';
  preview.className = 'poster-preview hidden';

  $('tmdb-results').before(preview);

  $('auth-form').addEventListener('submit', submitAuth);
  $('signup').addEventListener('click', signup);

  $('logout').addEventListener('click', async () => {
    await db.auth.signOut();
  });

  $('add-form').addEventListener('submit', addItem);
  $('edit-form').addEventListener('submit', updateItem);
  $('delete-item').addEventListener('click', deleteItem);

  $('close-dialog').addEventListener('click', () => {
    $('edit-dialog').close();
  });

  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  $('random').addEventListener('click', randomPick);

  $('title').addEventListener('input', scheduleTmdbSearch);
  $('kind').addEventListener('change', scheduleTmdbSearch);

  show('tmdb-search', false);
  show('tmdb-credit', true);

  db.auth.onAuthStateChange((_event, session) => {
    void setAuth(session);
  });

  const { data: { session } } = await db.auth.getSession();
  await setAuth(session);
}

init().catch((error) => {
  console.error('Erro ao iniciar Nossa Lista:', error);
  show('setup', true);

  $('setup').append(
    document.createTextNode(` Erro ao iniciar: ${errorText(error)}`)
  );
});
