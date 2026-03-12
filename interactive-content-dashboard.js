// Interactive Content Display Script v2.0-firebase
// Load from external source to avoid Leadpages validation restrictions
// Now powered by Firebase Realtime Database

(function() {
	var hasRun = false;

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

		// Method 4: Auto-detect from pathname (first path segment)
		const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
		if (pathSegments.length > 0) {
			const detectedSlug = pathSegments[0]
				.replace(/[^a-z0-9-]/g, '-')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '');
			if (detectedSlug) {
				return detectedSlug;
			}
		}

		// Method 5: Default fallback
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

			// Get all configured slugs for this site
			const allSlugs = getConfiguredSlugs(siteContent);

			// Detect slug now that we know all configured slugs (URL contains match)
			const slug = getSlug(allSlugs);
		console.log('[ICD] Site detectat:', currentSite);
		console.log('[ICD] Slug-uri din Firebase:', allSlugs);
		console.log('[ICD] Slug detectat:', slug);
		console.log('[ICD] Continut Firebase:', JSON.stringify(siteContent));
			// Apply content-based display logic
			applyContentDisplay(contentPrefixes, allSlugs, slug);

			// Apply functional element logic
			applyFunctionalDisplay(functionalPrefixes, allSlugs, slug);

			// Update actual content from Firebase
			updateContentFromData(siteContent, slug);

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
					}
				} else if (content.startsWith('<')) {
					// It's HTML
					element.innerHTML = content;
				} else {
					// It's plain text - wrap in h2 for main-title component
					if (componentId === 'main-title') {
						element.innerHTML = `<h2>${content}</h2>`;
					} else {
						element.textContent = content;
					}
				}
			}
		});
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
