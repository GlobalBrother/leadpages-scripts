// Interactive Content Display Script
// Load from external source to avoid Leadpages validation restrictions

(function() {
	var hasRun = false;

	function applyDynamicContent() {
		if (hasRun) {
			return;
		}
		hasRun = true;

		const url = window.location.href.toLowerCase();

		// Determina slug-ul din URL
		let slug = 'default';
		if (url.includes('amish-fire-cider')) {
			slug = 'amish-fire-cider';
		} else if (url.includes('herbal-parasite-flush')) {
			slug = 'herbal-parasite-flush';
		}

		// Lista de prefixe pentru componentele dinamice
		const componentPrefixes = [
			'title-interactive',
			'interactivesection'
		];

		// Lista de slug-uri posibile
		const allSlugs = ['default', 'amish-fire-cider', 'herbal-parasite-flush'];

		// Proceseaza fiecare componenta
		componentPrefixes.forEach(function(prefix) {
			// Ascunde toate variantele
			allSlugs.forEach(function(s) {
				const element = document.getElementById(prefix + '-' + s);
				if (element) {
					element.style.display = 'none';
				}
			});

			// Afiseaza varianta corecta
			const targetElement = document.getElementById(prefix + '-' + slug);
			if (targetElement) {
				targetElement.style.display = 'block';
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
