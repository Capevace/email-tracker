const { encode: encodeHtmlEntities } = require('html-entities');

function template({ title = null, subtitle = null, backUrl = null }, body) {
	return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1">
			<link rel="stylesheet" href="/static/pico.css">
			<link rel="stylesheet" href="/static/style.css">
			<title>${title ? `${title} | ` : ''}E-Mail Tracker</title>
		</head>
		<body>
			<style>
				:root {
					--primary: #d81b60;
				}
			</style>
			<main class="container">
				<header>
					<nav>
						<ul>
							<li>
								${backUrl ? `<a href="${backUrl}" style="color: inherit;">` : ''}
								<strong>${
									backUrl
										? `<span style="font-family: monospaced;">‹</span> `
										: ''
								}E-Mail Tracker</strong>
								${backUrl ? `</a>` : ''}
							</li>
						</ul>
						<ul>
							<li><a href="/">My Trackers</a></li>
							<li><a href="/tracker/create">Create a new tracker</a></li>
						</ul>
					</nav>


					${
						subtitle
							? `
						<hgroup>
							<h2>${title}</h2>
							<h3>${subtitle}</h3>
						</hgroup>
					`
							: title
							? `
						<h2>${title}</h2>
					`
							: ''
					}
				</header>

				${body}
			</main>
			<script type="module" src="/static/main.js"></script>
		</body>
		</html>
	`;
}

module.exports.AllTrackersPage = function AllTrackersPage(trackers = []) {
	return template(
		{ title: `All Trackers` },
		`
		
		<div class="data">
			<figure>
				<table role="grid">
					<thead>
						<tr>
							<th scope="col">Description</th>
							<th scope="col">Opened?</th>
							<th scope="col">Created At</th>
							<th scope="col">Active?</th>
							<th scope="col"></th>
						</tr>
					</thead>
					<tbody>
						${trackers
							.map(
								(track) => `
							<tr>
								<th scope="row">${track.description}</th>
								<td>${
									track.type === 'open'
										? `<ins>Opened at ${new Date(
												track.triggeredAt
										  ).toLocaleString()}</ins>`
										: 'Not opened'
								}</td>
								<td>${new Date(track.createdAt).toLocaleString()}</td>
								<td>${
									track.activated === 1
										? `Active`
										: '<span class="danger">Not active</span>'
								}</td>
								<td>
									<div class="flex justify-around">
										<a href="/tracker/${track.id}">Details</a>
										<span class="spacer-sm">|</span>
										<a href="/tracker/${track.id}/delete">Delete</a>
									</div>
								</td>
							</tr>
						`
							)
							.join('\n')}
					</tbody>
				</table>
			</figure>
			${
				trackers.length === 0
					? `
				<center>
					<h3 style="margin-bottom: 0.5rem;">
						No trackers yet
					</h3>
					<a href="/tracker/create">Create a new tracker</a>
				</center>
			`
					: ''
			}
		</div>
	`
	);
};

module.exports.CreateTrackerPage = function CreateTrackerPage() {
	return template(
		{ title: 'Create a new tracker', backUrl: '/' },
		`
		<div class="data">
			<form method="POST" action="/tracker/create">
				<label for="description">
					Description
					<input type="text" id="description" name="description" required placeholder="Example: 'Meeting Confirmation David'" />
				</label>

				<br />
				<button type="submit">Create</button>
			</form>
		</div>
	`
	);
};

module.exports.TrackerDetailsPage = function TrackerDetailsPage(
	email,
	events = []
) {
	function AnalyseSection(email, events = []) {
		return `
		<figure>
			<table role="grid" class="align-top">
				<thead>
					<tr>
						<th scope="col">ID</th>
						<th scope="col">Type</th>
						<th scope="col">Triggered At</th>
						<th scope="col">Headers</th>
					</tr>
				</thead>
				<tbody>
					${events
						.map((event) => {
							const headers = JSON.parse(event.headers);

							return `
								<tr>
									<td>${event.id}</td>
									<td>${event.type}</td>
									<td>${new Date(event.triggeredAt).toLocaleString()}</td>
									<td>
										<details>
											<summary>View headers</summary>
											${Object.entries(headers)
												.map(
													([key, value]) =>
														`<small class="muted">
															<strong>${key}:</strong>
														</small><br>
														${value}`
												)
												.join(' <br> <br> ')}
										</details>
									</td>
								</tr>
							`;
						})
						.join('\n')}
				</tbody>
			</table>
		</figure>
		`;
	}

	function ActivateTrackerSection(email) {
		return `
			<form action="/tracker/${email.id}/${
			email.activated === 1 ? 'deactivate' : 'activate'
		}" method="POST">
				${
					email.activated === 1
						? `
							<button type="submit" class="secondary outline">
								Deactivate tracker
							</button>`
						: `
							<button type="submit" class="secondary ">
								Activate tracker
							</button>`
				}
				
			</form>
		`;
	}

	function EmbedTrackerSection(email) {
		return email.activated === 0
			? `
				<p>You can track the email by pasting one of the snippets below.</p>
				<img src="/tracker/${email.id}/open.gif" class="src tracker-selector" />
				<br />
				<p>
					<strong>You can also paste this example footer, the image is hidden in the <code>--</code>:</strong>
				</p>
				<p>
					<strong>Joe Dart</strong><br/>
					<img class="src" src="/tracker/${email.id}/open.gif" />-- <br/>
					joe.dart@example.com
				</p>
				<br />
				<code class="url">&lt;img src=&quot;URL/tracker/${email.id}/open.gif&quot; /&gt;</code>
				<script type="module">
					Array.from(document.querySelectorAll('.url')).forEach(el => {
						el.textContent = el.textContent.replace('URL', location.protocol + '//' + location.host);
					});
					Array.from(document.querySelectorAll('.src')).forEach(el => {
						console.log(location.protocol + '//' + location.host, el.src)
						el.src = String(el.src)
						console.log(el.src)
					});
				</script>
			`
			: `
				<p class="danger">Embedding is disabled while the tracker is active, as this would trigger the open event.</p>
			`;
	}

	return template(
		{
			title: 'Tracker details',
			backUrl: '/',
		},
		`
			<div class="grid layout-grid-aside">
				<section>
					<section>
						<hgroup>
							<h3>Embed your tracker</h3>
							<h4>The tracker will not accept events until it is activated, so you can embed it without triggering an open.</h4>
						</hgroup>
						${EmbedTrackerSection(email)}
					</section>	
					<section>
						<hgroup>
							<h3>Activate the tracker</h3>
							<h4>The tracker will not accept events until it is activated, so you can embed it without triggering an open.</h4>
						</hgroup>
						${ActivateTrackerSection(email)}
					</section>
				</section>
				<aside>
					<article style="margin-top: 0px; padding: 1rem 1.5rem;">
						<strong>${email.description}</strong><br>
						<small class="muted">Description</small>

						<br><br>

						<strong>${
							email.activated === 1
								? `<ins>Active</ins>`
								: `Not active`
						}</strong><br>
						<small class="muted">Activated?</small>
						
						<br><br>
						
						<strong>
							${
								events.length > 0
									? `<ins>Opened on <br>${new Date(
											events[0].triggeredAt
									  ).toLocaleString()}</ins>`
									: `<span class="muted">Unopened</span>`
							}
						</strong><br>
						<small class="muted">Opened?</small>
					</article>
				</aside>
			</div>
			<section>
				<hgroup>
					<h3>Analyse tracker events</h3>
					<h4>The tracker will not accept events until it is activated, so you can embed it without triggering an open.</h4>
				</hgroup>
				${AnalyseSection(email, events)}
			</section>
	`
	);
};

module.exports.DeleteTrackerPage = function DeleteTrackerPage(email) {
	return template(
		{
			title: `Delete a tracker`,
			subtitle: email.description,
			backUrl: '/',
		},
		`
			<center style="display: block; margin-top: 8vw;">
				<h3 style="margin-bottom: 4rem;">Are you sure you want to delete this tracker?</h3>

				<div class="grid">
					<form action="/" method="GET">
						<button class="secondary">No, take me back</button>
					</form>
					<div class="spacer"></div>
					<form action="/tracker/${email.id}/delete" method="POST">
						<button type="submit">Yes, delete tracker</button>
					</form>
				</div>
			</center>
	`
	);
};
