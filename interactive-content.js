// Interactive Content Display Script v1.1
// Load from external source to avoid Leadpages validation restrictions

(function() {
	var hasRun = false;

	function applyDynamicContent() {
		if (hasRun) {
			return;
		}
		hasRun = true;

		const url = window.location.href.toLowerCase();

		let slug = 'default';
		if (url.includes('amish-fire-cider')) {
			slug = 'amish-fire-cider';
		} else if (url.includes('herbal-parasite-flush')) {
			slug = 'herbal-parasite-flush';
		}

		const componentPrefixes = [
			'title-interactive',
			'2col-interactive',
			'big-idea-interactive',
		];

		const allSlugs = ['default', 'amish-fire-cider', 'herbal-parasite-flush'];

		componentPrefixes.forEach(function(prefix) {
			allSlugs.forEach(function(s) {
				const element = document.getElementById(prefix + '-' + s);
				if (element) {
					element.style.display = 'none';
				}
			});

			const targetElement = document.getElementById(prefix + '-' + slug);
			if (targetElement) {
				targetElement.style.display = 'block';
			}
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', applyDynamicContent);
	} else {
		applyDynamicContent();
	}

	setTimeout(applyDynamicContent, 500);
})();
