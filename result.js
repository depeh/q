/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Göran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Göran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq");

var request = require("request");
var common = require('./common');
var logger = require('./logger');
var config = require('./config');
var db = require('./db');

var url = require('url');

function handleAction(actionStr, id, result, body, info)
{
	if (actionStr == null || actionStr == undefined)
	{
		return;
	}

	// Support multiple actions divided by ,
	var actionArray = actionStr.split(',');

	var deleted = false;

	for (var i = 0; i < actionArray.length; i++)
	{
		var action = actionArray[i].trim();

		if (action == "DELETE" && result == common.statsType.SUCCEEDED)
		{
			deleted = true;
			if (deleteMessageById(id, result))
			{
				deleted = true;
			}
		}
		else if (common.validateEmail(action))
		{
			sendEmail(action, id, result, body, info);
		}
		else if (action.startsWith("http"))
		{
			sendHttpMessage(action, id, result);
		}
		else if (action.length > 1 && deleted == false) // if the queue is deleted it cant be moved to another queue.
		{
			moveToQueue(action, id, result);
		}
	}

};


function moveToQueue(queue, id, result)
{
	logger.info("Msg #" + id + " Action for " + result + " message. Move msg to queue: " + queue);
	moveMessageToQueue(id, queue);
}

function sendHttpMessage(uri, id, result)
{
	logger.info("Msg #" + id + " Action for " + result + " message. Sending http request to: " + uri);

	// Create headers for the request
	var headersJson = JSON.parse("{}");
	headersJson['user-agent'] = "Q";

	// Parse the query and add id and result
	var qs = url.parse(uri, true).query;
	qs['id'] = id;
	qs['result'] = result;

	request(
	{
		uri: uri,
		method: 'GET',
		headers: headersJson,
		timeout: 10000,
		qs: qs
	}, function(error, response, body)
	{

		if (error)
		{
			logger.warn("Msg #" + id + " Action. Error while sending http for " + result + " msg. Error: " + error);
			return;
		}

		var status = response.statusCode;
		if (status != 200)
		{
			logger.warn("Msg #" + id + " Action. Error while sending http for " + result + " msg. http statuscode: " + error);
			return;
		}

		// If the status is ok, then do SUCCESS measures and then delete the queue item ID
		logger.info("Msg #" + id + " Action. Success on sending http for " + result + " msg. Response: " + body);
	});

}

function sendEmail(mail, id, result, body, info)
{

	var message = {
		from: config.get('email.sender'),
		to: mail,
		subject: "Queue msg #" + id + " " + result,
		text: "Queue msg #" + id + "\nResult: " + result + "\nMore info: " + info + "\nBody:\n-----------------------------------------\n" + body,
		html: "Queue msg #" + id + "<br>Result: " + result + "<br>More info: " + info + "<br>Body:<br><br>" + body
	};

	transporter.sendMail(message, function(err, info)
	{
		if (err)
		{
			logger.warn("Msg #" + id + " Mail was not sent to " + mail + "! Message: " + err.message);
		}
		else
		{
			logger.info("Msg #" + id + " Mail sent to " + mail + " successfully!");
		}
	});

	logger.info("Msg #" + id + " Action for " + result + " message. Sending mail to: " + mail);
	// todo: Send Email
}

function moveMessageToQueue(id, queue)
{
	var query = conn.query("UPDATE Message SET Queue=?, Updated=NOW(), Status='" + common.messageStatus.MOVED + "' WHERE id=?", [queue, id], function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}

function deleteMessageById(id)
{
	var query = conn.query("DELETE FROM Message WHERE id=?", id, function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

		logger.info("Msg #" + id + " DELETED!");
		return true;
	});

}


exports.handleSuccess = function(id, body, info)
{
	db.getMessageQueueById(id, function(res)
	{
		if (res == null || res == undefined)
		{
			logger.error("FATAL! Msg #" + id + " was successfully sent, but no ACTION could be taken!");
			return;
		}
		var successString = (res.s1 == null) ? res.s2 : res.s1;
		var deliveryTime = res.Delivery;
		var updated = new Date();
		var status = common.messageStatus.SUCCESS;
		var retryCounter = res.RetryCounter;
		var queue = res.Queue;

		db.increaseStats("SuccessfulSentMessages");
		db.increaseQueueStats(queue, common.statsType.SUCCEEDED);
		// Update the Message
		db.updateMessageById(id, retryCounter, updated, deliveryTime, status);

		handleAction(successString, id, common.statsType.SUCCEEDED, body, info);

	});
}


exports.handleError = function(id, body, info, fatal)
{

	db.getMessageQueueById(id, function(res)
	{
		if (res == null || res == undefined)
		{
			logger.error("FATAL! Msg #" + id + " was NOT successfully sent, but no ACTION could be taken!");
			return;
		}

		var retryCounter = res.RetryCounter;
		var retries = (res.r1 == null) ? res.r2 : res.r1;
		var retryInterval = (res.ri1 == null) ? res.ri2 : res.ri1;
		var failString = (res.f1 == null) ? res.f2 : res.f1;
		var queue = res.Queue;

		var status = common.messageStatus.ERROR;

		// increase the retry counter
		retryCounter = retryCounter + 1;

		// Calculate new delivery time.
		var updated = new Date();
		var deliveryTime = new Date(updated.getTime() + (1000 * retryInterval));

		var errorText = info;
		if (body != undefined)
		{
			errorText = body + "\n" + info;
		}

		errorText = "" + errorText;
		db.updateMessageLastErrorById(id, errorText);

		if (retryCounter > retries || fatal)
		{
			db.increaseStats("FailedMessages");
			db.increaseQueueStats(queue, common.statsType.FAILED);

			retryCounter = retries;
			// set fail Status

			status = common.messageStatus.FAIL;
			logger.warn("Msg #" + id + " Failed! I have given up!");
			logger.warn("Msg #" + id + " Response: " + body);

		}
		else
		{
			db.increaseStats("RetriedMessages");

			logger.warn("Retrying msg #" + id + " at " + deliveryTime + ". Retry #" + retryCounter);
		}

		// Update the Message
		db.updateMessageById(id, retryCounter, updated, deliveryTime, status);

		if (status == common.messageStatus.FAIL)
		{
			// Do FAIL measures.
			handleAction(failString, id, common.statsType.FAILED, body, info);
		}

	});

}
