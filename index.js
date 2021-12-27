#!/usr/bin/env node

const path = require('path');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const cuid = require('cuid');

const DB_PATH = path.resolve(
	process.cwd(),
	process.env.DB_PATH || 'email-tracker.db'
);

const DEBUG = !!process.env.DEBUG;

const logger = {
	_log(type = 'DEBUG', title = 'main', message, options = {}) {
		let attachment = options.attach || [];
		let isError = false;

		if (attachment instanceof Error) {
			isError = true;

			attachment = JSON.parse(
				JSON.stringify(
					attachment,
					Object.getOwnPropertyNames(attachment)
				)
			);

			if (attachment.stack)
				attachment.stack = attachment.stack
					.split('\n')
					.map((line, index) =>
						index === 0 ? line : `            ${line}`
					)
					.join('\n');
		}

		const attachmentText = Object.keys(attachment)
			.map(
				(key) =>
					`    ${key} = ${
						isError && typeof attachment[key] !== 'object'
							? attachment[key]
							: JSON.stringify(attachment[key])
					}`
			)
			.join('\n');

		const log = type === 'ERROR' ? console.error : console.log;

		log(
			`${type} [${new Date().toISOString()}]	${title}	${message}${
				attachment ? `\n${attachmentText}` : ''
			}`
		);
	},
	info: (...args) => logger._log('INFO', ...args),
	error: (...args) => logger._log('ERROR', ...args),
};

const db = require('better-sqlite3')(DB_PATH);
const {
	AnalyseTrackerPage,
	CreateTrackerPage,
	TrackerDetailsPage,
	AllTrackersPage,
	DeleteTrackerPage,
} = require('./templates');

const PORT = process.env.PORT || 8080;

const app = express();

const httpServer = http.createServer(app);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(errorMiddleware);

app.use('/static', express.static('static'));

// const email = {
// 	id: '',
// 	description: '',
// 	createdAt: new Date(),
// };

// const emailEvent = {
// 	id: '',
// 	email: '',
// 	type: '',
// 	triggeredAt: new Date(),
// };

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
			triggeredAt TEXT,
			headers TEXT
		)
	`
	).run();
}

install();

function errorMiddleware(req, res, next) {
	res.error = (code = 500, message = 'Internal Server Error') => {
		return res.status(500).json({
			error: 'Internal server error',
		});
	};

	return next(null, req, res, next);
}

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
	} catch (error) {
		logger.error('tracker', 'Could not fetch trackers', {
			attach: error,
		});

		return res.error(500, 'Could not fetch trackers');
	}
});

// Create a tracker page
app.get('/tracker/create', (req, res) => {
	try {
		return res.status(200).type('text/html').send(CreateTrackerPage());
	} catch (error) {
		logger.error('tracker', 'Error showing tracker creation view', {
			attach: error,
		});

		return res.error(500, 'Cannot display tracker creation');
	}
});

// Create a tracker action
app.post('/tracker/create', (req, res) => {
	try {
		const description = String(
			req.body ? req.body.description : req.query.description || ''
		);
		const id = cuid();
		const stmt = db.prepare(
			'INSERT INTO emails (id, description, createdAt, activated) VALUES (?, ?, ?, ?)'
		);

		const createdAt = new Date();

		stmt.run(id, description, createdAt.toISOString(), 0);

		logger.info('tracker', `Created Tracker`, {
			attach: { id, description, createdAt, activated: 0 },
		});
		return res.status(200).redirect(`/tracker/${id}`);
	} catch (error) {
		logger.error('tracker', 'Could not create tracker', {
			attach: error,
		});

		return res.error(500, 'Could not create tracker');
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
	} catch (error) {
		logger.error('tracker', 'Could not display tracker details', {
			attach: error,
		});

		return res.error(500, 'Unable to fetch tracker data');
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
		logger.error(
			'tracker',
			'Could not display tracker deletion confirmation',
			{
				attach: error,
			}
		);

		return res.error(500, 'Unable to fetch tracker data');
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

		logger.info('tracker', `Deleted Tracker`, {
			attach: { ...email, id: emailId },
		});

		return res.status(200).redirect(`/`);
	} catch (error) {
		logger.error('tracker', 'Could not delete tracker', {
			attach: error,
		});
		return res.error(500, 'Unable to delete tracker');
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

		logger.info('tracker', `Activated Tracker`, {
			attach: { ...email, activated: 1 },
		});

		return res.status(200).redirect(`/tracker/${emailId}`);
	} catch (error) {
		logger.error('tracker', 'Could not activate tracker', {
			attach: error,
		});
		return res.error(500, 'Unable to activate tracker');
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

		logger.info('tracker', `Activated Tracker`, {
			attach: { ...email, activated: 0 },
		});

		return res.status(200).redirect(`/tracker/${emailId}`);
	} catch (error) {
		logger.error('tracker', 'Could not deactivate tracker', {
			attach: error,
		});
		return res.error(500, 'Unable to deactivate tracker');
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
			'INSERT INTO events (id, email, type, triggeredAt, headers) VALUES (?, ?, ?, ?, ?)'
		);
		const info = stmt.run(
			cuid(),
			email.id,
			event,
			new Date().toISOString(),
			JSON.stringify(req.headers)
		);

		logger.info('tracker', `Tracker event invoked`, {
			attach: { ...email, event },
		});

		return res
			.status(200)
			.sendFile(path.resolve(__dirname, 'static/gif.gif'));
	} catch (error) {
		logger.error('tracker', 'Error during tracker event callback', {
			attach: error,
		});

		return res.error(500, 'Internal Server Error');
	}
});

httpServer.listen(PORT, () =>
	logger.info('main', `Server listening on port ${PORT}`)
);
