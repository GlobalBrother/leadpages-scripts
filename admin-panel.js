
let firebaseUrl = '';
let currentSite = '';
let currentSlug = '';
let contentData = {};
let _currentComponentsData = {}; // cache for the current slug's components

// ─── CONFIG (edit these two values) ──────────────────────────────────────
const FIREBASE_URL = 'https://content-manager-8da5c-default-rtdb.europe-west1.firebasedatabase.app';
const ADMIN_PASSWORD = '121212'; // ← schimbă cu parola ta
// ──────────────────────────────────────────────────────────────────────────

// ─── AUTH ─────────────────────────────────────────────────────────────────

const SESSION_KEY = 'cm_session_until';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 ore în ms

function initAuthUI() {
	const sessionUntil = localStorage.getItem(SESSION_KEY);
	if (sessionUntil && Date.now() < Number(sessionUntil)) {
		// Sesiune validă — intră direct
		firebaseUrl = FIREBASE_URL;
		document.getElementById('authOverlay').style.display = 'none';
		document.getElementById('appLayout').style.display = 'flex';
		document.getElementById('connectionStatus').style.display = 'flex';
		loadSites();
		_loadAiApiKeyFromFirebase();
		return;
	}
	// Sesiune expirată sau inexistentă
	localStorage.removeItem(SESSION_KEY);
	document.getElementById('authCardPassword').style.display = 'block';
	setTimeout(() => document.getElementById('adminPassword').focus(), 100);
}

function loginWithPassword() {
	const input = document.getElementById('adminPassword').value;
	const errorEl = document.getElementById('authPasswordError');
	errorEl.style.display = 'none';

	if (!input) return;

	if (input !== ADMIN_PASSWORD) {
		errorEl.style.display = 'block';
		document.getElementById('adminPassword').value = '';
		document.getElementById('adminPassword').focus();
		return;
	}

	// Salvează sesiunea pentru 24h
	localStorage.setItem(SESSION_KEY, Date.now() + SESSION_DURATION);

	firebaseUrl = FIREBASE_URL;
	document.getElementById('authOverlay').style.display = 'none';
	document.getElementById('appLayout').style.display = 'flex';
	document.getElementById('connectionStatus').style.display = 'flex';
	loadSites();
	_loadAiApiKeyFromFirebase();
}

function logout() {
	localStorage.removeItem(SESSION_KEY);
	firebaseUrl = '';
	currentSite = '';
	currentSlug = '';
	contentData = {};
	_aiApiKey    = '';
	_aiClaudeKey = '';
	_aiProvider  = 'gpt';
	document.getElementById('appLayout').style.display = 'none';
	document.getElementById('connectionStatus').style.display = 'none';
	document.getElementById('adminPassword').value = '';
	document.getElementById('authPasswordError').style.display = 'none';
	document.getElementById('authCardPassword').style.display = 'block';
	document.getElementById('authOverlay').style.display = 'flex';
	setTimeout(() => document.getElementById('adminPassword').focus(), 100);
}

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────

function firebaseKeyToHostname(key) {
	return key.replace(/_/g, '.');
}

function hostnameToFirebaseKey(hostname) {
	return hostname.replace(/\./g, '_');
}

async function loadSites() {
	try {
		const response = await fetch(`${firebaseUrl}/dynamic_content.json`);
		const data = await response.json();

		const siteSelect = document.getElementById('siteSelect');
		siteSelect.innerHTML = '<option value="">Select site...</option>';

		Object.keys(data || {}).forEach(firebaseKey => {
			const option = document.createElement('option');
			option.value = firebaseKey;
			option.textContent = firebaseKeyToHostname(firebaseKey);
			siteSelect.appendChild(option);
		});
	} catch (error) {
		showNotification('Error loading sites', 'error');
	}
}

async function loadSiteContent() {
	if (window.innerWidth <= 900) closeMobileSidebar();
	const site = document.getElementById('siteSelect').value;
	if (!site) return;
	currentSite = site;

	document.getElementById('breadcrumbSite').textContent = firebaseKeyToHostname(site);
	document.getElementById('breadcrumbSep').style.display = 'none';
	document.getElementById('breadcrumbSlug').style.display = 'none';
	document.getElementById('breadcrumbSystem').style.display = 'none';
	document.getElementById('editDeleteSlugBtn').style.display = 'none';
	document.getElementById('slugMetaBar').style.display = 'none';
	document.getElementById('archivedSection').style.display = 'none';

	try {
		showLoader(true);
		const response = await fetch(`${firebaseUrl}/dynamic_content/${site}.json`);
		const data = await response.json();
		contentData = data || {};

		const slugsSet = new Set();
		Object.keys(contentData).forEach(component => {
			Object.keys(contentData[component]).forEach(slug => {
				if (!slug.startsWith('_')) slugsSet.add(slug);
			});
		});
		// 'default' is always a valid slug (shows native LeadPages content)
		slugsSet.add('default');

		const slugSelect = document.getElementById('slugSelect');
		slugSelect.innerHTML = '<option value="">Select slug...</option>';
		Array.from(slugsSet).sort().forEach(slug => {
			const option = document.createElement('option');
			option.value = slug;
			option.textContent = slug;
			slugSelect.appendChild(option);
		});

		showLoader(false);
		document.getElementById('emptyState').style.display = 'flex';
		document.getElementById('contentGrid').innerHTML = '';
	} catch (error) {
		showLoader(false);
		showNotification('Error loading content', 'error');
	}
}

function loadSlugContent() {
	if (window.innerWidth <= 900) closeMobileSidebar();
	const slug = document.getElementById('slugSelect').value;
	if (!slug) return;
	currentSlug = slug;

	document.getElementById('breadcrumbSep').style.display = 'inline';
	document.getElementById('breadcrumbSlug').style.display = 'inline';
	document.getElementById('breadcrumbSlug').textContent = slug;
	document.getElementById('editDeleteSlugBtn').style.display = 'flex';

	// Show system badge if slug has a system mapping
	const systemBadge = document.getElementById('breadcrumbSystem');
	fetch(`${firebaseUrl}/config/slug_systems/${slug}.json`)
		.then(r => r.json())
		.then(systemKey => {
			if (systemKey) {
				// Fetch system label
				return fetch(`${firebaseUrl}/config/systems/${systemKey}.json`)
					.then(r => r.json())
					.then(label => {
						systemBadge.textContent = '🫁 ' + (label || systemKey);
						systemBadge.style.display = 'inline';
					});
			} else {
				systemBadge.style.display = 'none';
			}
		})
		.catch(() => { systemBadge.style.display = 'none'; });

	const componentsData = {};
	Object.keys(contentData).forEach(component => {
		if (contentData[component][slug]) {
			componentsData[component] = contentData[component][slug];
		}
	});

	renderContentGrid(componentsData);
	document.getElementById('emptyState').style.display = 'none';

	const count = Object.keys(componentsData).length;
	document.getElementById('slugMetaBar').style.display = 'flex';
	document.getElementById('metaBadgeSlug').textContent = slug;
	document.getElementById('metaBadgeSite').textContent = firebaseKeyToHostname(currentSite);
	document.getElementById('metaCount').textContent = `${count} component${count !== 1 ? 's' : ''}`;

	// Load archived components for this slug
	loadArchivedComponents(slug);
}

function getComponentIcon(name) {
	if (name.includes('title') || name.includes('titlu')) return '✏️';
	if (name.includes('video') || name.includes('vsl')) return '🎬';
	if (name.includes('image') || name.includes('img')) return '🖼️';
	if (name.includes('button') || name.includes('btn')) return '🔘';
	return '📄';
}

function isKnownComponent(name) {
	return (
		isBulletsComponent(name) ||
		isTestimonialsComponent(name) ||
		is2ColComponent(name) ||
		isTitleComponent(name) ||
		name.includes('video') || name.includes('vsl') ||
		name.includes('image') || name.includes('img') ||
		name.includes('button') || name.includes('btn')
	);
}

function getComponentTypeTag(name) {
	const n = name.toLowerCase();
	if (isBulletsComponent(name))      return { label: 'changing-bullets', type: 'known' };
	if (isTestimonialsComponent(name)) return { label: 'customer-reviews',  type: 'known' };
	if (is2ColComponent(name))         return { label: '2-col',             type: 'known' };
	if (isTitleComponent(name))        return { label: 'title',             type: 'known' };
	if (n.includes('video') || n.includes('vsl'))   return { label: 'video',  type: 'known' };
	if (n.includes('image') || n.includes('img'))   return { label: 'image',  type: 'known' };
	if (n.includes('button') || n.includes('btn'))  return { label: 'button', type: 'known' };
	return { label: 'custom component', type: 'custom' };
}

function renderContentGrid(componentsData) {
	_currentComponentsData = componentsData;
	const grid = document.getElementById('contentGrid');
	grid.innerHTML = '';

	const _lastComponents = ['changing-bullets', 'customer-reviews'];
	Object.keys(componentsData).sort((a, b) => {
		const aLast = _lastComponents.includes(a) ? 1 : 0;
		const bLast = _lastComponents.includes(b) ? 1 : 0;
		if (aLast !== bLast) return aLast - bLast;
		return a.localeCompare(b);
	}).forEach(component => {
		const content = componentsData[component];
		const card = buildPreviewCard(component, content);
		grid.appendChild(card);
	});
}

function buildPreviewCard(component, content) {
	const card = document.createElement('div');
	card.className = 'content-card';
	card.setAttribute('data-component', component);
	card.onclick = () => openComponentEditor(component);

	const icon = getComponentIcon(component);
	let previewHtml = '';

	if (isBulletsComponent(component)) {
		const data = parseBulletsHtml(content);
		const chips = data.bullets.slice(0, 4).map(b =>
			`<span class="card-preview-chip">${escapeHtml(b)}</span>`
		).join('');
		const more = data.bullets.length > 4
			? `<span class="card-preview-chip" style="color:var(--gold-dark);background:rgba(201,162,39,0.07);border-color:rgba(201,162,39,0.2);">+${data.bullets.length - 4} more</span>`
			: '';
		previewHtml = `
					<div class="card-preview-text">📝 ${escapeHtml(data.header || '—')}</div>
					<div class="card-preview-chips">${chips}${more}</div>`;
	} else if (is2ColComponent(component)) {
		let imgSrc = '', textPreview = '';
		try {
			const d = JSON.parse(content);
			imgSrc = d.image || '';
			textPreview = stripHtml(d.text || '');
		} catch (e) { textPreview = stripHtml(content); }
		previewHtml = `
					<div style="display:flex;gap:8px;align-items:flex-start;">
						${imgSrc ? `<img src="${escapeHtml(imgSrc)}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;flex-shrink:0;">` : '<div style="width:60px;height:45px;background:#eee;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;">🖼</div>'}
						<div class="card-preview-text" style="flex:1;">${escapeHtml(textPreview.slice(0, 80) || '(empty)')}</div>
					</div>`;
	} else if (isTestimonialsComponent(component)) {
		const parsed = parseTestimonialsHtml(content);
		const reviews = parsed.reviews;
		const chips = reviews.slice(0, 3).map(r =>
			`<span class="card-preview-chip">⭐ ${escapeHtml(r.name || 'Unnamed')}</span>`
		).join('');
		const more = reviews.length > 3
			? `<span class="card-preview-chip" style="color:var(--gold-dark);background:rgba(201,162,39,0.07);border-color:rgba(201,162,39,0.2);">+${reviews.length - 3} more</span>`
			: '';
		previewHtml = `
					<div class="card-preview-text">${reviews.length} review${reviews.length !== 1 ? 's' : ''} (showing first ${parsed.initialCount})</div>
					<div class="card-preview-chips">${chips}${more}</div>`;
	} else {
		const plain = stripHtml(content);
		previewHtml = `<div class="card-preview-text">${escapeHtml(plain || '(empty)')}</div>`;
	}

	const typeTag = getComponentTypeTag(component);
	card.innerHTML = `
				<div class="card-header">
					<span class="component-slug-badge">${escapeHtml(currentSlug)}</span>
					<div class="card-component-name">
						<div class="component-icon">${icon}</div>
						<span class="component-label">${escapeHtml(component)}</span>

					</div>
					<div class="component-type-tag component-type-tag--${typeTag.type}">${escapeHtml(typeTag.label)}</div>
				</div>
				<div class="card-preview-body">${previewHtml}</div>
				<div class="card-preview-edit-hint">✏️ Click to edit</div>
			`;
	return card;
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function stripHtml(html) {
	const tmp = document.createElement('div');
	tmp.innerHTML = html;
	return tmp.textContent || tmp.innerText || '';
}

// ─── COMPONENT EDITOR MODAL ───────────────────────────────────────────────

function openComponentEditor(component) {
	const content = _currentComponentsData[component];
	const modal = document.getElementById('componentEditorModal');
	const body = document.getElementById('compEditorBody');
	const footer = document.getElementById('compEditorFooter');

	document.getElementById('compEditorIcon').textContent = getComponentIcon(component);
	document.getElementById('compEditorTitle').textContent = component;
	document.getElementById('compEditorSlugBadge').textContent = currentSlug;

	body.innerHTML = '';
	footer.innerHTML = '';

	if (isBulletsComponent(component)) {
		const editorDiv = document.createElement('div');
		editorDiv.className = 'bullets-editor-inner';
		body.appendChild(editorDiv);
		renderBulletsEditorInto(editorDiv, component, content);
		footer.innerHTML = `
					<button class="btn-save-card" onclick="saveBulletsContent('${component}')">Save Bullets</button>
					<button class="btn-rename-card" onclick="renameComponent('${component}')">Rename</button>
					<button class="btn-archive-card" onclick="archiveComponent('${component}')" title="Archive — hides this component from the live site without deleting it">📦 Archive</button>
					<button class="btn-delete-card" onclick="deleteComponent('${component}')">Delete</button>`;
	} else if (is2ColComponent(component)) {
		const editorDiv = document.createElement('div');
		body.appendChild(editorDiv);
		render2ColEditorInto(editorDiv, component, content);
		footer.innerHTML = `
					<button class="btn-save-card" onclick="save2ColContent('${component}')">Save</button>
					<button class="btn-rename-card" onclick="renameComponent('${component}')">Rename</button>
					<button class="btn-archive-card" onclick="archiveComponent('${component}')" title="Archive">📦 Archive</button>
					<button class="btn-delete-card" onclick="deleteComponent('${component}')">Delete</button>`;
	} else if (isTestimonialsComponent(component)) {
		const editorDiv = document.createElement('div');
		editorDiv.className = 'testimonials-editor-inner';
		body.appendChild(editorDiv);
		renderTestimonialsEditorInto(editorDiv, component, content);
		footer.innerHTML = `
					<button class="btn-save-card" onclick="saveTestimonialsContent('${component}')">Save Reviews</button>
					<button class="btn-rename-card" onclick="renameComponent('${component}')">Rename</button>
					<button class="btn-archive-card" onclick="archiveComponent('${component}')" title="Archive — hides this component from the live site without deleting it">📦 Archive</button>
					<button class="btn-delete-card" onclick="deleteComponent('${component}')">Delete</button>`;
	} else if (isTitleComponent(component)) {
		const editorDiv = document.createElement('div');
		body.appendChild(editorDiv);
		renderMainTitleEditorInto(editorDiv, component, content);
		footer.innerHTML = `
					<button class="btn-save-card" onclick="saveMainTitleContent('${component}')">Save</button>
					<button class="btn-rename-card" onclick="renameComponent('${component}')">Rename</button>
					<button class="btn-archive-card" onclick="archiveComponent('${component}')" title="Archive — hides this component from the live site without deleting it">📦 Archive</button>
					<button class="btn-delete-card" onclick="deleteComponent('${component}')">Delete</button>`;
	} else {
		body.innerHTML = `
					<textarea id="content-${component}" rows="8" style="width:100%;padding:11px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Inter',monospace;resize:vertical;min-height:120px;color:var(--text-primary);background:#fafafa;transition:all 0.2s;line-height:1.6;box-sizing:border-box;">${escapeHtml(content)}</textarea>`;
		footer.innerHTML = `
					<button class="btn-save-card" onclick="saveContent('${component}')">Save</button>
					<button class="btn-preview-card" onclick="previewComponentContent('${component}')" title="Preview component HTML in a live iframe">👁 Preview</button>
					<button class="btn-rename-card" onclick="renameComponent('${component}')">Rename</button>
					<button class="btn-archive-card" onclick="archiveComponent('${component}')" title="Archive — hides this component from the live site without deleting it">📦 Archive</button>
					<button class="btn-delete-card" onclick="deleteComponent('${component}')">Delete</button>`;
	}

	modal.style.display = 'flex';
	document.addEventListener('keydown', _editorEscHandler);
}

function _editorEscHandler(e) {
	if (e.key === 'Escape') closeComponentEditor();
}

function closeComponentEditor() {
	document.getElementById('componentEditorModal').style.display = 'none';
	document.removeEventListener('keydown', _editorEscHandler);
	if (_titleSelectionHandler) {
		document.removeEventListener('selectionchange', _titleSelectionHandler);
		_titleSelectionHandler = null;
	}
	_savedTitleRange = null;
}

function previewComponentContent(component) {
	const code = document.getElementById(`content-${component}`)?.value || _currentComponentsData[component] || '';
	if (!code || !code.trim()) {
		showNotification('No content to preview', 'error');
		return;
	}

	const existing = document.getElementById('aiPreviewModal');
	if (existing) existing.remove();

	const modal = document.createElement('div');
	modal.id = 'aiPreviewModal';
	modal.style.cssText = `
		position:fixed; inset:0; z-index:99999;
		display:flex; align-items:center; justify-content:center;
		background:rgba(0,0,0,0.72); backdrop-filter:blur(4px);
		padding:20px; box-sizing:border-box;
	`;
	modal.innerHTML = `
		<div style="background:#ffffff; border-radius:16px; overflow:hidden; width:100%; max-width:960px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 32px 80px rgba(0,0,0,0.45); height:100%;">
			<div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:#0f0f17; border-bottom:1px solid #1e1e2e; flex-shrink:0;">
				<div style="display:flex; align-items:center; gap:10px;">
					<span style="font-size:16px;">👁</span>
					<span style="font-size:13px; font-weight:700; color:#e2e8f0;">Preview — ${escapeHtml(component)}</span>
				</div>
				<div style="display:flex; gap:8px; align-items:center;">
					<div style="display:flex; gap:4px; padding:3px 4px; background:#1e1e2e; border-radius:8px;">
						<button onclick="document.getElementById('aiPreviewFrame').style.width='100%'; document.getElementById('aiPreviewFrame').style.margin='0';"
							title="Desktop" style="padding:4px 10px; background:transparent; color:#94a3b8; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;"
							onmouseover="this.style.background='#313244'" onmouseout="this.style.background='transparent'">🖥 Desktop</button>
						<button onclick="document.getElementById('aiPreviewFrame').style.width='768px'; document.getElementById('aiPreviewFrame').style.margin='0 auto';"
							title="Tablet" style="padding:4px 10px; background:transparent; color:#94a3b8; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;"
							onmouseover="this.style.background='#313244'" onmouseout="this.style.background='transparent'">📱 Tablet</button>
						<button onclick="document.getElementById('aiPreviewFrame').style.width='390px'; document.getElementById('aiPreviewFrame').style.margin='0 auto';"
							title="Mobile" style="padding:4px 10px; background:transparent; color:#94a3b8; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;"
							onmouseover="this.style.background='#313244'" onmouseout="this.style.background='transparent'">📲 Mobile</button>
					</div>
					<button onclick="document.getElementById('aiPreviewModal').remove()"
						style="width:30px; height:30px; display:grid; place-items:center; background:#1e1e2e; color:#94a3b8; border:1px solid #313244; border-radius:8px; font-size:16px; cursor:pointer;">✕</button>
				</div>
			</div>
			<div style="flex:1; overflow:auto; background:#e5e7eb; padding:16px; display:flex; justify-content:center;">
				<iframe id="aiPreviewFrame"
					style="width:100%; height:100%; min-height:500px; border:none; border-radius:10px; background:#fff; box-shadow:0 4px 24px rgba(0,0,0,0.15); transition:width .25s ease; display:block;"
					sandbox="allow-scripts allow-same-origin"></iframe>
			</div>
		</div>
	`;
	document.body.appendChild(modal);

	modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
	const onKey = e => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onKey); } };
	document.addEventListener('keydown', onKey);

	const frame = document.getElementById('aiPreviewFrame');
	frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box} body{margin:0;font-family:system-ui,sans-serif;}</style></head><body>${code}</body></html>`;
}

function refreshPreviewCard(component) {
	const content = _currentComponentsData[component];
	const grid = document.getElementById('contentGrid');
	const old = grid.querySelector(`[data-component="${component}"]`);
	if (!old) return;
	const newCard = buildPreviewCard(component, content);
	grid.replaceChild(newCard, old);
}

// --- BULLETS EDITOR HELPERS ---

// Detect if a component name is a bullets-type component
function isBulletsComponent(name) {
	return name.toLowerCase() === 'changing-bullets';
}

function isTitleComponent(name) {
	const n = name.toLowerCase();
	return n.includes('title') || n.includes('titlu');
}

var _savedTitleRange = null;
var _titleSelectionHandler = null;

function renderMainTitleEditorInto(targetEl, component, content) {
	targetEl.innerHTML = `
				<div class="title-toolbar" id="titleToolbar">
					<label>🖥</label>
					<div class="stepper">
						<span>Desktop:</span>
						<button class="stepper-btn" onmousedown="event.preventDefault()" onclick="stepTitleFont('d',-0.1)">−</button>
						<button class="stepper-btn" onmousedown="event.preventDefault()" onclick="stepTitleFont('d',0.1)">+</button>

						<span class="stepper-val" id="titleFontDesktopVal">3.0</span>rem
					</div>
					<label style="margin-left:6px;">📱</label>
					<div class="stepper">
						<span>Mobile:</span>
						<button class="stepper-btn" onmousedown="event.preventDefault()" onclick="stepTitleFont('m',-0.1)">−</button>
						<button class="stepper-btn" onmousedown="event.preventDefault()" onclick="stepTitleFont('m',0.1)">+</button>

						<span class="stepper-val" id="titleFontMobileVal">1.5</span>rem
					</div>
					<div class="title-toolbar-sep"></div>
					<button class="toolbar-toggle-btn" id="titleBoldBtn" onmousedown="event.preventDefault()" onclick="toggleTitleFormat('bold')"><b>B</b></button>
					<button class="toolbar-toggle-btn" id="titleItalicBtn" onmousedown="event.preventDefault()" onclick="toggleTitleFormat('italic')"><i>I</i></button>
					<div class="title-toolbar-sep"></div>
					<label>↕</label>
					<div class="stepper">
						<button class="stepper-btn" onmousedown="event.preventDefault()" onclick="stepTitleLH(-0.1)">−</button>

						<button class="stepper-btn" onmousedown="event.preventDefault()" onclick="stepTitleLH(0.1)">+</button>
						<span class="stepper-val" id="titleLineHeightVal">1.2</span>
					</div>
					<div>
						<button class="toolbar-btn toolbar-apply" onmousedown="event.preventDefault()" onclick="applyTitleSpan()">Apply to selection</button>
						<button class="toolbar-btn toolbar-clear" onmousedown="event.preventDefault()" onclick="clearTitleSpan()">✕ Remove formatting</button>
					</div>
				</div>
				<div id="titleRichEditor" class="title-rich-editable" contenteditable="true" spellcheck="false"></div>
				<div style="margin-top:8px;font-size:11px;color:#9ca3af;">Select text → adjust sizes with −/+ → click Apply.</div>
			`;
	const editor = document.getElementById('titleRichEditor');
	editor.innerHTML = content || '';
	_normalizeTitleSpans(editor);
	// Init steppers from first formatted span already in content
	const _initSpan = editor.querySelector('span[style*="--fs-d"]');
	if (_initSpan) {
		const _fsd = _initSpan.style.getPropertyValue('--fs-d');
		const _fsm = _initSpan.style.getPropertyValue('--fs-m');
		const dEl = document.getElementById('titleFontDesktopVal');
		const mEl = document.getElementById('titleFontMobileVal');
		if (dEl && _fsd) dEl.textContent = parseFloat(_fsd).toFixed(1);
		if (mEl && _fsm) mEl.textContent = parseFloat(_fsm).toFixed(1);
		const _boldBtn = document.getElementById('titleBoldBtn');
		const _italicBtn = document.getElementById('titleItalicBtn');
		const _lhEl = document.getElementById('titleLineHeightVal');
		if (_boldBtn) _boldBtn.classList.toggle('active', _initSpan.style.fontWeight === 'bold' || _initSpan.style.fontWeight === '700');
		if (_italicBtn) _italicBtn.classList.toggle('active', _initSpan.style.fontStyle === 'italic');
		if (_lhEl && _initSpan.style.lineHeight) _lhEl.textContent = parseFloat(_initSpan.style.lineHeight).toFixed(1);
	}

	_savedTitleRange = null;
	if (_titleSelectionHandler) document.removeEventListener('selectionchange', _titleSelectionHandler);
	_titleSelectionHandler = function () {
		const sel = window.getSelection();
		const editor = document.getElementById('titleRichEditor');
		if (!editor || !sel || !sel.rangeCount) return;
		const r = sel.getRangeAt(0);
		if (!editor.contains(r.commonAncestorContainer)) return;
		if (!sel.isCollapsed) _savedTitleRange = r.cloneRange();
		// Update stepper values to reflect font-size of node at cursor
		let node = r.startContainer;
		if (node.nodeType === 3) node = node.parentNode;
		while (node && node !== editor) {
			const fsd = node.style && node.style.getPropertyValue('--fs-d');
			const fsm = node.style && node.style.getPropertyValue('--fs-m');
			if (fsd && fsm) {
				const dEl = document.getElementById('titleFontDesktopVal');
				const mEl = document.getElementById('titleFontMobileVal');
				const boldBtn = document.getElementById('titleBoldBtn');
				const italBtn = document.getElementById('titleItalicBtn');
				const lhEl = document.getElementById('titleLineHeightVal');
				if (dEl) dEl.textContent = parseFloat(fsd).toFixed(1);
				if (mEl) mEl.textContent = parseFloat(fsm).toFixed(1);
				if (boldBtn) boldBtn.classList.toggle('active', node.style.fontWeight === 'bold' || node.style.fontWeight === '700');
				if (italBtn) italBtn.classList.toggle('active', node.style.fontStyle === 'italic');
				if (lhEl && node.style.lineHeight) lhEl.textContent = parseFloat(node.style.lineHeight).toFixed(1);
				break;
			}
			node = node.parentNode;
		}
	};
	document.addEventListener('selectionchange', _titleSelectionHandler);

	// Prevent Enter from creating <div> blocks — insert <br> instead
	editor.addEventListener('keydown', function (e) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const s = window.getSelection();
		if (!s || !s.rangeCount) return;
		const r = s.getRangeAt(0);
		r.deleteContents();
		const br = document.createElement('br');
		r.insertNode(br);
		r.setStartAfter(br);
		r.collapse(true);
		s.removeAllRanges();
		s.addRange(r);
	});
}

function stepTitleFont(which, delta) {
	const id = which === 'd' ? 'titleFontDesktopVal' : 'titleFontMobileVal';
	const el = document.getElementById(id);
	if (!el) return;
	const val = Math.round((parseFloat(el.textContent) + delta) * 10) / 10;
	el.textContent = Math.max(0.5, Math.min(10, val)).toFixed(1);
}

function stepTitleLH(delta) {
	const el = document.getElementById('titleLineHeightVal');
	if (!el) return;
	const val = Math.round((parseFloat(el.textContent) + delta) * 10) / 10;
	el.textContent = Math.max(0.7, Math.min(3, val)).toFixed(1);
}

function toggleTitleFormat(which) {
	const btn = document.getElementById(which === 'bold' ? 'titleBoldBtn' : 'titleItalicBtn');
	if (btn) btn.classList.toggle('active');
}

function applyTitleSpan() {
	const desktop = parseFloat(document.getElementById('titleFontDesktopVal').textContent) || 3;
	const mobile = parseFloat(document.getElementById('titleFontMobileVal').textContent) || 1.5;
	const lh = parseFloat(document.getElementById('titleLineHeightVal')?.textContent) || 1.2;
	const isBold = document.getElementById('titleBoldBtn')?.classList.contains('active');
	const isItalic = document.getElementById('titleItalicBtn')?.classList.contains('active');
	const editor = document.getElementById('titleRichEditor');
	if (!editor) return;

	// onmousedown=preventDefault keeps the selection alive through the click.
	// Use the live selection directly; fall back to saved range if needed.
	const sel = window.getSelection();
	let range = null;
	if (sel && sel.rangeCount && !sel.isCollapsed) {
		const r = sel.getRangeAt(0);
		if (editor.contains(r.commonAncestorContainer)) range = r;
	}
	if (!range && _savedTitleRange) {
		editor.focus();
		sel.removeAllRanges();
		try { sel.addRange(_savedTitleRange); } catch (e) { }
		if (sel.rangeCount && !sel.isCollapsed) range = sel.getRangeAt(0);
	}
	if (!range) { showNotification('Select some text first', 'error'); return; }

	const _applyToSpan = function (s) {
		s.style.setProperty('--fs-d', desktop + 'rem');
		s.style.setProperty('--fs-m', mobile + 'rem');
		s.style.removeProperty('font-size');
		s.style.fontWeight = isBold ? 'bold' : '';
		s.style.fontStyle = isItalic ? 'italic' : '';
		s.style.lineHeight = lh;
	};

	// Always find leaf spans via intersectsNode — avoids relying on
	// commonAncestorContainer which can be the h2 when selection crosses a <br>
	const leafSpans = Array.from(editor.querySelectorAll('span'))
		.filter(s => _isTitleSpan(s) && range.intersectsNode(s) && !s.querySelector('span'));

	if (leafSpans.length === 0) {
		// No existing title-spans in selection — wrap in a new one
		const span = document.createElement('span');
		_applyToSpan(span);
		span.appendChild(range.extractContents());
		range.insertNode(span);
		range.setStartAfter(span);
		range.collapse(true);
		sel.removeAllRanges();
		sel.addRange(range);

	} else if (leafSpans.length > 1) {
		// Selection covers multiple spans — update each in-place
		leafSpans.forEach(_applyToSpan);

	} else {
		// Exactly one span intersects the selection
		const existingSpan = leafSpans[0];
		const spanRange = document.createRange();
		spanRange.selectNodeContents(existingSpan);
		const coversAll =
			range.compareBoundaryPoints(Range.START_TO_START, spanRange) <= 0 &&
			range.compareBoundaryPoints(Range.END_TO_END, spanRange) >= 0;

		if (coversAll) {
			// Selection covers the entire span — update in-place
			_applyToSpan(existingSpan);
		} else {
			// Partial selection inside a span — split into before / selected / after
			const oldStyle = existingSpan.getAttribute('style') || '';

			const beforeRange = document.createRange();
			beforeRange.setStart(existingSpan, 0);
			beforeRange.setEnd(range.startContainer, range.startOffset);
			const beforeFrag = beforeRange.cloneContents();

			const afterRange = document.createRange();
			afterRange.setStart(range.endContainer, range.endOffset);
			afterRange.setEnd(existingSpan, existingSpan.childNodes.length);
			const afterFrag = afterRange.cloneContents();

			const selectedFrag = range.cloneContents();

			const _hasContent = f => {
				if (!f.childNodes.length) return false;
				if (f.textContent.trim()) return true;
				return Array.from(f.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE);
			};
			const _buildSpan = (frag, applyNew) => {
				const s = document.createElement('span');
				if (applyNew) _applyToSpan(s); else s.setAttribute('style', oldStyle);
				s.appendChild(frag);
				return s;
			};

			const replacement = document.createDocumentFragment();
			if (_hasContent(beforeFrag)) replacement.appendChild(_buildSpan(beforeFrag, false));
			replacement.appendChild(_buildSpan(selectedFrag, true));
			if (_hasContent(afterFrag)) replacement.appendChild(_buildSpan(afterFrag, false));

			existingSpan.parentNode.replaceChild(replacement, existingSpan);
		}
	}

	_normalizeTitleSpans(editor);

	_savedTitleRange = null;
	showNotification('Formatting applied', 'success');
}

function _isTitleSpan(node) {
	if (!node || node.nodeType !== 1 || !node.style) return false;
	if (node.style.getPropertyValue('--fs-d') && node.style.getPropertyValue('--fs-m')) return true;
	return false;
}

function _unwrapNode(node) {
	const parent = node.parentNode;
	while (node.firstChild) parent.insertBefore(node.firstChild, node);
	parent.removeChild(node);
}

function _normalizeTitleSpans(editor) {
	// 1. Unwrap all <div> elements the browser may have inserted
	let div;
	while ((div = editor.querySelector('div'))) {
		// Replace div with a <br> + its children (mimic line-break)
		const parent = div.parentNode;
		const frag = document.createDocumentFragment();
		// Only prepend <br> if div is not the very first child
		if (div.previousSibling) frag.appendChild(document.createElement('br'));
		while (div.firstChild) frag.appendChild(div.firstChild);
		parent.replaceChild(frag, div);
	}
	// 2. Unwrap non-title spans (browser wrappers like font-size:48px)
	let stray;
	while ((stray = Array.from(editor.querySelectorAll('span')).find(s => !_isTitleSpan(s)))) {
		_unwrapNode(stray);
	}
	// 3. Unwrap title-spans that still nest other spans
	let outer;
	while ((outer = Array.from(editor.querySelectorAll('span')).find(
		s => _isTitleSpan(s) && s.querySelector('span')
	))) {
		_unwrapNode(outer);
	}
	// 4. Strip stray font-size from title-spans (browser adds it during editing)
	Array.from(editor.querySelectorAll('span')).forEach(s => {
		if (_isTitleSpan(s)) s.style.removeProperty('font-size');
	});
	// 5. Remove empty title-spans
	Array.from(editor.querySelectorAll('span')).forEach(s => {
		if (_isTitleSpan(s) && !s.textContent.trim()) s.remove();
	});
}

function clearTitleSpan() {
	const editor = document.getElementById('titleRichEditor');
	const sel = window.getSelection();
	if (sel && sel.rangeCount && !sel.isCollapsed) {
		// Unwrap the title-span containing the selection start
		let node = sel.getRangeAt(0).startContainer;
		if (node.nodeType === 3) node = node.parentNode;
		while (node && node !== editor) {
			if (_isTitleSpan(node)) { _unwrapNode(node); break; }
			node = node.parentNode;
		}
	} else {
		// Nothing selected — clear ALL title-spans
		Array.from(editor.querySelectorAll('span')).forEach(span => {
			if (_isTitleSpan(span)) _unwrapNode(span);
		});
	}
	sel && sel.removeAllRanges();
}

async function saveMainTitleContent(component) {
	const editor = document.getElementById('titleRichEditor');
	if (!editor) { showNotification('Editor not found', 'error'); return; }
	_normalizeTitleSpans(editor);
	// Normalize: &nbsp; between closing and opening spans is a line-break intent
	let content = editor.innerHTML.trim()
		.replace(/(<\/span>)\s*(?:&nbsp;|\u00a0)+\s*(<span)/gi, '$1<br>$2')
		.replace(/(<\/span>)\s*(?:&nbsp;|\u00a0)+\s*$/gi, '$1'); // trailing nbsp after last span
	try {
		const response = await fetch(
			`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) }
		);
		if (response.ok) {
			showNotification('Saved successfully!', 'success');
			if (!contentData[component]) contentData[component] = {};
			contentData[component][currentSlug] = content;
			_currentComponentsData[component] = content;
			refreshPreviewCard(component);
			closeComponentEditor();
		} else throw new Error('Save failed');
	} catch (error) {
		showNotification('Error saving content', 'error');
	}
}

// Parse existing HTML stored in Firebase → extract header + bullets array
function parseBulletsHtml(html) {
	const tmp = document.createElement('div');
	tmp.innerHTML = html;
	const headerEl = tmp.querySelector('.amish-header');
	const bulletEls = tmp.querySelectorAll('.amish-bullet');
	return {
		header: headerEl ? headerEl.textContent.trim() : '',
		bullets: Array.from(bulletEls).map(el => el.textContent.trim())
	};
}

// Build HTML string from header + bullets array (preserves full structure)
function buildBulletsHtml(header, bullets) {
	// Store ONLY the content HTML — no <style> or <script>
	// Those remain in the Leadpages page itself; we just swap the inner content
	const bulletsHtml = bullets.map(b => `\t\t<div class="amish-bullet">${b}</div>`).join('\n');
	return `<div class="amish-container">\n\t<div class="amish-header">${header}</div>\n\t<div id="amish-bullets">\n${bulletsHtml}\n\t</div>\n</div>`;
}

// Render the visual bullets editor card (used when editing existing component)
function renderBulletsEditorInto(targetEl, component, content) {
	const data = parseBulletsHtml(content);
	targetEl.innerHTML = `
				<div style="margin-bottom: 16px;">
					<label style="display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 6px;">
						📝 Header Text
					</label>
					<input type="text" id="bullets-header-input-${component}"
						value="${data.header.replace(/"/g, '&quot;')}"
						placeholder="e.g. You will soon learn:"
						style="width: 100%; padding: 10px 12px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
				</div>
				<div class="bullets-editor-section">
					<label style="display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 6px;">
						📌 Bullet Points
					</label>
					<div id="bullets-list-${component}"></div>
					<button onclick="addBulletRow('${component}')"
						style="width: 100%; padding: 9px; margin-top: 8px; background: #f3f4f6; border: 1.5px dashed #d1d5db; border-radius: 8px; font-size: 13px; font-weight: 600; color: #6b7280; cursor: pointer; transition: all 0.2s;">
						➕ Add Bullet Point
					</button>
				</div>
			`;
	const container = targetEl.querySelector(`#bullets-list-${component}`);
	data.bullets.forEach(bullet => addBulletRow(component, bullet));
}

function addBulletRow(component, value = '') {
	const container = document.getElementById(`bullets-list-${component}`);
	const row = document.createElement('div');
	row.className = 'bullet-row';
	row.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';
	row.innerHTML = `
				<input type="text"
					class="bullet-input"
					value="${value.replace(/"/g, '&quot;')}"
					placeholder="Enter bullet point..."
					style="flex: 1; padding: 9px 12px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-family: inherit;">
				<button onclick="this.closest('.bullet-row').remove()"
					style="padding: 9px 12px; background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 8px; color: #dc2626; cursor: pointer; font-size: 13px; font-weight: 600;">
					🗑
				</button>
			`;
	container.appendChild(row);
}

async function saveBulletsContent(component) {
	const header = document.getElementById(`bullets-header-input-${component}`).value.trim();
	if (!header) { showNotification('Please enter a header text', 'error'); return; }

	const container = document.getElementById(`bullets-list-${component}`);
	const bullets = Array.from(container.querySelectorAll('.bullet-input'))
		.map(i => i.value.trim())
		.filter(v => v !== '');

	if (bullets.length === 0) { showNotification('Please add at least one bullet point', 'error'); return; }

	const htmlContent = buildBulletsHtml(header, bullets);

	try {
		const response = await fetch(
			`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(htmlContent) }
		);
		if (response.ok) {
			showNotification('Bullets saved successfully!', 'success');
			if (!contentData[component]) contentData[component] = {};
			contentData[component][currentSlug] = htmlContent;
			_currentComponentsData[component] = htmlContent;
			refreshPreviewCard(component);
			closeComponentEditor();
		} else throw new Error('Save failed');
	} catch (error) {
		showNotification('Error saving bullets', 'error');
	}
}

// --- TESTIMONIALS EDITOR HELPERS ---

const DEFAULT_REVIEW_AVATAR = 'https://lh3.googleusercontent.com/zKmgb_LeFmmzOlBMAex59JNFoyq2fVE5W7OMJQGURFJqeJWLHzSk7xlXMVhYfSkBL2VTKJP7VaGMYee6e-n1gzUKqvPGYNFxy_E=s0';

function isTestimonialsComponent(name) {
	return name.toLowerCase() === 'customer-reviews';
}

function is2ColComponent(name) {
	return name.toLowerCase().includes('2col');
}

function render2ColEditorInto(targetEl, component, content) {
	let imgVal = '', textVal = '';
	try {
		const d = JSON.parse(content);
		imgVal = d.image || '';
		textVal = d.text || '';
	} catch (e) { }

	targetEl.innerHTML = `
				<div style="margin-bottom:14px;">
					<label style="display:block;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">🖼 Image URL</label>
					<input id="2col-img-${component}" type="text" placeholder="https://..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);background:#fafafa;box-sizing:border-box;">
				</div>
				<div>
					<label style="display:block;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">📝 Text (right column)</label>
					<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;padding:8px 10px;background:#f3f4f6;border-radius:8px;">
						<button class="toolbar-toggle-btn" id="2col-bold-btn" onmousedown="event.preventDefault()" onclick="_2colFormat('bold')"><b>B</b></button>
						<button class="toolbar-toggle-btn" id="2col-italic-btn" onmousedown="event.preventDefault()" onclick="_2colFormat('italic')"><i>I</i></button>
						<div style="display:flex;align-items:center;gap:4px;font-size:12px;">
							<span style="color:#6b7280;">Size:</span>
							<button class="stepper-btn" onmousedown="event.preventDefault()" onclick="_2colStepFont(-1)">−</button>
							<span id="2col-font-val" style="min-width:28px;text-align:center;font-weight:600;">16</span>rem
							<button class="stepper-btn" onmousedown="event.preventDefault()" onclick="_2colStepFont(1)">+</button>
						</div>
						<button class="toolbar-btn toolbar-apply" onmousedown="event.preventDefault()" onclick="_2colApplySpan()">Apply to selection</button>
						<button class="toolbar-btn toolbar-clear" onmousedown="event.preventDefault()" onclick="_2colClearSpan()">✕ Remove</button>
						<button class="toolbar-btn" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;" onmousedown="event.preventDefault()" onclick="_2colInsertParagraph()">+ Paragraph</button>
					</div>
					<div id="2col-text-${component}" class="title-rich-editable" contenteditable="true" spellcheck="false" style="min-height:140px;"></div>
					<div style="margin-top:6px;font-size:11px;color:#9ca3af;">Select text → adjust options → Apply. Use "+ Paragraph" to add un paragraf nou.</div>
				</div>
			`;

	document.getElementById('2col-img-' + component).value = imgVal;
	const textEditor = document.getElementById('2col-text-' + component);
	// Normalize loaded content: ensure all text is inside <p> tags
	const initTmp = document.createElement('div');
	initTmp.innerHTML = textVal || '<p>Text here...</p>';
	Array.from(initTmp.childNodes).forEach(function (node) {
		if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
			const p = document.createElement('p');
			initTmp.insertBefore(p, node);
			p.appendChild(node);
		}
	});
	textEditor.innerHTML = initTmp.innerHTML;

	window._2colCurrentComponent = component;
	window._2colSavedRange = null;
	document.addEventListener('selectionchange', _2colTrackSelection);

	// Force browser to use <p> as block separator (works reliably across Chrome/Firefox)
	textEditor.addEventListener('focus', function () {
		document.execCommand('defaultParagraphSeparator', false, 'p');
	});
}

function _2colTrackSelection() {
	const sel = window.getSelection();
	if (!sel || !sel.rangeCount) return;
	const comp = window._2colCurrentComponent;
	if (!comp) return;
	const editor = document.getElementById('2col-text-' + comp);
	if (!editor) return;
	const r = sel.getRangeAt(0);
	if (!editor.contains(r.commonAncestorContainer)) return;
	if (!sel.isCollapsed) window._2colSavedRange = r.cloneRange();
}

function _2colStepFont(delta) {
	const el = document.getElementById('2col-font-val');
	if (!el) return;
	let val = parseFloat(el.textContent) || 1.0;
	val = Math.round((val + delta) * 10) / 10;
	val = Math.max(0.5, Math.min(6.0, val));
	el.textContent = val.toFixed(1);
}

function _2colFormat(cmd) {
	const btn = document.getElementById('2col-' + cmd + '-btn');
	if (btn) btn.classList.toggle('active');
}

function _2colApplySpan() {
	const comp = window._2colCurrentComponent;
	if (!comp) return;
	const range = window._2colSavedRange;
	if (!range || range.collapsed) { alert('Select some text first.'); return; }

	const fontSize = document.getElementById('2col-font-val')?.textContent || '1.0';
	const isBold = document.getElementById('2col-bold-btn')?.classList.contains('active');
	const isItalic = document.getElementById('2col-italic-btn')?.classList.contains('active');

	const span = document.createElement('span');
	span.style.fontSize = fontSize + 'rem';
	if (isBold) span.style.fontWeight = 'bold';
	if (isItalic) span.style.fontStyle = 'italic';

	try {
		range.surroundContents(span);
	} catch (e) {
		const frag = range.extractContents();
		span.appendChild(frag);
		range.insertNode(span);
	}
	window.getSelection().removeAllRanges();
}

function _2colClearSpan() {
	const range = window._2colSavedRange;
	if (!range || range.collapsed) { alert('Select some text first.'); return; }
	const frag = range.extractContents();
	const text = document.createTextNode(frag.textContent);
	range.insertNode(text);
}

function _2colInsertParagraph() {
	const comp = window._2colCurrentComponent;
	if (!comp) return;
	const editor = document.getElementById('2col-text-' + comp);
	if (!editor) return;
	const p = document.createElement('p');
	p.innerHTML = 'New paragraph...';
	editor.appendChild(p);
}

async function save2ColContent(component) {
	const imgInput = document.getElementById('2col-img-' + component);
	const textEditor = document.getElementById('2col-text-' + component);
	if (!imgInput || !textEditor) return;

	// Normalize HTML with DOM: wrap loose text nodes in <p>, remove trailing empty <p>
	const tmp = document.createElement('div');
	tmp.innerHTML = textEditor.innerHTML;

	// Wrap direct child text nodes (bare text not inside any block) into <p>
	Array.from(tmp.childNodes).forEach(function (node) {
		if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
			const p = document.createElement('p');
			tmp.insertBefore(p, node);
			p.appendChild(node);
		}
	});

	// Remove trailing empty <p> tags (empty or containing only <br> variants)
	const allPs = Array.from(tmp.querySelectorAll('p'));
	for (let i = allPs.length - 1; i >= 0; i--) {
		const inner = allPs[i].innerHTML.replace(/<br[^>]*>/gi, '').trim();
		if (!inner) allPs[i].parentNode.removeChild(allPs[i]);
		else break;
	}

	const content = JSON.stringify({
		image: imgInput.value.trim(),
		text: tmp.innerHTML.trim()
	});

	const response = await fetch(
		`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
		{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) }
	);
	if (response.ok) {
		if (!contentData[component]) contentData[component] = {};
		contentData[component][currentSlug] = content;
		_currentComponentsData[component] = content;
		refreshPreviewCard(component);
		closeComponentEditor();
		document.removeEventListener('selectionchange', _2colTrackSelection);
	} else {
		alert('Save failed.');
	}
}

function parseTestimonialsHtml(html) {
	const tmp = document.createElement('div');
	tmp.innerHTML = html;
	const container = tmp.querySelector('.reviews-container');
	const initialCount = container ? (parseInt(container.getAttribute('data-initial')) || 5) : 5;
	const cards = tmp.querySelectorAll('.reviews-container .review-card, .review-card');
	return {
		initialCount,
		reviews: Array.from(cards).map(card => {
			const avatarEl = card.querySelector('.review-header img');
			const nameEl = card.querySelector('.review-header h4');
			const dateEl = card.querySelector('.review-date');
			const starsEl = card.querySelector('.stars');
			const bodyEl = card.querySelector('.review-body');
			const photoEls = card.querySelectorAll('.review-photo img');
			return {
				avatar: avatarEl ? (avatarEl.getAttribute('src') || '') : DEFAULT_REVIEW_AVATAR,
				name: nameEl ? nameEl.textContent.trim() : '',
				date: dateEl ? dateEl.textContent.trim() : '',
				stars: starsEl ? (starsEl.textContent.match(/★/g) || []).length : 5,
				body: bodyEl ? bodyEl.textContent.trim() : '',
				photos: Array.from(photoEls).map(img => img.getAttribute('src') || '')
			};
		})
	};
}

function buildTestimonialsHtml(reviews, initialCount) {
	if (!initialCount || initialCount < 1) initialCount = 5;
	const cardsHtml = reviews.map(r => {
		const starsStr = '★'.repeat(Math.max(0, Math.min(5, r.stars))) + '☆'.repeat(5 - Math.max(0, Math.min(5, r.stars)));
		const photosHtml = (r.photos || [])
			.filter(url => url.trim())
			.map(url => `\t\t<img src="${url}" alt="Review Image" onclick="_icdOpenModal(this)">`)
			.join('\n');
		return `<div class="review-card" style="display: block !important;">\n\t<div class="review-header">\n\t\t<img src="${r.avatar}" alt="Avatar">\n\t\t<div>\n\t\t\t<h4>${r.name}</h4>\n\t\t\t<p class="review-date">${r.date}</p>\n\t\t</div>\n\t</div>\n\t<div class="stars">${starsStr}</div>\n\t<div class="review-body">${r.body}</div>\n\t<div class="review-photo">\n${photosHtml}\n\t</div>\n</div>`;
	}).join('\n');
	const toggleBtn = reviews.length > initialCount
		? `\n<span class="toggle-reviews-btn toggle-btn" style="cursor:pointer;color:#007185;text-decoration:underline;font-size:1.2em;display:block;margin-top:10px;">View More Reviews</span>`
		: '';
	return `<div class="reviews-container" data-initial="${initialCount}" style="margin: 0 15px;">\n${cardsHtml}${toggleBtn}\n</div>`;
}

function renderTestimonialsEditorInto(targetEl, component, content) {
	const parsed = parseTestimonialsHtml(content);
	const reviews = parsed.reviews;
	const initialCount = parsed.initialCount;
	targetEl.innerHTML = `
				<div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; padding:10px 12px; background:#f9fafb; border:1.5px solid #e5e7eb; border-radius:8px;">
					<label style="font-size:12px; font-weight:700; color:#6b7280; white-space:nowrap;">Initial reviews shown:</label>
					<input type="number" id="reviews-initial-count-${component}" min="1" max="50" value="${initialCount}"
						style="width:70px; padding:6px 10px; border:1.5px solid #e5e7eb; border-radius:6px; font-size:13px; font-family:inherit;">
					<span style="font-size:12px; color:#9ca3af;">(remaining hidden behind "View More Reviews" button)</span>
				</div>
				<div id="reviews-list-${component}" class="reviews-editor-list"></div>
				<button onclick="addReviewBlock('${component}')"
					style="width:100%; padding:10px; margin-top:12px; background:#f3f4f6; border:1.5px dashed #d1d5db; border-radius:8px; font-size:13px; font-weight:600; color:#6b7280; cursor:pointer; transition:all 0.2s; font-family:inherit;">
					➕ Add Review
				</button>
			`;

	const container = targetEl.querySelector(`#reviews-list-${component}`);
	if (reviews.length > 0) {
		reviews.forEach(review => addReviewBlock(component, review));
	} else {
		addReviewBlock(component);
	}
}

function addReviewBlock(component, review = {}) {
	const container = document.getElementById(`reviews-list-${component}`);
	const index = container.children.length;
	const r = {
		avatar: review.avatar || DEFAULT_REVIEW_AVATAR,
		name: review.name || '',
		date: review.date || 'Reviewed in the United States on January 1, 2025',
		stars: review.stars !== undefined ? review.stars : 5,
		body: review.body || '',
		photos: review.photos || []
	};

	const block = document.createElement('div');
	block.className = 'review-editor-block';

	const starsHtml = [1, 2, 3, 4, 5].map(n =>
		`<span class="star-btn${n <= r.stars ? ' active' : ''}" data-val="${n}" onclick="setReviewStars(this)">★</span>`
	).join('');

	block.innerHTML = `
				<div class="review-editor-header">
					<span class="review-editor-index">Review #${index + 1}</span>
					<button class="review-remove-btn" onclick="this.closest('.review-editor-block').remove(); renumberReviews('${component}')">🗑 Remove</button>
				</div>
				<div class="review-editor-fields">
					<div class="review-field-row">
						<label>Avatar URL</label>
						<input class="review-field review-avatar-input" placeholder="https://..." />
					</div>
					<div class="review-field-row two-col">
						<div>
							<label>Reviewer Name</label>
							<input class="review-field review-name-input" placeholder="e.g. D.S." />
						</div>
						<div>
							<label>Star Rating</label>
							<div class="stars-selector" data-rating="${r.stars}">${starsHtml}</div>
						</div>
					</div>
					<div class="review-field-row">
						<label>Review Date</label>
						<input class="review-field review-date-field" placeholder="Reviewed in the United States on January 1, 2025" />
					</div>
					<div class="review-field-row">
						<label>Review Text</label>
						<textarea class="review-field review-body-field" rows="3" placeholder="Enter review text..."></textarea>
					</div>
					<div class="review-field-row">
						<label>Photo URLs</label>
						<div class="review-photos-list"></div>
						<button class="review-add-photo-btn" onclick="addReviewPhotoRow(this.previousElementSibling)">➕ Add Photo URL</button>
					</div>
				</div>
			`;
	container.appendChild(block);

	// Set values via JS to avoid HTML escaping issues
	block.querySelector('.review-avatar-input').value = r.avatar;
	block.querySelector('.review-name-input').value = r.name;
	block.querySelector('.review-date-field').value = r.date;
	block.querySelector('.review-body-field').value = r.body;

	// Add photo rows
	const photosList = block.querySelector('.review-photos-list');
	r.photos.forEach(url => addReviewPhotoRow(photosList, url));
}

function addReviewPhotoRow(photosList, url = '') {
	const row = document.createElement('div');
	row.className = 'review-photo-row';
	row.innerHTML = `
				<input class="review-field review-photo-url" placeholder="https://image-url.com/photo.jpg" />
				<button onclick="this.closest('.review-photo-row').remove()">🗑</button>
			`;
	row.querySelector('.review-photo-url').value = url;
	photosList.appendChild(row);
}

function setReviewStars(starEl) {
	const container = starEl.closest('.stars-selector');
	const val = parseInt(starEl.getAttribute('data-val'));
	container.setAttribute('data-rating', val);
	container.querySelectorAll('.star-btn').forEach(s => {
		s.classList.toggle('active', parseInt(s.getAttribute('data-val')) <= val);
	});
}

function renumberReviews(component) {
	const container = document.getElementById(`reviews-list-${component}`);
	Array.from(container.querySelectorAll('.review-editor-index')).forEach((el, i) => {
		el.textContent = `Review #${i + 1}`;
	});
}

async function saveTestimonialsContent(component) {
	const container = document.getElementById(`reviews-list-${component}`);
	const blocks = container.querySelectorAll('.review-editor-block');
	if (blocks.length === 0) {
		showNotification('Please add at least one review', 'error');
		return;
	}

	const reviews = Array.from(blocks).map(block => {
		const photos = Array.from(block.querySelectorAll('.review-photo-url'))
			.map(i => i.value.trim()).filter(v => v);
		return {
			avatar: block.querySelector('.review-avatar-input').value.trim() || DEFAULT_REVIEW_AVATAR,
			name: block.querySelector('.review-name-input').value.trim(),
			date: block.querySelector('.review-date-field').value.trim(),
			stars: parseInt(block.querySelector('.stars-selector').getAttribute('data-rating')) || 5,
			body: block.querySelector('.review-body-field').value.trim(),
			photos
		};
	});

	const initialCount = parseInt(document.getElementById(`reviews-initial-count-${component}`).value) || 5;
	const htmlContent = buildTestimonialsHtml(reviews, initialCount);
	try {
		const response = await fetch(
			`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(htmlContent) }
		);
		if (response.ok) {
			showNotification('Reviews saved successfully!', 'success');
			if (!contentData[component]) contentData[component] = {};
			contentData[component][currentSlug] = htmlContent;
			_currentComponentsData[component] = htmlContent;
			refreshPreviewCard(component);
			closeComponentEditor();
		} else throw new Error('Save failed');
	} catch (error) {
		showNotification('Error saving reviews', 'error');
	}
}

async function saveContent(component) {
	const content = document.getElementById(`content-${component}`).value;
	try {
		const response = await fetch(
			`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) }
		);
		if (response.ok) {
			showNotification('Saved successfully!', 'success');
			contentData[component][currentSlug] = content;
			_currentComponentsData[component] = content;
			refreshPreviewCard(component);
			closeComponentEditor();
		} else throw new Error('Save failed');
	} catch (error) {
		showNotification('Error saving content', 'error');
	}
}

async function deleteComponent(component) {
	if (!confirm(`Are you sure you want to delete slug "${currentSlug}" from component "${component}"?`)) return;
	try {
		const response = await fetch(
			`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'DELETE' }
		);
		if (response.ok) {
			showNotification('Deleted successfully!', 'success');
			delete contentData[component][currentSlug];

			// If this was the last real slug, keep the Firebase node alive with a placeholder
			// so the dashboard script still reveals the element (shows native LeadPages content)
			const realSlugs = Object.keys(contentData[component]).filter(k => !k.startsWith('_'));
			if (realSlugs.length === 0) {
				contentData[component]['_placeholder'] = true;
				await fetch(
					`${firebaseUrl}/dynamic_content/${currentSite}/${component}/_placeholder.json`,
					{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: 'true' }
				);
			}

			closeComponentEditor();
			loadSlugContent();
		} else throw new Error('Delete failed');
	} catch (error) {
		showNotification('Error deleting content', 'error');
	}
}

// ─── ARCHIVE / RESTORE ───────────────────────────────────────────────────────

async function archiveComponent(component) {
	if (!confirm(`Archive "${component}" for slug "${currentSlug}"?\n\nIt will be hidden from the live site until you restore it.`)) return;
	try {
		const content = contentData[component][currentSlug];

		// Write to archived node
		await fetch(`${firebaseUrl}/archived/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) });

		// Delete from dynamic_content
		await fetch(`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'DELETE' });

		// Update local cache
		delete contentData[component][currentSlug];
		delete _currentComponentsData[component];

		closeComponentEditor();
		showNotification(`"${component}" archived successfully!`, 'success');
		loadSlugContent();
	} catch (e) {
		showNotification('Error archiving component', 'error');
	}
}

async function restoreComponent(component) {
	try {
		const res = await fetch(`${firebaseUrl}/archived/${currentSite}/${component}/${currentSlug}.json`);
		const content = await res.json();
		if (content === null) { showNotification('Archived data not found', 'error'); return; }

		// Write back to dynamic_content
		await fetch(`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) });

		// Delete from archived
		await fetch(`${firebaseUrl}/archived/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'DELETE' });

		// Update local cache
		if (!contentData[component]) contentData[component] = {};
		contentData[component][currentSlug] = content;

		showNotification(`"${component}" restored successfully!`, 'success');
		loadSlugContent();
	} catch (e) {
		showNotification('Error restoring component', 'error');
	}
}

async function deleteArchivedComponent(component) {
	if (!confirm(`Permanently delete archived component "${component}"?\n\nThis cannot be undone.`)) return;
	try {
		await fetch(`${firebaseUrl}/archived/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'DELETE' });
		showNotification(`"${component}" permanently deleted.`, 'success');
		loadSlugContent();
	} catch (e) {
		showNotification('Error deleting archived component', 'error');
	}
}

async function loadArchivedComponents(slug) {
	const archivedSection = document.getElementById('archivedSection');
	const archivedGrid = document.getElementById('archivedGrid');
	const archivedCount = document.getElementById('archivedCount');
	archivedGrid.innerHTML = '';

	try {
		const res = await fetch(`${firebaseUrl}/archived/${currentSite}.json`);
		const allArchived = await res.json();
		if (!allArchived) { archivedSection.style.display = 'none'; return; }

		const components = Object.keys(allArchived).filter(comp =>
			allArchived[comp] && allArchived[comp][slug] !== undefined
		);

		if (components.length === 0) { archivedSection.style.display = 'none'; return; }

		archivedCount.textContent = components.length;
		archivedSection.style.display = 'block';

		components.forEach(component => {
			const content = allArchived[component][slug];
			const preview = typeof content === 'string'
				? escapeHtml(stripHtml(content).slice(0, 80) || '(no preview)') + (stripHtml(content).length > 80 ? '…' : '')
				: '(complex content)';
			const icon = getComponentIcon(component);

			const card = document.createElement('div');
			card.className = 'archived-card';
			card.innerHTML = `
						<div class="archived-card-header">
							<div style="display:flex; align-items:center; gap:8px;">
								<span>${icon}</span>
								<span style="font-size:14px; font-weight:700; color:var(--text-secondary);">${escapeHtml(component)}</span>
							</div>
							<span class="archived-badge">Archived</span>
						</div>
						<div class="archived-card-body">${preview}</div>
						<div class="archived-card-footer">
							<button class="btn-restore-card" onclick="restoreComponent('${component}')">↩ Restore</button>
							<button class="btn-delete-archived-card" onclick="deleteArchivedComponent('${component}')">🗑</button>
						</div>`;
			archivedGrid.appendChild(card);
		});
	} catch (e) {
		archivedSection.style.display = 'none';
	}
}

function toggleArchivedSection(header) {
	const grid = document.getElementById('archivedGrid');
	const isOpen = header.classList.toggle('open');
	grid.style.display = isOpen ? 'grid' : 'none';
}

// ─────────────────────────────────────────────────────────────────────────

function showAddComponentModal() {
	if (!currentSlug) { showNotification('Please select a slug first', 'error'); return; }
	// Reset modal to step 1
	document.getElementById('modalStep1').style.display = 'block';
	document.getElementById('modalStep2Simple').style.display = 'none';
	document.getElementById('modalStep2Bullets').style.display = 'none';
	document.getElementById('modalStep2Testimonials').style.display = 'none';
	document.getElementById('modalStep2TwoCol').style.display = 'none';
	document.getElementById('reviews-list-__modal__').innerHTML = '';
	document.getElementById('modalReviewsInitialCount').value = '5';
	document.getElementById('modalComponentName').value = '';
	document.getElementById('modalSimpleContent').value = '';
	document.getElementById('modalBulletsHeader').value = '';
	document.getElementById('modalBulletsList').innerHTML = '';
	// Add 3 empty bullet rows by default
	for (let i = 0; i < 3; i++) modalAddBulletRow();
	document.getElementById('addComponentModal').style.display = 'flex';
	setTimeout(() => document.getElementById('modalComponentName').focus(), 100);
}

function closeAddComponentModal() {
	document.getElementById('addComponentModal').style.display = 'none';
}

function modalBackToStep1() {
	document.getElementById('modalStep1').style.display = 'block';
	document.getElementById('modalStep2Simple').style.display = 'none';
	document.getElementById('modalStep2Bullets').style.display = 'none';
	document.getElementById('modalStep2Testimonials').style.display = 'none';
	document.getElementById('modalStep2TwoCol').style.display = 'none';
}

function modalSelectSpecial(name) {
	document.getElementById('modalComponentName').value = name;
	modalStep1Next();
}

function modalStep1Next() {
	const raw = document.getElementById('modalComponentName').value.trim();
	if (!raw) { showNotification('Please enter a component name', 'error'); return; }

	// Sanitize: lowercase, spaces/special chars → hyphens
	const name = raw.toLowerCase()
		.replace(/[^a-z0-9-_]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	if (!name) { showNotification('Invalid component name', 'error'); return; }

	// Update the input to show the sanitized value
	document.getElementById('modalComponentName').value = name;

	const isBullets = name === 'changing-bullets';
	const isTestimonials = isTestimonialsComponent(name);
	const is2Col = is2ColComponent(name);

	document.getElementById('modalStep1').style.display = 'none';

	if (isBullets) {
		document.getElementById('modalStep2BulletsCompName').textContent = name;
		document.getElementById('modalStep2Bullets').style.display = 'block';
		setTimeout(() => document.getElementById('modalBulletsHeader').focus(), 100);
	} else if (isTestimonials) {
		document.getElementById('reviews-list-__modal__').innerHTML = '';
		document.getElementById('modalReviewsInitialCount').value = 5;
		modalAddReviewBlock();
		document.getElementById('modalStep2Testimonials').style.display = 'block';
	} else if (is2Col) {
		document.getElementById('modalStep2TwoColCompName').textContent = name;
		document.getElementById('modal2ColImg').value = '';
		document.getElementById('modal2ColText').value = '';
		document.getElementById('modalStep2TwoCol').style.display = 'block';
		setTimeout(() => document.getElementById('modal2ColImg').focus(), 100);
	} else {
		document.getElementById('modalStep2CompName').textContent = name;
		document.getElementById('modalStep2Simple').style.display = 'block';
		setTimeout(() => document.getElementById('modalSimpleContent').focus(), 100);
	}
}

function modalAddReviewBlock() {
	addReviewBlock('__modal__');
}

async function modalSaveTestimonials() {
	const name = 'customer-reviews';
	const container = document.getElementById('reviews-list-__modal__');
	if (!container) { showNotification('No reviews list found', 'error'); return; }
	const blocks = container.querySelectorAll('.review-editor-block');
	if (blocks.length === 0) { showNotification('Please add at least one review', 'error'); return; }

	const reviews = Array.from(blocks).map(block => {
		const photos = Array.from(block.querySelectorAll('.review-photo-url'))
			.map(i => i.value.trim()).filter(v => v);
		return {
			avatar: block.querySelector('.review-avatar-input').value.trim() || DEFAULT_REVIEW_AVATAR,
			name: block.querySelector('.review-name-input').value.trim(),
			date: block.querySelector('.review-date-field').value.trim(),
			stars: parseInt(block.querySelector('.stars-selector').getAttribute('data-rating')) || 5,
			body: block.querySelector('.review-body-field').value.trim(),
			photos
		};
	});

	const initialCount = parseInt(document.getElementById('modalReviewsInitialCount').value) || 5;
	const htmlContent = buildTestimonialsHtml(reviews, initialCount);
	closeAddComponentModal();
	await addNewComponent(name, htmlContent);
}

function modalAddBulletRow() {
	const container = document.getElementById('modalBulletsList');
	const row = document.createElement('div');
	row.className = 'modal-bullet-row';
	row.innerHTML = `
				<input type="text" placeholder="Enter bullet point..." />
				<button class="modal-bullet-remove" onclick="this.parentElement.remove()">🗑</button>
			`;
	container.appendChild(row);
	row.querySelector('input').focus();
}

async function modalSaveSimple() {
	const name = document.getElementById('modalStep2CompName').textContent.trim();
	const content = document.getElementById('modalSimpleContent').value;
	if (!content) { showNotification('Please enter some content', 'error'); return; }
	closeAddComponentModal();
	await addNewComponent(name, content);
}

async function modalSave2Col() {
	const name = document.getElementById('modalStep2TwoColCompName').textContent.trim();
	const image = document.getElementById('modal2ColImg').value.trim();
	const text = document.getElementById('modal2ColText').value.trim();
	const content = JSON.stringify({ image, text });
	closeAddComponentModal();
	await addNewComponent(name, content);
}

async function modalSaveBullets() {
	const name = document.getElementById('modalStep2BulletsCompName').textContent.trim();
	const header = document.getElementById('modalBulletsHeader').value.trim();
	if (!header) { showNotification('Please enter a header text', 'error'); return; }

	const bulletInputs = document.querySelectorAll('#modalBulletsList .modal-bullet-row input');
	const bullets = Array.from(bulletInputs)
		.map(i => i.value.trim())
		.filter(v => v !== '');

	if (bullets.length === 0) { showNotification('Please add at least one bullet point', 'error'); return; }

	const htmlContent = buildBulletsHtml(header, bullets);
	closeAddComponentModal();
	await addNewComponent(name, htmlContent);
}

function showAddCustomComponentModal() {
	if (!currentSlug) { showNotification('Please select a slug first', 'error'); return; }
	document.getElementById('customCompName').value = '';
	document.getElementById('customCompCode').value = '';
	document.getElementById('addCustomComponentModal').style.display = 'flex';
	setTimeout(() => document.getElementById('customCompName').focus(), 100);
}

function closeAddCustomComponentModal() {
	document.getElementById('addCustomComponentModal').style.display = 'none';
}

async function saveCustomComponent() {
	const name = document.getElementById('customCompName').value.trim();
	const code = document.getElementById('customCompCode').value;

	if (!name) { showNotification('Please enter a component name', 'error'); return; }
	if (!code.trim()) { showNotification('Please enter some HTML/CSS/JS content', 'error'); return; }

	// Sanitize component name to be a valid ID / Firebase key
	const safeName = name.toLowerCase()
		.replace(/[^a-z0-9-_]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	if (!safeName) { showNotification('Invalid component name', 'error'); return; }

	closeAddCustomComponentModal();
	await addNewComponent(safeName, code);
}

async function renameComponent(oldName) {
	const newName = prompt(`Rename component "${oldName}" to:`, oldName);
	if (!newName || newName.trim() === oldName) return;

	const safeName = newName.trim().toLowerCase()
		.replace(/[^a-z0-9-_]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	if (!safeName) { showNotification('Invalid component name', 'error'); return; }
	if (safeName === oldName) return;
	if (contentData[safeName]) {
		showNotification(`Component "${safeName}" already exists!`, 'error');
		return;
	}

	try {
		// Get ALL slugs for this component (not just the current one)
		const allSlugData = contentData[oldName];
		if (!allSlugData) { showNotification('Component data not found', 'error'); return; }

		// Write all slug data under the new name
		const putResp = await fetch(
			`${firebaseUrl}/dynamic_content/${currentSite}/${safeName}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(allSlugData) }
		);
		if (!putResp.ok) throw new Error('Write failed');

		// Delete old key
		const delResp = await fetch(
			`${firebaseUrl}/dynamic_content/${currentSite}/${oldName}.json`,
			{ method: 'DELETE' }
		);
		if (!delResp.ok) throw new Error('Delete old failed');

		// Update local cache
		contentData[safeName] = allSlugData;
		delete contentData[oldName];

		showNotification(`Renamed "${oldName}" → "${safeName}"`, 'success');
		closeComponentEditor();
		loadSlugContent(); // re-render grid
	} catch (err) {
		showNotification('Error renaming component', 'error');
	}
}

async function showAddNewSlugModal() {
	if (!currentSite) { showNotification('Please select a site first', 'error'); return; }

	// Populate systems dropdown from Firebase config
	const select = document.getElementById('newSlugSystemSelect');
	select.innerHTML = '<option value="">— No system —</option>';
	try {
		const res = await fetch(`${firebaseUrl}/config/systems.json`);
		const systems = await res.json() || {};
		Object.entries(systems).forEach(([key, label]) => {
			const opt = document.createElement('option');
			opt.value = key;
			opt.textContent = label || key;
			select.appendChild(opt);
		});
	} catch (e) { /* no systems defined yet — that's ok */ }

	document.getElementById('newSlugName').value = '';
	select.value = '';
	document.getElementById('addSlugModal').style.display = 'flex';
	setTimeout(() => document.getElementById('newSlugName').focus(), 100);
}

function closeAddSlugModal() {
	document.getElementById('addSlugModal').style.display = 'none';
}

async function showEditDeleteSlugModal() {
	if (!currentSlug) return;

	document.getElementById('editDeleteSlugInput').value = currentSlug;

	// Load systems dropdown
	const select = document.getElementById('editDeleteSlugSystemSelect');
	select.innerHTML = '<option value="">— No system —</option>';
	try {
		const res = await fetch(`${firebaseUrl}/config/systems.json`);
		const systems = await res.json() || {};
		Object.entries(systems).forEach(([key, label]) => {
			const opt = document.createElement('option');
			opt.value = key;
			opt.textContent = label || key;
			select.appendChild(opt);
		});
	} catch (e) { /* no systems yet */ }

	// Pre-select current system (if any)
	try {
		const res = await fetch(`${firebaseUrl}/config/slug_systems/${currentSlug}.json`);
		const currentSystem = await res.json();
		select.value = currentSystem || '';
	} catch (e) { select.value = ''; }

	document.getElementById('editDeleteSlugModal').style.display = 'flex';
}

function closeEditDeleteSlugModal() {
	document.getElementById('editDeleteSlugModal').style.display = 'none';
}

async function saveEditDeleteSlug() {
	const system = document.getElementById('editDeleteSlugSystemSelect').value;
	const rawName = document.getElementById('editDeleteSlugInput').value.trim();
	const newSlug = rawName.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

	if (!newSlug) { showNotification('Invalid slug name', 'error'); return; }

	const nameChanged = newSlug !== currentSlug;

	// If renaming, check for conflicts
	if (nameChanged) {
		const allSlugs = Array.from(document.getElementById('slugSelect').options).map(o => o.value);
		if (allSlugs.includes(newSlug)) {
			showNotification(`Slug "${newSlug}" already exists!`, 'error');
			return;
		}
	}

	try {
		// ── 1. Rename across all components if needed ──
		if (nameChanged) {
			showLoader(true);
			// For each component, copy old slug value to new slug key, then delete old
			const renamePromises = Object.keys(contentData).map(async component => {
				const val = contentData[component][currentSlug];
				if (val === undefined) return;
				await fetch(`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${newSlug}.json`,
					{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) });
				await fetch(`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
					{ method: 'DELETE' });
			});
			await Promise.all(renamePromises);

			// Update local cache
			Object.keys(contentData).forEach(component => {
				if (contentData[component][currentSlug] !== undefined) {
					contentData[component][newSlug] = contentData[component][currentSlug];
					delete contentData[component][currentSlug];
				}
			});

			// Update slug dropdown option
			const slugSelect = document.getElementById('slugSelect');
			const opt = slugSelect.querySelector(`option[value="${currentSlug}"]`);
			if (opt) { opt.value = newSlug; opt.textContent = newSlug; }
			slugSelect.value = newSlug;

			// Update breadcrumb
			document.getElementById('breadcrumbSlug').textContent = newSlug;
			currentSlug = newSlug;
			showLoader(false);
		}

		// ── 2. Save system mapping ──
		if (system) {
			await fetch(`${firebaseUrl}/config/slug_systems/${currentSlug}.json`,
				{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(system) });
		} else {
			// Delete old mapping — covers both old and new slug name
			if (nameChanged) {
				await fetch(`${firebaseUrl}/config/slug_systems/${rawName.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}.json`,
					{ method: 'DELETE' });
			}
			await fetch(`${firebaseUrl}/config/slug_systems/${currentSlug}.json`, { method: 'DELETE' });
		}

		closeEditDeleteSlugModal();
		showNotification(nameChanged ? `Slug renamed to "${newSlug}" and saved!` : 'Slug updated!', 'success');

		// Refresh system badge in topbar
		const systemBadge = document.getElementById('breadcrumbSystem');
		if (system) {
			const res = await fetch(`${firebaseUrl}/config/systems/${system}.json`);
			const label = await res.json();
			systemBadge.textContent = '🫁 ' + (label || system);
			systemBadge.style.display = 'inline';
		} else {
			systemBadge.style.display = 'none';
		}
	} catch (e) {
		showLoader(false);
		showNotification('Error saving slug changes', 'error');
	}
}

async function deleteSlug() {
	if (!currentSite || !currentSlug) return;

	const confirmed = confirm(`⚠️ Delete slug "${currentSlug}" from site "${firebaseKeyToHostname(currentSite)}"?\n\nThis will permanently delete ALL components for this slug and cannot be undone.`);
	if (!confirmed) return;

	closeEditDeleteSlugModal();

	try {
		showLoader(true);

		const deletePromises = Object.keys(contentData).map(component =>
			fetch(`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`, { method: 'DELETE' })
		);
		deletePromises.push(
			fetch(`${firebaseUrl}/config/slug_systems/${currentSlug}.json`, { method: 'DELETE' })
		);
		await Promise.all(deletePromises);

		Object.keys(contentData).forEach(component => {
			delete contentData[component][currentSlug];
		});

		showLoader(false);
		showNotification(`Slug "${currentSlug}" deleted successfully!`, 'success');

		const slugSelect = document.getElementById('slugSelect');
		const optionToRemove = slugSelect.querySelector(`option[value="${currentSlug}"]`);
		if (optionToRemove) optionToRemove.remove();

		currentSlug = '';
		document.getElementById('editDeleteSlugBtn').style.display = 'none';
		document.getElementById('breadcrumbSep').style.display = 'none';
		document.getElementById('breadcrumbSlug').style.display = 'none';
		document.getElementById('breadcrumbSystem').style.display = 'none';
		document.getElementById('slugMetaBar').style.display = 'none';
		document.getElementById('contentGrid').innerHTML = '';
		document.getElementById('emptyState').style.display = 'flex';
		slugSelect.value = '';

	} catch (error) {
		showLoader(false);
		showNotification('Error deleting slug: ' + error.message, 'error');
	}
}

async function confirmAddSlug() {
	const rawName = document.getElementById('newSlugName').value.trim();
	const system = document.getElementById('newSlugSystemSelect').value;

	if (!rawName) { showNotification('Please enter a slug name', 'error'); return; }

	const slugName = rawName.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	if (!slugName) { showNotification('Invalid slug name!', 'error'); return; }

	closeAddSlugModal();

	// If a system was chosen, save the mapping to config/slug_systems
	if (system) {
		try {
			await fetch(`${firebaseUrl}/config/slug_systems/${slugName}.json`,
				{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(system) });
		} catch (e) { console.warn('Could not save slug→system mapping', e); }
	}

	addNewSlug(slugName);
}

async function addNewSlug(slugName) {
	try {
		showLoader(true);
		const defaultComponents = {
			'main-title': `Title for ${slugName}`,
			'vsl-video': 'https://player.vimeo.com/video/YOUR_VIDEO_ID'
		};
		await Promise.all(Object.keys(defaultComponents).map(component =>
			fetch(`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${slugName}.json`,
				{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defaultComponents[component]) })
		));
		showNotification(`Slug "${slugName}" added successfully!`, 'success');
		showLoader(false);
		await loadSiteContent();
		document.getElementById('slugSelect').value = slugName;
		currentSlug = slugName;
		loadSlugContent();
	} catch (error) {
		showLoader(false);
		showNotification('Error adding slug: ' + error.message, 'error');
	}
}

async function addNewComponent(component, content) {
	try {
		const response = await fetch(
			`${firebaseUrl}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) }
		);
		if (response.ok) {
			showNotification('Component added successfully!', 'success');
			if (!contentData[component]) contentData[component] = {};
			contentData[component][currentSlug] = content;
			loadSlugContent();
		} else throw new Error('Add failed');
	} catch (error) {
		showNotification('Error adding component', 'error');
	}
}

function showAddSiteModal() {
	const hostname = prompt('Enter the site hostname (e.g. advertorials645.lpages.co):');
	if (!hostname) return;
	if (!hostname.includes('.')) { showNotification('Invalid hostname! Must contain a valid domain', 'error'); return; }
	addNewSite(hostname);
}

async function addNewSite(hostname) {
	const firebaseKey = hostnameToFirebaseKey(hostname);
	try {
		showLoader(true);
		const minimalStructure = {
			"main-title": { "default": "Generic Title – Edit from Admin Panel" },
			"vsl-video": { "default": "https://player.vimeo.com/video/YOUR_VIDEO_ID" }
		};
		const response = await fetch(
			`${firebaseUrl}/dynamic_content/${firebaseKey}.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(minimalStructure) }
		);
		if (response.ok) {
			showNotification(`Site "${hostname}" added successfully!`, 'success');
			showLoader(false);
			await loadSites();
			document.getElementById('siteSelect').value = firebaseKey;
			loadSiteContent();
		} else throw new Error('Add site failed');
	} catch (error) {
		showLoader(false);
		showNotification('Error adding site: ' + error.message, 'error');
	}
}

function refreshData() {
	if (currentSite) loadSiteContent(); else loadSites();
}

function showNotification(message, type = 'success') {
	const notification = document.getElementById('notification');
	const text = document.getElementById('notificationText');
	text.textContent = message;
	notification.className = `notification ${type} show`;
	setTimeout(() => notification.classList.remove('show'), 3000);
}

function showLoader(show) {
	document.getElementById('loader').classList.toggle('show', show);
}

function toggleSidebar() {
	// On mobile, use drawer behaviour
	if (window.innerWidth <= 900) { toggleMobileSidebar(); return; }
	const sidebar = document.querySelector('.sidebar');
	const layout = document.getElementById('appLayout');
	const btn = document.getElementById('sidebarToggleBtn');
	const isCollapsed = sidebar.classList.contains('collapsed');
	sidebar.classList.toggle('collapsed');
	layout.classList.toggle('sidebar-collapsed', !isCollapsed);
	if (btn) btn.textContent = isCollapsed ? '‹' : '›';
	localStorage.setItem('sidebar_collapsed', isCollapsed ? '0' : '1');
}

function toggleMobileSidebar() {
	const sidebar = document.querySelector('.sidebar');
	const overlay = document.getElementById('sidebarMobileOverlay');
	const isOpen = sidebar.classList.contains('mobile-open');
	sidebar.classList.toggle('mobile-open', !isOpen);
	if (overlay) overlay.classList.toggle('show', !isOpen);
}

function closeMobileSidebar() {
	document.querySelector('.sidebar').classList.remove('mobile-open');
	const overlay = document.getElementById('sidebarMobileOverlay');
	if (overlay) overlay.classList.remove('show');
}

function initSidebarState() {
	if (localStorage.getItem('sidebar_collapsed') === '1') {
		document.querySelector('.sidebar').classList.add('collapsed');
		document.getElementById('appLayout').classList.add('sidebar-collapsed');
		const btn = document.getElementById('sidebarToggleBtn');
		if (btn) btn.textContent = '›';
	}
}

// ─── MANAGE SYSTEMS ───────────────────────────────────────────────────────
async function openManageSystemsModal() {
	const rows = document.getElementById('manageSystemsRows');
	rows.innerHTML = '';
	try {
		const res = await fetch(`${firebaseUrl}/config/systems.json`);
		const systems = await res.json() || {};
		Object.entries(systems).forEach(([key, label]) => addManageSystemRow(key, label));
	} catch (e) { /* empty — user can add fresh */ }
	if (rows.children.length === 0) addManageSystemRow(); // start with one empty row
	document.getElementById('manageSystemsModal').style.display = 'flex';
}

function closeManageSystemsModal() {
	document.getElementById('manageSystemsModal').style.display = 'none';
}

function addManageSystemRow(key = '', label = '') {
	const rows = document.getElementById('manageSystemsRows');
	const row = document.createElement('div');
	row.style.cssText = 'display:flex; gap:8px; align-items:center;';
	row.innerHTML = `
				<input type="text" placeholder="key (e.g. respiratory)" value="${escapeHtml(key)}"
					style="flex:0 0 150px; padding:8px 10px; border:1.5px solid var(--border); border-radius:7px; font-size:13px; font-family:inherit; color:var(--text-primary);" class="sys-key">
				<input type="text" placeholder="Label (e.g. Respiratory System)" value="${escapeHtml(label)}"
					style="flex:1; padding:8px 10px; border:1.5px solid var(--border); border-radius:7px; font-size:13px; font-family:inherit; color:var(--text-primary);" class="sys-label">
				<button onclick="this.closest('div').remove()"
					style="padding:8px 10px; background:#fef2f2; border:1.5px solid #fecaca; border-radius:7px; color:var(--danger); cursor:pointer; font-size:13px; flex-shrink:0;">🗑</button>
			`;
	rows.appendChild(row);
	if (!key) row.querySelector('.sys-key').focus();
}

async function saveManageSystems() {
	const rows = document.querySelectorAll('#manageSystemsRows > div');
	const systems = {};
	rows.forEach(row => {
		const k = row.querySelector('.sys-key').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
		const l = row.querySelector('.sys-label').value.trim();
		if (k) systems[k] = l;
	});
	try {
		await fetch(`${firebaseUrl}/config/systems.json`,
			{ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(systems) });
		showNotification('Systems saved!', 'success');
		closeManageSystemsModal();
		// Re-populate the slug modal dropdown
		const select = document.getElementById('newSlugSystemSelect');
		const current = select.value;
		select.innerHTML = '<option value="">— No system —</option>';
		Object.entries(systems).forEach(([k, l]) => {
			const opt = document.createElement('option');
			opt.value = k; opt.textContent = l || k;
			select.appendChild(opt);
		});
		select.value = current;
	} catch (e) {
		showNotification('Error saving systems', 'error');
	}
}
// ─────────────────────────────────────────────────────────────────────────

// ─── AI PAGE ANALYZER ─────────────────────────────────────────────────────

// In-memory cache — loaded from Firebase after login, never stored in source
let _aiApiKey    = '';   // OpenAI key  (sk-...)
let _aiClaudeKey = '';   // Anthropic key (sk-ant-...)
let _aiProvider  = 'gpt'; // 'gpt' | 'claude'

async function _loadAiApiKeyFromFirebase() {
	try {
		const [resGpt, resClaude] = await Promise.all([
			fetch(`${FIREBASE_URL}/config/openai_key.json`),
			fetch(`${FIREBASE_URL}/config/anthropic_key.json`)
		]);
		if (resGpt.ok) {
			const val = await resGpt.json();
			if (val && typeof val === 'string' && val.startsWith('sk-')) _aiApiKey = val;
		}
		if (resClaude.ok) {
			const val = await resClaude.json();
			if (val && typeof val === 'string' && val.startsWith('sk-ant-')) _aiClaudeKey = val;
		}
	} catch (e) {
		// silently ignore — keys just won't be pre-loaded
	}
}

function showAiAnalyzerModal() {
	// Pre-fill API key inputs if we have them in memory
	if (_aiApiKey)    document.getElementById('aiApiKeyInput').value    = _aiApiKey;
	if (_aiClaudeKey) document.getElementById('aiClaudeKeyInput').value = _aiClaudeKey;
	// Sync provider selector
	_aiSyncProviderUI();
	// Pre-fill URL from current site if available
	if (currentSite) {
		const hostname = firebaseKeyToHostname(currentSite);
		const urlInput = document.getElementById('aiPageUrl');
		if (!urlInput.value) urlInput.value = 'https://' + hostname;
	}
	document.getElementById('aiAnalyzerModal').style.display = 'flex';
	setTimeout(() => document.getElementById('aiPageUrl').focus(), 100);
}

function closeAiAnalyzerModal() {
	document.getElementById('aiAnalyzerModal').style.display = 'none';
}

function toggleAiApiKeySection(btn) {
	const section = document.getElementById('aiApiKeySection');
	const icon = document.getElementById('aiApiKeyToggleIcon');
	const isOpen = section.classList.contains('is-open');
	section.classList.toggle('is-open', !isOpen);
	icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ── Custom component ideas (pre-analyze) ─────────────────────────────────────

function toggleAiCustomIdeasSection() {
	const section = document.getElementById('aiCustomIdeasSection');
	const icon    = document.getElementById('aiCustomIdeasToggleIcon');
	const isOpen = section.classList.contains('is-open');
	section.classList.toggle('is-open', !isOpen);
	icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
	// Auto-add first row if empty
	if (!isOpen && document.getElementById('aiCustomIdeasList').children.length === 0) {
		aiAddCustomIdea();
	}
}

let _aiCustomIdeaCounter = 0;

function aiAddCustomIdea() {
	const list = document.getElementById('aiCustomIdeasList');
	const id = _aiCustomIdeaCounter++;
	const row = document.createElement('div');
	row.id = `ai-custom-idea-${id}`;
	row.style.cssText = 'background:#0d1f17; border:1px solid rgba(52,211,153,0.2); border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:7px; animation:slideInRow .15s ease;';
	row.innerHTML = `
		<div style="display:flex; gap:8px; align-items:center;">
			<input type="text" placeholder="Component name (e.g. testimonial-video-strip)"
				id="ai-custom-idea-name-${id}"
				style="flex:1; padding:7px 10px; background:#0f2a1c; color:#d1fae5; border:1px solid rgba(52,211,153,0.25); border-radius:6px; font-size:12px; font-family:inherit; box-sizing:border-box; outline:none;"
				onfocus="this.style.borderColor='#34d399'" onblur="this.style.borderColor='rgba(52,211,153,0.25)'"
			/>
			<button onclick="aiRemoveCustomIdea(${id})"
				style="width:26px; height:26px; flex-shrink:0; background:#1a0a0a; color:#f87171; border:1px solid rgba(248,113,113,0.3); border-radius:6px; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1;">✕</button>
		</div>
		<textarea id="ai-custom-idea-desc-${id}" rows="2"
			placeholder="Describe what you want… e.g. 'A sticky bottom bar with a countdown timer and a single CTA button that slides in after 5 seconds'"
			style="width:100%; padding:7px 10px; background:#0f2a1c; color:#d1fae5; border:1px solid rgba(52,211,153,0.25); border-radius:6px; font-size:12px; font-family:inherit; resize:vertical; line-height:1.5; box-sizing:border-box; outline:none;"
			onfocus="this.style.borderColor='#34d399'" onblur="this.style.borderColor='rgba(52,211,153,0.25)'"
		></textarea>
	`;
	list.appendChild(row);
	_aiUpdateCustomIdeasBadge();
	// Focus the name input
	setTimeout(() => row.querySelector('input')?.focus(), 50);
}

function aiRemoveCustomIdea(id) {
	const row = document.getElementById(`ai-custom-idea-${id}`);
	if (row) row.remove();
	_aiUpdateCustomIdeasBadge();
}

function _aiUpdateCustomIdeasBadge() {
	const count = document.getElementById('aiCustomIdeasList')?.children.length || 0;
	const badge  = document.getElementById('aiCustomIdeasCountBadge');
	const genBtn = document.getElementById('aiGenerateMyIdeasBtn');
	if (badge) {
		badge.style.display = count > 0 ? 'inline-block' : 'none';
		badge.textContent   = count;
	}
	if (genBtn) {
		genBtn.style.display = count > 0 ? 'block' : 'none';
	}
}

function _aiGetCustomIdeas() {
	const list = document.getElementById('aiCustomIdeasList');
	if (!list) return [];
	const ideas = [];
	for (const row of list.children) {
		const idMatch = row.id.match(/ai-custom-idea-(\d+)/);
		if (!idMatch) continue;
		const id = idMatch[1];
		const name = (document.getElementById(`ai-custom-idea-name-${id}`)?.value || '').trim();
		const desc = (document.getElementById(`ai-custom-idea-desc-${id}`)?.value || '').trim();
		if (name || desc) {
			ideas.push({
				component_name: name || `custom-idea-${id}`,
				description: desc || name,
				type: 'custom',
				interactivity: 'ANIMATED',
				scroll_timing: 'MIDDLE',
				placement: 'As specified in description',
				copy_suggestion: ''
			});
		}
	}
	return ideas;
}

async function runAiGenerateCustomOnly() {
	const customIdeas = _aiGetCustomIdeas();
	if (customIdeas.length === 0) {
		showNotification('Add at least one component idea first', 'error');
		return;
	}

	let activeKey;
	try { activeKey = _aiGetActiveKey(); } catch(e) {
		showNotification(e.message, 'error'); return;
	}

	// Disable both buttons while running
	const analyzeBtn  = document.getElementById('aiAnalyzeBtn');
	const generateBtn = document.getElementById('aiGenerateMyIdeasBtn');
	analyzeBtn.disabled  = true;  analyzeBtn.style.opacity  = '0.6';
	generateBtn.disabled = true;  generateBtn.style.opacity = '0.6';
	generateBtn.textContent = '⏳ Generating...';

	document.getElementById('aiResultsEmpty').style.display   = 'none';
	document.getElementById('aiResultsContent').style.display = 'none';
	document.getElementById('aiResultsLoading').style.display = 'flex';
	document.getElementById('aiCopyBtn').style.display        = 'none';
	document.getElementById('aiResultsMeta').textContent      = '';

	const setStep = msg => { document.getElementById('aiLoadingStep').textContent = msg; };

	try {
		window._aiLastPageContent  = '';
		window._aiLastNicheContext = null;
		window._aiLastExistingInfo = null;
		window._aiLastPageUrl      = '';

		const stubAnalysis = {
			overall_score:   null,
			score_rationale: '',
			page_summary:    '',
			improvements:    [],
			component_ideas: customIdeas
		};
		window._aiLastComponents = customIdeas;
		window._aiGeneratedCodes = {};

		_aiRenderResults(stubAnalysis, '', {}, true);

		for (let idx = 0; idx < customIdeas.length; idx++) {
			setStep(`Generating component ${idx + 1} / ${customIdeas.length}…`);
			const loadingEl = document.getElementById(`ai-comp-loading-${idx}`);
			const emptyEl   = document.getElementById(`ai-comp-empty-${idx}`);
			const outputEl  = document.getElementById(`ai-comp-output-${idx}`);
			if (loadingEl) loadingEl.style.display = 'block';
			if (emptyEl)   emptyEl.style.display   = 'none';
			if (outputEl)  outputEl.style.display  = 'none';
			try {
				const code = await _aiGenerateOneComponentCode(customIdeas[idx], '', activeKey.key, '', null, activeKey.provider);
				window._aiGeneratedCodes[idx] = code;
				if (loadingEl) loadingEl.style.display = 'none';
				if (outputEl)  outputEl.style.display  = 'block';
				const ta  = document.getElementById(`ai-comp-textarea-${idx}`);
				if (ta) ta.value = code;
				const btn = document.getElementById(`ai-gen-btn-${idx}`);
				if (btn) { btn.innerHTML = '🔄 Regenerate'; btn.disabled = false; btn.style.opacity = '1'; }
			} catch (e) {
				if (loadingEl) loadingEl.style.display = 'none';
				if (emptyEl)   emptyEl.style.display   = 'flex';
				const btn = document.getElementById(`ai-gen-btn-${idx}`);
				if (btn) { btn.innerHTML = '⚡ Generate Code'; btn.disabled = false; btn.style.opacity = '1'; }
			}
		}
	} finally {
		analyzeBtn.disabled  = false;  analyzeBtn.style.opacity  = '1';
		generateBtn.disabled = false;  generateBtn.style.opacity = '1';
		generateBtn.textContent = '⚡ Generate my ideas';
	}
}

async function listAvailableGptModels() {
	const apiKey = _aiApiKey || document.getElementById('aiApiKeyInput').value.trim();
	if (!apiKey || !apiKey.startsWith('sk-')) {
		showNotification('Add your OpenAI API key first', 'error');
		return;
	}
	showNotification('Fetching models...', 'success');
	try {
		const res = await fetch('https://api.openai.com/v1/models', {
			headers: { 'Authorization': `Bearer ${apiKey}` }
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status}`);
		const gptModels = data.data
			.map(m => m.id)
			.filter(id => id.startsWith('gpt'))
			.sort();
		alert('GPT models on your account:\n\n' + gptModels.join('\n'));
	} catch (e) {
		showNotification('Failed: ' + e.message, 'error');
	}
}

async function saveAiApiKey() {
	const key = document.getElementById('aiApiKeyInput').value.trim();
	if (!key.startsWith('sk-')) {
		showNotification('Invalid API key — must start with sk-', 'error');
		return;
	}
	try {
		const res = await fetch(`${FIREBASE_URL}/config/openai_key.json`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(key)
		});
		if (!res.ok) throw new Error('Firebase write failed');
		_aiApiKey = key;
		showNotification('OpenAI key saved to Firebase ✅', 'success');
	} catch (e) {
		showNotification('Failed to save key: ' + e.message, 'error');
	}
}

async function saveAiClaudeKey() {
	const key = document.getElementById('aiClaudeKeyInput').value.trim();
	if (!key.startsWith('sk-ant-')) {
		showNotification('Invalid Anthropic key — must start with sk-ant-', 'error');
		return;
	}
	try {
		const res = await fetch(`${FIREBASE_URL}/config/anthropic_key.json`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(key)
		});
		if (!res.ok) throw new Error('Firebase write failed');
		_aiClaudeKey = key;
		showNotification('Claude (Anthropic) key saved to Firebase ✅', 'success');
	} catch (e) {
		showNotification('Failed to save key: ' + e.message, 'error');
	}
}

function _aiSetProvider(provider) {
	_aiProvider = provider;
	_aiSyncProviderUI();
}

function _aiSyncProviderUI() {
	const gptBtn    = document.getElementById('aiProviderGpt');
	const claudeBtn = document.getElementById('aiProviderClaude');
	const gptSec    = document.getElementById('aiGptKeySection');
	const claudeSec = document.getElementById('aiClaudeKeySection');
	if (!gptBtn) return;

	// Summary line shown on the collapsed button
	const summary = document.getElementById('aiProviderSummary');

	if (_aiProvider === 'gpt') {
		gptBtn.setAttribute('data-active', 'true');
		claudeBtn.setAttribute('data-active', 'false');
		gptBtn.style.cssText    = 'flex:1; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .15s; border:2px solid #7c3aed; background:rgba(124,58,237,0.12); color:#6d28d9;';
		claudeBtn.style.cssText = 'flex:1; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .15s; border:2px solid var(--border); background:transparent; color:var(--text-muted);';
		if (gptSec)    gptSec.style.display    = 'block';
		if (claudeSec) claudeSec.style.display = 'none';
		if (summary) summary.textContent = 'Active: 🤖 GPT-4o';
	} else {
		gptBtn.setAttribute('data-active', 'false');
		claudeBtn.setAttribute('data-active', 'true');
		gptBtn.style.cssText    = 'flex:1; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .15s; border:2px solid var(--border); background:transparent; color:var(--text-muted);';
		claudeBtn.style.cssText = 'flex:1; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .15s; border:2px solid #d97706; background:rgba(217,119,6,0.1); color:#b45309;';
		if (gptSec)    gptSec.style.display    = 'none';
		if (claudeSec) claudeSec.style.display = 'block';
		if (summary) summary.textContent = 'Active: ✴️ Claude Opus';
	}
}

// Returns { key, provider } for the currently selected provider, or throws if missing
function _aiGetActiveKey() {
	if (_aiProvider === 'claude') {
		const key = _aiClaudeKey || document.getElementById('aiClaudeKeyInput')?.value.trim() || '';
		if (!key.startsWith('sk-ant-')) throw new Error('No Claude API key — expand ▶ API Key settings and add your Anthropic key');
		return { key, provider: 'claude' };
	}
	const key = _aiApiKey || document.getElementById('aiApiKeyInput')?.value.trim() || '';
	if (!key.startsWith('sk-')) throw new Error('No OpenAI API key — expand ▶ API Key settings to add one');
	return { key, provider: 'gpt' };
}

async function runAiAnalysis() {
	const url         = document.getElementById('aiPageUrl').value.trim();
	const customIdeas = _aiGetCustomIdeas();
	const hasUrl      = url && url.startsWith('http');

	if (!hasUrl) {
		showNotification('Enter a valid page URL to analyze (starting with https://)', 'error');
		return;
	}

	let activeKey;
	try { activeKey = _aiGetActiveKey(); } catch(e) {
		showNotification(e.message, 'error'); return;
	}

	// UI → loading state
	document.getElementById('aiResultsEmpty').style.display   = 'none';
	document.getElementById('aiResultsContent').style.display = 'none';
	document.getElementById('aiResultsLoading').style.display = 'flex';
	document.getElementById('aiAnalyzeBtn').disabled          = true;
	document.getElementById('aiAnalyzeBtn').style.opacity     = '0.6';
	const generateBtn = document.getElementById('aiGenerateMyIdeasBtn');
	if (generateBtn) { generateBtn.disabled = true; generateBtn.style.opacity = '0.5'; }
	document.getElementById('aiCopyBtn').style.display        = 'none';
	document.getElementById('aiResultsMeta').textContent      = '';

	const setStep = (msg) => {
		document.getElementById('aiLoadingStep').textContent = msg;
	};

	try {
		// ── Step 1: Fetch page HTML ───────────────────────────────────────────
		const rawHtml = await _aiProxyFetch(url, setStep);
		if (!rawHtml) throw new Error('Page returned empty content');

		// ── Step 2: Extract meaningful content from HTML ──────────────────────
		setStep('Extracting page content...');
		const pageContent = _aiExtractPageContent(rawHtml, url);
		window._aiLastPageContent = pageContent; // cache for Regenerate

		// ── Step 2.5: Detect existing components from live HTML + extract niche context ─
		setStep('Detecting existing components from page...');
		const [existingInfo, nicheContext] = await Promise.all([
			Promise.resolve(_aiExtractComponentsFromHtml(rawHtml)),
			Promise.resolve(_aiExtractNicheContext(pageContent))
		]);
		// Cache for Regenerate button
		window._aiLastExistingInfo = existingInfo;
		window._aiLastNicheContext = nicheContext;
		if (existingInfo) {
			console.log('[AI] Existing components detected from HTML:', existingInfo.componentNames);
		}
		if (nicheContext) {
			console.log('[AI] Niche context extracted:', nicheContext);
		}

		// ── Step 2.6: Capture screenshot for visual analysis ──────────────────
		setStep('Capturing page screenshot...');
		const screenshotUrl = await _aiGetScreenshotUrl(url, setStep);

		// ── Step 3: Analyze with selected AI provider ─────────────────────────
		const providerLabel = activeKey.provider === 'claude' ? 'Claude' : 'GPT';
		setStep(screenshotUrl ? `Analyzing with ${providerLabel} Vision...` : `Analyzing with ${providerLabel} (text only — screenshot unavailable)...`);
		const analysis = activeKey.provider === 'claude'
			? await _aiCallClaude(pageContent, url, activeKey.key, screenshotUrl, existingInfo, nicheContext)
			: await _aiCallGpt(pageContent, url, activeKey.key, screenshotUrl, existingInfo, nicheContext);

		// ── Step 4: Merge AI suggestions (max 4) with user's custom ideas ─────
		const aiComponents       = (analysis.component_ideas || []).slice(0, 4);
		const components         = [...aiComponents, ...customIdeas];
		analysis.component_ideas = components;
		const generatedCodes     = {};

		if (components.length > 0) {
			// Render results first so the user can see the cards with loading spinners
			setStep('Generating component code (1/' + components.length + ')...');
			_aiRenderResults(analysis, url, {}, true); // true = show spinners

			for (let idx = 0; idx < components.length; idx++) {
				setStep(`Generating component code (${idx + 1}/${components.length})...`);
				// Show spinner on card
				const loadingEl = document.getElementById(`ai-comp-loading-${idx}`);
				const emptyEl   = document.getElementById(`ai-comp-empty-${idx}`);
				const outputEl  = document.getElementById(`ai-comp-output-${idx}`);
				if (loadingEl) loadingEl.style.display = 'block';
				if (emptyEl)   emptyEl.style.display   = 'none';
				if (outputEl)  outputEl.style.display  = 'none';

				try {
					const code = await _aiGenerateOneComponentCode(components[idx], url, activeKey.key, pageContent, nicheContext, activeKey.provider);
					generatedCodes[idx] = code;
					window._aiGeneratedCodes = window._aiGeneratedCodes || {};
					window._aiGeneratedCodes[idx] = code;
					// Populate card
					if (loadingEl) loadingEl.style.display = 'none';
					if (outputEl)  outputEl.style.display  = 'block';
					const ta = document.getElementById(`ai-comp-textarea-${idx}`);
					if (ta) ta.value = code;
					const btn = document.getElementById(`ai-gen-btn-${idx}`);
					if (btn) { btn.innerHTML = '🔄 Regenerate'; btn.disabled = false; btn.style.opacity = '1'; }
				} catch (e) {
					console.error(`[AI codegen] component ${idx} failed:`, e);
					generatedCodes[idx] = '';
					if (loadingEl) loadingEl.style.display = 'none';
					if (emptyEl)   emptyEl.style.display   = 'flex';
					const btn = document.getElementById(`ai-gen-btn-${idx}`);
					if (btn) { btn.innerHTML = '⚡ Generate Code'; btn.disabled = false; btn.style.opacity = '1'; }
				}
			}
		} else {
			// ── Step 5: Render results ──────────────────────────────────────────
			setStep('Rendering results...');
			_aiRenderResults(analysis, url, {}, false);
		}

	} catch (err) {
		document.getElementById('aiResultsLoading').style.display = 'none';
		document.getElementById('aiResultsEmpty').style.display = 'flex';

		const msg = err.message || '';
		const isQuota = msg.toLowerCase().includes('quota') || msg.includes('429') || msg.toLowerCase().includes('billing') || msg.toLowerCase().includes('exceeded');
		const isAuth  = msg.includes('401') || msg.toLowerCase().includes('incorrect api key') || msg.toLowerCase().includes('invalid api key');

		let extraHtml = '';
		if (isQuota) {
			extraHtml = `
				<div style="margin-top:10px; display:flex; flex-direction:column; align-items:center; gap:6px;">
					<p style="margin:0; font-size:12px; color:#92400e; background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:8px 14px; text-align:center; max-width:400px; line-height:1.6;">
						💳 Your OpenAI account has run out of credits or the billing limit was reached.<br>
						Add credits to continue using the AI analyzer.
					</p>
					<a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank"
						style="padding:8px 16px; background:#7c3aed; color:#fff; border-radius:8px; font-size:12px; font-weight:700; text-decoration:none; display:inline-block; margin-top:2px;">
						💳 Open OpenAI Billing →
					</a>
				</div>`;
		} else if (isAuth) {
			extraHtml = `
				<p style="margin:6px 0 0; font-size:12px; color:#92400e; background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:8px 14px; text-align:center; max-width:380px; line-height:1.6;">
					🔑 The API key saved in Firebase may be wrong or expired.<br>
					Expand <strong>▶ API Key settings</strong> and save the correct key.
				</p>`;
		}

		document.getElementById('aiResultsEmpty').innerHTML = `
			<span style="font-size:36px;">${isQuota ? '💳' : '⚠️'}</span>
			<p style="margin:0; font-size:14px; font-weight:600; color:#dc2626;">Analysis failed</p>
			<p style="margin:0; font-size:12px; color:var(--text-muted); text-align:center; max-width:420px; line-height:1.6;">${escapeHtml(msg)}</p>
			${extraHtml}
		`;
	} finally {
		document.getElementById('aiAnalyzeBtn').disabled = false;
		document.getElementById('aiAnalyzeBtn').style.opacity = '1';
	}
}

// ── Fetch existing Firebase component names for the current site/slug ──
async function _aiGetExistingComponents(site, slug) {
	if (!site || !firebaseUrl) return null;

	try {
		const res = await fetch(`${firebaseUrl}/dynamic_content/${site}.json`);
		if (!res.ok) return null;
		const siteData = await res.json();
		if (!siteData) return null;

		// Collect component names present for this slug (and for 'default' as a fallback)
		const slugsToCheck = slug ? [slug, 'default'] : ['default'];
		const foundComponents = new Set();

		Object.keys(siteData).forEach(componentName => {
			const componentData = siteData[componentName];
			if (!componentData || typeof componentData !== 'object') return;
			for (const s of slugsToCheck) {
				if (componentData[s] !== undefined) {
					foundComponents.add(componentName);
					break;
				}
			}
		});

		if (foundComponents.size === 0) return null;

		return { componentNames: [...foundComponents].sort() };
	} catch (e) {
		console.warn('[AI] Could not load existing components from Firebase:', e.message);
		return null;
	}
}

// ── Detect components already injected into the live page HTML ──────────
// Scans for the lp- class prefix that all our generated components use.
// Returns { componentNames } in the same shape as _aiGetExistingComponents
// so all downstream prompt-building code works unchanged.
function _aiExtractComponentsFromHtml(rawHtml) {
	if (!rawHtml) return null;

	const seen = new Set();
	// Every generated component prefixes its classes with lp-{slug12}-
	// e.g. lp-curiosity-hoo-wrapper, lp-social-proo-title
	const pattern = /\blp-([a-z0-9][a-z0-9-]{0,11})-/g;
	let match;
	while ((match = pattern.exec(rawHtml)) !== null) {
		seen.add(match[1]);
	}

	if (seen.size === 0) return null;

	// Convert slug back to a readable name for the prompt
	const componentNames = [...seen].sort().map(slug =>
		slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
	);

	console.log('[AI] lp- components found in page HTML:', componentNames);
	return { componentNames };
}

// ── Extract free-form niche context directly from page content ───────────
// No predefined categories — pulls the most signal-rich lines from the
// extracted page text (title, H1, headings, CTAs) and returns them as a
// plain descriptive string that GPT can interpret freely.
function _aiExtractNicheContext(pageContent) {
	if (!pageContent) return null;

	const lines = pageContent.split('\n');
	const picked = [];

	// Priority order: TITLE > H1 > H2/H3 > CTA > P
	const slots = [
		{ prefix: '[TITLE]',    max: 1 },
		{ prefix: '[H1]',       max: 1 },
		{ prefix: '[H2]',       max: 3 },
		{ prefix: '[H3]',       max: 2 },
		{ prefix: '[CTA]',      max: 2 },
		{ prefix: '[P]',        max: 2 },
	];

	for (const slot of slots) {
		let count = 0;
		for (const line of lines) {
			if (line.startsWith(slot.prefix)) {
				const text = line.replace(slot.prefix, '').trim();
				if (text) {
					picked.push(text);
					count++;
				}
			}
			if (count >= slot.max) break;
		}
	}

	if (picked.length === 0) return null;

	// Return as a compact summary string — no label/type, just raw copy signals
	return picked.join(' | ');
}

// Extract readable content from raw HTML (strip scripts/styles, keep text structure)
function _aiExtractPageContent(html, pageUrl) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');

	// Remove noise elements
	['script', 'style', 'noscript', 'svg', 'iframe', 'link', 'meta', 'head'].forEach(tag => {
		doc.querySelectorAll(tag).forEach(el => el.remove());
	});

	// Collect headings, paragraphs, buttons, links, images (as alt/src)
	const lines = [];

	// Page title
	const title = doc.querySelector('title');
	if (title) lines.push(`[TITLE] ${title.textContent.trim()}`);

	// Meta description
	const metaDesc = doc.querySelector('meta[name="description"]');
	if (metaDesc) lines.push(`[META DESC] ${metaDesc.getAttribute('content') || ''}`);

	// All headings
	doc.querySelectorAll('h1,h2,h3,h4').forEach(h => {
		const t = h.textContent.trim().replace(/\s+/g, ' ');
		if (t) lines.push(`[${h.tagName}] ${t}`);
	});

	// Paragraphs (limit to 200 chars each to keep prompt size sane)
	doc.querySelectorAll('p').forEach(p => {
		const t = p.textContent.trim().replace(/\s+/g, ' ');
		if (t.length > 20) lines.push(`[P] ${t.substring(0, 220)}${t.length > 220 ? '...' : ''}`);
	});

	// Buttons and CTAs
	doc.querySelectorAll('button, [class*="btn"], [class*="cta"], a[href*="buy"], a[href*="order"], a[href*="checkout"]').forEach(btn => {
		const t = btn.textContent.trim().replace(/\s+/g, ' ');
		if (t && t.length < 120) lines.push(`[CTA] ${t}`);
	});

	// Images (alt text gives context)
	doc.querySelectorAll('img[alt]').forEach(img => {
		const alt = img.getAttribute('alt').trim();
		if (alt) lines.push(`[IMG ALT] ${alt}`);
	});

	// List items (bullets, testimonials etc.)
	doc.querySelectorAll('li').forEach(li => {
		const t = li.textContent.trim().replace(/\s+/g, ' ');
		if (t.length > 10 && t.length < 300) lines.push(`[LI] ${t.substring(0, 220)}`);
	});

	// Limit total size (~12k chars) to stay well within GPT token budget
	let combined = lines.join('\n');
	if (combined.length > 12000) combined = combined.substring(0, 12000) + '\n[...content truncated...]';

	return combined;
}

// ── Screenshot URL builder — tries multiple free services in order ────────
async function _aiGetScreenshotUrl(pageUrl, setStep) {
	// Each service returns a direct image URL GPT Vision can fetch.
	// We probe each with a HEAD request (5s timeout) to confirm it's reachable
	// before passing to GPT. Returns null if all fail.
	const encoded = encodeURIComponent(pageUrl);
	const candidates = [
		// 1. Microlink — reliable, CORS-open image CDN
		`https://api.microlink.io/?url=${encoded}&screenshot=true&meta=false&embed=screenshot.url`,
		// 2. screenshotmachine — no-auth free tier
		`https://api.screenshotmachine.com/?key=demo&url=${encoded}&dimension=1280x900&format=jpg&cacheLimit=0`,
		// 3. thum.io fallback
		`https://image.thum.io/get/width/1280/crop/900/noanimate/${encoded}`,
		// 4. s-shot.ru — lightweight free service
		`https://mini.s-shot.ru/1280x900/JPEG/1280/Z100/?${pageUrl}`,
	];

	for (const url of candidates) {
		try {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 5000);
			const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
			clearTimeout(t);
			if (res.ok && res.headers.get('content-type')?.startsWith('image')) {
				return url;
			}
		} catch (e) { /* try next */ }
	}

	// If HEAD checks fail, just return the most reliable URL and let GPT try anyway
	return candidates[0];
}

async function _aiProxyFetch(url, setStep) {
	const TIMEOUT_MS = 12000;

	// Each entry: { label, buildUrl, extractHtml }
	const proxies = [
		{
			label: 'proxy 1/3',
			buildUrl: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
			extractHtml: async (res) => {
				const d = await res.json();
				return d.contents || '';
			}
		},
		{
			label: 'proxy 2/3',
			buildUrl: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
			extractHtml: async (res) => res.text()
		},
		{
			label: 'proxy 3/3',
			buildUrl: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
			extractHtml: async (res) => res.text()
		}
	];

	let lastError = 'All proxies failed — the page may be blocking automated access';

	for (const proxy of proxies) {
		setStep(`Fetching page HTML (${proxy.label})...`);
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
			let res;
			try {
				res = await fetch(proxy.buildUrl(url), { signal: controller.signal });
			} finally {
				clearTimeout(timer);
			}
			if (!res.ok) {
				lastError = `Proxy returned HTTP ${res.status}`;
				continue;
			}
			const html = await proxy.extractHtml(res);
			if (html && html.trim().length > 200) return html;
			lastError = 'Proxy returned empty content';
		} catch (e) {
			lastError = e.name === 'AbortError'
				? `Proxy timed out after ${TIMEOUT_MS / 1000}s`
				: (e.message || 'Network error');
		}
	}

	throw new Error(`Could not fetch page: ${lastError}. Make sure the URL is publicly accessible.`);
}

async function _aiCallGpt(pageContent, pageUrl, apiKey, screenshotUrl, existingInfo = null, nicheContext = null) {
	// ── Build dynamic context sections ───────────────────────────────────
	// nicheContext is a plain string of key copy signals extracted from the page
	// (title, H1, headings, CTAs) — no predefined categories, GPT interprets it freely.
	const nicheSection = nicheContext
		? `\nPAGE TOPIC / NICHE SIGNALS (extracted from title, headings and CTAs):\n"${nicheContext}"\nUse these signals to infer the exact product/service niche, target problem, and customer language. All suggestions, copy angles, and component ideas must be hyper-specific to this page's topic — not generic. Speak the language of this particular customer.`
		: '';

	const existingComponentsContext = existingInfo
		? `\nEXISTING COMPONENTS ALREADY ON THIS PAGE (from Firebase CMS):\n${existingInfo.componentNames.join(', ')}\n\nCRITICAL: Do NOT suggest adding any component that duplicates one already listed above — they are already present on this page. Infer from the names what each component contains, and focus exclusively on what is MISSING.`
		: '';

	const systemPrompt = `You are a senior conversion strategist, UX diagnostician, and concept developer for ecommerce and offer pages.

Your job is to identify the fewest, highest-leverage changes most likely to increase conversion on THIS page.
You are not here to produce generic landing-page advice.

WORKING METHOD
- Diagnose before prescribing.
- Treat audience assumptions as hypotheses inferred from the page, not fixed truths.
- Optimize for expected conversion lift, not for novelty alone.
- Prefer relevance, specificity, and plausibility over generic best practices.
- Be commercially sharp, but avoid deceptive, fake, or unverifiable claims.

FIRST INFER
- what is being sold
- likely buyer profile
- awareness level
- main promise
- biggest objections
- what proof exists vs missing
- weakest part of page (hook / middle / close)

GROUNDING RULES
- Use only the page text, URL, screenshot, and existing-components context.
- Do NOT suggest components already present.
- Do NOT invent testimonials, numbers, certifications, urgency, or guarantees.
- If proof is missing → use placeholders like [X], [customer], [result].

CREATIVE FREEDOM
- You may suggest any component — not limited to predefined types.
- Do NOT force one idea per psychological trigger.
- Pick the 4 strongest ideas for THIS page.
${nicheSection}
${existingComponentsContext}
${screenshotUrl ? 'Use screenshot for layout, hierarchy, and what exists visually.' : ''}`;

	const userPrompt = `Analyze this landing page as a conversion diagnostician.

PAGE URL: ${pageUrl}

EXTRACTED PAGE CONTENT:
${pageContent}

${screenshotUrl
		? 'The screenshot is attached. Analyze layout, hierarchy, and what components already exist.'
		: 'No screenshot available.'}

YOUR TASK
Find what is most likely hurting conversions right now, then suggest the 4 highest-impact improvements.

THINK FIRST (do not output this):
- infer audience + intent
- identify biggest conversion bottleneck
- brainstorm at least 8 ideas
- select the best 4 (not generic, not duplicates)

OUTPUT RULES
- Give EXACTLY 4 component ideas
- Each must solve a real conversion problem (not random ideas)
- At least:
  • 1 trust/objection reducer
  • 1 conversion trigger (CTA / urgency / decision push)
  • 1 engagement or attention component
- Do NOT invent fake proof
- Use placeholders if needed
- Copy must match page tone (NOT aggressive if page isn't)

Respond with raw JSON only (no markdown code blocks), using this EXACT structure:

{
  "page_summary": "2-3 sentence summary of what this page is about, its goal, and overall visual impression from the screenshot",
  "overall_score": <number 1-10>,
  "score_rationale": "1 sentence explaining the score, referencing both copy and visual design",
  "improvements": [
    {
      "category": "Copy|CTA|Visual Design|Social Proof|Trust|Urgency|Layout|Mobile|Offer|UX",
      "priority": "HIGH|MEDIUM|LOW",
      "title": "Short improvement title",
      "observation": "What you see now (from screenshot or text) — be specific",
      "recommendation": "Specific, actionable fix with rationale"
    }
  ],
  "component_ideas": [
    {
      "component_name": "Component name (slug-friendly, e.g. curiosity-hook-strip)",
      "type": "social-proof|urgency|trust|content|faq|guarantee|comparison|testimonial|bonus|cta-section|objection-handler|curiosity|before-after|quiz-hook|authority|risk-reversal|scarcity|story|mechanism|stats-bar|peer-proof|scroll-trigger|sticky-cta|live-feed|flip-card|counter|progress-bar",
      "interactivity": "STATIC|INTERACTIVE|ANIMATED|SCROLL-TRIGGERED",
      "scroll_timing": "TOP (0-20%)|MIDDLE (20-60%)|BOTTOM (60-90%)|PERSISTENT",
      "description": "What this component adds and why it helps for a 30-70 year old audience — what psychological trigger it activates (curiosity, fear of loss, hope, trust, social proof from peers) AND why this interactivity type works at this scroll position",
      "placement": "Specific placement (e.g. directly below hero section, before the order button, bottom of page)",
      "copy_suggestion": "Ready-to-use copy example written specifically for this page's audience — conversational, specific, no hype"
    }
  ]
}

Respond with raw JSON only using the existing structure.`;

	const messages = [
		{ role: 'system', content: systemPrompt },
		{
			role: 'user',
			content: screenshotUrl
				? [
					{ type: 'text', text: userPrompt },
					{ type: 'image_url', image_url: { url: screenshotUrl, detail: 'high' } }
				]
				: userPrompt  // text-only fallback if screenshot unavailable
		}
	];

	const openAiController = new AbortController();
	const openAiTimer = setTimeout(() => openAiController.abort(), 90000); // 90s — vision calls take longer

	let response;
	try {
		response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			signal: openAiController.signal,
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: 'gpt-5.4',
				messages,
				max_completion_tokens: 4000
			})
		});
	} catch (e) {
		if (e.name === 'AbortError') throw new Error('OpenAI request timed out — try again');
		throw new Error('Could not reach OpenAI: ' + (e.message || 'network error'));
	} finally {
		clearTimeout(openAiTimer);
	}

	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		const msg = err?.error?.message || `OpenAI API error (${response.status})`;
		throw new Error(response.status === 429 ? `[429] ${msg}` : msg);
	}

	const data = await response.json();
	const raw = data.choices?.[0]?.message?.content || '';
	const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

	try {
		return JSON.parse(cleaned);
	} catch (e) {
		throw new Error('GPT returned malformed JSON. Try again. Raw: ' + cleaned.substring(0, 200));
	}
}

// ── Claude (Anthropic) equivalent of _aiCallGpt ───────────────────────────
async function _aiCallClaude(pageContent, pageUrl, apiKey, screenshotUrl, existingInfo = null, nicheContext = null) {
	// Reuse the same prompt-building logic as GPT
	const nicheSection = nicheContext
		? `\nPAGE TOPIC / NICHE SIGNALS (extracted from title, headings and CTAs):\n"${nicheContext}"\nUse these signals to infer the exact product/service niche, target problem, and customer language. All suggestions, copy angles, and component ideas must be hyper-specific to this page's topic — not generic. Speak the language of this particular customer.`
		: '';
	const existingComponentsContext = existingInfo
		? `\nEXISTING COMPONENTS ALREADY ON THIS PAGE (from Firebase CMS):\n${existingInfo.componentNames.join(', ')}\n\nCRITICAL: Do NOT suggest adding any component that duplicates one already listed above — they are already present on this page. Infer from the names what each component contains, and focus exclusively on what is MISSING.`
		: '';

	// System + user prompts are identical to _aiCallGpt — pulled from the same source of truth
	// (We call _aiCallGpt's prompt-building inline here to keep them in sync.)
	const systemPrompt = `You are a world-class conversion rate optimization (CRO) expert and UX analyst specializing in landing pages and direct-response marketing. You have deep expertise in copywriting, visual hierarchy, social proof, trust signals, and funnel optimization.

AUDIENCE CONTEXT — critical for all suggestions:
The page audience is adults aged 30–70. This means:
- They are skeptical and have been disappointed by products before — trust signals and proof are essential
- They respond to curiosity gaps, "hidden secret" framing, and "what doctors/experts don't tell you" angles
- They are motivated by fear of loss (health, money, independence) AND by hope (feeling younger, more energetic, saving money)
- They prefer plain, conversational language — no jargon, no hype that feels fake
- They trust specificity: real numbers, real names, real before/after stories
- They need reassurance before buying: guarantees, easy returns, security badges
- Social proof from PEERS (same age group) is far more persuasive than celebrity endorsements
- Urgency works when it feels real and reason-based — not fake countdown timers
${nicheSection}
${screenshotUrl ? 'You will receive both the extracted text content AND a screenshot of the page. Use the screenshot to assess the visual design, layout, color scheme, CTA visibility, whitespace, image quality, and overall aesthetics — things invisible from text alone.' : 'You will receive the extracted text content of the page.'}
When suggesting component ideas, look at what is MISSING from the page visually and contextually. Do NOT suggest components that are already clearly present.${existingComponentsContext}`;

	const userPrompt = `Analyze this landing page and provide a focused CRO + UX audit.

PAGE URL: ${pageUrl}

EXTRACTED PAGE CONTENT:
${pageContent}

${screenshotUrl ? 'A screenshot of the page is provided as an image URL below — study it carefully for visual hierarchy, design quality, section flow, and what components are already present vs. missing.\nSCREENSHOT URL: ' + screenshotUrl : '(No screenshot available — analyze from text only.)'}

---

Respond with raw JSON only (no markdown code blocks), using this EXACT structure:

{
  "page_summary": "2-3 sentence summary of what this page is about, its goal, and overall visual impression",
  "overall_score": <number 1-10>,
  "score_rationale": "1 sentence explaining the score",
  "improvements": [
    {
      "category": "Copy|CTA|Visual Design|Social Proof|Trust|Urgency|Layout|Mobile|Offer|UX",
      "priority": "HIGH|MEDIUM|LOW",
      "title": "Short improvement title",
      "observation": "What you see now — be specific",
      "recommendation": "Specific, actionable fix with rationale"
    }
  ],
  "component_ideas": [
    {
      "component_name": "slug-friendly-name",
      "type": "social-proof|urgency|trust|content|faq|guarantee|comparison|testimonial|bonus|cta-section|objection-handler|curiosity|before-after|quiz-hook|authority|risk-reversal|scarcity|story|mechanism|stats-bar|peer-proof|scroll-trigger|sticky-cta|live-feed|flip-card|counter|progress-bar",
      "interactivity": "STATIC|INTERACTIVE|ANIMATED|SCROLL-TRIGGERED",
      "scroll_timing": "TOP (0-20%)|MIDDLE (20-60%)|BOTTOM (60-90%)|PERSISTENT",
      "description": "What this component adds and why it helps for a 30-70 year old audience",
      "placement": "Specific placement on the page",
      "copy_suggestion": "Ready-to-use copy example written specifically for a 30-70 year old reader"
    }
  ]
}

Give exactly 4 component_ideas, each targeting a DIFFERENT psychological trigger. Be creative, specific, and pick components that are VISUALLY MISSING from the page.`;

	// Build messages array — Claude doesn't support image_url content blocks from URLs natively
	// but claude-3-opus supports vision via base64; for URL-based screenshots we pass as text hint
	const messages = screenshotUrl
		? [{ role: 'user', content: [
				{ type: 'text', text: userPrompt },
				{ type: 'image', source: { type: 'url', url: screenshotUrl } }
			]}]
		: [{ role: 'user', content: userPrompt }];

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 120000); // 2 min for vision

	let response;
	try {
		response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true'
			},
			body: JSON.stringify({
				model: 'claude-opus-4-5',
				system: systemPrompt,
				messages,
				max_tokens: 4000
			})
		});
	} catch (e) {
		if (e.name === 'AbortError') throw new Error('Claude request timed out — try again');
		throw new Error('Could not reach Claude API: ' + (e.message || 'network error'));
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		const msg = err?.error?.message || `Claude API error (${response.status})`;
		throw new Error(response.status === 429 ? `[429] ${msg}` : msg);
	}

	const data = await response.json();
	const raw = data.content?.[0]?.text || '';
	const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

	try {
		return JSON.parse(cleaned);
	} catch (e) {
		throw new Error('Claude returned malformed JSON. Try again. Raw: ' + cleaned.substring(0, 200));
	}
}

// ── Component Ideas → Generate Code ──────────────────────────────────────

// Shared code-gen function used both at analysis time and for "Regenerate"
async function _aiGenerateOneComponentCode(comp, pageUrl, apiKey, pageContent = '', nicheContext = null, provider = 'gpt') {
	// ── Niche context injected as raw copy signals — no predefined categories ─
	const nicheDirective = nicheContext
		? `\nPAGE TOPIC / NICHE SIGNALS: "${nicheContext}"\nInfer the exact product/niche from these signals and make every headline, benefit line, and CTA hyper-specific to this topic. No generic copy — write as if you know this product/market deeply.`
		: '';

	const systemPrompt = `You are a senior conversion-focused UI engineer and landing-page copywriter.

GOAL PRIORITY
1. Solve the specific conversion problem
2. Render perfectly on any page
3. Match page tone and style
4. Use interaction ONLY if it improves conversion

COPY RULES
- Match page tone exactly
- Be specific, not generic
- No fake testimonials, numbers, or urgency
- Use placeholders if needed: [X], [customer], [result]
- One clear message, one CTA

DESIGN RULES
- The component must feel native to the page BUT still draw attention.
- Use "controlled contrast":
  • Either slightly different background (darker/lighter/accent color)
  • OR stronger typography hierarchy
  • OR subtle shadow / elevation
- Do NOT copy the page design exactly — it will disappear visually.
- Do NOT go full contrast — it will feel disconnected.

VISUAL ENHANCEMENT RULES
- Use at least ONE of:
  • gradient accent (subtle, not flashy)
  • shadow or elevation
  • bold typography contrast (big number / keyword)
  • icon or visual anchor
- Buttons must visually stand out from the background
- Important elements must be instantly scannable (large, bold, spaced)

DESIGN STRATEGY (choose ONE approach internally):
1. BLEND → same palette, stronger hierarchy
2. CONTRAST → different background section to break pattern
3. FOCUS BLOCK → card/strip that isolates attention (shadow, spacing, border)

- Every component must have a clear visual focal point (headline, stat, CTA, or interaction)
- Avoid flat layouts — use depth (spacing, layers, shadows, gradients)
- Avoid boring sections that look like plain text blocks

CRITICAL RULES
1. Root div must have background + text color + font
2. Every text element must have explicit color
3. Content must be visible even if JS fails
4. Mobile responsive
5. Unique class prefix lp-

TECHNICAL
- Inline CSS + JS
- No dependencies
- DOMContentLoaded for JS
- Works as innerHTML`;

	// Pull a sample of the page's actual copy to guide tone-matching
	const pageCopySample = pageContent
		? pageContent.split('\n').filter(l => l.startsWith('[H') || l.startsWith('[P') || l.startsWith('[CTA')).slice(0, 20).join('\n')
		: '';

	const userPrompt = `Generate a complete, ready-to-use HTML/CSS/JS snippet for this landing page component.

Component name: ${comp.component_name}
Type: ${comp.type}
Interactivity level: ${comp.interactivity || 'ANIMATED'}
Scroll timing / page position: ${comp.scroll_timing || 'MIDDLE (20-60%)'}
Description: ${comp.description}
Placement: ${comp.placement || 'anywhere on the page'}
Suggested copy angle: ${comp.copy_suggestion || 'write high-converting copy that fits the page tone'}
Page URL: ${pageUrl || ''}

EXISTING PAGE COPY SAMPLE (match this tone, vocabulary and angle exactly):
${pageCopySample || '(not available — write in a direct, conversational, benefit-focused tone)'}

VISUAL INTENT
- This component should be noticeable within 1 second of scrolling into view
- It must not look like a generic template or plain text section
- It should feel like a "designed block", not just content

INTERACTIVITY IMPLEMENTATION — implement based on the interactivity level above:
- SCROLL-TRIGGERED: IMPORTANT — elements must be FULLY VISIBLE by default in HTML/CSS. Use IntersectionObserver only to add a CSS class that triggers a "polish" animation (e.g. slight fade-up from opacity:0.4 to 1, or scale 0.95→1). NEVER start elements at opacity:0 — if the observer fails to fire, content must still be readable.
- INTERACTIVE: Implement the full interaction in vanilla JS — no libraries. Quizzes track state. Accordions toggle open/close. All interactions have smooth CSS transitions (0.3s ease). First state must always be visible and usable without JS.
- ANIMATED: Auto-playing animations (counters, carousels, tickers). For counters: show the final number immediately in HTML, then count up from 0 when IntersectionObserver fires. Carousels: first slide must be visible immediately. Tickers: first item visible while animation loads.
- PERSISTENT (sticky): Use position:fixed with a smooth slide-in CSS transition. Triggers after scroll. Includes a dismiss button. Z-index 9998.

COPY REQUIREMENTS:
- Mirror the tone and vocabulary from the existing page copy sample above.
- Headline: outcome-focused, specific, benefit-driven — sounds like it belongs on this page.
- Body copy: identify a pain point the page already targets → reinforce with the solution angle → add a concrete benefit.
- CTA: first-person, action verb, matches the page's urgency level.
- Social proof (if applicable): specific name, age/location, concrete measurable result.
- For SCROLL_TIMING = TOP: Copy must be a pattern interrupt — make them stop and read. Bold promise, curiosity gap, "did you know" hook.
- For SCROLL_TIMING = MIDDLE: Copy builds on what they've already read — reference the promise made above, add proof/mechanism/authority.
- For SCROLL_TIMING = BOTTOM: Copy closes the deal — urgency, risk reversal, the cost of inaction. Reader is warm; remove final objections.
- For PERSISTENT: Copy is ultra-short and urgent — 1 headline + 1 CTA button, nothing more.
- If the component uses proof (testimonials, stats, guarantees) and they are not present in the input, use placeholders instead of inventing them.

OUTPUT RULES — CRITICAL, follow exactly:
- Output ONLY the raw HTML (with inline <style> and <script> if needed)
- No markdown, no code fences, no explanations — just the code
- The FIRST element in your output MUST be a div with explicit background-color AND color AND font-family set
- All CSS class names and JS variable names must be prefixed with "lp-${(comp.component_name || 'comp').replace(/[^a-z0-9]/g, '-').substring(0, 12)}-" to avoid conflicts
- Every text element (h1,h2,h3,p,span,li,button,a) must have an explicit color set — NEVER omit color on text
- Self-contained, works when injected as innerHTML into a div on any page
- Fully functional JS — wrap all querySelector calls in DOMContentLoaded or place <script> after the HTML
- Mobile-responsive (375px viewport)
- BEFORE FINISHING: mentally check — is every text element readable? Is any element invisible because opacity:0 was set without a trigger? Fix it.`;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 60000);

	const messages = [
		{ role: 'system', content: systemPrompt },
		{ role: 'user', content: userPrompt }
	];

	let response;
	try {
		if (provider === 'claude') {
			response = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				signal: controller.signal,
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true'
				},
				body: JSON.stringify({
					model: 'claude-opus-4-5',
					system: systemPrompt,
					messages: [{ role: 'user', content: userPrompt }],
					max_tokens: 4000
				})
			});
		} else {
			response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				signal: controller.signal,
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
				body: JSON.stringify({
					model: 'gpt-4o',
					messages,
					max_completion_tokens: 3500
				})
			});
		}
	} catch (fetchErr) {
		clearTimeout(timer);
		const msg = fetchErr.name === 'AbortError' ? 'Request timed out (60s)' : (fetchErr.message || 'Network error');
		console.error('[AI codegen] fetch failed:', fetchErr);
		throw new Error(msg);
	}
	clearTimeout(timer);

	if (!response.ok) {
		let errMsg = `${provider === 'claude' ? 'Claude' : 'OpenAI'} error (${response.status})`;
		try {
			const errBody = await response.json();
			errMsg = errBody?.error?.message || errBody?.error?.error?.message || errMsg;
		} catch (_) {}
		console.error('[AI codegen] API error:', response.status, errMsg);
		throw new Error(`[${response.status}] ${errMsg}`);
	}

	const data = await response.json();
	let code = provider === 'claude'
		? (data.content?.[0]?.text?.trim() || '')
		: (data.choices?.[0]?.message?.content?.trim() || '');
	console.log('[AI codegen] raw response length:', code.length, '| first 120:', code.substring(0, 120));
	// Strip markdown fences if the model added them
	code = code.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
	// Post-process: fix common rendering failures
	code = _aiFixComponentCode(code);
	return code;
}

// ── Post-processing: fix common AI-generated component rendering issues ───
function _aiFixComponentCode(code) {
	if (!code) return code;

	// 1. If the root element has no explicit background-color set,
	//    and it has no background at all, add a safe white background so
	//    text with explicit colors renders correctly.
	//    We only patch the FIRST opening div/section tag.
	const firstTagMatch = code.match(/^(<(?:div|section|article|aside|header|footer|main)[^>]*>)/i);
	if (firstTagMatch) {
		const firstTag = firstTagMatch[1];
		const hasBackground = /background(?:-color)?[\s]*:/i.test(firstTag);
		if (!hasBackground) {
			// Inject a safe neutral background that won't clash with text colors
			const patched = firstTag.replace(/style="([^"]*)"/, (m, existing) => {
				return `style="background:#ffffff; color:#1e293b; font-family:system-ui,-apple-system,sans-serif; ${existing}"`;
			});
			// If no style attr at all, add one
			if (patched === firstTag) {
				code = code.replace(
					firstTagMatch[0],
					firstTag.replace(/^(<\w+)/, '$1 style="background:#ffffff; color:#1e293b; font-family:system-ui,-apple-system,sans-serif;"')
				);
			} else {
				code = code.replace(firstTagMatch[0], patched);
			}
		}
	}

	// 2. Detect orphan opacity:0 in inline styles (element invisible with no JS trigger).
	//    Replace opacity:0 that appears in the HTML (not in <style> blocks) with opacity:1
	//    to prevent invisible content if IntersectionObserver never fires.
	//    We leave opacity:0 inside <style> tags alone (those are handled by JS class toggles).
	const styleBlocks = [];
	const codeWithoutStyles = code.replace(/<style[\s\S]*?<\/style>/gi, (m) => {
		styleBlocks.push(m);
		return `__STYLE_BLOCK_${styleBlocks.length - 1}__`;
	});
	const fixedHtml = codeWithoutStyles.replace(/\bopacity\s*:\s*0\b/gi, 'opacity:1');
	code = fixedHtml.replace(/__STYLE_BLOCK_(\d+)__/g, (_, i) => styleBlocks[parseInt(i)]);

	return code;
}

window._aiGenerateComponentCode = async function(idx) {
	const comp = window._aiLastComponents?.[idx];
	if (!comp) return;

	let activeKey;
	try { activeKey = _aiGetActiveKey(); } catch(e) {
		showNotification(e.message, 'error'); return;
	}

	const btn       = document.getElementById(`ai-gen-btn-${idx}`);
	const loadingEl = document.getElementById(`ai-comp-loading-${idx}`);
	const emptyEl   = document.getElementById(`ai-comp-empty-${idx}`);
	const outputEl  = document.getElementById(`ai-comp-output-${idx}`);

	// UI → loading
	btn.disabled = true;
	btn.style.opacity = '0.5';
	btn.textContent = '⏳ Generating...';
	if (emptyEl)  emptyEl.style.display  = 'none';
	outputEl.style.display = 'none';
	loadingEl.style.display = 'block';

	try {
		const code = await _aiGenerateOneComponentCode(comp, window._aiLastPageUrl || '', activeKey.key, window._aiLastPageContent || '', window._aiLastNicheContext || null, activeKey.provider);

		if (!window._aiGeneratedCodes) window._aiGeneratedCodes = {};
		window._aiGeneratedCodes[idx] = code;

		const ta = document.getElementById(`ai-comp-textarea-${idx}`);
		ta.value = code;
		ta.style.color = '#cdd6f4';
		loadingEl.style.display = 'none';
		if (emptyEl)  emptyEl.style.display  = 'none';
		outputEl.style.display = 'block';
		btn.innerHTML = '🔄 Regenerate';
		btn.style.opacity = '1';
		btn.disabled = false;

	} catch (e) {
		loadingEl.style.display = 'none';
		// If we already had code, keep showing it; otherwise show empty state again
		const hasCode = !!(window._aiGeneratedCodes?.[idx]);
		if (hasCode) {
			outputEl.style.display = 'block';
		} else {
			if (emptyEl) emptyEl.style.display = 'flex';
		}
		btn.innerHTML = hasCode ? '🔄 Regenerate' : '⚡ Generate Code';
		btn.disabled = false;
		btn.style.opacity = '1';
		showNotification('Generation failed: ' + e.message, 'error');
	}
};

window._aiToggleRefineRow = function(idx) {
	const row = document.getElementById(`ai-refine-row-${idx}`);
	const toggleBtn = document.getElementById(`ai-refine-toggle-btn-${idx}`);
	if (!row) return;
	const isVisible = row.style.display !== 'none';
	row.style.display = isVisible ? 'none' : 'flex';
	if (toggleBtn) {
		toggleBtn.style.background = isVisible ? '#0e3a2a' : '#065f46';
		toggleBtn.style.color      = isVisible ? '#34d399' : '#6ee7b7';
	}
	if (!isVisible) {
		// Focus the textarea when opening
		const ta = document.getElementById(`ai-refine-input-${idx}`);
		if (ta) setTimeout(() => ta.focus(), 50);
	}
};

window._aiRefineComponentCode = async function(idx) {
	const comp = window._aiLastComponents?.[idx];
	if (!comp) return;

	const refinementPrompt = (document.getElementById(`ai-refine-input-${idx}`)?.value || '').trim();
	if (!refinementPrompt) {
		showNotification('Write what you want to change first', 'error');
		return;
	}

	const existingCode = window._aiGeneratedCodes?.[idx] || document.getElementById(`ai-comp-textarea-${idx}`)?.value || '';
	if (!existingCode || existingCode.startsWith('<!-- ⚠️')) {
		showNotification('Generate the component first, then refine it', 'error');
		return;
	}

	let activeKey;
	try { activeKey = _aiGetActiveKey(); } catch(e) {
		showNotification(e.message, 'error'); return;
	}

	const btn       = document.getElementById(`ai-gen-btn-${idx}`);
	const loadingEl = document.getElementById(`ai-comp-loading-${idx}`);
	const outputEl  = document.getElementById(`ai-comp-output-${idx}`);
	const applyBtn  = document.querySelector(`#ai-refine-row-${idx} button`);

	// UI → loading state
	if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '⏳...'; }
	if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
	outputEl.style.display = 'none';
	loadingEl.style.display = 'block';

	try {
		const nicheContext = window._aiLastNicheContext || null;
		const nicheDirective = nicheContext
			? `\nPAGE TOPIC / NICHE SIGNALS: "${nicheContext}"\nInfer the exact product/niche from these signals and make every headline, benefit line, and CTA hyper-specific to this topic.`
			: '';
		const systemPrompt = `You are a senior direct-response copywriter AND expert front-end developer. You refine existing landing page HTML/CSS/JS snippets based on specific instructions.\n\nRULES:\n- Apply ONLY the changes requested. Keep everything else exactly as-is.\n- Do not restructure, rename, or restyle parts the user did not mention.\n- Output ONLY the complete updated HTML snippet — no markdown fences, no explanations.\n- The output must be fully self-contained and functional.\n${nicheDirective}`;

		const refineMessages = [
			{ role: 'user', content: `Here is the current HTML component code:\n\n${existingCode}` },
			{ role: 'assistant', content: 'I have reviewed the current component code.' },
			{ role: 'user', content: `Please apply these changes to the component:\n\n${refinementPrompt}\n\nOutput ONLY the complete updated HTML — no explanations, no markdown fences.` }
		];

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 60000);

		let response;
		try {
			if (activeKey.provider === 'claude') {
				response = await fetch('https://api.anthropic.com/v1/messages', {
					method: 'POST',
					signal: controller.signal,
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': activeKey.key,
						'anthropic-version': '2023-06-01',
						'anthropic-dangerous-direct-browser-access': 'true'
					},
					body: JSON.stringify({
						model: 'claude-opus-4-5',
						system: systemPrompt,
						messages: refineMessages,
						max_tokens: 4000
					})
				});
			} else {
				response = await fetch('https://api.openai.com/v1/chat/completions', {
					method: 'POST',
					signal: controller.signal,
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeKey.key}` },
					body: JSON.stringify({
						model: 'gpt-4o',
						messages: [{ role: 'system', content: systemPrompt }, ...refineMessages],
						max_completion_tokens: 3500
					})
				});
			}
		} catch (fetchErr) {
			clearTimeout(timer);
			throw new Error(fetchErr.name === 'AbortError' ? 'Request timed out (60s)' : (fetchErr.message || 'Network error'));
		}
		clearTimeout(timer);

		if (!response.ok) {
			let errMsg = `${activeKey.provider === 'claude' ? 'Claude' : 'OpenAI'} error (${response.status})`;
			try { const b = await response.json(); errMsg = b?.error?.message || b?.error?.error?.message || errMsg; } catch (_) {}
			throw new Error(errMsg);
		}

		const data = await response.json();
		let code = activeKey.provider === 'claude'
			? (data.content?.[0]?.text?.trim() || '')
			: (data.choices?.[0]?.message?.content?.trim() || '');
		code = code.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
		code = _aiFixComponentCode(code);

		window._aiGeneratedCodes[idx] = code;
		const ta = document.getElementById(`ai-comp-textarea-${idx}`);
		if (ta) { ta.value = code; ta.style.color = '#cdd6f4'; }

		loadingEl.style.display = 'none';
		outputEl.style.display = 'block';

		const refineInput = document.getElementById(`ai-refine-input-${idx}`);
		if (refineInput) refineInput.value = '';
		window._aiToggleRefineRow(idx);

		showNotification('Component refined ✅', 'success');

	} catch (e) {
		loadingEl.style.display = 'none';
		outputEl.style.display = 'block';
		showNotification('Refinement failed: ' + e.message, 'error');
	} finally {
		if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = '⚡ Apply'; }
		if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
	}
};

window._aiCopyComponentCode = function(idx) {
	const code = window._aiGeneratedCodes?.[idx] || document.getElementById(`ai-comp-textarea-${idx}`)?.value || '';
	if (!code) return;
	navigator.clipboard.writeText(code).then(() => {
		showNotification('Code copied to clipboard! ✅', 'success');
	}).catch(() => {
		showNotification('Could not auto-copy — select the code manually', 'error');
	});
};

window._aiSaveAsComponent = function(idx) {
	const comp = window._aiLastComponents?.[idx];
	const code = window._aiGeneratedCodes?.[idx] || document.getElementById(`ai-comp-textarea-${idx}`)?.value || '';
	if (!code) return;

	// Close AI modal
	closeAiAnalyzerModal();

	// Pre-fill the custom component modal and open it
	if (!currentSlug) {
		showNotification('Select a slug first, then use Save as Component again', 'error');
		return;
	}
	showAddCustomComponentModal();
	setTimeout(() => {
		const nameInput = document.getElementById('customCompName');
		const codeInput = document.getElementById('customCompCode');
		if (nameInput && comp) {
			nameInput.value = comp.component_name
				.toLowerCase()
				.replace(/[^a-z0-9-_]/g, '-')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '');
		}
		if (codeInput) codeInput.value = code;
	}, 100);
};

window._aiPreviewComponent = function(idx) {
	const code = window._aiGeneratedCodes?.[idx] || document.getElementById(`ai-comp-textarea-${idx}`)?.value || '';
	const comp = window._aiLastComponents?.[idx];
	const name = comp?.component_name || `Component ${idx + 1}`;

	if (!code || code.startsWith('<!-- ⚠️')) {
		showNotification('No code to preview — generate the component first', 'error');
		return;
	}

	// Remove existing preview modal if any
	const existing = document.getElementById('aiPreviewModal');
	if (existing) existing.remove();

	const modal = document.createElement('div');
	modal.id = 'aiPreviewModal';
	modal.style.cssText = `
		position:fixed; inset:0; z-index:99999;
		display:flex; align-items:center; justify-content:center;
		background:rgba(0,0,0,0.72); backdrop-filter:blur(4px);
		padding:20px; box-sizing:border-box;
	`;

	modal.innerHTML = `
		<div style="background:#ffffff; border-radius:16px; overflow:hidden; width:100%; max-width:960px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 32px 80px rgba(0,0,0,0.45); height:100%;">
			<!-- Header -->
			<div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:#0f0f17; border-bottom:1px solid #1e1e2e; flex-shrink:0;">
				<div style="display:flex; align-items:center; gap:10px;">
					<span style="font-size:16px;">👁</span>
					<span style="font-size:13px; font-weight:700; color:#e2e8f0;">Preview — ${escapeHtml(name)}</span>
				</div>
				<div style="display:flex; gap:8px; align-items:center;">
					<!-- Viewport toggles -->
					<div style="display:flex; gap:4px; padding:3px 4px; background:#1e1e2e; border-radius:8px;">
						<button onclick="document.getElementById('aiPreviewFrame').style.width='100%'; document.getElementById('aiPreviewFrame').style.margin='0';"
							title="Desktop" style="padding:4px 10px; background:transparent; color:#94a3b8; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; transition:all .15s;"
							onmouseover="this.style.background='#313244'" onmouseout="this.style.background='transparent'">🖥 Desktop</button>
						<button onclick="document.getElementById('aiPreviewFrame').style.width='768px'; document.getElementById('aiPreviewFrame').style.margin='0 auto';"
							title="Tablet" style="padding:4px 10px; background:transparent; color:#94a3b8; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; transition:all .15s;"
							onmouseover="this.style.background='#313244'" onmouseout="this.style.background='transparent'">📱 Tablet</button>
						<button onclick="document.getElementById('aiPreviewFrame').style.width='390px'; document.getElementById('aiPreviewFrame').style.margin='0 auto';"
							title="Mobile" style="padding:4px 10px; background:transparent; color:#94a3b8; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; transition:all .15s;"
							onmouseover="this.style.background='#313244'" onmouseout="this.style.background='transparent'">📲 Mobile</button>
					</div>
					<button onclick="document.getElementById('aiPreviewModal').remove()"
						style="width:30px; height:30px; display:grid; place-items:center; background:#1e1e2e; color:#94a3b8; border:1px solid #313244; border-radius:8px; font-size:16px; cursor:pointer; font-family:inherit;">✕</button>
				</div>
			</div>
			<!-- iframe container -->
			<div style="flex:1; overflow:auto; background:#e5e7eb; padding:16px; display:flex; justify-content:center;">
				<iframe id="aiPreviewFrame"
					style="width:100%; height:100%; min-height:500px; border:none; border-radius:10px; background:#fff; box-shadow:0 4px 24px rgba(0,0,0,0.15); transition:width .25s ease; display:block;"
					sandbox="allow-scripts allow-same-origin"></iframe>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	// Close on backdrop click
	modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
	// Close on Escape
	const onKey = e => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onKey); } };
	document.addEventListener('keydown', onKey);

	// Write code into iframe via srcdoc
	const frame = document.getElementById('aiPreviewFrame');
	const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
		*, *::before, *::after { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; background: #ffffff; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 16px; line-height: 1.5; color: #1e293b; }
		img { max-width: 100%; height: auto; display: block; }
		a { color: inherit; }
		button { font-family: inherit; }
	</style></head><body>${code}</body></html>`;
	frame.srcdoc = doc;
};

function _aiRenderResults(a, pageUrl, generatedCodes = {}, showSpinners = false) {
	document.getElementById('aiResultsLoading').style.display = 'none';

	const priorityColor = { HIGH: '#dc2626', MEDIUM: '#d97706', LOW: '#16a34a' };
	const priorityBg   = { HIGH: '#fef2f2', MEDIUM: '#fffbeb', LOW: '#f0fdf4' };
	const categoryColor = {
		'Copy': '#1d4ed8', 'CTA': '#7c3aed', 'Visual Design': '#0891b2',
		'Social Proof': '#15803d', 'Trust': '#15803d', 'Urgency': '#b45309',
		'Layout': '#0891b2', 'Mobile': '#0891b2', 'Offer': '#7c3aed', 'UX': '#374151'
	};
	const categoryBg = {
		'Copy': '#eff6ff', 'CTA': '#ede9fe', 'Visual Design': '#ecfeff',
		'Social Proof': '#f0fdf4', 'Trust': '#f0fdf4', 'Urgency': '#fffbeb',
		'Layout': '#ecfeff', 'Mobile': '#ecfeff', 'Offer': '#ede9fe', 'UX': '#f9fafb'
	};

	const typeEmoji = {
		'social-proof': '⭐', 'urgency': '⏰', 'trust': '🛡️', 'content': '📝',
		'video': '🎥', 'faq': '❓', 'guarantee': '✅', 'comparison': '📊',
		'testimonial': '💬', 'bonus': '🎁', 'cta-section': '🎯',
		'objection-handler': '🤝', 'curiosity': '🔍', 'before-after': '🔄',
		'quiz-hook': '🧠', 'authority': '🏅', 'risk-reversal': '🔒',
		'scarcity': '⚡', 'story': '📖', 'mechanism': '⚙️',
		'stats-bar': '📈', 'peer-proof': '👥', 'default': '🧩', 'custom': '✏️'
	};

	// Score badge color — null means custom-ideas-only run (no page analysis)
	const hasAnalysis = a.overall_score !== null && a.overall_score !== undefined && a.overall_score !== '';
	const score = hasAnalysis ? a.overall_score : 0;
	const scoreColor = score >= 8 ? '#16a34a' : score >= 6 ? '#d97706' : '#dc2626';
	const scoreBg    = score >= 8 ? '#f0fdf4' : score >= 6 ? '#fffbeb' : '#fef2f2';

	// Seed global caches
	window._aiLastComponents = a.component_ideas || [];
	window._aiLastPageUrl = pageUrl;
	window._aiGeneratedCodes = { ...generatedCodes };

	// Store raw text for copy
	window._aiLastReportText = _aiReportToText(a, pageUrl);

	let html = `
	<div style="display:flex; flex-direction:column; gap:20px;">

		<!-- Summary + Score (only shown for full page analysis) -->
		${hasAnalysis ? `
		<div style="background:#fafafa; border:1.5px solid var(--border); border-radius:12px; overflow:hidden;">
			<!-- Score bar on top -->
			<div style="display:flex; align-items:center; gap:12px; padding:12px 16px; background:${scoreBg}; border-bottom:1.5px solid ${scoreColor}22;">
				<div style="display:flex; align-items:baseline; gap:4px;">
					<span style="font-size:36px; font-weight:900; color:${scoreColor}; line-height:1;">${score}</span>
					<span style="font-size:14px; font-weight:700; color:${scoreColor}; opacity:0.7;">/ 10</span>
				</div>
				<div style="flex:1; min-width:0;">
					<div style="font-size:11px; font-weight:800; color:${scoreColor}; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:2px;">CRO Score</div>
					<div style="font-size:12px; color:var(--text-secondary); line-height:1.45;">${escapeHtml(a.score_rationale || '')}</div>
				</div>
				<!-- mini score bar -->
				<div style="flex-shrink:0; width:80px;">
					<div style="height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden;">
						<div style="height:100%; width:${score * 10}%; background:${scoreColor}; border-radius:3px; transition:width .6s ease;"></div>
					</div>
				</div>
			</div>
			<!-- Summary text -->
			<div style="padding:14px 16px;">
				<p style="margin:0 0 5px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Page Summary</p>
				<p style="margin:0; font-size:13px; line-height:1.7; color:var(--text-primary);">${escapeHtml(a.page_summary || '')}</p>
			</div>
		</div>
		` : `<!-- no page analysis -->`}

		<!-- Conversion & UX Improvements (collapsible, closed by default) -->
		${(a.improvements?.length) ? `
		<div style="border:1.5px solid var(--border); border-radius:10px; overflow:hidden;">
			<button onclick="var b=document.getElementById('ai-imp-body'),ic=document.getElementById('ai-imp-chevron'),open=b.style.display!=='none';b.style.display=open?'none':'flex';ic.style.transform=open?'rotate(0deg)':'rotate(180deg)';"
				style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 16px; background:#fafafa; border:none; cursor:pointer; font-family:inherit; text-align:left;">
				<div style="display:flex; align-items:center; gap:8px;">
					<span style="font-size:14px;">📈</span>
					<span style="font-size:12px; font-weight:700; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">Conversion & UX Improvements</span>
					<span style="font-size:11px; font-weight:700; color:#6b7280; background:#e5e7eb; padding:1px 8px; border-radius:20px;">${a.improvements.length}</span>
				</div>
				<span id="ai-imp-chevron" style="font-size:12px; color:var(--text-muted); transition:transform .25s; transform:rotate(0deg); display:inline-block;">▼</span>
			</button>
			<div id="ai-imp-body" style="display:none; flex-direction:column; gap:0; border-top:1.5px solid var(--border);">
				${a.improvements.map((imp, i) => {
					const pColor = priorityColor[imp.priority] || '#6b7280';
					const pBg    = priorityBg[imp.priority]    || '#f9fafb';
					const cColor = categoryColor[imp.category] || '#374151';
					const cBg    = categoryBg[imp.category]    || '#f9fafb';
					return `
					<div style="padding:13px 16px; background:white; border-left:3px solid ${pColor};${i > 0 ? ' border-top:1px solid var(--border);' : ''}">
						<div style="display:flex; align-items:center; gap:7px; margin-bottom:6px; flex-wrap:wrap;">
							<span style="font-size:10px; font-weight:800; color:${pColor}; background:${pBg}; padding:2px 8px; border-radius:20px; text-transform:uppercase; letter-spacing:0.5px; border:1px solid ${pColor}30;">${escapeHtml(imp.priority)}</span>
							<span style="font-size:10px; font-weight:700; color:${cColor}; background:${cBg}; padding:2px 9px; border-radius:20px; text-transform:uppercase; letter-spacing:0.3px;">${escapeHtml(imp.category)}</span>
							<span style="font-size:13px; font-weight:600; color:var(--text-primary);">${escapeHtml(imp.title)}</span>
						</div>
						${imp.observation ? `<p style="margin:0 0 5px; font-size:12px; color:var(--text-muted); line-height:1.5; font-style:italic;"><strong>Now:</strong> ${escapeHtml(imp.observation)}</p>` : ''}
						<p style="margin:0; font-size:12px; color:var(--text-primary); line-height:1.6;"><strong>→</strong> ${escapeHtml(imp.recommendation)}</p>
					</div>`;
				}).join('')}
			</div>
		</div>
		` : `<!-- no improvements -->`}

		<!-- Component Ideas -->
		${(a.component_ideas?.length) ? `
		<div>
			<div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">🧩 Component Ideas to Add</div>
			<div style="display:flex; flex-direction:column; gap:10px;">
				${a.component_ideas.map((c, idx) => {
					const code = generatedCodes[idx] || '';
					return `
					<div id="ai-comp-card-${idx}" style="background:white; border:1.5px solid var(--border); border-radius:9px; overflow:hidden;">
						<!-- Card header -->
						<div style="padding:13px 14px; display:flex; flex-direction:column; gap:6px;">
							<div style="display:flex; align-items:center; gap:8px; justify-content:space-between; flex-wrap:wrap;">
								<div style="display:flex; align-items:center; gap:8px;">
									<span style="font-size:18px;">${typeEmoji[c.type] || typeEmoji.default}</span>
									<span style="font-size:13px; font-weight:700; color:var(--text-primary);">${escapeHtml(c.component_name)}</span>
									<span style="font-size:10px; font-weight:700; color:#6d28d9; background:#ede9fe; padding:2px 9px; border-radius:20px; text-transform:uppercase; letter-spacing:0.3px;">${escapeHtml(c.type)}</span>
									${c.interactivity ? `<span style="font-size:10px; font-weight:700; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:20px; text-transform:uppercase; letter-spacing:0.3px;">${escapeHtml(c.interactivity)}</span>` : ''}
									${c.scroll_timing ? `<span style="font-size:10px; font-weight:700; color:#0f766e; background:#f0fdfa; padding:2px 8px; border-radius:20px; letter-spacing:0.2px;">📍 ${escapeHtml(c.scroll_timing)}</span>` : ''}
								</div>
								<div style="display:flex; gap:5px; flex-shrink:0;">
									<button id="ai-gen-btn-${idx}"
										onclick="window._aiGenerateComponentCode(${idx})"
										style="padding:5px 11px; background:#1e1e2e; color:#a78bfa; border:1px solid rgba(124,58,237,0.35); border-radius:7px; font-size:11px; font-weight:700; font-family:inherit; cursor:pointer; white-space:nowrap; transition:opacity .2s;">
										🔄 Regenerate
									</button>
									<button id="ai-refine-toggle-btn-${idx}"
										onclick="window._aiToggleRefineRow(${idx})"
										style="padding:5px 11px; background:#0e3a2a; color:#34d399; border:1px solid rgba(52,211,153,0.35); border-radius:7px; font-size:11px; font-weight:700; font-family:inherit; cursor:pointer; white-space:nowrap; transition:opacity .2s;">
										✏️ Refine
									</button>
								</div>
							</div>
							<p style="margin:0; font-size:12px; color:var(--text-secondary); line-height:1.55;">${escapeHtml(c.description)}</p>
							${c.placement ? `<p style="margin:0; font-size:11px; color:var(--text-muted); line-height:1.4;"><strong>📍 Placement:</strong> ${escapeHtml(c.placement)}</p>` : ''}
							${c.copy_suggestion ? `<div style="padding:8px 10px; background:#f5f3ff; border-radius:6px; font-size:11px; color:#6d28d9; line-height:1.55; font-style:italic;">"${escapeHtml(c.copy_suggestion)}"</div>` : ''}
							<!-- Refine row (hidden by default) -->
							<div id="ai-refine-row-${idx}" style="display:none; gap:6px; align-items:flex-start; margin-top:4px;">
								<textarea id="ai-refine-input-${idx}" rows="2" placeholder="Describe what to fix or improve… e.g. 'make the button red', 'add a second testimonial', 'fix mobile layout'"
									style="flex:1; width:100%; padding:8px 10px; background:#0d1117; color:#e2e8f0; border:1px solid rgba(52,211,153,0.3); border-radius:7px; font-size:12px; font-family:'Inter',sans-serif; resize:vertical; line-height:1.5; box-sizing:border-box; outline:none;"
									onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){window._aiRefineComponentCode(${idx});}"
								></textarea>
								<button onclick="window._aiRefineComponentCode(${idx})"
									style="padding:8px 14px; background:linear-gradient(135deg,#065f46,#047857); color:#ecfdf5; border:none; border-radius:7px; font-size:11px; font-weight:700; font-family:inherit; cursor:pointer; white-space:nowrap; flex-shrink:0;">
									⚡ Apply
								</button>
							</div>
						</div>
						<!-- Code area -->
						<div id="ai-comp-code-${idx}" style="border-top:1.5px solid var(--border);">
							<!-- loading spinner (shown while generating) -->
							<div id="ai-comp-loading-${idx}" style="display:${showSpinners && !code ? 'block' : 'none'}; padding:22px; text-align:center; background:#1e1e2e;">
								<div style="display:inline-block; width:22px; height:22px; border:2px solid rgba(124,58,237,0.3); border-top-color:#a78bfa; border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:8px;"></div>
								<div style="font-size:12px; color:#a78bfa;">Generating...</div>
							</div>
							<!-- empty state — generate prompt -->
							<div id="ai-comp-empty-${idx}" style="display:${!showSpinners && !code ? 'flex' : 'none'}; flex-direction:column; align-items:center; gap:10px; padding:22px 20px; background:#13111e;">
								<p style="margin:0; font-size:12px; color:#6e6a88; text-align:center; line-height:1.5;">Code not generated yet.<br>Click below to build this component.</p>
								<button onclick="window._aiGenerateComponentCode(${idx})"
									style="padding:9px 22px; background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff; border:none; border-radius:8px; font-size:12px; font-weight:700; font-family:inherit; cursor:pointer; box-shadow:0 4px 14px rgba(124,58,237,0.35); transition:opacity .2s;">
									⚡ Generate Code
								</button>
							</div>
							<!-- code output (shown after generation) -->
							<div id="ai-comp-output-${idx}" style="display:${code ? 'block' : 'none'};">
								<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#181825; border-bottom:1px solid #313244;">
									<span style="font-size:11px; color:#a6adc8; font-family:monospace;">HTML / CSS / JS</span>
									<div style="display:flex; gap:6px;">
										<button onclick="window._aiPreviewComponent(${idx})"
											style="padding:4px 11px; background:#0e3a5e; color:#38bdf8; border:1px solid rgba(56,189,248,0.35); border-radius:5px; font-size:11px; font-weight:700; font-family:inherit; cursor:pointer;">
											👁 Preview
										</button>
										<button onclick="window._aiCopyComponentCode(${idx})"
											style="padding:4px 11px; background:#313244; color:#cdd6f4; border:1px solid #45475a; border-radius:5px; font-size:11px; font-weight:700; font-family:inherit; cursor:pointer;">
											📋 Copy
										</button>
										<button onclick="window._aiSaveAsComponent(${idx})"
											style="padding:4px 11px; background:rgba(124,58,237,0.25); color:#a78bfa; border:1px solid rgba(124,58,237,0.4); border-radius:5px; font-size:11px; font-weight:700; font-family:inherit; cursor:pointer;">
											💾 Save
										</button>
									</div>
								</div>
								<textarea id="ai-comp-textarea-${idx}" readonly
									style="width:100%; min-height:220px; padding:14px 16px; background:#1e1e2e; color:#cdd6f4; border:none; font-size:12px; font-family:'JetBrains Mono','Fira Code','Courier New',monospace; resize:vertical; box-sizing:border-box; line-height:1.65; tab-size:2; outline:none;">${escapeHtml(code)}</textarea>
							</div>
						</div>
					</div>`;
				}).join('')}
			</div>
		</div>` : ''}


	</div>`;

	const content = document.getElementById('aiResultsContent');
	content.innerHTML = html;
	content.style.display = 'block';
	document.getElementById('aiCopyBtn').style.display = 'inline-flex';
	const providerLabel = _aiProvider === 'claude' ? '✴️ Claude Opus' : '🤖 GPT-4o';
	const metaBase = pageUrl ? `Analyzed: ${pageUrl} · ` : '';
	document.getElementById('aiResultsMeta').textContent = `${metaBase}${providerLabel} · ${new Date().toLocaleTimeString()}`;
}

function _aiReportToText(a, url) {
	const lines = [
		`AI PAGE ANALYSIS REPORT`,
		`URL: ${url}`,
		`Date: ${new Date().toLocaleString()}`,
		`Overall Score: ${a.overall_score}/10 — ${a.score_rationale}`,
		``,
		`SUMMARY`,
		a.page_summary,
		``,
	];

	if (a.improvements?.length) {
		lines.push(`CONVERSION & UX IMPROVEMENTS`);
		a.improvements.forEach(imp => {
			lines.push(`[${imp.priority}] [${imp.category}] ${imp.title}`);
			if (imp.observation) lines.push(`  Now: ${imp.observation}`);
			lines.push(`  → ${imp.recommendation}`);
		});
		lines.push('');
	}
	if (a.component_ideas?.length) {
		lines.push(`COMPONENT IDEAS`);
		a.component_ideas.forEach(c => {
			lines.push(`• ${c.component_name} (${c.type})`);
			lines.push(`  ${c.description}`);
			if (c.placement) lines.push(`  Placement: ${c.placement}`);
			if (c.copy_suggestion) lines.push(`  Copy: "${c.copy_suggestion}"`);
		});
	}

	return lines.join('\n');
}

function copyAiResults() {
	const text = window._aiLastReportText || '';
	if (!text) return;
	navigator.clipboard.writeText(text).then(() => {
		showNotification('Report copied to clipboard!', 'success');
	}).catch(() => {
		showNotification('Could not copy — try manually selecting the text', 'error');
	});
}

// ─────────────────────────────────────────────────────────────────────────

// Boot
initSidebarState();
initAuthUI();
