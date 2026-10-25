import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { config } from './config.js';

const $ = (id) => document.getElementById(id);
const show = (id, visible) => $(id).classList.toggle('hidden', !visible);
const availabilityNames = { pendente: 'A procurar', sim: 'No IPTV', nao: 'Não encontrado' };
const progressNames = { quero: 'Quero assistir', assistindo: 'Assistindo', assistido: 'Já assistimos' };
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const validUrl = (s) => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
let db;
let items = [];
let selectedTmdb = null;

function message(id, text) { $(id).textContent = text; }
function errorText(error) { return error?.message || 'Ocorreu um erro. Tente novamente.'; }

async function load() {
  const { data, error } = await db.from('titles').select('*').order('created_at', { ascending: false });
  if (error) { message('list-feedback', `Não foi possível carregar: ${errorText(error)}`); return; }
  message('list-feedback', '');
  items = data;
  render();
}

function render() {
  $('count-all').textContent = items.length;
  $('count-found').textContent = items.filter(x => x.availability === 'sim').length;
  $('count-watched').textContent = items.filter(x => x.progress === 'assistido').length;
  const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const filter = $('filter').value;
  const visible = items.filter(item => item.title.toLocaleLowerCase('pt-BR').includes(term) &&
    (filter === 'todos' || (['pendente', 'sim', 'nao'].includes(filter) ? item.availability === filter : item.progress === filter)));
  const container = $('items');
  container.replaceChildren();
  if (!visible.length) { container.innerHTML = '<div class="empty">Nenhum título por aqui. Que tal guardar a primeira indicação? ♥</div>'; return; }
  for (const item of visible) {
    const poster = item.poster_path && /^\/[\w/-]+\.(jpg|png|webp)$/i.test(item.poster_path)
      ? `<img alt="Capa de ${escapeHtml(item.title)}" loading="lazy" src="https://image.tmdb.org/t/p/w342${item.poster_path}">` : '✦';
    const reel = validUrl(item.reel_url);
    const card = document.createElement('article');
    card.className = 'item';
    card.innerHTML = `<div class="poster">${poster}</div><div class="item-body"><h3>${escapeHtml(item.title)}</h3><p>${item.kind === 'serie' ? 'Série' : 'Filme'}</p><div class="pills"><span class="pill ${item.availability === 'sim' ? 'ok' : ''}">${availabilityNames[item.availability]}</span><span class="pill">${progressNames[item.progress]}</span></div>${reel ? `<p><a href="${escapeHtml(reel)}" target="_blank" rel="noopener noreferrer">Ver indicação ↗</a></p>` : ''}<button class="button secondary edit" type="button">Editar</button></div>`;
    card.querySelector('.edit').addEventListener('click', () => openEdit(item.id));
    container.append(card);
  }
}

async function setAuth(session) {
  const logged = Boolean(session);
  show('auth', !logged);
  show('app', logged);
  show('logout', logged);
  if (logged) await load();
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  message('auth-feedback', 'Entrando...');
  const { error } = await db.auth.signInWithPassword({ email, password });
  message('auth-feedback', error ? errorText(error) : 'Login realizado.');
}

async function signup() {
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || password.length < 6) { message('auth-feedback', 'Preencha e-mail e senha de pelo menos 6 caracteres.'); return; }
  const { error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  message('auth-feedback', error ? errorText(error) : 'Conta solicitada. Confira seu e-mail para confirmar o cadastro, se necessário.');
}

async function addItem(event) {
  event.preventDefault();
  $('add-button').disabled = true;
  const { error } = await db.from('titles').insert({
    title: $('title').value.trim(), kind: $('kind').value, reel_url: $('reel').value.trim() || null,
    note: $('note').value.trim() || null, availability: 'pendente', progress: 'quero',
    tmdb_id: selectedTmdb?.id || null, poster_path: selectedTmdb?.poster_path || null
  });
  $('add-button').disabled = false;
  if (error) { message('list-feedback', `Erro ao salvar: ${errorText(error)}`); return; }
  $('add-form').reset();
  selectedTmdb = null;
  show('tmdb-results', false);
  await load();
  message('list-feedback', 'Indicação guardada! ♥');
}

function openEdit(id) {
  const item = items.find(x => x.id === id);
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
  const { error } = await db.from('titles').update({ title: $('edit-title').value.trim(), availability: $('edit-availability').value,
    progress: $('edit-progress').value, note: $('edit-note').value.trim() || null, reel_url: $('edit-reel').value.trim() || null }).eq('id', id);
  if (error) { alert(`Não foi possível salvar: ${errorText(error)}`); return; }
  $('edit-dialog').close();
  await load();
}

async function deleteItem() {
  if (!confirm('Excluir esta indicação para os dois?')) return;
  const { error } = await db.from('titles').delete().eq('id', $('edit-id').value);
  if (error) { alert(`Não foi possível excluir: ${errorText(error)}`); return; }
  $('edit-dialog').close();
  await load();
}

async function searchTmdb() {
  const title = $('title').value.trim();
  if (!title) { message('list-feedback', 'Digite um título antes de buscar no TMDB.'); return; }
  const endpoint = $('kind').value === 'serie' ? 'tv' : 'movie';
  const url = new URL(`https://api.themoviedb.org/3/search/${endpoint}`);
  url.search = new URLSearchParams({ api_key: config.tmdbApiKey, query: title, language: 'pt-BR', include_adult: 'false' });
  const results = $('tmdb-results');
  results.replaceChildren();
  show('tmdb-results', true);
  results.textContent = 'Buscando...';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB respondeu ${response.status}`);
    const data = await response.json();
    results.replaceChildren();
    for (const result of data.results.slice(0, 5)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tmdb-option';
      const titleText = result.title || result.name;
      const year = (result.release_date || result.first_air_date || '').slice(0, 4);
      if (result.poster_path) {
        const img = document.createElement('img');
        img.src = `https://image.tmdb.org/t/p/w92${result.poster_path}`;
        img.alt = '';
        button.append(img);
      }
      const label = document.createElement('span');
      label.textContent = `${titleText}${year ? ` (${year})` : ''}`;
      button.append(label);
      button.addEventListener('click', () => { selectedTmdb = { id: result.id, poster_path: result.poster_path }; $('title').value = titleText; show('tmdb-results', false); });
      results.append(button);
    }
    if (!data.results.length) results.textContent = 'Não encontramos resultados. Você pode salvar manualmente.';
  } catch (error) { results.textContent = `Busca indisponível: ${errorText(error)}. Você pode salvar manualmente.`; }
}

function randomPick() {
  const eligible = items.filter(x => x.availability === 'sim' && x.progress !== 'assistido');
  if (!eligible.length) { message('list-feedback', 'Marquem filmes disponíveis no IPTV para poder sortear.'); return; }
  const choice = eligible[Math.floor(Math.random() * eligible.length)];
  message('list-feedback', `Que tal assistir: ${choice.title}? ♥`);
}

async function init() {
  if (!config.supabaseUrl || !config.supabasePublishableKey) { show('setup', true); return; }
  db = createClient(config.supabaseUrl, config.supabasePublishableKey);
  $('auth-form').addEventListener('submit', submitAuth);
  $('signup').addEventListener('click', signup);
  $('logout').addEventListener('click', async () => { await db.auth.signOut(); });
  $('add-form').addEventListener('submit', addItem);
  $('edit-form').addEventListener('submit', updateItem);
  $('delete-item').addEventListener('click', deleteItem);
  $('close-dialog').addEventListener('click', () => $('edit-dialog').close());
  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  $('random').addEventListener('click', randomPick);
  $('title').addEventListener('input', () => { selectedTmdb = null; });
  $('kind').addEventListener('change', () => { selectedTmdb = null; });
  if (config.tmdbApiKey) { show('tmdb-search', true); show('tmdb-credit', true); $('tmdb-search').addEventListener('click', searchTmdb); }
  db.auth.onAuthStateChange((_event, session) => { void setAuth(session); });
  const { data: { session } } = await db.auth.getSession();
  await setAuth(session);
}

init().catch(error => { show('setup', true); $('setup').append(document.createTextNode(` Erro ao iniciar: ${errorText(error)}`)); });
