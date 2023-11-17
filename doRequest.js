var require = require("./rq");

var request = require("request");
var logger = require('./logger');
var result = require('./result');
var common = require('./common');
var config = require('./config');
var db = require('./db');


/**
 * Send a http request to the web service or server
 * 
 * @param {any} id
 * @param {any} url
 * @param {any} verb
 * @param {any} headers
 * @param {any} params
 */
exports.http = function(id, uri, verb, headers, params)
{
	var headersJson = JSON.parse(headers);
	var paramsJson = JSON.parse(params);

	// Delete specific headers
	delete headersJson['host'];
	delete headersJson['content-length'];
	delete headersJson['accept-encoding'];
	delete headersJson['accept-language'];
	delete headersJson['postman-token'];
	delete headersJson['origin'];
	delete headersJson['q-name'];
	delete headersJson['q-url'];

	headersJson['user-agent'] = "Q";

	var qs = "";

	// If the request is a Get-request.
	if (verb == 'GET')
	{
		qs = paramsJson;
		paramsJson = null;
	}

	// Set status to WAITING...
	db.updateMessageStatusById(id, common.messageStatus.WAITING);

	request(
	{
		uri: uri,
		method: verb,
		form: paramsJson,
		headers: headersJson,
		timeout: 10000,
		qs: qs
	}, function(error, response, body)
	{

		if (error)
		{
			logger.warning("Msg #" + id + " Error " + error);
			// Handle FAIL
			result.handleError(id, body, error);

			return;
		}
		var status = response.statusCode;
		if (status != 200)
		{
			logger.warning("Msg #" + id + " http error " + status);
			// Handle FAIL
			result.handleError(id, body, status);

			return;
		}

		// If the status is ok, then do SUCCESS measures and then delete the queue item ID
		logger.info("Msg #" + id + " Delivered. Response: " + body);
		result.handleSuccess(id, body, "");

	});

}

/**
 * Send a MAIL message to the mail recipient
 * 
 * @param {any} id
 * @param {any} url
 * @param {any} verb
 * @param {any} headers
 * @param {any} params
 */
exports.email = function(id, uri, verb, headers, params)
{
	var headersJson = JSON.parse(headers);
	var paramsJson = JSON.parse(params);

	// Delete specific headers
	delete headersJson['host'];
	delete headersJson['content-length'];
	delete headersJson['accept-encoding'];
	delete headersJson['accept-language'];
	delete headersJson['postman-token'];
	delete headersJson['origin'];
	delete headersJson['q-name'];
	delete headersJson['q-url'];

	// Get mail parameters from headers
	var mailFrom = headersJson['q-from'];
	var mailTo = headersJson['q-to'];
	var mailBody = headersJson['q-body'];
	var mailSubject = headersJson['q-subject'];

	headersJson['user-agent'] = "Q";

	var qs = "";

	// If the request is a Get-request.
	if (verb == 'GET')
	{

	}

	// Any parameter will override the headers
	mailFrom = common.getHeader(paramsJson, 'from', mailFrom);
	mailTo = common.getHeader(paramsJson, 'to', mailTo);
	mailBody = common.getHeader(paramsJson, 'body', mailBody);
	mailSubject = common.getHeader(paramsJson, 'subject', mailSubject);

	// Replace the body and subject with any matching parameter.
	// e.g. "Hello $name " will be replaced with the parameter name.
	for (var key in paramsJson)
	{
		var value = paramsJson[key];

		mailBody = mailBody.replace("$" + key, value);
		mailSubject = mailSubject.replace("$" + key, value);
	}

	if (mailFrom == undefined || mailTo == undefined || mailBody == undefined || mailSubject == undefined || !common.validateEmail(mailFrom) || !common.validateEmail(mailTo))
	{
		if (mailBody != undefined) mailBody = "(body)";
		var mailStr = 'From: "' + mailFrom + '" - To: "' + mailTo + '" - Subject: "' + mailSubject + '" - Body: ' + mailBody;
		logger.warning("Msg #" + id + " Error. Mail parameters missing/faulty! " + mailStr);
		result.handleError(id, "Mail was not sent to " + mailTo, "Mail parameters missing/faulty! " + mailStr, true);
		return;
	}

	// Replace ALL \\n with \n
	mailBody = mailBody.split('\\n').join('\n');

	// Set status to WAITING...
	db.updateMessageStatusById(id, common.messageStatus.WAITING);


	var message = {
		from: mailFrom,
		to: mailTo,
		subject: mailSubject,
		text: mailBody,
		html: mailBody
	};

	transporter.sendMail(message, function(err, info)
	{
		if (err)
		{
			logger.warning("Msg #" + id + " Error. Mail was not sent to " + mailTo + "! Message: " + err.message);
			result.handleError(id, "Mail was not sent to " + mailTo, err.message);
			return;
		}
		else
		{
			logger.info("Msg #" + id + " Delivered. Mail sent to " + mailTo + " successfully!");
			result.handleSuccess(id, "Mail sent to " + mailTo + " successfully!", mailSubject);
			return;
		}
	});




	/*
	server.send(
	{
		text: mailBody,
		from: mailFrom,
		'reply-to': mailFrom,
		to: mailTo,
		//cc: "else <else@your-email.com>",
		subject: mailSubject
	}, function(err, message)
	{
		if (err)
		{
			logger.warning("Msg #" + id + " Error. Mail was not sent to " + mailTo + "! Message: " + err.message);
			result.handleError(id, "Mail was not sent to " + mailTo, err.message);
			return;
		}
		else
		{
			logger.info("Msg #" + id + " Delivered. Mail sent to " + mailTo + " successfully!");
			result.handleSuccess(id, "Mail sent to " + mailTo + " successfully!", mailSubject);
			return;
		}
	});
	*/

	logger.info("Msg #" + id + " Sending mail to: " + mailTo);
}