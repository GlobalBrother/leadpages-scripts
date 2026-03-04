// Interactive Content Display Script v1.5-debug
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

		// Content elements that should be shown/hidden with display property
		const contentPrefixes = [
			'title-interactive',
			'title-interactive-mobile',
			'2col-interactive',
			'big-idea-interactive'
		];

		// Functional elements (popups, modals) that have their own display logic
		// We remove wrong variants from DOM, leave correct one untouched
		const functionalPrefixes = [
			'popup-interactive'
		];

		const allSlugs = ['default', 'amish-fire-cider', 'herbal-parasite-flush'];

		// Handle content elements: hide all, show correct variant
		contentPrefixes.forEach(function(prefix) {
			allSlugs.forEach(function(s) {
				const element = document.getElementById(prefix + '-' + s);
				if (element) {
					element.style.setProperty('display', 'none', 'important');
				}
			});

			const targetElement = document.getElementById(prefix + '-' + slug);
			if (targetElement) {
				targetElement.style.setProperty('display', 'block', 'important');
			}
		});

		// Handle functional elements: remove wrong variants, leave correct one in DOM
		functionalPrefixes.forEach(function(prefix) {
			allSlugs.forEach(function(s) {
				if (s !== slug) {
					const element = document.getElementById(prefix + '-' + s);
					if (element && element.parentNode) {
						element.parentNode.removeChild(element);
					}
				}
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', applyDynamicContent);
	} else {
		applyDynamicContent();
	}

	setTimeout(applyDynamicContent, 500);
})();
