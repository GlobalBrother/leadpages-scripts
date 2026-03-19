
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
}

function logout() {
	localStorage.removeItem(SESSION_KEY);
	firebaseUrl = '';
	currentSite = '';
	currentSlug = '';
	contentData = {};
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

	card.innerHTML = `
				<div class="card-header">
					<span class="component-slug-badge">${escapeHtml(currentSlug)}</span>
					<div class="card-component-name">
						<div class="component-icon">${icon}</div>
						<span class="component-label">${escapeHtml(component)}</span>
					</div>

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

function _restoreTitleRange() {
	if (!_savedTitleRange) return null;
	const sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(_savedTitleRange);
	return _savedTitleRange;
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
							<span id="2col-font-val" style="min-width:28px;text-align:center;font-weight:600;">16</span>px
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
		`${FIREBASE_URL}/dynamic_content/${currentSite}/${component}/${currentSlug}.json`,
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

// Boot
initSidebarState();
initAuthUI();
