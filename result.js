/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Goran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Goran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq");

var httpClient = require("./httpClient");
var common = require('./common');
var logger = require('./logger');
var config = require('./config');
var db = require('./db');
var mailTransporter = null;

function handleAction(actionStr, id, result, body, info)
{
	var actionArray;
	var deleted = false;
	var i;
	var action;

	if (actionStr == null || actionStr == undefined)
	{
		return;
	}

	actionArray = actionStr.split(',');

	for (i = 0; i < actionArray.length; i++)
	{
		action = actionArray[i].trim();

		if (action == "DELETE" && result == common.statsType.SUCCEEDED)
		{
			deleted = true;
			deleteMessageById(id);
		}
		else if (common.validateEmail(action))
		{
			sendEmail(action, id, result, body, info);
		}
		else if (action.startsWith("http"))
		{
			sendHttpMessage(action, id, result);
		}
		else if (action.length > 1 && deleted == false)
		{
			moveToQueue(action, id, result);
		}
	}
}

function moveToQueue(queue, id, result)
{
	logger.info("Msg #" + id + " Action for " + result + " message. Move msg to queue: " + queue);
	moveMessageToQueue(id, queue);
}

function sendHttpMessage(uri, id, result)
{
	logger.info("Msg #" + id + " Action for " + result + " message. Sending http request to: " + uri);

	httpClient.send({
		uri: uri,
		method: 'GET',
		headers: {
			'user-agent': 'Q'
		},
		timeout: 10000,
		qs: {
			id: id,
			result: result
		}
	}, function(error, response, body)
	{
		if (error)
		{
			logger.warn("Msg #" + id + " Action. Error while sending http for " + result + " msg. Error: " + error);
			return;
		}

		if (response.statusCode != 200)
		{
			logger.warn("Msg #" + id + " Action. Error while sending http for " + result + " msg. http statuscode: " + response.statusCode);
			return;
		}

		logger.info("Msg #" + id + " Action. Success on sending http for " + result + " msg. Response: " + body);
	});
}

function sendEmail(mail, id, result, body, info)
{
	if (!mailTransporter)
	{
		logger.warn("Msg #" + id + " Mail action skipped. Transporter is not configured.");
		return;
	}

	mailTransporter.sendMail({
		from: config.get('email.sender'),
		to: mail,
		subject: "Queue msg #" + id + " " + result,
		text: "Queue msg #" + id + "\nResult: " + result + "\nMore info: " + info + "\nBody:\n-----------------------------------------\n" + body,
		html: "Queue msg #" + id + "<br>Result: " + result + "<br>More info: " + info + "<br>Body:<br><br>" + body
	}, function(err)
	{
		if (err)
		{
			logger.warn("Msg #" + id + " Mail was not sent to " + mail + "! Message: " + err.message);
			return;
		}

		logger.info("Msg #" + id + " Mail sent to " + mail + " successfully!");
	});

	logger.info("Msg #" + id + " Action for " + result + " message. Sending mail to: " + mail);
}

function moveMessageToQueue(id, queue)
{
	db.moveMessageToQueue(id, queue);
}

function deleteMessageById(id)
{
	db.deleteMessageById(id);
}

function onDone(done)
{
	if (typeof done === 'function')
	{
		done();
	}
}

function deadLetterActive()
{
	if (config.has('consumer.deadLetter.active'))
	{
		return config.get('consumer.deadLetter.active');
	}

	return true;
}

exports.handleSuccess = function(id, body, info, done)
{
	db.getMessageQueueById(id, function(res)
	{
		var successString;
		var deliveryTime;
		var updated;
		var status;
		var retryCounter;
		var queue;

		if (res == null || res == undefined)
		{
			logger.error("FATAL! Msg #" + id + " was successfully sent, but no ACTION could be taken!");
			onDone(done);
			return;
		}

		successString = (res.s1 == null) ? res.s2 : res.s1;
		deliveryTime = res.Delivery;
		updated = new Date();
		status = common.messageStatus.SUCCESS;
		retryCounter = res.RetryCounter;
		queue = res.Queue;

		db.increaseStats("SuccessfulSentMessages");
		db.increaseQueueStats(queue, common.statsType.SUCCEEDED);
		db.updateMessageById(id, retryCounter, updated, deliveryTime, status, function()
		{
			db.logEvent(id, queue, "success", status, "Message delivered successfully");
			handleAction(successString, id, common.statsType.SUCCEEDED, body, info);
			onDone(done);
		});
	});
};

exports.handleError = function(id, body, info, fatal, done)
{
	db.getMessageQueueById(id, function(res)
	{
		var retryCounter;
		var retries;
		var retryInterval;
		var failString;
		var queue;
		var status;
		var updated;
		var deliveryTime;
		var errorText;

		if (res == null || res == undefined)
		{
			logger.error("FATAL! Msg #" + id + " was NOT successfully sent, but no ACTION could be taken!");
			onDone(done);
			return;
		}

		retryCounter = res.RetryCounter;
		retries = (res.r1 == null) ? res.r2 : res.r1;
		retryInterval = (res.ri1 == null) ? res.ri2 : res.ri1;
		failString = (res.f1 == null) ? res.f2 : res.f1;
		queue = res.Queue;
		status = common.messageStatus.ERROR;

		retryCounter = retryCounter + 1;
		updated = new Date();
		deliveryTime = new Date(updated.getTime() + (1000 * retryInterval));
		errorText = info;

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
			status = common.messageStatus.FAIL;
			logger.warn("Msg #" + id + " Failed! I have given up!");
			logger.warn("Msg #" + id + " Response: " + body);
		}
		else
		{
			db.increaseStats("RetriedMessages");
			logger.warn("Retrying msg #" + id + " at " + deliveryTime + ". Retry #" + retryCounter);
		}

		db.updateMessageById(id, retryCounter, updated, deliveryTime, status, function()
		{
			if (status == common.messageStatus.FAIL)
			{
				db.logEvent(id, queue, "failed", status, errorText);
				if (deadLetterActive())
				{
					db.moveMessageToDeadLetter(id, function() {});
				}

				handleAction(failString, id, common.statsType.FAILED, body, info);
			}
			else
			{
				db.logEvent(id, queue, "retry", status, "Retry #" + retryCounter + " scheduled");
			}

			onDone(done);
		});
	});
};

exports.setTransporter = function(transporter)
{
	mailTransporter = transporter;
};
