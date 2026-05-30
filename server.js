/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Goran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Goran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq"); // Override require
var http = require('http');
var config = require('./config');
var db = require('./db');
var logger = require('./logger');
var common = require('./common');
var dashboard = require('./dashboard');
var git = require('git-rev');

global.conn = db.connect();

var gitVersion = "";
var SSL = config.get('server.ssl.active');
var sslKeyFile = config.get('server.ssl.keyFile');
var sslCertFile = config.get('server.ssl.certFile');
var httpPort = config.get('server.httpPort');
var httpsPort = config.get('server.httpsPort');
var maxBodySizeKb = config.has('server.maxBodySizeKb') ? config.get('server.maxBodySizeKb') : 256;
var adminStreams = [];

git.short(function(str)
{
	gitVersion = str;
	logger.info("Queue Server version " + common.version + "(" + gitVersion + ") is Listening on port " + httpPort);
});

if (config.get('email.active'))
{
	global.transporter = common.initMail();
}

setInterval(function()
{
	conn.query('SELECT 1');
}, 5000);

if (SSL == false)
{
	http.createServer(handleServer).listen(httpPort);
}
else
{
	var https = require('https');
	var fs = require('fs');

	logger.info("Queue Server version " + common.version + " is Listening with SSL on port " + httpsPort);
	https.createServer({
		key: fs.readFileSync(sslKeyFile),
		cert: fs.readFileSync(sslCertFile)
	}, handleServer).listen(httpsPort);
}

function writeJson(res, statusCode, payload)
{
	res.writeHead(statusCode, { 'content-type': 'application/json' });
	res.end(JSON.stringify(payload));
}

function collectAdminSnapshot(filters, callback)
{
	db.listQueues(function(queueError, queues)
	{
		if (queueError)
		{
			callback(queueError);
			return;
		}

		db.getStatsSummary(function(statsError, statsRows)
		{
			var stats = {};

			if (statsError)
			{
				callback(statsError);
				return;
			}

			statsRows.forEach(function(row)
			{
				stats[row.Key] = row.Figure;
			});

			db.listMessages(filters, function(messageError, messages)
			{
				if (messageError)
				{
					callback(messageError);
					return;
				}

				db.listEvents(20, function(eventError, events)
				{
					if (eventError)
					{
						callback(eventError);
						return;
					}

					callback(null, {
						queues: queues,
						stats: stats,
						messages: messages,
						events: events
					});
				});
			});
		});
	});
}

function broadcastAdminRefresh()
{
	adminStreams = adminStreams.filter(function(stream)
	{
		return !stream.res.writableEnded;
	});

	adminStreams.forEach(function(stream)
	{
		collectAdminSnapshot(stream.filters, function(error, payload)
		{
			if (error || stream.res.writableEnded)
			{
				return;
			}

			stream.res.write("event: snapshot\n");
			stream.res.write("data: " + JSON.stringify(payload) + "\n\n");
		});
	});
}

setInterval(broadcastAdminRefresh, 1000);

function readBody(req, callback)
{
	var chunks = [];
	var size = 0;
	var maxBytes = maxBodySizeKb * 1024;

	req.on('data', function(chunk)
	{
		size += chunk.length;
		if (size > maxBytes)
		{
			callback(new Error("Payload too large"));
			req.destroy();
			return;
		}

		chunks.push(chunk);
	});

	req.on('end', function()
	{
		callback(null, Buffer.concat(chunks).toString());
	});
}

function getParsedUrl(req)
{
	return new URL(req.url, "http://localhost");
}

function handleAdminApi(req, res, pathname)
{
	var match = pathname.match(/^\/admin\/api\/messages\/(\d+)\/(requeue|dead-letter)$/);
	var parsedUrl;

	if (pathname == "/admin/api/queues" && req.method == "GET")
	{
		collectAdminSnapshot({
			limit: 50,
			offset: 0
		}, function(queueError, payload)
		{
			if (queueError)
			{
				writeJson(res, 500, { error: "Failed to list queues" });
				return;
			}

			writeJson(res, 200, {
				queues: payload.queues,
				stats: payload.stats
			});
		});
		return;
	}

	if (pathname == "/admin/api/messages" && req.method == "GET")
	{
		parsedUrl = getParsedUrl(req);
		db.listMessages({
			queue: parsedUrl.searchParams.get('queue'),
			status: parsedUrl.searchParams.get('status'),
			limit: parseInt(parsedUrl.searchParams.get('limit') || "100", 10),
			offset: parseInt(parsedUrl.searchParams.get('offset') || "0", 10)
		}, function(error, rows)
		{
			if (error)
			{
				writeJson(res, 500, { error: "Failed to list messages" });
				return;
			}

			writeJson(res, 200, { messages: rows });
		});
		return;
	}

	if (pathname == "/admin/api/stream-snapshot" && req.method == "GET")
	{
		parsedUrl = getParsedUrl(req);
		collectAdminSnapshot({
			queue: parsedUrl.searchParams.get('queue'),
			status: parsedUrl.searchParams.get('status'),
			limit: parseInt(parsedUrl.searchParams.get('limit') || "50", 10),
			offset: 0
		}, function(error, payload)
		{
			if (error)
			{
				writeJson(res, 500, { error: "Failed to collect snapshot" });
				return;
			}

			writeJson(res, 200, payload);
		});
		return;
	}

	if (pathname == "/admin/api/activity" && req.method == "GET")
	{
		db.listEvents(20, function(error, rows)
		{
			if (error)
			{
				writeJson(res, 500, { error: "Failed to list activity" });
				return;
			}

			writeJson(res, 200, { events: rows });
		});
		return;
	}

	if (pathname == "/admin/api/stream" && req.method == "GET")
	{
		parsedUrl = getParsedUrl(req);
		res.writeHead(200, {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'connection': 'keep-alive'
		});
		res.write("retry: 1000\n\n");

		var stream = {
			res: res,
			filters: {
				queue: parsedUrl.searchParams.get('queue'),
				status: parsedUrl.searchParams.get('status'),
				limit: parseInt(parsedUrl.searchParams.get('limit') || "50", 10),
				offset: 0
			}
		};

		adminStreams.push(stream);
		collectAdminSnapshot(stream.filters, function(error, payload)
		{
			if (!error && !res.writableEnded)
			{
				res.write("event: snapshot\n");
				res.write("data: " + JSON.stringify(payload) + "\n\n");
			}
		});

		req.on('close', function()
		{
			adminStreams = adminStreams.filter(function(item)
			{
				return item !== stream;
			});
		});
		return;
	}

	if (pathname.match(/^\/admin\/api\/messages\/\d+$/) && req.method == "GET")
	{
		var id = parseInt(pathname.split('/').pop(), 10);
		db.getMessageById(id, function(error, row)
		{
			if (error || !row)
			{
				writeJson(res, 404, { error: "Message not found" });
				return;
			}

			writeJson(res, 200, { message: row });
		});
		return;
	}

	if (match && req.method == "POST")
	{
		var messageId = parseInt(match[1], 10);
		var action = match[2];
		var handler = action == "requeue" ? db.requeueMessageById : db.moveMessageToDeadLetter;

		handler(messageId, function(error, payload)
		{
			if (error)
			{
				writeJson(res, 500, { error: error.message || "Action failed" });
				return;
			}

			broadcastAdminRefresh();
			writeJson(res, 200, payload);
		});
		return;
	}

	if (pathname == "/admin/api/health" && req.method == "GET")
	{
		writeJson(res, 200, { ok: true, version: common.version });
		return;
	}

	writeJson(res, 404, { error: "Not found" });
}

function handleAdmin(req, res, pathname)
{
	if (pathname == "/admin" || pathname == "/admin/")
	{
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.end(dashboard.render());
		return;
	}

	if (pathname.indexOf("/admin/api/") === 0)
	{
		handleAdminApi(req, res, pathname);
		return;
	}

	writeJson(res, 404, { error: "Not found" });
}

function parseQueueBody(method, req, body)
{
	var qs = require('qs');
	var bodyText = body;
	var bodyJson;
	var specialParams = false;
	var parsedParams;

	if (method == 'GET')
	{
		bodyText = req.url.replace(/(\/[?]?)/g, "");
	}

	bodyJson = qs.parse(bodyText);
	parsedParams = getParams(bodyJson["_params"]);

	if (parsedParams != null)
	{
		specialParams = true;
		bodyJson = parsedParams;
	}

	return {
		bodyJson: bodyJson,
		specialParams: specialParams
	};
}

function handleQueueRequest(req, res, headers)
{
	var qurl = headers['q-url'];
	var qname = headers['q-name'];
	var referer = headers.referer;
	var method = req.method;
	var qpriority = common.getHeader(headers, 'q-priority', 5);

	if (qurl == undefined || qname == undefined)
	{
		res.writeHead(400);
		res.end('Nope');
		return;
	}

	readBody(req, function(error, body)
	{
		var parsedBody;

		if (error)
		{
			res.writeHead(413);
			res.end('Nope');
			return;
		}

		parsedBody = parseQueueBody(method, req, body || "");
		db.push(qname, qurl, method, headers, parsedBody.bodyJson, referer, qpriority, parsedBody.specialParams, function(id)
		{
			if (id == 0)
			{
				res.writeHead(500);
				res.end('<q-id>' + id + '</q-id>');
				return;
			}

			db.setQueueUpdated(qname);
			db.increaseQueueStats(qname, common.statsType.ADDED);
			broadcastAdminRefresh();
			res.writeHead(200);
			res.end('<q-id>' + id + '</q-id>');
		});
	});
}

function handleServer(req, res)
{
	var headers = req.headers;
	var userAgent = headers['user-agent'];
	var ip = common.getIpFromReq(req);
	var validIp = common.validateIp(ip);
	var pathname = getParsedUrl(req).pathname;

	if (pathname == "/test")
	{
		res.writeHead(200);
		res.end('Alive');
		return;
	}

	if (validIp == false)
	{
		res.writeHead(400);
		res.end('Nope');
		return;
	}

	if (pathname == "/admin" || pathname == "/admin/" || pathname.indexOf("/admin/api/") === 0)
	{
		handleAdmin(req, res, pathname);
		return;
	}

	if (userAgent == "Q")
	{
		res.writeHead(400);
		res.end('The Queue System does not allow it to send Requests to Itself! Fatal Error!');
		return;
	}

	handleQueueRequest(req, res, headers);
}

function getParams(_params)
{
	if (_params == undefined)
	{
		return null;
	}

	try
	{
		return JSON.parse(_params);
	}
	catch (e)
	{
		return null;
	}
}
