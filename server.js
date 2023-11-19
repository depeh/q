/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Göran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Göran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq"); // Override require
var http = require('http');
var config = require('./config');
var db = require('./db');
global.conn = db.connect();

var logger = require('./logger');
var common = require('./common');
var git = require('git-rev')
var gitVersion = "";

git.short(function(str)
{
	gitVersion = str;
	logger.info("Queue Server version " + common.version + "(" + gitVersion + ") is Listening on port " + httpPort);
});

/**
 * 
 * Web server for Queue!
 * 
 */

// Init mail
if (config.get('email.active'))
{
	global.transporter = common.initMail();
}

var SSL = config.get('server.ssl.active');
var sslKeyFile = config.get('server.ssl.keyFile');
var sslCertFile = config.get('server.ssl.certFile');
var httpPort = config.get('server.httpPort');
var httpsPort = config.get('server.httpsPort');

// Keep DB Alive
setInterval(function () 
	{
    conn.query('SELECT 1');
	}
, 5000);


if (SSL == false)
{


	var server = http.createServer(function(req, res)
	{
		handleServer(req, res);
	});
	server.listen(httpPort);
}
else
{
	logger.info("Queue Server version " + common.version + " is Listening with SSL on port " + httpsPort);

	var https = require('https');
	var fs = require('fs');

	var options = {
		key: fs.readFileSync(sslKeyFile),
		cert: fs.readFileSync(sslCertFile)
	};

	var server = https.createServer(options, function(req, res)
	{
		handleServer(req, res);
	});
	server.listen(httpsPort);
}


/// **************************

function handleServer(req, res)
{
	var headers = req.headers;

	// Get common variables
	var qurl = headers['q-url'];
	var qname = headers['q-name'];
	var referer = headers.referer;
	var method = req['method'];
	var qpriority = common.getHeader(headers, 'q-priority', 5);
	var userAgent = ['user-agent'];

	var ip = common.getIpFromReq(req);

	var validIp = common.validateIp(ip);

	var urlPart = req['url'];

	var testPath = urlPart == "/test";
	if (testPath == true)
	{
		res.writeHead(200);
		res.end('Alive');
		return;	
	}

	if (validIp == false || qurl == undefined || qname == undefined)
	{
		res.writeHead(400);
		res.end('Nope');
		return;
	}

	if (userAgent == "Q")
	{
		res.writeHead(400);
		res.end('The Queue System does not allow it to send Requests to Itself! Fatal Error!');
		return;
	}

	// Load body
	var body = [];
	req.on('data', function(chunk)
	{
		body.push(chunk);
	}).on('end', function()
	{
		body = Buffer.concat(body).toString();

		// IF this is a GET method
		if (method == 'GET')
		{
			// Parse the GET-parameters
			body = req['url'];
			body = body.replace(/(\/[?]?)/g, "");
		}

		var qs = require('qs')
		var bodyJson = qs.parse(body);

		var specialParams = false;
		var _params = getParams(bodyJson["_params"]);

		if (_params != null)
		{
			specialParams = true;
			bodyJson = _params;
		}

		// Push message to queue
		db.push(qname, qurl, method, headers, bodyJson, referer, qpriority, specialParams, function(id)
		{
			if (id == 0)
			{
				res.writeHead(500);
				res.end('<q-id>' + id + '</q-id>');
			}
			else
			{
				db.setQueueUpdated(qname);
				db.increaseQueueStats(qname, common.statsType.ADDED);
				res.writeHead(200);
				res.end('<q-id>' + id + '</q-id>');
			}

		});

	});
}




/**
 * get JSON from parameter if possible
 * 
 * @param {any} _params
 * @returns {JSON} or NULL
 */
function getParams(_params)
{

	if (_params == undefined) return null;

	var ret = false;

	try
	{
		ret = JSON.parse(_params);
		return ret;
	}
	catch (e)
	{
		return null;
	}

}
