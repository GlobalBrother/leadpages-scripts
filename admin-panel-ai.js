// ─── AI PAGE ANALYZER ─────────────────────────────────────────────────────

// In-memory cache — loaded from Firebase after login, never stored in source
let _aiApiKey = '';   // OpenAI key  (sk-...)
let _aiClaudeKey = '';   // Anthropic key (sk-ant-...)
let _aiProvider = 'gpt'; // 'gpt' | 'claude'

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
	if (_aiApiKey) document.getElementById('aiApiKeyInput').value = _aiApiKey;
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
	const icon = document.getElementById('aiCustomIdeasToggleIcon');
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
	const badge = document.getElementById('aiCustomIdeasCountBadge');
	const genBtn = document.getElementById('aiGenerateMyIdeasBtn');
	if (badge) {
		badge.style.display = count > 0 ? 'inline-block' : 'none';
		badge.textContent = count;
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

	let claudeKey;
	try { claudeKey = _aiGetClaudeKey(); } catch (e) {
		showNotification(e.message, 'error'); return;
	}

	// Disable both buttons while running
	const analyzeBtn = document.getElementById('aiAnalyzeBtn');
	const generateBtn = document.getElementById('aiGenerateMyIdeasBtn');
	analyzeBtn.disabled = true; analyzeBtn.style.opacity = '0.6';
	generateBtn.disabled = true; generateBtn.style.opacity = '0.6';
	generateBtn.textContent = '⏳ Generating...';

	document.getElementById('aiResultsEmpty').style.display = 'none';
	document.getElementById('aiResultsContent').style.display = 'none';
	document.getElementById('aiResultsLoading').style.display = 'flex';
	document.getElementById('aiCopyBtn').style.display = 'none';
	document.getElementById('aiResultsMeta').textContent = '';

	const setStep = msg => { document.getElementById('aiLoadingStep').textContent = msg; };

	try {
		window._aiLastPageContent = '';
		window._aiLastNicheContext = null;
		window._aiLastExistingInfo = null;
		window._aiLastPageUrl = '';

		const stubAnalysis = {
			overall_score: null,
			score_rationale: '',
			page_summary: '',
			improvements: [],
			component_ideas: customIdeas
		};
		window._aiLastComponents = customIdeas;
		window._aiGeneratedCodes = {};

		_aiRenderResults(stubAnalysis, '', {}, true);

		for (let idx = 0; idx < customIdeas.length; idx++) {
			setStep(`Generating component ${idx + 1} / ${customIdeas.length}…`);
			const loadingEl = document.getElementById(`ai-comp-loading-${idx}`);
			const emptyEl = document.getElementById(`ai-comp-empty-${idx}`);
			const outputEl = document.getElementById(`ai-comp-output-${idx}`);
			if (loadingEl) loadingEl.style.display = 'block';
			if (emptyEl) emptyEl.style.display = 'none';
			if (outputEl) outputEl.style.display = 'none';
			try {
				const code = await _aiGenerateOneComponentCode(customIdeas[idx], '', claudeKey, '', null, 'claude');
				window._aiGeneratedCodes[idx] = code;
				if (loadingEl) loadingEl.style.display = 'none';
				if (outputEl) outputEl.style.display = 'block';
				const ta = document.getElementById(`ai-comp-textarea-${idx}`);
				if (ta) ta.value = code;
				const btn = document.getElementById(`ai-gen-btn-${idx}`);
				if (btn) { btn.innerHTML = '🔄 Regenerate'; btn.disabled = false; btn.style.opacity = '1'; }
			} catch (e) {
				if (loadingEl) loadingEl.style.display = 'none';
				if (emptyEl) emptyEl.style.display = 'flex';
				const btn = document.getElementById(`ai-gen-btn-${idx}`);
				if (btn) { btn.innerHTML = '⚡ Generate Code'; btn.disabled = false; btn.style.opacity = '1'; }
			}
		}
	} finally {
		analyzeBtn.disabled = false; analyzeBtn.style.opacity = '1';
		generateBtn.disabled = false; generateBtn.style.opacity = '1';
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

function _aiSetProvider(provider) { /* no-op — provider is now fixed: GPT=analysis, Claude=codegen */ }
function _aiSyncProviderUI() { /* no-op — both key sections are always visible */ }

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

// Always returns the OpenAI key — used for analysis / thinking
function _aiGetGptKey() {
	const key = _aiApiKey || document.getElementById('aiApiKeyInput')?.value.trim() || '';
	if (!key.startsWith('sk-')) throw new Error('No OpenAI API key — needed for page analysis. Expand ▶ API Key settings to add one');
	return key;
}

// Always returns the Anthropic key — used for code generation
function _aiGetClaudeKey() {
	const key = _aiClaudeKey || document.getElementById('aiClaudeKeyInput')?.value.trim() || '';
	if (!key.startsWith('sk-ant-')) throw new Error('No Claude API key — needed for code generation. Expand ▶ API Key settings and add your Anthropic key');
	return key;
}

async function runAiAnalysis() {
	const url = document.getElementById('aiPageUrl').value.trim();
	const customIdeas = _aiGetCustomIdeas();
	const hasUrl = url && url.startsWith('http');

	if (!hasUrl) {
		showNotification('Enter a valid page URL to analyze (starting with https://)', 'error');
		return;
	}

	// Reset global Opus overload flag for this fresh run
	_claudeOpusOverloaded = false;

	let gptKey, claudeKey;
	try {
		gptKey = _aiGetGptKey();
		claudeKey = _aiGetClaudeKey();
	} catch (e) {
		showNotification(e.message, 'error'); return;
	}

	// UI → loading state
	document.getElementById('aiResultsEmpty').style.display = 'none';
	document.getElementById('aiResultsContent').style.display = 'none';
	document.getElementById('aiResultsLoading').style.display = 'flex';
	document.getElementById('aiAnalyzeBtn').disabled = true;
	document.getElementById('aiAnalyzeBtn').style.opacity = '0.6';
	const generateBtn = document.getElementById('aiGenerateMyIdeasBtn');
	if (generateBtn) { generateBtn.disabled = true; generateBtn.style.opacity = '0.5'; }
	document.getElementById('aiCopyBtn').style.display = 'none';
	document.getElementById('aiResultsMeta').textContent = '';

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

		// ── Step 2.6: Screenshot + inspiration pages in parallel ─────────────
		setStep('Capturing screenshot & fetching inspiration from best-in-class pages...');
		const inspirationUrls = _aiPickInspirationUrls(nicheContext, 2);
		const [screenshotUrl, inspirationPages] = await Promise.all([
			_aiGetScreenshotUrl(url, setStep),
			_aiFetchInspirationContent(inspirationUrls)
		]);
		window._aiLastInspirationPages = inspirationPages;
		console.log('[AI] Inspiration pages loaded:', inspirationPages.length, '/', inspirationUrls.length, inspirationUrls);

		// ── Step 3: Analyze with GPT (thinking) ─────────────────────────────
		setStep(screenshotUrl ? 'Analyzing with GPT Vision...' : 'Analyzing with GPT (text only — screenshot unavailable)...');
		const analysis = await _aiCallGpt(pageContent, url, gptKey, screenshotUrl, existingInfo, nicheContext, inspirationPages);

		// ── Step 4: Merge AI suggestions (max 4) with user's custom ideas ─────
		const aiComponents = (analysis.component_ideas || []).slice(0, 4);
		const components = [...aiComponents, ...customIdeas];
		analysis.component_ideas = components;
		const generatedCodes = {};

		if (components.length > 0) {
			// Render cards immediately with spinners, then fire all codegen requests in parallel
			setStep(`Generating ${components.length} components in parallel...`);
			_aiRenderResults(analysis, url, {}, true); // true = show spinners

			if (!window._aiGeneratedCodes) window._aiGeneratedCodes = {};

			await Promise.allSettled(
				components.map((comp, idx) => {
					const loadingEl = document.getElementById(`ai-comp-loading-${idx}`);
					const emptyEl   = document.getElementById(`ai-comp-empty-${idx}`);
					const outputEl  = document.getElementById(`ai-comp-output-${idx}`);
					if (loadingEl) loadingEl.style.display = 'block';
					if (emptyEl)   emptyEl.style.display   = 'none';
					if (outputEl)  outputEl.style.display  = 'none';

					// Stagger starts by 4s per component to avoid simultaneous Opus overload
				return new Promise(r => setTimeout(r, idx * 4000))
					.then(() => _aiGenerateOneComponentCode(comp, url, claudeKey, pageContent, nicheContext, 'claude', inspirationPages))
						.then(code => {
							generatedCodes[idx] = code;
							window._aiGeneratedCodes[idx] = code;
							if (loadingEl) loadingEl.style.display = 'none';
							if (outputEl)  outputEl.style.display  = 'block';
							const ta = document.getElementById(`ai-comp-textarea-${idx}`);
							if (ta) ta.value = code;
							const btn = document.getElementById(`ai-gen-btn-${idx}`);
							if (btn) { btn.innerHTML = '🔄 Regenerate'; btn.disabled = false; btn.style.opacity = '1'; }
						})
						.catch(e => {
							console.error(`[AI codegen] component ${idx} failed:`, e);
							generatedCodes[idx] = '';
							if (loadingEl) loadingEl.style.display = 'none';
							if (emptyEl) {
								emptyEl.style.display = 'flex';
								const errEl = emptyEl.querySelector('.ai-gen-error-msg');
								if (errEl) { errEl.textContent = '⚠️ ' + (e.message || 'Generation failed'); errEl.style.display = 'block'; }
							}
							const btn = document.getElementById(`ai-gen-btn-${idx}`);
							if (btn) { btn.innerHTML = '⚡ Generate Code'; btn.disabled = false; btn.style.opacity = '1'; }
						});
				})
			);
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
		const isAuth = msg.includes('401') || msg.toLowerCase().includes('incorrect api key') || msg.toLowerCase().includes('invalid api key');

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
		const _genBtn = document.getElementById('aiGenerateMyIdeasBtn');
		if (_genBtn) { _genBtn.disabled = false; _genBtn.style.opacity = '1'; }
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
		{ prefix: '[TITLE]', max: 1 },
		{ prefix: '[H1]', max: 1 },
		{ prefix: '[H2]', max: 3 },
		{ prefix: '[H3]', max: 2 },
		{ prefix: '[CTA]', max: 2 },
		{ prefix: '[P]', max: 2 },
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

	const lines = [];

	// Read title + meta BEFORE removing head — they live inside <head>
	const title = doc.querySelector('title');
	if (title) lines.push(`[TITLE] ${title.textContent.trim()}`);
	const metaDesc = doc.querySelector('meta[name="description"]');
	if (metaDesc) lines.push(`[META DESC] ${metaDesc.getAttribute('content') || ''}`);

	// Remove noise elements
	['script', 'style', 'noscript', 'svg', 'iframe', 'link', 'meta', 'head'].forEach(tag => {
		doc.querySelectorAll(tag).forEach(el => el.remove());
	});

	// All headings
	doc.querySelectorAll('h1,h2,h3,h4').forEach(h => {
		const t = h.textContent.trim().replace(/\s+/g, ' ');
		if (t) lines.push(`[${h.tagName}] ${t}`);
	});

	// Paragraphs
	doc.querySelectorAll('p').forEach(p => {
		const t = p.textContent.trim().replace(/\s+/g, ' ');
		if (t.length > 20) lines.push(`[P] ${t.substring(0, 300)}${t.length > 300 ? '...' : ''}`);
	});

	// Buttons and CTAs
	doc.querySelectorAll('button, [class*="btn"], [class*="cta"], a[href*="buy"], a[href*="order"], a[href*="checkout"]').forEach(btn => {
		const t = btn.textContent.trim().replace(/\s+/g, ' ');
		if (t && t.length < 120) lines.push(`[CTA] ${t}`);
	});

	// Prices and offers — elements with price/offer-related class names
	doc.querySelectorAll('[class*="price"], [class*="amount"], [class*="cost"], [class*="saving"], [class*="discount"], [class*="offer"], [class*="bonus"], [class*="guarantee"], [class*="total"], [class*="sale"]').forEach(el => {
		const t = el.textContent.trim().replace(/\s+/g, ' ');
		if (t && t.length < 150) lines.push(`[PRICE/OFFER] ${t}`);
	});

	// Highlighted text — short strong/em/b often contain key numbers, benefits, claims
	doc.querySelectorAll('strong, b, em').forEach(el => {
		const t = el.textContent.trim().replace(/\s+/g, ' ');
		if (t.length > 4 && t.length < 100) lines.push(`[HIGHLIGHT] ${t}`);
	});

	// Images (alt text gives context)
	doc.querySelectorAll('img[alt]').forEach(img => {
		const alt = img.getAttribute('alt').trim();
		if (alt) lines.push(`[IMG ALT] ${alt}`);
	});

	// List items (bullets, testimonials etc.)
	doc.querySelectorAll('li').forEach(li => {
		const t = li.textContent.trim().replace(/\s+/g, ' ');
		if (t.length > 10 && t.length < 300) lines.push(`[LI] ${t.substring(0, 250)}`);
	});

	// Deduplicate lines (same text from nested elements)
	const seen = new Set();
	const deduped = lines.filter(l => {
		const key = l.replace(/\s+/g, ' ').toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key); return true;
	});

	// Raw price/number scan — catches prices in ANY element type (span, div, etc.)
	const bodyText = doc.body?.textContent || '';
	const priceMatches = [...new Set([
		...(bodyText.match(/(?:\$|€|£|RON|EUR|USD|GBP|lei)\s*\d[\d.,]*/gi) || []),
		...(bodyText.match(/\d[\d.,]*\s*(?:RON|EUR|USD|GBP|lei)/gi) || [])
	])];
	if (priceMatches.length > 0) {
		deduped.push(`[PRICES FOUND ON PAGE] ${priceMatches.slice(0, 20).join(' | ')}`);
	}

	let combined = deduped.join('\n');
	if (combined.length > 16000) combined = combined.substring(0, 16000) + '\n[...content truncated...]';

	return combined;
}

// ── Curated inspiration URL pool (sources: unbounce.com/landing-page-examples) ────
// All 40 examples from Unbounce's "Best Landing Page Examples" list
const _AI_INSPIRATION_POOL = [
	{ url: 'https://www.calm.com/',                                   tags: ['health', 'wellness', 'app', 'saas', 'subscription', 'mental', 'sleep', 'meditation'] },
	{ url: 'https://www.zola.com/',                                   tags: ['weddings', 'ecommerce', 'planning', 'registry', 'couples', 'gifts', 'events'] },
	{ url: 'https://www.cdbaby.com/',                                  tags: ['music', 'entertainment', 'saas', 'artists', 'distribution', 'royalties', 'creative'] },
	{ url: 'https://www.netflix.com/',                                 tags: ['subscription', 'entertainment', 'saas', 'streaming', 'video', 'online'] },
	{ url: 'https://www.linkedin.com/',                                tags: ['saas', 'professional', 'career', 'b2b', 'networking', 'jobs', 'premium'] },
	{ url: 'https://try.goby.co/dental/',                              tags: ['health', 'dental', 'wellness', 'ecommerce', 'product', 'subscription', 'hygiene'] },
	{ url: 'https://www.doordash.com/',                                tags: ['food', 'delivery', 'marketplace', 'gig', 'driver', 'restaurant', 'income'] },
	{ url: 'https://www.semrush.com/',                                 tags: ['saas', 'marketing', 'seo', 'tools', 'b2b', 'analytics', 'digital', 'competitors'] },
	{ url: 'https://cocovillage.com/',                                 tags: ['ecommerce', 'furniture', 'kids', 'children', 'bedroom', 'sale', 'discount', 'bedding'] },
	{ url: 'https://www.grassrootscoop.com/',                          tags: ['food', 'nutrition', 'ecommerce', 'subscription', 'organic', 'health', 'meat', 'natural'] },
	{ url: 'https://www.amazon.com/',                                  tags: ['ecommerce', 'saas', 'subscription', 'prime', 'marketplace', 'delivery', 'membership'] },
	{ url: 'https://www.branchfurniture.com/',                         tags: ['ecommerce', 'furniture', 'office', 'b2b', 'product', 'workspace', 'corporate'] },
	{ url: 'https://www.westernrise.com/',                             tags: ['ecommerce', 'clothing', 'apparel', 'outdoor', 'product', 'fashion', 'pants', 'lifestyle'] },
	{ url: 'https://www.athabascau.ca/',                               tags: ['education', 'university', 'online', 'distance', 'courses', 'certificates', 'learning'] },
	{ url: 'https://www.bariatriceating.com/',                         tags: ['health', 'nutrition', 'diet', 'weight', 'food', 'supplements', 'wellness', 'slimming'] },
	{ url: 'https://www.blowltd.com/',                                 tags: ['beauty', 'services', 'local', 'booking', 'app', 'eyelash', 'salon', 'mobile'] },
	{ url: 'https://www.blueforestfarms.com/',                         tags: ['ecommerce', 'hemp', 'cannabis', 'b2b', 'organic', 'wholesale', 'extracts', 'natural'] },
	{ url: 'https://www.borderbuddy.com/',                             tags: ['travel', 'shipping', 'customs', 'b2b', 'logistics', 'import', 'export', 'services'] },
	{ url: 'https://www.rover.com/',                                   tags: ['services', 'pets', 'marketplace', 'booking', 'local', 'animal', 'dog', 'sitting'] },
	{ url: 'https://www.campaignmonitor.com/',                         tags: ['saas', 'email', 'marketing', 'b2b', 'tools', 'newsletter', 'automation'] },
	{ url: 'https://www.classcreator.io/',                             tags: ['saas', 'education', 'edtech', 'school', 'software', 'teachers', 'b2b'] },
	{ url: 'https://www.fastmask.com/',                                tags: ['ecommerce', 'clothing', 'apparel', 'outdoor', 'sports', 'accessories', 'cycling', 'motorcycle'] },
	{ url: 'https://www.goodeggs.com/',                                tags: ['food', 'delivery', 'grocery', 'organic', 'ecommerce', 'subscription', 'local', 'healthy'] },
	{ url: 'https://www.homeloangurus.com/',                           tags: ['finance', 'lending', 'real-estate', 'mortgage', 'credit', 'loan', 'home'] },
	{ url: 'https://www.jetpetresort.com/',                            tags: ['pets', 'local', 'boarding', 'services', 'dog', 'care', 'resort'] },
	{ url: 'https://www.mooala.com/',                                  tags: ['food', 'beverages', 'health', 'ecommerce', 'organic', 'natural', 'vegan', 'dairy-free'] },
	{ url: 'https://nanorcollection.com/',                             tags: ['ecommerce', 'wellness', 'gifts', 'luxury', 'beauty', 'candles', 'lifestyle', 'scent'] },
	{ url: 'https://panda7.ca/en',                                     tags: ['finance', 'insurance', 'car', 'comparison', 'saas', 'quotes', 'savings'] },
	{ url: 'https://www.lyft.com/driver',                              tags: ['gig', 'transportation', 'freelance', 'income', 'earn', 'driver', 'rideshare'] },
	{ url: 'https://perfectketo.com/',                                 tags: ['food', 'nutrition', 'health', 'ecommerce', 'supplements', 'diet', 'keto', 'weight', 'fitness'] },
	{ url: 'https://gusto.com/product/time-tools',                     tags: ['saas', 'hr', 'b2b', 'productivity', 'software', 'business', 'payroll', 'time-tracking'] },
	{ url: 'https://www.roomeze.com/',                                 tags: ['real-estate', 'saas', 'roommates', 'apartments', 'local', 'rental', 'housing'] },
	{ url: 'https://www.smallsforsmalls.com/',                         tags: ['ecommerce', 'pets', 'subscription', 'food', 'natural', 'cat', 'dog', 'fresh'] },
	{ url: 'https://sundae.com/',                                      tags: ['real-estate', 'saas', 'home', 'selling', 'property', 'fast', 'cash', 'offers'] },
	{ url: 'https://www.wavehuggers.com/',                             tags: ['local', 'leisure', 'sports', 'lessons', 'booking', 'outdoor', 'surfing', 'beach'] },
	{ url: 'https://www.woolx.com/',                                   tags: ['ecommerce', 'clothing', 'apparel', 'outdoor', 'product', 'fashion', 'wool', 'merino'] },
	{ url: 'https://www.zumba.com/en-US/become-a-zumba-instructor',    tags: ['fitness', 'health', 'wellness', 'training', 'courses', 'instructor', 'dance', 'certification'] },
	{ url: 'https://mailchimp.com/',                                   tags: ['saas', 'marketing', 'email', 'b2b', 'tools', 'newsletter', 'automation', 'campaigns'] },
	{ url: 'https://open.spotify.com/',                                tags: ['subscription', 'entertainment', 'saas', 'streaming', 'music', 'audio', 'podcasts'] },
	{ url: 'https://www.snackpass.co/',                                tags: ['food', 'saas', 'restaurant', 'social', 'b2b', 'pos', 'ordering', 'quick-serve'] },
];

// Pick 2 inspiration URLs whose tags best match the page's niche signals
function _aiPickInspirationUrls(nicheContext, count = 2) {
	const lc = (nicheContext || '').toLowerCase();
	const scored = _AI_INSPIRATION_POOL.map(entry => ({
		url: entry.url,
		score: entry.tags.filter(tag => lc.includes(tag)).length
	}));
	// Sort by score desc, random tiebreak; if all score 0 just shuffle
	scored.sort((a, b) => b.score - a.score + (Math.random() - 0.5) * 0.1);
	return scored.slice(0, count).map(e => e.url);
}

// Lightweight single-proxy fetch for inspiration pages (best-effort, silent on failure)
async function _aiProxyFetchQuick(url) {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 7000);
		let res;
		try {
			res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: controller.signal });
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) return null;
		const d = await res.json();
		return (d.contents && d.contents.length > 200) ? d.contents : null;
	} catch (e) {
		return null; // silent — inspiration is optional
	}
}

// Scrape inspiration pages in parallel — only keep headings, CTAs, prices (structural signal)
async function _aiFetchInspirationContent(urls) {
	const results = await Promise.allSettled(
		urls.map(async (url) => {
			const html = await _aiProxyFetchQuick(url);
			if (!html) return null;
			const content = _aiExtractPageContent(html, url);
			const niche = _aiExtractNicheContext(content);
			// Keep only structurally informative lines — enough to see patterns, not full content
			const structural = content.split('\n')
				.filter(l => /^\[(H[1-4]|CTA|TITLE|PRICE\/OFFER|HIGHLIGHT)\]/.test(l))
				.slice(0, 12)
				.join('\n');
			return { url, niche, structural };
		})
	);
	return results
		.filter(r => r.status === 'fulfilled' && r.value !== null)
		.map(r => r.value);
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

async function _aiCallGpt(pageContent, pageUrl, apiKey, screenshotUrl, existingInfo = null, nicheContext = null, inspirationPages = []) {
	// ── Build dynamic context sections ───────────────────────────────────
	// nicheContext is a plain string of key copy signals extracted from the page
	// (title, H1, headings, CTAs) — no predefined categories, GPT interprets it freely.
	const nicheSection = nicheContext
		? `\nPAGE TOPIC / NICHE SIGNALS (extracted from title, headings and CTAs):\n"${nicheContext}"\nUse these signals to infer the exact product/service niche, target problem, and customer language. All suggestions, copy angles, and component ideas must be hyper-specific to this page's topic — not generic. Speak the language of this particular customer.`
		: '';

	const existingComponentsContext = existingInfo
		? `\nEXISTING COMPONENTS ALREADY ON THIS PAGE (from Firebase CMS):\n${existingInfo.componentNames.join(', ')}\n\nCRITICAL: Do NOT suggest adding any component that duplicates one already listed above — they are already present on this page. Infer from the names what each component contains, and focus exclusively on what is MISSING.`
		: '';

	const inspirationSection = inspirationPages?.length > 0
		? `\n\nINSPIRATION — BEST-IN-CLASS PAGES IN SIMILAR SPACE:\n` +
			inspirationPages.map(p =>
				`• ${p.url}\n  Key signals: ${p.niche || '(unavailable)'}\n  Structural elements:\n${(p.structural || '(none extracted)').split('\n').map(l => '    ' + l).join('\n')}`
			).join('\n\n') +
			`\n\nUse these to identify structural patterns, component types, and conversion elements that work in this type of market. Specifically flag what the TARGET PAGE is missing that these high-converting pages do well.`
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

CREATIVE FREEDOM + DIVERSITY MANDATE
- You may suggest any component — not limited to predefined types.
- Pick the 4 strongest ideas for THIS page based on actual conversion gaps.
- CRITICAL: Each of the 4 components MUST use a DIFFERENT visual layout format. No two may share the same visual approach.
- For each component you suggest, you must mentally assign it one specific visual format from this palette:
  horizontal-scroll-strip | sticky-progress-bar | tab-switcher | before-after-reveal | quiz-funnel-hook | expandable-accordion | comparison-table | icon-benefit-grid | numbered-timeline | social-proof-ticker | countdown-with-reason | star-rating-breakdown | mega-guarantee-block | transformation-story-card | objection-crusher-list | urgency-stack | trust-logos-bar | animated-stat-counter | micro-quiz-hook | risk-reversal-box | step-process-visual | chat-style-testimonial | peer-proof-carousel | floating-sticky-cta | benefit-checklist-reveal | founder-story-block | mechanism-diagram
- Forbidden: do not suggest two components with the same format. Do not default to "text + CTA button" for all components.
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
- identify the 3 biggest conversion bottlenecks
- brainstorm at least 10 component ideas with a specific visual format for each
- eliminate any that share the same visual format as another
- select the best 4, ensuring: different visual formats, different psychological triggers, different page positions

OUTPUT RULES
- Give EXACTLY 4 component ideas
- Each must solve a real, specific conversion problem on THIS page
- Each must use a DIFFERENT visual layout format — no two components may look or behave the same way
- Cover at minimum: one trust/proof element, one conversion push, one engagement/curiosity element
- At least 2 of the 4 must be INTERACTIVE or ANIMATED — not just static text blocks
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
				max_completion_tokens: 4000,
				temperature: 1
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

// ── Shared Claude fetch with 529 retry + global model fallback ───────────
// Uses a global flag so that once ANY component triggers the Opus→Sonnet switch,
// ALL subsequent requests immediately use Sonnet — no wasted retries.
const _CLAUDE_FALLBACK_MODEL = 'claude-sonnet-4-5';
const _CLAUDE_FALLBACK_AFTER = 1; // switch after this many 529s per request
let _claudeOpusOverloaded = false; // global flag — shared across all parallel calls

function _claudePatchModelToFallback(options) {
	try {
		const body = JSON.parse(options.body);
		if (body.model && body.model.includes('opus')) {
			body.model = _CLAUDE_FALLBACK_MODEL;
			return { ...options, body: JSON.stringify(body) };
		}
	} catch (_) { }
	return options;
}

async function _claudeFetchWithRetry(url, options, timeoutMs = 120000, maxRetries = 4) {
	let delay = 8000;

	// If Opus is already known to be overloaded, skip straight to Sonnet
	let currentOptions = _claudeOpusOverloaded ? _claudePatchModelToFallback(options) : options;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		let response;
		try {
			response = await fetch(url, { ...currentOptions, signal: controller.signal });
		} catch (e) {
			clearTimeout(timer);
			if (e.name === 'AbortError') throw new Error('Claude request timed out — try again');
			throw new Error('Could not reach Claude API: ' + (e.message || 'network error'));
		}
		clearTimeout(timer);

		if (response.status !== 529) return response;
		if (attempt === maxRetries) return response; // let caller handle the final 529

		console.warn(`[Claude] 529 Overloaded — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);

		// After FALLBACK_AFTER failures, switch to Sonnet globally for all calls
		if (!_claudeOpusOverloaded && attempt >= _CLAUDE_FALLBACK_AFTER) {
			_claudeOpusOverloaded = true;
			currentOptions = _claudePatchModelToFallback(currentOptions);
			console.warn(`[Claude] Switching globally to ${_CLAUDE_FALLBACK_MODEL} — all pending requests will use Sonnet`);
			showNotification(`Opus overloaded — switching to Sonnet for all components…`, 'info');
		} else {
			showNotification(`Claude overloaded — retrying in ${delay / 1000}s…`, 'info');
		}

		await new Promise(r => setTimeout(r, delay));
		delay = Math.min(delay * 2, 30000);
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
When suggesting component ideas, look at what is MISSING from the page visually and contextually. Do NOT suggest components that are already clearly present.${existingComponentsContext}${inspirationSection}`;

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
		? [{
			role: 'user', content: [
				{ type: 'text', text: userPrompt },
				{ type: 'image', source: { type: 'url', url: screenshotUrl } }
			]
		}]
		: [{ role: 'user', content: userPrompt }];

	let response;
	try {
		response = await _claudeFetchWithRetry(
			'https://api.anthropic.com/v1/messages',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true'
				},
				body: JSON.stringify({
					model: 'claude-opus-4-6',
					system: systemPrompt,
					messages,
					max_tokens: 6000
				})
			},
			120000 // 2-min per-attempt timeout
		);
	} catch (e) {
		throw new Error('Could not reach Claude API: ' + (e.message || 'network error'));
	}

	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		const msg = err?.error?.message || `Claude API error (${response.status})`;
		throw new Error(response.status === 429 ? `[429] ${msg}` : `[${response.status}] ${msg}`);
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
async function _aiGenerateOneComponentCode(comp, pageUrl, apiKey, pageContent = '', nicheContext = null, provider = 'gpt', inspirationPages = []) {
	// ── Niche context injected as raw copy signals — no predefined categories ─
	const nicheDirective = nicheContext
		? `\nPAGE TOPIC / NICHE SIGNALS: "${nicheContext}"\nInfer the exact product/niche from these signals and make every headline, benefit line, and CTA hyper-specific to this topic. No generic copy — write as if you know this product/market deeply.`
		: '';

	const systemPrompt = `You are a senior conversion-focused UI engineer and landing-page copywriter with strong visual design instincts.

You will receive:
- The component spec (type, description, copy angle)
- A sample of the target page's actual copy (tone, vocabulary, topic)
- Inspiration from high-converting pages in the same space

Your job: design and build a component that fits this specific page's world — not a generic template.

CREATIVITY RULES
- Study the page copy and inspiration pages. Let them inform the visual direction.
- Pick the layout structure that best serves this specific component's conversion goal.
- Do not default to the same card/box pattern every time. Each component should feel purpose-built.
- Surprise yourself: if a ticker makes sense, do a ticker. If a split layout with a bold stat works, do that. If an interactive step-by-step suits the goal, do that.

COPY RULES
- Match the page's tone, vocabulary, and specificity exactly
- No fake testimonials, numbers, or urgency
- Use placeholders if needed: [X], [customer], [result]
- One clear message, one CTA

VISUAL QUALITY RULES
- Every component needs ONE strong visual anchor (large number, bold headline, icon cluster, or color block)
- Use real CSS: gradients, box-shadow, border-radius, transitions
- Minimum 3 distinctly styled elements per component (headline, body, CTA — each visually different)
- Buttons: contrasting bg, padding 12px 28px minimum, border-radius, hover state with transition
- Avoid: all-white flat sections, plain text list with no visual treatment, single-border generic cards

COLOR RULES — CRITICAL
- Do NOT default to dark/black backgrounds. Dark is one option out of many.
- Choose colors that feel authentic to this page's niche and copy tone.
- You will receive a COLOR MOOD directive in the user message — use it as creative direction, not a constraint.
- Pick your own specific colors freely. Do not repeat the same palette you'd use by default.
- Ensure sufficient contrast between background and text at all times.

CRITICAL RULES
1. Root div must have background + text color + font-family
2. Every text element must have explicit color
3. Content fully visible even if JS fails
4. Mobile responsive (375px)
5. Unique class prefix lp-

TECHNICAL
- Inline CSS + JS only
- No external dependencies
- DOMContentLoaded for JS
- Works as innerHTML injection`;

	// Pull a sample of the page's actual copy to guide tone-matching
	const pageCopySample = pageContent
		? pageContent.split('\n').filter(l => l.startsWith('[H') || l.startsWith('[P') || l.startsWith('[CTA')).slice(0, 20).join('\n')
		: '';

	// Random color direction — sets a vibe, no hex values, full creative freedom
	const _colorMoods = [
		'LIGHT & AIRY — light background, strong colored accent, dark text. Clean, modern feel.',
		'WARM & HUMAN — warm-toned background (earthy, amber, coral family), dark text. Approachable, personal.',
		'GRADIENT — use a bold multi-stop gradient as the background. Choose colors that feel right for this niche. Light text on top.',
		'BRAND-DRIVEN — infer the dominant color personality from the page copy and niche, then build the entire palette freely around that.',
		'DEEP & BOLD — dark or very deep background, vivid/bright text and accents. Dramatic, high-contrast.',
		'SPLIT-TONE — two clearly different color zones (top/bottom or left/right). Dynamic visual divide.',
		'MUTED & SOPHISTICATED — low-saturation, restrained palette. Refined typography as the main visual element.',
		'VIBRANT & ENERGETIC — saturated, punchy colors. Bold headlines, high contrast, energetic feel.',
		'MONOCHROMATIC — pick one hue and build the whole component using tints, shades, and tones of that single color.',
		'NATURE-INSPIRED — draw palette cues from nature (forest, ocean, earth, sky, fire) — pick whatever fits the niche.',
	];
	const _colorMood = _colorMoods[Math.floor(Math.random() * _colorMoods.length)];

	const inspirationHint = inspirationPages?.length > 0
		? `\nINSPIRATION FROM HIGH-CONVERTING PAGES (same niche — adapt patterns, don't copy):\n` +
		  inspirationPages.map(p =>
			  `• ${p.url}\n  Key signals: ${p.niche || 'best-in-class page'}\n  Top structural elements:\n${(p.structural || '').split('\n').slice(0, 8).map(l => '    ' + l).join('\n')}`
		  ).join('\n\n') +
		  `\nStudy the visual hierarchy, CTA placement, and proof formatting these pages use — then apply the most effective patterns to this specific component.`
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
${pageCopySample || '(not available — write in a direct, conversational, benefit-focused tone)'}${inspirationHint}

COLOR MOOD FOR THIS COMPONENT: ${_colorMood}

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

	let response;
	if (provider === 'claude') {
		// Use retry helper — manages its own AbortController per attempt
		response = await _claudeFetchWithRetry(
			'https://api.anthropic.com/v1/messages',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true'
				},
				body: JSON.stringify({
					model: 'claude-opus-4-6',
					system: systemPrompt,
					messages: [{ role: 'user', content: userPrompt }],
					max_tokens: 6000,
					temperature: 0.9
				})
			},
			120000 // 2-min per-attempt timeout
		);
	} else {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 120000);
		try {
			response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				signal: controller.signal,
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
				body: JSON.stringify({
					model: 'gpt-5.4',
					messages,
					max_completion_tokens: 3500
				})
			});
		} catch (fetchErr) {
			clearTimeout(timer);
			const msg = fetchErr.name === 'AbortError' ? 'Request timed out (60s)' : (fetchErr.message || 'Network error');
			console.error('[AI codegen] fetch failed:', fetchErr);
			throw new Error(msg);
		}
		clearTimeout(timer);
	}

	if (!response.ok) {
		let errMsg = `${provider === 'claude' ? 'Claude' : 'OpenAI'} error (${response.status})`;
		try {
			const errBody = await response.json();
			errMsg = errBody?.error?.message || errBody?.error?.error?.message || errMsg;
		} catch (_) { }
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

window._aiGenerateComponentCode = async function (idx) {
	const comp = window._aiLastComponents?.[idx];
	if (!comp) {
		showNotification('Component data not found — re-run the analysis to restore it', 'error');
		return;
	}

	let claudeKey;
	try { claudeKey = _aiGetClaudeKey(); } catch (e) {
		showNotification(e.message, 'error'); return;
	}

	const btn = document.getElementById(`ai-gen-btn-${idx}`);
	const loadingEl = document.getElementById(`ai-comp-loading-${idx}`);
	const emptyEl = document.getElementById(`ai-comp-empty-${idx}`);
	const outputEl = document.getElementById(`ai-comp-output-${idx}`);

	// UI → loading
	btn.disabled = true;
	btn.style.opacity = '0.5';
	btn.textContent = '⏳ Generating...';
	if (emptyEl) emptyEl.style.display = 'none';
	outputEl.style.display = 'none';
	loadingEl.style.display = 'block';

	try {
		const code = await _aiGenerateOneComponentCode(comp, window._aiLastPageUrl || '', claudeKey, window._aiLastPageContent || '', window._aiLastNicheContext || null, 'claude', window._aiLastInspirationPages || []);

		if (!window._aiGeneratedCodes) window._aiGeneratedCodes = {};
		window._aiGeneratedCodes[idx] = code;

		const ta = document.getElementById(`ai-comp-textarea-${idx}`);
		ta.value = code;
		ta.style.color = '#cdd6f4';
		loadingEl.style.display = 'none';
		if (emptyEl) emptyEl.style.display = 'none';
		outputEl.style.display = 'block';
		btn.innerHTML = '🔄 Regenerate';
		btn.style.opacity = '1';
		btn.disabled = false;

	} catch (e) {
		loadingEl.style.display = 'none';
		// If we already had code, keep showing it; otherwise show empty state with error
		const hasCode = !!(window._aiGeneratedCodes?.[idx]);
		if (hasCode) {
			outputEl.style.display = 'block';
		} else {
			if (emptyEl) {
				emptyEl.style.display = 'flex';
				const errEl = emptyEl.querySelector('.ai-gen-error-msg');
				const errText = e.message || 'Unknown error';
				if (errEl) {
					errEl.textContent = '⚠️ ' + errText;
					errEl.style.display = 'block';
				}
			}
		}
		btn.innerHTML = hasCode ? '🔄 Regenerate' : '⚡ Generate Code';
		btn.disabled = false;
		btn.style.opacity = '1';
		showNotification('Generation failed: ' + e.message, 'error');
	}
};

window._aiToggleRefineRow = function (idx) {
	const row = document.getElementById(`ai-refine-row-${idx}`);
	const toggleBtn = document.getElementById(`ai-refine-toggle-btn-${idx}`);
	if (!row) return;
	const isVisible = row.style.display !== 'none';
	row.style.display = isVisible ? 'none' : 'flex';
	if (toggleBtn) {
		toggleBtn.style.background = isVisible ? '#0e3a2a' : '#065f46';
		toggleBtn.style.color = isVisible ? '#34d399' : '#6ee7b7';
	}
	if (!isVisible) {
		// Focus the textarea when opening
		const ta = document.getElementById(`ai-refine-input-${idx}`);
		if (ta) setTimeout(() => ta.focus(), 50);
	}
};

window._aiRefineComponentCode = async function (idx) {
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

	let claudeKey;
	try { claudeKey = _aiGetClaudeKey(); } catch (e) {
		showNotification(e.message, 'error'); return;
	}

	const btn = document.getElementById(`ai-gen-btn-${idx}`);
	const loadingEl = document.getElementById(`ai-comp-loading-${idx}`);
	const outputEl = document.getElementById(`ai-comp-output-${idx}`);
	const applyBtn = document.querySelector(`#ai-refine-row-${idx} button`);

	// UI → loading state
	if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '⏳...'; }
	if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
	outputEl.style.display = 'none';
	loadingEl.style.display = 'block';

	try {
		const nicheContext = window._aiLastNicheContext || null;
		const nicheDirective = nicheContext
			? `\nPAGE TOPIC / NICHE SIGNALS: "${nicheContext}"\nKeep all copy hyper-specific to this product/niche — no generic language.`
			: '';
		const buildRefineMessages = (retrying = false) => {
			const systemPrompt = `You are a surgical code editor. Your ONLY job is to apply the exact changes requested — nothing else.

CRITICAL RULES:
1. SURGICAL EDITS ONLY — find the exact lines that need to change and change only those. Do not touch anything else.
2. Copy everything outside the changed parts VERBATIM — character for character. Do not reformat, do not refactor, do not "improve" unrelated code.
3. Do NOT change: class names, IDs, JS logic, structure, layout, animations, or copy — unless explicitly asked.
4. Output the COMPLETE updated HTML with the changes applied — no markdown fences, no explanations, no text before or after the code.
5. The component must remain fully functional after your edit.${nicheDirective}`;

			const retryPrefix = retrying
				? `⚠️ RETRY: Your previous response was identical to the input — you did not apply the requested changes. This time, you MUST make the specific changes listed below.\n\n`
				: '';

			const userMsg = `${retryPrefix}EXISTING COMPONENT (apply changes to this, copy the rest verbatim):
${existingCode}

---
COMPONENT PURPOSE: ${comp.description || 'landing page component'}${comp.copy_suggestion ? `\nCOPY ANGLE: ${comp.copy_suggestion}` : ''}

CHANGES TO APPLY:
${refinementPrompt}

Output ONLY the complete updated HTML — no markdown, no explanations.`;

			return {
				systemPrompt,
				messages: [{ role: 'user', content: userMsg }]
			};
		};

		const callRefineApi = async (retrying = false) => {
			const { systemPrompt, messages: refineMessages } = buildRefineMessages(retrying);
			const response = await _claudeFetchWithRetry(
				'https://api.anthropic.com/v1/messages',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': claudeKey,
						'anthropic-version': '2023-06-01',
						'anthropic-dangerous-direct-browser-access': 'true'
					},
					body: JSON.stringify({
						model: 'claude-opus-4-6',
						system: systemPrompt,
						messages: refineMessages,
						max_tokens: 8000,
						temperature: 0.2
					})
				},
				60000 // 1-min per-attempt timeout
			);

			if (!response.ok) {
				let errMsg = `Claude error (${response.status})`;
				try { const b = await response.json(); errMsg = b?.error?.message || b?.error?.error?.message || errMsg; } catch (_) { }
				throw new Error(errMsg);
			}

			const data = await response.json();
			let code = (data.content?.[0]?.text?.trim() || '');
			code = code.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
			return code;
		};

		// Helper: check if two code strings are identical (ignoring whitespace normalization)
		const codesAreIdentical = (a, b) => a.trim() === b.trim();

		let code = await callRefineApi(false);

		// If response is identical to input, retry once with a stronger prompt
		if (codesAreIdentical(code, existingCode)) {
			console.warn('[AI refine] Response identical to input — retrying with stronger prompt');
			showNotification('No changes detected — retrying with stronger prompt…', 'info');
			code = await callRefineApi(true);
			if (codesAreIdentical(code, existingCode)) {
				showNotification('⚠️ The AI returned identical code even after retry. Try rephrasing your request more explicitly.', 'error');
			}
		}

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

window._aiCopyComponentCode = function (idx) {
	const code = window._aiGeneratedCodes?.[idx] || document.getElementById(`ai-comp-textarea-${idx}`)?.value || '';
	if (!code) return;
	navigator.clipboard.writeText(code).then(() => {
		showNotification('Code copied to clipboard! ✅', 'success');
	}).catch(() => {
		showNotification('Could not auto-copy — select the code manually', 'error');
	});
};

window._aiSaveAsComponent = function (idx) {
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

window._aiPreviewComponent = function (idx) {
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
		<div style="background:#ffffff; border-radius:16px; overflow:hidden; width:100%; max-width:1300px; max-height:95vh; display:flex; flex-direction:column; box-shadow:0 32px 80px rgba(0,0,0,0.45); height:100%;">
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
	const priorityBg = { HIGH: '#fef2f2', MEDIUM: '#fffbeb', LOW: '#f0fdf4' };
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
	const scoreBg = score >= 8 ? '#f0fdf4' : score >= 6 ? '#fffbeb' : '#fef2f2';

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
		const pBg = priorityBg[imp.priority] || '#f9fafb';
		const cColor = categoryColor[imp.category] || '#374151';
		const cBg = categoryBg[imp.category] || '#f9fafb';
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
				<p class="ai-gen-error-msg" style="display:none; margin:0; font-size:11px; color:#f87171; text-align:center; line-height:1.5; padding:6px 10px; background:rgba(248,113,113,0.08); border-radius:6px; max-width:280px;"></p>
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
	const metaBase = pageUrl ? `Analyzed: ${pageUrl} · ` : '';
	document.getElementById('aiResultsMeta').textContent = `${metaBase}🤖 GPT + ✴️ Claude · ${new Date().toLocaleTimeString()}`;

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
