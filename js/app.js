import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { config } from './config.js';

const $ = (id) => document.getElementById(id);
const show = (id, visible) => $(id).classList.toggle('hidden', !visible);
const labels = { pendente: 'A procurar', sim: 'Disponível no IPTV', nao: 'Não encontrado', quero: 'Quero assistir', assistindo: 'Assistindo', assistido: 'Assistido' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const validPoster = (path) => typeof path === 'string' && /^\/[\w/-]+\.(jpg|jpeg|png|webp)$/i.test(path);
const posterUrl = (path, size = 'w342') => `https://image.tmdb.org/t/p/${size}${path}`;
const message = (id, text) => { $(id).textContent = text; };
const errorText = (error) => error?.message || 'Ocorreu um erro. Tente novamente.';
function validUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }

let db;
let items = [];
let selectedTmdb = null;
let searchTimer = null;
let searchVersion = 0;
let searchResults = [];
let editPoster = null;
let posterModalVersion = 0;
let posterModalTimer;
const rememberKey = 'nossa-lista-remember';
const authStorage = {
  getItem(key) { return localStorage.getItem(key) ?? sessionStorage.getItem(key); },
  setItem(key, value) {
    if (localStorage.getItem(rememberKey) === 'false') {
      localStorage.removeItem(key);
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.removeItem(key);
      localStorage.setItem(key, value);
    }
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

function setPoster(result) {
  selectedTmdb = result && validPoster(result.poster_path) ? { id: result.id, poster_path: result.poster_path } : null;
  const preview = $('poster-preview');
  preview.replaceChildren();
  if (!selectedTmdb) { show('poster-preview', false); return; }
  const img = document.createElement('img');
  img.src = posterUrl(result.poster_path, 'w185');
  img.alt = `Capa de ${result.title}`;
  const text = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = result.title;
  const help = document.createElement('small');
  help.textContent = `${(result.release_date || '').slice(0, 4) || 'Ano desconhecido'} · Capa escolhida`;
  text.append(name, help);
  const change = document.createElement('button');
  change.type = 'button'; change.className = 'button ghost'; change.textContent = 'Trocar capa';
  change.addEventListener('click', () => { setPoster(null); show('tmdb-results', true); });
  preview.append(img, text, change);
  show('poster-preview', true);
}

function resetLookup() {
  clearTimeout(searchTimer);
  searchVersion += 1;
  setPoster(null);
  searchResults = [];
  $('tmdb-results').replaceChildren();
  show('tmdb-results', false);
  message('lookup-feedback', '');
}

function scheduleLookup() {
  resetLookup();
  const query = $('title').value.trim();
  if (query.length < 3) return;
  const version = searchVersion;
  const kind = $('kind').value;
  searchTimer = setTimeout(() => void lookupTmdb(query, kind, version), 650);
}

function renderResults(results, query) {
  const box = $('tmdb-results');
  box.replaceChildren();
  if (!results.length) {
    message('lookup-feedback', 'Nenhum resultado com capa. Você pode cadastrar só pelo nome.');
    show('tmdb-results', false);
    return;
  }
  const exact = results.filter((item) => normalize(item.title) === normalize(query));
  // Nomes repetidos não são decididos automaticamente: um filme de outro ano pode ter o mesmo nome.
  if (exact.length === 1) setPoster(exact[0]);
  message('lookup-feedback', exact.length === 1 ? 'Encontramos uma capa. Confira antes de salvar.' : 'Escolha a produção correta pela capa e pelo ano.');
  for (const result of results) {
    const option = document.createElement('button');
    option.type = 'button'; option.className = 'tmdb-option';
    option.setAttribute('aria-label', `Selecionar ${result.title}, ${(result.release_date || '').slice(0, 4) || 'ano não informado'}`);
    const image = document.createElement('img');
    image.src = posterUrl(result.poster_path, 'w92'); image.alt = ''; image.loading = 'lazy';
    const desc = document.createElement('span'); desc.className = 'tmdb-meta';
    const title = document.createElement('strong'); title.className = 'tmdb-name'; title.textContent = result.title;
    const year = document.createElement('span'); year.className = 'tmdb-year'; year.textContent = (result.release_date || '').slice(0, 4) || 'Ano não informado';
    const synopsis = document.createElement('span'); synopsis.className = 'tmdb-overview'; synopsis.textContent = result.overview || 'Sinopse não disponível.';
    desc.append(title, year, synopsis);
    option.append(image, desc);
    option.addEventListener('click', () => {
      searchVersion += 1;
      $('title').value = result.title;
      setPoster(result);
      show('tmdb-results', false);
      message('lookup-feedback', 'Capa selecionada. Você já pode guardar a indicação.');
    });
    box.append(option);
  }
  show('tmdb-results', true);
}

async function lookupTmdb(query, kind, version) {
  message('lookup-feedback', 'Pesquisando capas...');
  try {
    const { data, error } = await db.functions.invoke('buscar-tmdb', { body: { query, kind } });
    if (version !== searchVersion) return;
    if (error) {
      const body = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null;
      throw new Error(body?.error || body?.message || error.message);
    }
    if (data?.error) throw new Error(data.error);
    if (!Array.isArray(data?.results)) throw new Error('Resposta inesperada da busca.');
    const unique = new Set();
    searchResults = data.results.filter((result) => {
      const key = `${result.id}-${result.title}`;
      if (!result.title || !validPoster(result.poster_path) || unique.has(key)) return false;
      unique.add(key); return true;
    });
    renderResults(searchResults, query);
  } catch (error) {
    if (version !== searchVersion) return;
    message('lookup-feedback', `Busca indisponível: ${errorText(error)}. Você pode cadastrar manualmente.`);
  }
}

async function load() {
  const { data, error } = await db.from('titles').select('*').order('created_at', { ascending: false });
  if (error) { message('list-feedback', `Não foi possível carregar: ${errorText(error)}`); return; }
  items = data ?? [];
  message('list-feedback', '');
  render();
}

function render() {
  $('count-all').textContent = items.length;
  $('count-found').textContent = items.filter((item) => item.availability === 'sim').length;
  $('count-watched').textContent = items.filter((item) => item.progress === 'assistido').length;
  const term = normalize($('search').value);
  const filter = $('filter').value;
  const visible = items.filter((item) => normalize(item.title).includes(term) &&
    (filter === 'todos' || (['pendente', 'sim', 'nao'].includes(filter) ? item.availability === filter : item.progress === filter)));
  const root = $('items'); root.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    empty.textContent = items.length ? 'Nenhum título corresponde aos filtros.' : 'Sua próxima indicação começa aqui. Adicione o primeiro título!';
    root.append(empty); return;
  }
  for (const item of visible) {
    const reel = validUrl(item.reel_url);
    const poster = validPoster(item.poster_path) ? `<img src="${posterUrl(item.poster_path)}" alt="Capa de ${escapeHtml(item.title)}" loading="lazy">` : '<span aria-hidden="true">🍿</span>';
    const card = document.createElement('article'); card.className = 'item';
    card.innerHTML = `<div class="poster">${poster}</div><div class="item-body"><p class="item-type">${item.kind === 'serie' ? 'Série' : 'Filme'}</p><h3>${escapeHtml(item.title)}</h3><div class="pills"><span class="pill ${item.availability === 'sim' ? 'ok' : ''}">${labels[item.availability] || 'A procurar'}</span><span class="pill">${labels[item.progress] || 'Quero assistir'}</span></div>${reel ? `<a class="reel-link" href="${escapeHtml(reel)}" target="_blank" rel="noopener noreferrer">Ver Reels ↗</a>` : ''}<button class="button secondary edit" type="button">Editar indicação</button></div>`;
    card.querySelector('.edit').addEventListener('click', () => openEdit(item.id));
    root.append(card);
  }
}

async function setAuth(session) {
  const logged = Boolean(session);
  show('auth', !logged); show('app', logged); show('logout', logged);
  if (logged) await load(); else { items = []; render(); }
}

async function submitAuth(event) {
  event.preventDefault();
  message('auth-feedback', 'Entrando...');
  localStorage.setItem(rememberKey, $('remember-login').checked ? 'true' : 'false');
  const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) { message('auth-feedback', errorText(error)); return; }
  $('password').value = '';
  message('auth-feedback', 'Login realizado.');
}

async function signup() {
  const email = $('email').value.trim(); const password = $('password').value;
  if (!email || password.length < 8) { message('auth-feedback', 'Informe e-mail e senha de pelo menos 8 caracteres.'); return; }
  const { error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  message('auth-feedback', error ? errorText(error) : 'Confira seu e-mail para confirmar o cadastro, se necessário.');
}

async function addItem(event) {
  event.preventDefault(); const title = $('title').value.trim();
  if (!title) return;
  $('add-button').disabled = true;
  const { error } = await db.from('titles').insert({ title, kind: $('kind').value,
    reel_url: $('reel').value.trim() || null, note: $('note').value.trim() || null,
    availability: $('availability').value, progress: $('progress').value,
    tmdb_id: selectedTmdb?.id || null, poster_path: selectedTmdb?.poster_path || null });
  $('add-button').disabled = false;
  if (error) { message('list-feedback', `Erro ao salvar: ${errorText(error)}`); return; }
  $('add-form').reset(); resetLookup(); await load();
  message('list-feedback', 'Indicação guardada na lista!');
}

function openEdit(id) {
  const item = items.find((entry) => entry.id === id); if (!item) return;
  $('edit-id').value = item.id; $('edit-title').value = item.title;
  $('edit-availability').value = item.availability; $('edit-progress').value = item.progress;
  $('edit-note').value = item.note || ''; $('edit-reel').value = item.reel_url || '';
  editPoster = { id: item.tmdb_id ?? null, poster_path: item.poster_path ?? null };
  renderEditPoster();
  $('edit-dialog').showModal();
}


function renderEditPoster() {
  const container = $('edit-poster-preview');
  container.replaceChildren();
  if (!editPoster || !validPoster(editPoster.poster_path)) {
    container.textContent = '🍿 Sem capa';
    return;
  }
  const img = document.createElement('img');
  img.src = posterUrl(editPoster.poster_path, 'w185');
  img.alt = 'Capa selecionada';
  container.append(img);
}

function openPosterDialog() {
  $('poster-search-input').value = $('edit-title').value.trim();
  $('poster-search-results').replaceChildren();
  $('poster-search-feedback').textContent = '';
  $('poster-dialog').showModal();
  schedulePosterSearch();
}

function schedulePosterSearch() {
  clearTimeout(posterModalTimer);
  const version = ++posterModalVersion;
  const query = $('poster-search-input').value.trim();
  if (query.length < 3) {
    $('poster-search-results').replaceChildren();
    $('poster-search-feedback').textContent = 'Digite pelo menos 3 letras.';
    return;
  }
  posterModalTimer = setTimeout(() => void searchEditPosters(query, version), 500);
}

async function searchEditPosters(query, version) {
  const results = $('poster-search-results');
  $('poster-search-feedback').textContent = 'Procurando capas...';
  try {
    const item = items.find((entry) => String(entry.id) === $('edit-id').value);
    const { data, error } = await db.functions.invoke('buscar-tmdb', {
      body: { query, kind: item?.kind || 'filme' }
    });
    if (version !== posterModalVersion || !$('poster-dialog').open) return;
    if (error) {
      const body = error.context instanceof Response
        ? await error.context.clone().json().catch(() => null)
        : null;
      throw new Error(body?.error || body?.message || error.message);
    }
    if (data?.error) throw new Error(data.error);
    if (!Array.isArray(data?.results)) throw new Error('Resposta inválida da busca.');
    results.replaceChildren();
    const valid = data.results.filter(result => result.title && validPoster(result.poster_path));
    $('poster-search-feedback').textContent = valid.length
      ? 'Escolha a capa correta pela imagem e pelo ano.'
      : 'Nenhum resultado com capa. Tente outro nome.';
    for (const result of valid) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tmdb-option';
      const image = document.createElement('img');
      image.src = posterUrl(result.poster_path, 'w92');
      image.alt = '';
      const description = document.createElement('span');
      description.className = 'tmdb-meta';
      const name = document.createElement('strong');
      name.textContent = result.title;
      const year = document.createElement('span');
      year.className = 'tmdb-year';
      year.textContent = (result.release_date || '').slice(0, 4) || 'Ano desconhecido';
      description.append(name, year);
      button.append(image, description);
      button.addEventListener('click', () => {
        editPoster = { id: result.id, poster_path: result.poster_path };
        renderEditPoster();
        closePosterDialog();
      });
      results.append(button);
    }
  } catch (error) {
    if (version !== posterModalVersion) return;
    $('poster-search-feedback').textContent = `Busca indisponível: ${errorText(error)}`;
  }
}

function closePosterDialog() {
  clearTimeout(posterModalTimer);
  posterModalVersion++;
  $('poster-dialog').close();
}

async function updateItem(event) {
  event.preventDefault();
  const { error } = await db.from('titles').update({ title: $('edit-title').value.trim(),
    availability: $('edit-availability').value, progress: $('edit-progress').value,
    note: $('edit-note').value.trim() || null, reel_url: $('edit-reel').value.trim() || null,
    tmdb_id: editPoster?.id ?? null, poster_path: editPoster?.poster_path ?? null }).eq('id', $('edit-id').value);
  if (error) { alert(`Não foi possível salvar: ${errorText(error)}`); return; }
  $('edit-dialog').close(); await load();
}

async function deleteItem() {
  if (!confirm('Excluir esta indicação para os dois?')) return;
  const { error } = await db.from('titles').delete().eq('id', $('edit-id').value);
  if (error) { alert(`Não foi possível excluir: ${errorText(error)}`); return; }
  $('edit-dialog').close(); await load();
}

function randomPick() {
  const available = items.filter((item) => item.availability === 'sim' && item.progress !== 'assistido');
  if (!available.length) { message('list-feedback', 'Marquem títulos disponíveis no IPTV para usar o sorteio.'); return; }
  const chosen = available[Math.floor(Math.random() * available.length)];
  message('list-feedback', `Sugestão para hoje: ${chosen.title}`);
}

async function init() {
  if (!config.supabaseUrl || !config.supabasePublishableKey) { show('setup', true); return; }
  db = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage } });
  $('remember-login').checked = localStorage.getItem(rememberKey) !== 'false';
  $('auth-form').addEventListener('submit', submitAuth);
  $('signup').addEventListener('click', signup);
  $('logout').addEventListener('click', async () => { await db.auth.signOut(); });
  $('add-form').addEventListener('submit', addItem);
  $('edit-form').addEventListener('submit', updateItem);
  $('delete-item').addEventListener('click', deleteItem);
  $('close-dialog').addEventListener('click', () => $('edit-dialog').close());
  $('edit-poster-button').addEventListener('click', openPosterDialog);
  $('close-poster-dialog').addEventListener('click', closePosterDialog);
  $('poster-search-input').addEventListener('input', schedulePosterSearch);
  $('poster-search-button').addEventListener('click', () => { clearTimeout(posterModalTimer); void searchEditPosters($('poster-search-input').value.trim(), ++posterModalVersion); });
  $('remove-poster').addEventListener('click', () => { editPoster = { id: null, poster_path: null }; renderEditPoster(); closePosterDialog(); });
  $('poster-dialog').addEventListener('close', () => { clearTimeout(posterModalTimer); posterModalVersion++; });
  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  $('random').addEventListener('click', randomPick);
  $('title').addEventListener('input', scheduleLookup);
  $('kind').addEventListener('change', scheduleLookup);
  $('tmdb-search').addEventListener('click', () => { clearTimeout(searchTimer); void lookupTmdb($('title').value.trim(), $('kind').value, ++searchVersion); });
  show('tmdb-credit', true);
  db.auth.onAuthStateChange((_event, session) => { setTimeout(() => void setAuth(session), 0); });
  const { data: { session } } = await db.auth.getSession();
  await setAuth(session);
}

init().catch((error) => { console.error(error); show('setup', true); $('setup').append(document.createTextNode(` Erro ao iniciar: ${errorText(error)}`)); });
