// Interactive Content Display Script
// Load from external source to avoid Leadpages validation restrictions

(function() {
	var hasRun = false;
	
	function applyDynamicContent() {
		if (hasRun) {
			console.log('[Dynamic Content] Already executed, skipping...');
			return;
		}
		hasRun = true;
		
		const url = window.location.href.toLowerCase();
		console.log('[Dynamic Content] URL:', url);
		
		// Debug: Lista toate elementele cu ID
		console.log('[Dynamic Content] Available IDs in page:');
		var allElements = document.querySelectorAll('[id]');
		allElements.forEach(function(el) {
			console.log('  - ID:', el.id, '| Tag:', el.tagName, '| Classes:', el.className);
		});

		// Determina slug-ul din URL
		let slug = 'default';
		if (url.includes('amish-fire-cider')) {
			slug = 'amish-fire-cider';
		} else if (url.includes('herbal-parasite-flush')) {
			slug = 'herbal-parasite-flush';
		}
		console.log('[Dynamic Content] Detected slug:', slug);

		// Lista de prefixe pentru componentele dinamice
		const componentPrefixes = [
			'title-interactive',
			'interactivesection'
		];

		// Lista de slug-uri posibile
		const allSlugs = ['default', 'amish-fire-cider', 'herbal-parasite-flush'];

		// Proceseaza fiecare componenta
		componentPrefixes.forEach(function(prefix) {
			console.log('[Dynamic Content] Processing prefix:', prefix);

			// Ascunde toate variantele
			allSlugs.forEach(function(s) {
				const elementId = prefix + '-' + s;
				const element = document.getElementById(elementId);
				console.log('[Dynamic Content] Checking element:', elementId, 'Found:', !!element);
				if (element) {
					element.style.display = 'none';
				}
			});

			// Afiseaza varianta corecta
			const targetId = prefix + '-' + slug;
			const targetElement = document.getElementById(targetId);
			console.log('[Dynamic Content] Showing element:', targetId, 'Found:', !!targetElement);
			if (targetElement) {
				targetElement.style.display = 'block';
			} else {
				console.warn('[Dynamic Content] Target element not found:', targetId);
			}
		});
	}

	// Aplica imediat daca DOM-ul e deja gata
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', applyDynamicContent);
	} else {
		applyDynamicContent();
	}

	// Retry dupa 500ms pentru Leadpages lazy loading
	setTimeout(applyDynamicContent, 500);
})();
