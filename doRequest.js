/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Goran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Goran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq");

var httpClient = require("./httpClient");
var logger = require('./logger');
var result = require('./result');
var common = require('./common');

function sanitizeHeaders(headersJson)
{
	delete headersJson['host'];
	delete headersJson['content-length'];
	delete headersJson['accept-encoding'];
	delete headersJson['accept-language'];
	delete headersJson['postman-token'];
	delete headersJson['origin'];
	delete headersJson['q-name'];
	delete headersJson['q-url'];

	headersJson['user-agent'] = "Q";
	return headersJson;
}

function handleHttp(id, uri, verb, headers, params, done)
{
	var headersJson = sanitizeHeaders(JSON.parse(headers));
	var paramsJson = JSON.parse(params);
	var options = {
		uri: uri,
		method: verb,
		headers: headersJson,
		timeout: 10000
	};

	if (verb == 'GET')
	{
		options.qs = paramsJson;
	}
	else
	{
		options.form = paramsJson;
	}

	httpClient.send(options, function(error, response, body)
	{
		if (error)
		{
			logger.warn("Msg #" + id + " Error " + error);
			result.handleError(id, body, error, false, done);
			return;
		}

		if (response.statusCode != 200)
		{
			logger.warn("Msg #" + id + " http error " + response.statusCode);
			result.handleError(id, body, response.statusCode, false, done);
			return;
		}

		logger.info("Msg #" + id + " Delivered. Response: " + body);
		result.handleSuccess(id, body, "", done);
	});
}

function handleEmail(id, uri, verb, headers, params, done)
{
	var headersJson = sanitizeHeaders(JSON.parse(headers));
	var paramsJson = JSON.parse(params);
	var mailFrom = headersJson['q-from'];
	var mailTo = headersJson['q-to'];
	var mailBody = headersJson['q-body'];
	var mailSubject = headersJson['q-subject'];
	var key;
	var value;

	mailFrom = common.getHeader(paramsJson, 'from', mailFrom);
	mailTo = common.getHeader(paramsJson, 'to', mailTo);
	mailBody = common.getHeader(paramsJson, 'body', mailBody);
	mailSubject = common.getHeader(paramsJson, 'subject', mailSubject);

	for (key in paramsJson)
	{
		value = paramsJson[key];
		mailBody = mailBody.replace("$" + key, value);
		mailSubject = mailSubject.replace("$" + key, value);
	}

	if (mailFrom == undefined || mailTo == undefined || mailBody == undefined || mailSubject == undefined || !common.validateEmail(mailFrom) || !common.validateEmail(mailTo))
	{
		if (mailBody != undefined)
		{
			mailBody = "(body)";
		}

		var mailStr = 'From: "' + mailFrom + '" - To: "' + mailTo + '" - Subject: "' + mailSubject + '" - Body: ' + mailBody;
		logger.warn("Msg #" + id + " Error. Mail parameters missing/faulty! " + mailStr);
		result.handleError(id, "Mail was not sent to " + mailTo, "Mail parameters missing/faulty! " + mailStr, true, done);
		return;
	}

	mailBody = mailBody.split('\\n').join('\n');

	transporter.sendMail({
		from: mailFrom,
		to: mailTo,
		subject: mailSubject,
		text: mailBody,
		html: mailBody
	}, function(err)
	{
		if (err)
		{
			logger.warn("Msg #" + id + " Error. Mail was not sent to " + mailTo + "! Message: " + err.message);
			result.handleError(id, "Mail was not sent to " + mailTo, err.message, false, done);
			return;
		}

		logger.info("Msg #" + id + " Delivered. Mail sent to " + mailTo + " successfully!");
		result.handleSuccess(id, "Mail sent to " + mailTo + " successfully!", mailSubject, done);
	});

	logger.info("Msg #" + id + " Sending mail to: " + mailTo);
}

exports.dispatch = function(message, done)
{
	if (message.Url == "email")
	{
		handleEmail(message.id, message.Url, message.Verb, message.Headers, message.Params, done || function() {});
		return;
	}

	handleHttp(message.id, message.Url, message.Verb, message.Headers, message.Params, done || function() {});
};
