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
	function getSlug() {
		const url = window.location.href.toLowerCase();
		const pathname = window.location.pathname.toLowerCase();

		// Method 1: Check for explicit slug parameter in URL (?slug=X or &slug=X)
		const urlParams = new URLSearchParams(window.location.search);
		const explicitSlug = urlParams.get('slug');
		if (explicitSlug) {
			return explicitSlug;
		}

		// Method 2: Auto-detect from pathname (first path segment)
		// Example: /reactive-site-admin-panel/ → reactive-site-admin-panel
		// Example: /book/ → book
		const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
		if (pathSegments.length > 0) {
			// Return first path segment as slug, sanitized
			const detectedSlug = pathSegments[0]
				.replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with dash
				.replace(/-+/g, '-') // Replace multiple dashes with single dash
				.replace(/^-|-$/g, ''); // Remove leading/trailing dashes

			if (detectedSlug) {
				return detectedSlug;
			}
		}

		// Method 3: Fallback - check for hardcoded slugs (backward compatibility)
		if (url.includes('amish-fire-cider')) return 'amish-fire-cider';
		if (url.includes('herbal-parasite-flush')) return 'herbal-parasite-flush';

		// Method 4: Default fallback
		return 'default';
	}

	// Load content from Firebase
	async function loadContentFromFirebase() {
		if (hasRun) return;
		hasRun = true;

		const slug = getSlug();

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
					// It's plain text
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
