// Interactive Content Display Script
// Load from external source to avoid Leadpages validation restrictions

(function() {
	const url = window.location.href.toLowerCase();

	// Determină slug-ul din URL
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

	// Procesează fiecare componentă
	componentPrefixes.forEach(function(prefix) {
		// Ascunde toate variantele
		allSlugs.forEach(function(s) {
			const element = document.getElementById(prefix + '-' + s);
			if (element) {
				element.style.display = 'none';
			}
		});

		// Afișează varianta corectă
		const targetElement = document.getElementById(prefix + '-' + slug);
		if (targetElement) {
			targetElement.style.display = 'block';
		}
	});
})();
