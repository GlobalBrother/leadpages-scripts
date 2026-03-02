// Interactive Content Display Script v1.4-debug
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
			'title-interactive-mobile',
			'2col-interactive',
			'big-idea-interactive',
		];

		const allSlugs = ['default', 'amish-fire-cider', 'herbal-parasite-flush'];

		componentPrefixes.forEach(function(prefix) {
			allSlugs.forEach(function(s) {
				const element = document.getElementById(prefix + '-' + s);
				if (element) {
					element.style.setProperty('display', 'none', 'important');
					console.log('Hidden:', prefix + '-' + s);
				}
			});

			const targetElement = document.getElementById(prefix + '-' + slug);
			console.log('Looking for:', prefix + '-' + slug, 'Found:', !!targetElement);
			if (targetElement) {
				targetElement.style.setProperty('display', 'block', 'important');
				console.log('Shown:', prefix + '-' + slug, 'Display value:', window.getComputedStyle(targetElement).display);
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
