/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Goran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Goran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq"); // Override require
var config = require('./config');
var logger = require('./logger');
var common = require('./common');
var doRequest = require('./doRequest');
var db = require('./db');

global.conn = db.connect();

var git = require('git-rev');
var gitVersion = "";
var c = 0;
var activeDispatches = 0;
var hostLastDispatchAt = {};
var sleepForSeconds = config.get('consumer.sleepForSeconds');
var maxConcurrent = config.has('consumer.maxConcurrent') ? config.get('consumer.maxConcurrent') : 4;
var minIntervalPerHostMs = config.has('consumer.minIntervalPerHostMs') ? config.get('consumer.minIntervalPerHostMs') : 0;

git.short(function(str)
{
	gitVersion = str;
	logger.info("Queue Consumer version " + common.version + "(" + gitVersion + ") Alive and Kicking...");
});

if (config.get('email.active'))
{
	global.transporter = common.initMail();
}

function getHostForMessage(message)
{
	if (message.Url == "email")
	{
		return "email";
	}

	return new URL(message.Url).host;
}

function getAvailableSlots()
{
	return Math.max(0, maxConcurrent - activeDispatches);
}

function scheduleForRateLimit(message)
{
	var host = getHostForMessage(message);
	var lastSentAt = hostLastDispatchAt[host] || 0;
	var nextAllowedAt = new Date(lastSentAt + minIntervalPerHostMs);

	db.updateDeliveryById(message.id, nextAllowedAt, function()
	{
		db.updateMessageStatusById(message.id, common.messageStatus.NEW);
	});
}

function dispatchMessage(message)
{
	var host = getHostForMessage(message);
	var now = Date.now();
	var lastSentAt = hostLastDispatchAt[host] || 0;

	if (minIntervalPerHostMs > 0 && lastSentAt + minIntervalPerHostMs > now)
	{
		scheduleForRateLimit(message);
		return;
	}

	activeDispatches = activeDispatches + 1;
	hostLastDispatchAt[host] = now;

	doRequest.dispatch(message, function()
	{
		activeDispatches = Math.max(0, activeDispatches - 1);
		pump();
	});
}

function pump()
{
	var slots = getAvailableSlots();

	if (slots < 1)
	{
		return;
	}

	db.claimAvailableMessages(slots, function(error, messages)
	{
		if (error || !messages || !messages.length)
		{
			return;
		}

		messages.forEach(dispatchMessage);
	});
}

function updateStats()
{
	var newMessages = 0;
	var errorMessages = 0;

	db.getMessageCount("Status = '" + common.messageStatus.NEW + "'", function(figure)
	{
		newMessages = figure;
		db.setStats("NewMessages", figure);
		db.setStats("ActiveDispatches", activeDispatches);

		db.getMessageCount("Status = '" + common.messageStatus.ERROR + "'", function(errorFigure)
		{
			errorMessages = errorFigure;
			db.setStats("MessagesWithError", errorFigure);
			db.setStats("TotalWaitingMessages", newMessages + errorMessages);

			if (c % 5 == 0 && (newMessages + errorMessages) > 0)
			{
				console.log("Total waiting msgs: " + (newMessages + errorMessages));
			}
		});
	});
}

setInterval(function()
{
	db.sortQueues();
	pump();
	c = c + 1;

	if (c % 2 == 0)
	{
		updateStats();
	}
}, 1000 * sleepForSeconds);
