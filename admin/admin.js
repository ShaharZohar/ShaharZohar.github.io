// ============================================================
// admin.js — admin panel logic
// ============================================================

import {
  auth, db,
  login, logout, onAuth,
  getAllArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  fetchGitHubRepos,
  getReposConfig,
  setRepoConfig,
  slugify,
  formatDate,
  timeAgo
} from '../js/firebase.js';

// ── STATE ────────────────────────────────────────────────────
let currentUser   = null;
let articles      = [];
let repos         = [];
let reposCfg      = { hidden: new Set(), pinned: new Set() };
let editingId     = null;
let quill         = null;
let activeSection = 'dashboard';

// ── BOOT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  onAuth(user => {
    currentUser = user;
    if (user) {
      showAdmin();
    } else {
      showLogin();
    }
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pw    = document.getElementById('login-pw').value;
    const btn   = document.getElementById('login-btn');
    const err   = document.getElementById('login-err');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';
    try {
      await login(email, pw);
    } catch (ex) {
      err.textContent = friendlyAuthError(ex.code);
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => logout());

  // Nav
  document.querySelectorAll('[data-section]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.section));
  });
});

// ── AUTH ────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-screen').style.display = 'none';
}

async function showAdmin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'flex';
  document.getElementById('admin-email').textContent = currentUser.email;
  await loadAll();
  navigateTo('dashboard');
  initQuill();
}

async function loadAll() {
  const [arts, gRepos, cfg] = await Promise.all([
    getAllArticles().catch(() => []),
    fetchGitHubRepos().catch(() => []),
    getReposConfig().catch(() => ({ hidden: new Set(), pinned: new Set() }))
  ]);
  articles = arts;
  repos    = gRepos;
  reposCfg = cfg;
}

// ── NAVIGATION ───────────────────────────────────────────────
function navigateTo(section) {
  activeSection = section;
  document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[data-section="' + section + '"]').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`section-${section}`);
  if (el) el.classList.add('active');

  switch (section) {
    case 'dashboard': renderDashboard(); break;
    case 'articles':  renderArticlesList(); break;
    case 'repos':     renderReposAdmin(); break;
    case 'editor':    openNewArticle(); break;
  }
}
window.navigateTo = navigateTo;

// ── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  const published = articles.filter(a => a.published).length;
  const drafts    = articles.filter(a => !a.published).length;
  const visible   = repos.filter(r => !reposCfg.hidden.has(r.name)).length;
  const hidden    = reposCfg.hidden.size;

  document.getElementById('dash-published').textContent = published;
  document.getElementById('dash-drafts').textContent    = drafts;
  document.getElementById('dash-repos').textContent     = visible;
  document.getElementById('dash-hidden').textContent    = hidden;

  // Recent articles
  const el = document.getElementById('dash-recent-articles');
  if (el) {
    el.innerHTML = articles.slice(0, 5).map(a => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:600;font-size:.88rem">${a.title}</div>
          <div style="font-family:var(--mono);font-size:.65rem;color:var(--text3);margin-top:.15rem">${formatDate(a.date)} · ${a.published ? '<span style="color:var(--accent)">Published</span>' : '<span style="color:var(--accent3)">Draft</span>'}</div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="editArticle('${a.id}')">Edit</button>
      </div>`).join('') || '<p style="color:var(--text3);font-size:.84rem">No articles yet.</p>';
  }
}

// ── ARTICLES LIST ────────────────────────────────────────────
function renderArticlesList() {
  const el = document.getElementById('articles-list');
  if (!el) return;
  if (!articles.length) {
    el.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text3);font-size:.84rem">No articles yet. Click "+ New Article" to create one.</div>';
    return;
  }
  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:.75rem 1rem;font-family:var(--mono);font-size:.68rem;color:var(--text3);font-weight:500;letter-spacing:.08em;text-transform:uppercase">Title</th>
          <th style="text-align:left;padding:.75rem 1rem;font-family:var(--mono);font-size:.68rem;color:var(--text3);font-weight:500;letter-spacing:.08em;text-transform:uppercase">Tags</th>
          <th style="text-align:left;padding:.75rem 1rem;font-family:var(--mono);font-size:.68rem;color:var(--text3);font-weight:500;letter-spacing:.08em;text-transform:uppercase">Date</th>
          <th style="text-align:left;padding:.75rem 1rem;font-family:var(--mono);font-size:.68rem;color:var(--text3);font-weight:500;letter-spacing:.08em;text-transform:uppercase">Status</th>
          <th style="text-align:right;padding:.75rem 1rem;font-family:var(--mono);font-size:.68rem;color:var(--text3);font-weight:500;letter-spacing:.08em;text-transform:uppercase">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${articles.map(a => `
          <tr style="border-bottom:1px solid var(--border);transition:background .1s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
            <td style="padding:.85rem 1rem;font-weight:600;font-size:.88rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.title}</td>
            <td style="padding:.85rem 1rem">${(a.tags||[]).slice(0,3).map(t=>`<span class="badge badge-gray">${t}</span>`).join(' ')}</td>
            <td style="padding:.85rem 1rem;font-family:var(--mono);font-size:.72rem;color:var(--text3)">${formatDate(a.date)}</td>
            <td style="padding:.85rem 1rem"><span class="badge ${a.published ? 'badge-green' : 'badge-orange'}">${a.published ? 'Published' : 'Draft'}</span></td>
            <td style="padding:.85rem 1rem;text-align:right">
              <div style="display:flex;gap:.4rem;justify-content:flex-end">
                <button class="btn btn-sm btn-ghost" onclick="editArticle('${a.id}')">Edit</button>
                <button class="btn btn-sm btn-ghost" onclick="togglePublish('${a.id}', ${a.published})">${a.published ? 'Unpublish' : 'Publish'}</button>
                <button class="btn btn-sm btn-danger" onclick="confirmDelete('${a.id}', '${a.title.replace(/'/g,"\\'")}')">Delete</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── ARTICLE EDITOR ───────────────────────────────────────────
function initQuill() {
  if (quill) return;
  quill = new Quill('#quill-editor', {
    theme: 'snow',
    placeholder: 'Start writing your article…',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ indent: '-1' }, { indent: '+1' }],
        ['link', 'image'],
        [{ color: [] }, { background: [] }],
        ['clean']
      ]
    }
  });
}

function openNewArticle() {
  editingId = null;
  document.getElementById('editor-title-input').textContent = 'New Article';
  document.getElementById('art-title-field').value   = '';
  document.getElementById('art-slug-field').value    = '';
  document.getElementById('art-excerpt-field').value = '';
  document.getElementById('art-tags-field').value    = '';
  document.getElementById('art-published').checked   = true;
  if (quill) quill.setContents([]);
  navigateToEditorSection();
}
window.openNewArticle = openNewArticle;

function navigateToEditorSection() {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-editor').classList.add('active');
  document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[data-section="editor"]').forEach(b => b.classList.add('active'));
}

window.editArticle = async function(id) {
  const art = articles.find(a => a.id === id);
  if (!art) return;
  editingId = id;
  document.getElementById('editor-title-input').textContent = 'Edit Article';
  document.getElementById('art-title-field').value   = art.title || '';
  document.getElementById('art-slug-field').value    = art.slug  || '';
  document.getElementById('art-excerpt-field').value = art.excerpt || '';
  document.getElementById('art-tags-field').value    = (art.tags || []).join(', ');
  document.getElementById('art-published').checked   = !!art.published;
  if (quill) quill.clipboard.dangerouslyPasteHTML(art.content || '');
  navigateToEditorSection();
};

// Auto-generate slug from title
document.getElementById('art-title-field')?.addEventListener('input', function() {
  const slugField = document.getElementById('art-slug-field');
  if (!editingId) slugField.value = slugify(this.value);
});

window.saveArticle = async function(publish) {
  const title   = document.getElementById('art-title-field').value.trim();
  const slug    = document.getElementById('art-slug-field').value.trim() || slugify(title);
  const excerpt = document.getElementById('art-excerpt-field').value.trim();
  const tagsRaw = document.getElementById('art-tags-field').value;
  const tags    = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
  const content = quill ? quill.root.innerHTML : '';
  const pub     = publish ?? document.getElementById('art-published').checked;

  if (!title) { toast('Please enter a title.', 'error'); return; }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const data = { title, slug, excerpt, tags, content, published: !!pub };
    if (editingId) {
      await updateArticle(editingId, data);
      toast('Article updated!', 'success');
    } else {
      await createArticle(data);
      toast('Article created!', 'success');
    }
    articles = await getAllArticles();
    renderArticlesList();
    navigateTo('articles');
  } catch (e) {
    toast('Error saving: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
};

window.togglePublish = async function(id, currentlyPublished) {
  try {
    await updateArticle(id, { published: !currentlyPublished });
    articles = await getAllArticles();
    renderArticlesList();
    renderDashboard();
    toast(currentlyPublished ? 'Article unpublished.' : 'Article published!', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
};

window.confirmDelete = function(id, title) {
  showModal(
    `Delete "${title}"?`,
    `<p style="color:var(--text2);font-size:.9rem;margin-bottom:1.5rem">This action cannot be undone.</p>
     <div style="display:flex;gap:.75rem;justify-content:flex-end">
       <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
       <button class="btn btn-danger" onclick="doDelete('${id}')">Delete</button>
     </div>`
  );
};

window.doDelete = async function(id) {
  closeModal();
  try {
    await deleteArticle(id);
    articles = articles.filter(a => a.id !== id);
    renderArticlesList();
    renderDashboard();
    toast('Article deleted.', 'info');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
};

// ── REPOS ADMIN ──────────────────────────────────────────────
function renderReposAdmin() {
  const el = document.getElementById('repos-list');
  if (!el) return;
  if (!repos.length) {
    el.innerHTML = '<p style="color:var(--text3);font-size:.84rem;text-align:center;padding:2rem">No repositories found. Check your GitHub username in firebase.js.</p>';
    return;
  }
  el.innerHTML = `
    <div style="display:grid;gap:.75rem">
      ${repos.map(r => {
        const isHidden = reposCfg.hidden.has(r.name);
        const isPinned = reposCfg.pinned.has(r.name);
        return `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:1rem;display:flex;align-items:center;gap:1rem;${isHidden?'opacity:.5':''}">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.2rem">
                <span style="font-weight:700;font-size:.9rem">${r.name}</span>
                ${isPinned ? '<span class="badge badge-purple">Pinned</span>' : ''}
                ${isHidden ? '<span class="badge badge-red">Hidden</span>' : ''}
                ${r.language ? `<span class="badge badge-gray">${r.language}</span>` : ''}
              </div>
              <div style="font-size:.78rem;color:var(--text3)">${r.description || 'No description'}</div>
              <div style="font-family:var(--mono);font-size:.62rem;color:var(--text3);margin-top:.25rem">⭐ ${r.stargazers_count} · Updated ${timeAgo({ toDate: () => new Date(r.updated_at) })}</div>
            </div>
            <div style="display:flex;gap:.4rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
              <button class="btn btn-sm ${isPinned ? 'btn-primary':'btn-ghost'}" onclick="togglePin('${r.name}', ${isPinned})">
                ${isPinned ? '📌 Pinned' : '📌 Pin'}
              </button>
              <button class="btn btn-sm ${isHidden ? 'btn-danger':'btn-ghost'}" onclick="toggleHide('${r.name}', ${isHidden})">
                ${isHidden ? '👁 Show' : '🙈 Hide'}
              </button>
              <a href="${r.html_url}" target="_blank" class="btn btn-sm btn-ghost">GitHub ↗</a>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

window.toggleHide = async function(name, currentlyHidden) {
  try {
    await setRepoConfig(name, { repoName: name, hidden: !currentlyHidden });
    if (!currentlyHidden) reposCfg.hidden.add(name);
    else reposCfg.hidden.delete(name);
    renderReposAdmin();
    renderDashboard();
    toast(currentlyHidden ? `${name} is now visible.` : `${name} is now hidden.`, 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
};

window.togglePin = async function(name, currentlyPinned) {
  try {
    await setRepoConfig(name, { repoName: name, pinned: !currentlyPinned });
    if (!currentlyPinned) reposCfg.pinned.add(name);
    else reposCfg.pinned.delete(name);
    renderReposAdmin();
    toast(currentlyPinned ? `${name} unpinned.` : `${name} pinned!`, 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
};

window.refreshRepos = async function() {
  const btn = document.getElementById('refresh-repos-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Refreshing…'; }
  try {
    repos = await fetchGitHubRepos(true);
    renderReposAdmin();
    toast('Repositories refreshed!', 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
  finally { if(btn){ btn.disabled=false; btn.textContent='Refresh from GitHub'; } }
};

// ── UI HELPERS ───────────────────────────────────────────────
function showModal(title, body) {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  overlay.style.display = 'flex';
}
window.closeModal = function() {
  document.getElementById('modal-overlay').style.display = 'none';
};

function toast(msg, type = 'info') {
  const container = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':      'Invalid email address.',
    'auth/user-not-found':     'No account with that email.',
    'auth/wrong-password':     'Incorrect password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/too-many-requests':  'Too many attempts. Try again later.'
  };
  return map[code] || 'Login failed. Check your credentials.';
}
