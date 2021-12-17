const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cuid = require('cuid');

const dbPath = path.resolve(
	process.cwd(),
	process.env.DB_PATH || 'email-tracker.db'
);

const db = require('better-sqlite3')(dbPath);
const {
	AnalyseTrackerPage,
	CreateTrackerPage,
	TrackerDetailsPage,
	AllTrackersPage,
	DeleteTrackerPage,
} = require('./templates');

const PORT = process.env.PORT || 8080;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use('/static', express.static('static'));

const email = {
	id: '',
	description: '',
	createdAt: new Date(),
};

const emailEvent = {
	id: '',
	email: '',
	type: '',
	triggeredAt: new Date(),
};

function install() {
	db.prepare(
		`
		CREATE TABLE IF NOT EXISTS emails (
			id TEXT PRIMARY KEY,
			description TEXT,
			createdAt TEXT,
			activated INTEGER
		)
	`
	).run();

	db.prepare(
		`
		CREATE TABLE IF NOT EXISTS events (
			id TEXT PRIMARY KEY,
			email TEXT,
			type TEXT,
			triggeredAt TEXT
		)
	`
	).run();
}

install();

// All Trackers
app.get('/', (req, res) => {
	try {
		const id = cuid();
		const events = db
			.prepare(
				`SELECT emails.*, events.type, events.triggeredAt FROM emails
				LEFT JOIN events ON
    				events.email = emails.id
    			ORDER BY emails.createdAt DESC`
			)
			.all();

		let emails = {};

		for (const email of events) {
			console.log(events);
			if (
				!(email.id in emails) ||
				emails[email.id].triggeredAt > email.triggeredAt
			) {
				emails[email.id] = email;
			}
		}

		return res
			.status(200)
			.type('text/html')
			.send(AllTrackersPage(Object.values(emails)));
	} catch (e) {
		console.error('Error during POST /track', e);
		return res.status(500).json({
			error: 'Internal server error',
		});
	}
});

// Create a tracker page
app.get('/tracker/create', (req, res) => {
	return res.status(200).type('text/html').send(CreateTrackerPage());
});

// Create a tracker action
app.post('/tracker/create', (req, res) => {
	const description = String(
		req.body ? req.body.description : req.query.description || ''
	);

	try {
		const id = cuid();
		const stmt = db.prepare(
			'INSERT INTO emails (id, description, createdAt, activated) VALUES (?, ?, ?, ?)'
		);

		const createdAt = new Date();

		stmt.run(id, description, createdAt.toISOString(), 0);

		return res.status(200).redirect(`/tracker/${id}`);
	} catch (e) {
		console.error('Error during POST /track', e);
		return res.status(500).json({
			error: 'Internal server error',
		});
	}
});

// Embed tracker
app.get('/tracker/:id', (req, res) => {
	try {
		const emailId = req.params.id;

		const email = db
			.prepare('SELECT * FROM emails WHERE id = ?')
			.get(emailId);

		if (!email) {
			return res.status(404).json({
				error: `Tracker with ID ${emailId} not found.`,
			});
		}

		const events = db
			.prepare('SELECT * FROM events WHERE email = ?')
			.all(emailId);

		return res
			.status(200)
			.type('text/html')
			.send(TrackerDetailsPage(email, events));
	} catch (e) {
		console.error('Error during GET /track/:id', e);
		return res.status(500).json({
			error: 'Internal server error',
		});
	}
});

// Delete tracker
app.get('/tracker/:id/delete', (req, res) => {
	try {
		const emailId = req.params.id;

		const email = db
			.prepare('SELECT * FROM emails WHERE id = ?')
			.get(emailId);

		if (!email) {
			return res.status(404).json({
				error: `Tracker with ID ${emailId} not found.`,
			});
		}

		return res.status(200).type('text/html').send(DeleteTrackerPage(email));
	} catch (e) {
		console.error('Error during GET /track/:id', e);
		return res.status(500).json({
			error: 'Internal server error',
		});
	}
});

// Delete tracker action
app.post('/tracker/:id/delete', (req, res) => {
	try {
		const emailId = req.params.id;

		const email = db
			.prepare('SELECT * FROM emails WHERE id = ?')
			.get(emailId);

		if (!email) {
			return res.status(404).json({
				error: `Tracker with ID ${emailId} not found.`,
			});
		}

		db.prepare('DELETE FROM emails WHERE id = ?').run(emailId);
		db.prepare('DELETE FROM events WHERE email = ?').run(emailId);

		return res.status(200).redirect(`/`);
	} catch (e) {
		console.error('Error during GET /track/:id', e);
		return res.status(500).json({
			error: 'Internal server error',
		});
	}
});

// Activate tracker
app.post('/tracker/:id/activate', (req, res) => {
	try {
		const emailId = req.params.id;

		const email = db
			.prepare('SELECT * FROM emails WHERE id = ?')
			.get(emailId);

		if (!email) {
			return res.status(404).json({
				error: `Tracker with ID ${emailId} not found.`,
			});
		}

		db.prepare('UPDATE emails SET activated = 1 WHERE id = ?').run(emailId);

		return res.status(200).redirect(`/tracker/${emailId}`);
	} catch (e) {
		console.error('Error during GET /track/:id', e);
		return res.status(500).json({
			error: 'Internal server error',
		});
	}
});

// Deactivate tracker
app.post('/tracker/:id/deactivate', (req, res) => {
	try {
		const emailId = req.params.id;

		const email = db
			.prepare('SELECT * FROM emails WHERE id = ?')
			.get(emailId);

		if (!email) {
			return res.status(404).json({
				error: `Tracker with ID ${emailId} not found.`,
			});
		}

		db.prepare('UPDATE emails SET activated = 0 WHERE id = ?').run(emailId);

		return res.status(200).redirect(`/tracker/${emailId}`);
	} catch (e) {
		console.error('Error during GET /track/:id', e);
		return res.status(500).json({
			error: 'Internal server error',
		});
	}
});

// Track an email open event action
app.get('/tracker/:id/:event', (req, res) => {
	const emailId = String(req.params.id);
	let event = String(req.params.event).toLowerCase().replaceAll('.gif', '');

	try {
		const email = db
			.prepare('SELECT * FROM emails WHERE id = ?')
			.get(emailId);

		if (!email) {
			return res.status(404).json({
				error: `Tracker with ID ${emailId} not found.`,
			});
		}

		if (email.activated === 0) {
			return res
				.status(403)
				.sendFile(path.resolve(__dirname, 'static/gif.gif'));
		}

		if (!['open', 'open.gif'].includes(event)) {
			return res.status(404).json({
				error: `Event type ${event} doesn't exist.`,
			});
		}

		const stmt = db.prepare(
			'INSERT INTO events (id, email, type, triggeredAt) VALUES (?, ?, ?, ?)'
		);
		const info = stmt.run(
			cuid(),
			email.id,
			event,
			new Date().toISOString()
		);

		return res
			.status(200)
			.sendFile(path.resolve(__dirname, 'static/gif.gif'));
	} catch (e) {
		console.error('Error during GET /track/:id/:event', e);
		return res.status(500).json({
			error: 'Internal server error',
		});
	}
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
