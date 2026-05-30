const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

const repoDir = path.resolve(__dirname, '..');
const configPath = path.join(repoDir, 'config', 'default.json');

let backupConfig = null;
let receiverServer = null;
let receiverRequests = [];
let failMode = true;
let unauthorizedMode = false;
let serverProcess = null;
let queueProcess = null;
let tempDir = null;
let ports = null;

function getFreePort()
{
	return new Promise((resolve, reject) =>
	{
		const server = net.createServer();

		server.listen(0, '127.0.0.1', function()
		{
			const address = server.address();
			server.close(function()
			{
				resolve(address.port);
			});
		});

		server.on('error', reject);
	});
}

function wait(ms)
{
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, message)
{
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs)
	{
		if (await predicate())
		{
			return;
		}

		await wait(100);
	}

	throw new Error(message);
}

function startReceiverServer(port)
{
	return new Promise((resolve) =>
	{
		receiverServer = http.createServer((req, res) =>
		{
			const chunks = [];

			req.on('data', (chunk) => chunks.push(chunk));
			req.on('end', () =>
			{
				receiverRequests.push({
					path: req.url,
					method: req.method,
					body: Buffer.concat(chunks).toString()
				});

				if (req.url === '/fail' && failMode)
				{
					res.writeHead(500);
					res.end('failed');
					return;
				}

				if (req.url === '/unauthorized' && unauthorizedMode)
				{
					res.writeHead(401);
					res.end('unauthorized');
					return;
				}

				res.writeHead(200, { 'content-type': 'text/plain' });
				res.end('ok');
			});
		});

		receiverServer.listen(port, '127.0.0.1', resolve);
	});
}

function startProcess(script)
{
	const child = spawn(process.execPath, [script], {
		cwd: repoDir,
		stdio: ['ignore', 'pipe', 'pipe']
	});

	child.stdout.on('data', function() {});
	child.stderr.on('data', function() {});
	return child;
}

async function stopProcess(child)
{
	if (!child || child.killed)
	{
		return;
	}

	child.kill('SIGINT');
	await new Promise((resolve) =>
	{
		child.once('exit', resolve);
		setTimeout(function()
		{
			if (!child.killed)
			{
				child.kill('SIGKILL');
			}
			resolve();
		}, 2000);
	});
}

async function queueRequest(headers, body)
{
	const response = await fetch(`http://127.0.0.1:${ports.server}/`, {
		method: 'POST',
		headers: headers,
		body: body
	});

	return response.text();
}

async function getJson(pathname)
{
	const response = await fetch(`http://127.0.0.1:${ports.server}${pathname}`);
	return response.json();
}

test.before(async function()
{
	ports = {
		server: await getFreePort(),
		receiver: await getFreePort()
	};
	tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'q-system-test-'));

	if (fs.existsSync(configPath))
	{
		backupConfig = await fsp.readFile(configPath, 'utf8');
	}

	await startReceiverServer(ports.receiver);

	await fsp.writeFile(configPath, JSON.stringify({
		db: {
			client: 'sqlite',
			sqlite: {
				file: path.join(tempDir, 'queue.sqlite')
			}
		},
		server: {
			whiteListIpAdresses: ['127.0.0.1', '::1'],
			maxBodySizeKb: 256,
			httpPort: ports.server,
			httpsPort: ports.server + 1,
			ssl: {
				active: false,
				keyFile: 'ssl/key.pem',
				certFile: 'ssl/cert.pem'
			}
		},
		consumer: {
			sleepForSeconds: 1,
			maxConcurrent: 2,
			minIntervalPerHostMs: 0,
			httpResponseCodesOK: '200,401',
			httpResponseCodesFail: '',
			deadLetter: {
				active: true,
				prefix: 'dead-letter.'
			}
		},
		email: {
			active: false,
			setting: {
				user: 'username',
				password: '123456',
				host: 'domain.com',
				port: 587,
				ssl: false,
				tls: {
					rejectUnauthorized: false
				}
			},
			sender: 'mail@domain.com'
		}
	}, null, '\t'));

	serverProcess = startProcess('server.js');
	queueProcess = startProcess('queue.js');

	await waitFor(async function()
	{
		try
		{
			const response = await fetch(`http://127.0.0.1:${ports.server}/test`);
			return (await response.text()) === 'Alive';
		}
		catch (error)
		{
			return false;
		}
	}, 10000, 'Server health check did not become ready');
});

test.after(async function()
{
	await stopProcess(queueProcess);
	await stopProcess(serverProcess);

	if (receiverServer)
	{
		await new Promise((resolve) => receiverServer.close(resolve));
	}

	if (backupConfig === null)
	{
		if (fs.existsSync(configPath))
		{
			await fsp.unlink(configPath);
		}
	}
	else
	{
		await fsp.writeFile(configPath, backupConfig);
	}

	if (tempDir)
	{
		await fsp.rm(tempDir, { recursive: true, force: true });
	}
});

test('serves admin dashboard and queue health endpoints', async function()
{
	const dashboardResponse = await fetch(`http://127.0.0.1:${ports.server}/admin`);
	const dashboardHtml = await dashboardResponse.text();
	const healthResponse = await fetch(`http://127.0.0.1:${ports.server}/admin/api/health`);
	const healthJson = await healthResponse.json();

	assert.equal(dashboardResponse.status, 200);
	assert.match(dashboardHtml, /Q Dashboard/);
	assert.equal(healthJson.ok, true);
});

test('dispatches a successful message and exposes queue stats', async function()
{
	const responseText = await queueRequest({
		'q-name': 'smoke',
		'q-url': `http://127.0.0.1:${ports.receiver}/success`
	}, 'hello=world');

	assert.match(responseText, /<q-id>\d+<\/q-id>/);

	await waitFor(async function()
	{
		return receiverRequests.some((request) => request.path === '/success' && request.body.indexOf('hello=world') > -1);
	}, 10000, 'Successful message was never delivered');

	const queuePayload = await getJson('/admin/api/queues');
	assert.ok(queuePayload.queues.some((queue) => queue.Name === 'smoke'));
});

test('moves failed messages to dead-letter and allows requeue', async function()
{
	const responseText = await queueRequest({
		'q-name': 'failing',
		'q-url': `http://127.0.0.1:${ports.receiver}/fail`,
		'q-retries': '0'
	}, 'mode=fail');

	assert.match(responseText, /<q-id>\d+<\/q-id>/);

	let deadLetterMessageId = 0;

	await waitFor(async function()
	{
		const payload = await getJson('/admin/api/messages?queue=dead-letter.failing&status=fail&limit=10');
		if (payload.messages.length > 0)
		{
			deadLetterMessageId = payload.messages[0].id;
			return true;
		}

		return false;
	}, 10000, 'Dead-letter message did not appear');

	failMode = false;

	const requeueResponse = await fetch(`http://127.0.0.1:${ports.server}/admin/api/messages/${deadLetterMessageId}/requeue`, {
		method: 'POST'
	});
	const requeuePayload = await requeueResponse.json();

	assert.equal(requeuePayload.status, 'new');

	await waitFor(async function()
	{
		return receiverRequests.filter((request) => request.path === '/fail').length >= 2;
	}, 10000, 'Requeued dead-letter message was never retried');

	await waitFor(async function()
	{
		const response = await fetch(`http://127.0.0.1:${ports.server}/admin/api/messages/${deadLetterMessageId}`);
		return response.status === 404;
	}, 10000, 'Successfully requeued message was not deleted after success');
});

test('accepts configured non-200 response codes as success', async function()
{
	unauthorizedMode = true;

	const responseText = await queueRequest({
		'q-name': 'customok',
		'q-url': `http://127.0.0.1:${ports.receiver}/unauthorized`
	}, 'mode=custom');

	assert.match(responseText, /<q-id>\d+<\/q-id>/);

	await waitFor(async function()
	{
		return receiverRequests.some((request) => request.path === '/unauthorized');
	}, 10000, 'Configured success-status request was never delivered');

	await waitFor(async function()
	{
		const payload = await getJson('/admin/api/activity');
		return payload.events.some((event) => event.EventType === 'success' && event.Queue === 'customok');
	}, 10000, '401 response was not treated as success');
});
