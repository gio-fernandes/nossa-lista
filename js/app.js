
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { config } from './config.js';

const $ = (id) => document.getElementById(id);

const show = (id, visible) => {
  $(id).classList.toggle('hidden', !visible);
};

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
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);

const validUrl = (value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

let db;
let items = [];
let selectedTmdb = null;

function message(id, text) {
  $(id).textContent = text;
}

function errorText(error) {
  return error?.message || 'Ocorreu um erro. Tente novamente.';
}

async function load() {
  const { data, error } = await db
    .from('titles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    message('list-feedback', `Não foi possível carregar: ${errorText(error)}`);
    return;
  }

  message('list-feedback', '');
  items = data;
  render();
}

function render() {
  $('count-all').textContent = items.length;

  $('count-found').textContent = items.filter(
    (item) => item.availability === 'sim'
  ).length;

  $('count-watched').textContent = items.filter(
    (item) => item.progress === 'assistido'
  ).length;

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
    container.innerHTML = `
      <div class="empty">
        Nenhum título por aqui. Que tal guardar a primeira indicação? ♥
      </div>
    `;
    return;
  }

  for (const item of visible) {
    const poster = item.poster_path &&
      /^\/[\w/-]+\.(jpg|png|webp)$/i.test(item.poster_path)
      ? `<img
          alt="Capa de ${escapeHtml(item.title)}"
          loading="lazy"
          src="https://image.tmdb.org/t/p/w342${item.poster_path}"
        >`
      : '✦';

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

        ${reel
          ? `<p>
               <a href="${escapeHtml(reel)}"
                  target="_blank"
                  rel="noopener noreferrer">
                 Ver indicação ↗
               </a>
             </p>`
          : ''
        }

        <button class="button secondary edit" type="button">
          Editar
        </button>
      </div>
    `;

    card.querySelector('.edit').addEventListener('click', () => {
      openEdit(item.id);
    });

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

  const email = $('email').value.trim();
  const password = $('password').value;

  message('auth-feedback', 'Entrando...');

  const { error } = await db.auth.signInWithPassword({
    email,
    password
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
    message(
      'auth-feedback',
      'Preencha e-mail e senha de pelo menos 8 caracteres.'
    );
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
    error
      ? errorText(error)
      : 'Conta solicitada. Confira seu e-mail, se necessário.'
  );
}

async function addItem(event) {
  event.preventDefault();

  $('add-button').disabled = true;

  const { error } = await db.from('titles').insert({
    title: $('title').value.trim(),
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
  selectedTmdb = null;

  show('tmdb-results', false);

  await load();
  message('list-feedback', 'Indicação guardada! ♥');
}

function openEdit(id) {
  const item = items.find((title) => title.id === id);

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

  const id = $('edit-id').value;

  const { error } = await db
    .from('titles')
    .update({
      title: $('edit-title').value.trim(),
      availability: $('edit-availability').value,
      progress: $('edit-progress').value,
      note: $('edit-note').value.trim() || null,
      reel_url: $('edit-reel').value.trim() || null
    })
    .eq('id', id);

  if (error) {
    alert(`Não foi possível salvar: ${errorText(error)}`);
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
    alert(`Não foi possível excluir: ${errorText(error)}`);
    return;
  }

  $('edit-dialog').close();
  await load();
}

async function searchTmdb() {
  const title = $('title').value.trim();

  if (!title) {
    message('list-feedback', 'Digite um título antes de pesquisar.');
    return;
  }

  const results = $('tmdb-results');

  results.replaceChildren();
  show('tmdb-results', true);

  results.textContent = 'Buscando filmes e séries...';

  try {
    const { data, error } = await db.functions.invoke('buscar-tmdb', {
      body: {
        query: title,
        kind: $('kind').value
      }
    });

    if (error) {
      throw new Error(error.message || 'Falha ao consultar o Supabase.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!Array.isArray(data?.results)) {
      throw new Error('Resposta inválida da API.');
    }

    results.replaceChildren();

    for (const result of data.results.slice(0, 5)) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'tmdb-option';

      const titleText = result.title;
      const year = (result.release_date || '').slice(0, 4);

      if (result.poster_path) {
        const image = document.createElement('img');

        image.src =
          `https://image.tmdb.org/t/p/w92${result.poster_path}`;

        image.alt = `Capa de ${titleText || 'filme'}`;
        image.loading = 'lazy';

        button.append(image);
      }

      const meta = document.createElement('span');
      meta.className = 'tmdb-meta';

      const name = document.createElement('span');
      name.className = 'tmdb-name';
      name.textContent = titleText || 'Título desconhecido';

      const yearElement = document.createElement('span');
      yearElement.className = 'tmdb-year';
      yearElement.textContent = year || 'Ano não informado';

      const overview = document.createElement('span');
      overview.className = 'tmdb-overview';
      overview.textContent =
        result.overview || 'Sinopse não disponível em português.';

      meta.append(name, yearElement, overview);
      button.append(meta);

      button.addEventListener('click', () => {
        selectedTmdb = {
          id: result.id,
          poster_path: result.poster_path
        };

        $('title').value = titleText;
        show('tmdb-results', false);
      });

      results.append(button);
    }

    if (!data.results.length) {
      results.textContent =
        'Nenhum resultado encontrado. Você pode cadastrar manualmente.';
    }
  } catch (error) {
    results.textContent =
      `Busca indisponível: ${errorText(error)}. ` +
      'Você ainda pode cadastrar manualmente.';
  }
}

function randomPick() {
  const eligible = items.filter(
    (item) =>
      item.availability === 'sim' &&
      item.progress !== 'assistido'
  );

  if (!eligible.length) {
    message(
      'list-feedback',
      'Marquem filmes disponíveis no IPTV para poder sortear.'
    );
    return;
  }

  const choice = eligible[Math.floor(Math.random() * eligible.length)];

  message(
    'list-feedback',
    `Que tal assistir: ${choice.title}? ♥`
  );
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

  $('title').addEventListener('input', () => {
    selectedTmdb = null;
  });

  $('kind').addEventListener('change', () => {
    selectedTmdb = null;
  });

  show('tmdb-search', true);
  show('tmdb-credit', true);

  $('tmdb-search').addEventListener('click', searchTmdb);

  db.auth.onAuthStateChange((_event, session) => {
    void setAuth(session);
  });

  const {
    data: { session }
  } = await db.auth.getSession();

  await setAuth(session);
}

init().catch((error) => {
  show('setup', true);

  $('setup').append(
    document.createTextNode(
      ` Erro ao iniciar: ${errorText(error)}`
    )
  );
});
