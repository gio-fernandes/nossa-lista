# Nossa Lista — Filmes & Séries

Aplicativo simples para guardar indicações que vocês encontram em Reels, pesquisar depois no IPTV e marcar o andamento. HTML, CSS e JavaScript puro; sem build ou Node.js.

## Funcionalidades

- Dois logins individuais e uma lista compartilhada.
- Cadastro manual de filmes/séries, link de Reels e observações.
- Marcação de disponibilidade no IPTV: a procurar, disponível, não encontrado.
- Progresso separado: quero assistir, assistindo, já assistimos.
- Pesquisa, filtros, editar, excluir, sorteio do que está disponível.
- Capas do TMDB opcionais; salvar manualmente sempre funciona.
- Compatível com celular e computador.

## 1. Preparar banco de dados

1. Crie um projeto em https://supabase.com/dashboard.
2. Abra **SQL Editor** > **New query** e execute o conteúdo de `supabase/schema.sql`.
3. No SQL Editor, autorize **somente os dois e-mails** (substitua pelos reais):

```sql
insert into public.allowed_members (email)
values ('seu-email@exemplo.com'), ('email-do-marido@exemplo.com')
on conflict (email) do nothing;
```

**Importante:** não coloque os e-mails reais no repositório do GitHub. Execute esse comando apenas no SQL Editor. Você pode verificar os e-mails permitidos pelo Table Editor. Com as políticas de Row Level Security (RLS), logins não autorizados não têm acesso aos títulos. A criação de conta ainda pode ser solicitada por qualquer pessoa se o cadastro por e-mail estiver habilitado, mas isso não libera os dados. Para um projeto ainda mais fechado, crie os usuários pelo painel Auth e desative novos cadastros depois.

## 2. Configurar autenticação

1. No Supabase, abra **Authentication > Providers > Email**. Confira se Email está habilitado.
2. Recomenda-se manter confirmação por e-mail ativa.
3. Em **Authentication > URL Configuration**, ajuste **Site URL** e **Redirect URLs** para o endereço final do GitHub Pages (ex.: `https://seuusuario.github.io/nossa-lista/`). Se estiver testando localmente, adicione também `http://localhost:8000/` como Redirect URL.
4. Quando o aplicativo estiver publicado, use **Criar minha conta** para os dois e-mails autorizados e confirme o e-mail de cada um, se solicitado. Se o cadastro estiver desativado, crie os usuários no painel Auth.

## 3. Configurar JavaScript

No painel Supabase, procure **Project Settings / Connect** e copie:

- **Project URL**: `https://seu-projeto.supabase.co`
- **Publishable key** (ou chave pública `anon` em projetos antigos)

Preencha `js/config.js`:

```js
export const config = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabasePublishableKey: 'SUA_CHAVE_PUBLICA',
  tmdbApiKey: ''
};
```

A URL e a chave **publishable/anon** são próprias para uso público no navegador, desde que RLS esteja ativa. **NUNCA** use `service_role`, secret API keys, senha do banco ou outros segredos no front-end ou no GitHub.

## 4. (Opcional) TMDB

Cadastre-se em https://www.themoviedb.org/ e solicite uma API Key em **Settings > API**. Informe a chave V3 em `tmdbApiKey` para habilitar o botão de buscar capas. O TMDB pede atribuição e possui condições de uso.

**Atenção:** em um app 100% estático, qualquer chave de API usada pelo JavaScript é visível a quem abrir o site. Por isso, **não use tokens privados**. Se o TMDB for usado, avalie os riscos/termos da chave V3. Para esconder totalmente a credencial, é necessário usar uma função intermediária (por exemplo uma Edge Function) em vez de chamar o TMDB diretamente. Deixe a chave vazia se preferir.

## 5. Publicar no GitHub Pages

1. Crie um repositório no GitHub chamado `nossa-lista`.
2. Envie o conteúdo desta pasta à **raiz** do repositório: `index.html`, `css/`, `js/`, `supabase/`, `README.md`.
3. No GitHub, vá a **Settings > Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch** → `main` → `/ (root)` → **Save**.
5. Depois da publicação, o link será semelhante a `https://seuusuario.github.io/nossa-lista/`.
6. Atualize as URLs em **Authentication > URL Configuration** no Supabase e compartilhe o link com seu marido.

**Nota:** o GitHub Pages normalmente exige que a publicação esteja habilitada para o repositório/plano correspondente. Em uma conta comum, usar um repositório público é a opção mais simples. O código é público, mas os registros do Supabase permanecem protegidos pelas políticas configuradas.

## 6. Testar localmente (opcional)

O `type="module"` exige acessar o projeto via HTTP, não abrindo `index.html` diretamente como arquivo. Se tiver Python instalado:

```bash
python -m http.server 8000
```

Acesse `http://localhost:8000` e configure a URL de redirecionamento no Supabase. Também é possível testar direto no GitHub Pages.

## Checklist de validação

1. Conta autorizada consegue fazer login.
2. Conta não autorizada não vê nem insere títulos.
3. Adicionar filme com nome e link de Reels.
4. Abrir no outro celular, entrar com o segundo e-mail e visualizar o título (recarregue a página).
5. Marcar encontrado no IPTV e assistido, editar e excluir.
6. Filtrar lista e sortear um título disponível não assistido.
7. Se configurar TMDB, pesquisar capa e salvar.

**Limitação do MVP:** a lista atualiza quando você entra ou recarrega a página, sem sincronização em tempo real. Isso é suficiente para começar. Não há verificação automática do catálogo do IPTV; vocês marcam manualmente.
