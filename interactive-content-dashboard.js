// Interactive Content Display Script v2.0-firebase
// Load from external source to avoid Leadpages validation restrictions
// Now powered by Firebase Realtime Database

(function() {
	var hasRun = false;
	var _icdSafetyTimeout = null;

	// Inject styles for dynamic components
	const _icdStyles = document.createElement('style');
	_icdStyles.textContent = `
		#main-title h2 {
			font-family: "Noto Serif", sans-serif;
			font-size: 3rem;
			line-height: 1.2;
			margin: 0;
			text-align: center;
			padding: 15px;
		}
		@media (max-width: 767px) {
			#main-title h2 {
				font-size: 1.7rem;
			}
		}

		/* customer-reviews component styles */
		.review-date { font-family: Arial, sans-serif; font-size: 14px !important; color: #333 !important; margin: 0; padding: 0; }
		.review-photo img { width: 100px !important; height: 100px !important; object-fit: cover !important; margin-right: 10px !important; cursor: pointer !important; transition: transform .3s ease !important, filter .3s ease !important; }
		.stars { color: #FFA41C !important; font-size: 18px; }
		.toggle-btn { color: #007185 !important; cursor: pointer; font-size: 1.2em; font-weight: bold; text-decoration: underline; margin-top: 10px; display: inline-block; }
		.reviews-container { padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #fff !important; }
		.reviews-container h1 { color: #000 !important; text-align: center; font-family: Arial, sans-serif !important; }
		.review-card { border-bottom: 1px solid #ddd; padding: 15px 0; }
		.review-header { display: flex; align-items: center; margin-bottom: 10px; }
		.review-header img { width: 50px; height: 50px; border-radius: 50%; margin-right: 15px; }
		.review-header h4 { margin: 0; font-size: 14px; }
		.review-body { font-size: 18px !important; line-height: 1.6; color: #555 !important; }
	`;
	(document.head || document.documentElement).appendChild(_icdStyles);

	function revealComponents(componentIds) {
		componentIds.forEach(function(id) {
			var el = document.getElementById(id);
			if (el) el.style.setProperty('display', 'block', 'important');
		});
	}

	// Firebase Configuration
	const FIREBASE_CONFIG = {
		databaseURL: 'https://content-manager-8da5c-default-rtdb.europe-west1.firebasedatabase.app/' // REPLACE WITH YOUR FIREBASE URL
	};

	// Convert hostname to Firebase-safe key (replace dots with underscores)
	function hostnameToFirebaseKey(hostname) {
		return hostname.replace(/\./g, '_');
	}

	// Detect current site (convert to Firebase format)
	const currentSiteHostname = window.location.hostname;
	const currentSite = hostnameToFirebaseKey(currentSiteHostname);

	// Detect slug from URL
	function getSlug(knownSlugs) {
		const url = window.location.href.toLowerCase();
		const pathname = window.location.pathname.toLowerCase();

		// Method 1: Check if URL contains any known slug from Firebase (contains match)
		if (knownSlugs && knownSlugs.length > 0) {
			for (const slug of knownSlugs) {
				if (url.includes(slug.toLowerCase())) {
					return slug;
				}
			}
		}

		// Method 2: Check for explicit slug parameter in URL (?slug=X or &slug=X)
		const urlParams = new URLSearchParams(window.location.search);
		const explicitSlug = urlParams.get('slug');
		if (explicitSlug) {
			return explicitSlug;
		}

		// Method 3: Check for bare query param as slug (e.g. ?amish-fire-cider)
		const searchString = window.location.search;
		if (searchString.startsWith('?') && !searchString.includes('=')) {
			const bareSlug = searchString.slice(1)
				.replace(/[^a-z0-9-]/g, '-')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '');
			if (bareSlug) {
				return bareSlug;
			}
		}

		// Method 4: Default fallback
		return 'default';
	}

	// Load content from Firebase
	async function loadContentFromFirebase() {
		if (hasRun) return;
		hasRun = true;

		try {
			// Fetch content from Firebase
			const response = await fetch(`${FIREBASE_CONFIG.databaseURL}/dynamic_content/${currentSite}.json`);

			if (!response.ok) {
				console.warn('Firebase content not found for site:', currentSite);
				return;
			}

			const siteContent = await response.json();

			if (!siteContent) {
				console.warn('No content configured for site:', currentSite);
				return;
			}

			// Fetch config for prefixes
			const configResponse = await fetch(`${FIREBASE_CONFIG.databaseURL}/config.json`);
			const config = await configResponse.json();

			const contentPrefixes = config.content_prefixes || [];
			const functionalPrefixes = config.functional_prefixes || [];
			const slugSystems = config.slug_systems || {};

			// Get all configured slugs for this site
			const allSlugs = getConfiguredSlugs(siteContent);
			const componentIds = Object.keys(siteContent);

			// Safety timeout: show components after 3s even if something fails later
			_icdSafetyTimeout = setTimeout(function() { revealComponents(componentIds); }, 3000);

			// Detect slug now that we know all configured slugs (URL contains match)
			const slug = getSlug(allSlugs);

			// Prioritize system sections based on slug → system mapping
			prioritizeSystemSections(slug, slugSystems);

			// Apply content-based display logic
			applyContentDisplay(contentPrefixes, allSlugs, slug);

			// Apply functional element logic
			applyFunctionalDisplay(functionalPrefixes, allSlugs, slug);

			// Update actual content from Firebase
			updateContentFromData(siteContent, slug);

			// Show all component elements after content is applied
			clearTimeout(_icdSafetyTimeout);
			revealComponents(componentIds);

		} catch (error) {
			console.error('Error loading Firebase content:', error);
		}
	}

	// Get all unique slugs configured for this site
	function getConfiguredSlugs(siteContent) {
		const slugs = new Set();

		Object.keys(siteContent).forEach(componentId => {
			Object.keys(siteContent[componentId]).forEach(slug => {
				slugs.add(slug);
			});
		});

		return Array.from(slugs);
	}

	// Handle content elements: hide all, show correct variant
	function applyContentDisplay(contentPrefixes, allSlugs, activeSlug) {
		contentPrefixes.forEach(function(prefix) {
			allSlugs.forEach(function(s) {
				const element = document.getElementById(prefix + '-' + s);
				if (element) {
					element.style.setProperty('display', 'none', 'important');
				}
			});

			const targetElement = document.getElementById(prefix + '-' + activeSlug);
			if (targetElement) {
				targetElement.style.setProperty('display', 'block', 'important');
			}
		});
	}

	// Handle functional elements: remove wrong variants
	function applyFunctionalDisplay(functionalPrefixes, allSlugs, activeSlug) {
		functionalPrefixes.forEach(function(prefix) {
			allSlugs.forEach(function(s) {
				const element = document.getElementById(prefix + '-' + s);
				if (!element) return;

				if (s !== activeSlug) {
					// Remove wrong variants from DOM
					if (element.parentNode) {
						element.parentNode.removeChild(element);
					}
				} else {
					// Reset correct variant to normal display
					element.style.setProperty('display', 'none');
				}
			});
		});
	}

	// Update content from Firebase data (for single elements without variants)
	function updateContentFromData(siteContent, slug) {
		Object.keys(siteContent).forEach(componentId => {
			const componentData = siteContent[componentId];

			// Skip if this component uses multi-variant system
			if (document.getElementById(componentId + '-' + slug)) {
				return;
			}

			// For single elements, update content directly
			const element = document.getElementById(componentId);
			if (element && componentData[slug]) {
				const content = componentData[slug];

				// Detect content type and apply
				if (content.startsWith('http://') || content.startsWith('https://')) {
					// It's a URL - probably for iframe/img/video
					if (element.tagName === 'IFRAME' || element.tagName === 'VIDEO') {
						element.src = content;
					} else if (element.tagName === 'IMG') {
						element.src = content;
					} else if (element.tagName === 'A') {
						element.href = content;
					} else if (element.tagName === 'DIV') {
						const nestedIframe = element.querySelector('iframe');
						if (nestedIframe) {
							nestedIframe.src = content;
						}
					}
				} else if (content.startsWith('<')) {
					// Check if this is a bullets component (has .amish-container structure)
					// If so, find the existing .amish-container in the element and replace only that,
					// leaving the surrounding section (with <style> and <script>) intact.
					const existingContainer = element.querySelector('.amish-container');
					if (existingContainer) {
						const tmp = document.createElement('div');
						tmp.innerHTML = content;
						const newContainer = tmp.querySelector('.amish-container');
						if (newContainer) {
							existingContainer.parentNode.replaceChild(newContainer, existingContainer);
							// Re-run animation on new nodes (old script's closure still points to old nodes)
							const newBullets = Array.from(newContainer.querySelectorAll('.amish-bullet'));
							startBulletsAnimation(newBullets);
						}
					} else {
						// Generic HTML injection with DOMParser
						const parser = new DOMParser();
						const doc = parser.parseFromString(content, 'text/html');

						// Move <style> tags to <head>
						Array.from(doc.querySelectorAll('style')).forEach(function(styleTag) {
							const newStyle = document.createElement('style');
							newStyle.textContent = styleTag.textContent;
							document.head.appendChild(newStyle);
							styleTag.parentNode.removeChild(styleTag);
						});

						// Collect <script> contents before injecting
						const scripts = Array.from(doc.querySelectorAll('script')).map(function(s) {
							const src = s.getAttribute('src');
							const text = s.textContent;
							s.parentNode.removeChild(s);
							return { src: src, text: text };
						});

						// Inject cleaned HTML
						element.innerHTML = doc.body.innerHTML;

						// Initialize toggle for customer-reviews component
						var reviewsContainer = element.querySelector('.reviews-container[data-initial]');
						if (reviewsContainer) {
							var initialReviews = parseInt(reviewsContainer.getAttribute('data-initial')) || 5;
							var reviewCards = reviewsContainer.querySelectorAll('.review-card');
							var toggleBtn = reviewsContainer.querySelector('.toggle-reviews-btn');
							reviewCards.forEach(function(card, i) {
								card.style.setProperty('display', i < initialReviews ? 'block' : 'none', 'important');
							});
							if (toggleBtn) {
								toggleBtn.style.display = reviewCards.length > initialReviews ? 'block' : 'none';
								toggleBtn.addEventListener('click', function() {
									var isHidden = Array.from(reviewCards).some(function(c) { return c.style.display === 'none'; });
									if (isHidden) {
										reviewCards.forEach(function(c) { c.style.setProperty('display', 'block', 'important'); });
										toggleBtn.textContent = 'View Fewer Reviews';
									} else {
										reviewCards.forEach(function(c, i) { c.style.setProperty('display', i < initialReviews ? 'block' : 'none', 'important'); });
										toggleBtn.textContent = 'View More Reviews';
									}
								});
							}
						}

						// Execute scripts
						scripts.forEach(function(scriptData) {
							const newScript = document.createElement('script');
							if (scriptData.src) {
								newScript.src = scriptData.src;
							} else {
								newScript.textContent = scriptData.text;
							}
							document.body.appendChild(newScript);
						});
					}
				} else {
					// It's plain text
					const contentWithBreaks = content.replace(/\n/g, '<br>');
					if (componentId === 'main-title') {
						element.innerHTML = `<h2>${contentWithBreaks}</h2>`;
					} else {
						element.innerHTML = contentWithBreaks;
					}
				}
			}
		});
	}

	// ── Photo Modal (for customer-reviews component) ────────────────────────────
	function ensurePhotoModal() {
		if (document.getElementById('_icd_photo_modal')) return;

		// Inject modal CSS
		const modalStyle = document.createElement('style');
		modalStyle.textContent = `
			#_icd_photo_modal {
				display: none; position: fixed; z-index: 99999;
				left: 0; top: 0; width: 100%; height: 100%;
				background: rgba(0,0,0,0.85); overflow: auto;
			}
			#_icd_photo_modal_img {
				display: block; margin: 5% auto; max-width: 90%; max-height: 85vh;
				object-fit: contain; border-radius: 6px;
			}
			#_icd_photo_modal_close {
				position: fixed; top: 18px; right: 28px;
				color: #fff; font-size: 40px; font-weight: bold;
				cursor: pointer; line-height: 1; user-select: none; z-index: 100000;
			}
			#_icd_photo_modal_close:hover { color: #ccc; }
		`;
		document.head.appendChild(modalStyle);

		// Inject modal HTML
		const modal = document.createElement('div');
		modal.id = '_icd_photo_modal';
		modal.innerHTML = '<span id="_icd_photo_modal_close">&times;</span><img id="_icd_photo_modal_img" />';
		document.body.appendChild(modal);

		document.getElementById('_icd_photo_modal_close').addEventListener('click', closeModal);
		modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
		document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
	}

	function openModal(imgEl) {
		ensurePhotoModal();
		document.getElementById('_icd_photo_modal_img').src = imgEl.src;
		document.getElementById('_icd_photo_modal').style.display = 'block';
	}

	function closeModal() {
		const modal = document.getElementById('_icd_photo_modal');
		if (modal) modal.style.display = 'none';
	}

	// Expose globally so onclick="openModal(this)" works
	window.openModal  = openModal;
	window.closeModal = closeModal;
	// ─────────────────────────────────────────────────────────────────────────────

	// ── System Section Prioritization ────────────────────────────────────────────
	// Moves the <section> wrappers of the active system (e.g. "respiratory") to the
	// top of their sibling group so they appear first on the page.
	//
	// How it works:
	//   1. Look up slug → system key in slugSystems  (e.g. "jello-flu-shots" → "respiratory")
	//   2. Find every element whose id ends with "-system-title" or "-system-content"
	//      → these are ALL system markers in the page
	//   3. Walk up to each marker's closest <section> ancestor
	//   4. Collect the <section>s that belong to the ACTIVE system and those that don't
	//   5. Prepend active <section>s before the first system <section> found in the DOM
	//      (preserving relative order of non-active sections underneath)
	function prioritizeSystemSections(slug, slugSystems) {
		const systemKey = slugSystems[slug];
		if (!systemKey) return;

		// Find every element with id ending in "-system-title" or "-system-content"
		const allMarkers = Array.from(
			document.querySelectorAll('[id$="-system-title"],[id$="-system-content"]')
		);
		if (allMarkers.length === 0) return;

		// Map each marker → its system key (everything before "-system-")
		// e.g. "respiratory-system-title" → "respiratory"
		//      "nervous-system-content"   → "nervous"
		function markerToSystemKey(id) {
			const m = id.match(/^(.+)-system-(?:title|content)$/);
			return m ? m[1] : null;
		}

		// Collect unique <section> ancestors in DOM order,
		// storing which system they belong to
		const seen = new Set();
		const allSections = []; // [{ section, sysKey }]
		allMarkers.forEach(function(marker) {
			const section = marker.closest('section') || marker.parentElement;
			if (section && !seen.has(section)) {
				seen.add(section);
				allSections.push({ section: section, sysKey: markerToSystemKey(marker.id) });
			}
		});
		if (allSections.length === 0) return;

		const parent = allSections[0].section.parentNode;
		if (!parent) return;

		// Find the anchor: the first <section> in DOM that belongs to ANY system
		// We will insert everything starting from this position.
		const anchor = allSections[0].section;

		// Separate active-system sections from the rest (preserve relative order within each group)
		const activeSections = allSections.filter(function(s) { return s.sysKey === systemKey; });
		const otherSections  = allSections.filter(function(s) { return s.sysKey !== systemKey; });

		// Insert active sections first (before anchor), then other sections — in their original order.
		// Use a moving reference so that each insertBefore puts the next item directly after the previous.
		var ref = anchor;
		activeSections.forEach(function(s) {
			parent.insertBefore(s.section, ref);
			// After inserting before ref, the new section is just before ref — move ref to stay consistent
		});
		// Now insert all other sections after the active block, preserving their relative order
		// They go right before the current `ref` (which is the original first section, now after active ones)
		otherSections.forEach(function(s) {
			parent.insertBefore(s.section, ref);
		});
	}
	// ─────────────────────────────────────────────────────────────────────────────

	// Animation for bullets - works on any NodeList of .amish-bullet elements
	function startBulletsAnimation(bullets) {
		if (!bullets || bullets.length === 0) return;
		let current = 0;

		function updateBullets() {
			bullets.forEach(function(b) { b.classList.remove('bolded'); });
			if (bullets[current]) bullets[current].classList.add('bolded');
			current = (current + 1) % bullets.length;
		}

		updateBullets();
		setInterval(updateBullets, 1000);
	}

	// Initialize
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', loadContentFromFirebase);
	} else {
		loadContentFromFirebase();
	}

	// Fallback safety
	setTimeout(loadContentFromFirebase, 500);
})();
