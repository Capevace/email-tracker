for (const form of document.querySelectorAll('form')) {
	form.addEventListener('submit', (e) => {
		e.target
			.querySelector('button[type=submit]')
			.setAttribute('aria-busy', 'true');
	});
}
