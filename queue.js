/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Göran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Göran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq"); // Override require
var http = require('http');
var config = require('./config');
var logger = require('./logger');
var common = require('./common');

var db = require('./db');
global.conn = db.connect();

var git = require('git-rev')
var gitVersion = "";

git.short(function(str)
{
	gitVersion = str;
	logger.info("Queue Consumer version " + common.version + "(" + gitVersion + ") Alive and Kicking...");
});

/**
 * 
 * This is the Queue Consumer Process!
 * 
 */

// init mail
if (config.get('email.active'))
{
	global.transporter = common.initMail();
}

var startedDate = new Date();

var c = 0;

var sleepForSeconds = config.get('consumer.sleepForSeconds');

var i = setInterval(function()
{
	db.sortQueues();
	db.getMessages();
	c = c + 1;
	if (c % 2 == 0)
	{
		updateStats();
	}

}, 1000 * sleepForSeconds);


// NOTE!
//
// Queues with different names does not affect each others priority so make sure that you 
// DO NOT have two queues that are sending to the same service!
//

function updateStats()
{
	var newMessages = 0;
	var errorMessages = 0;

	db.getMessageCount("status = '" + common.messageStatus.NEW + "'", function(figure)
	{
		newMessages = figure;
		db.setStats("NewMessages", figure);

		db.getMessageCount("status = '" + common.messageStatus.ERROR + "'", function(figure)
		{
			errorMessages = figure;
			var totalWaiting = newMessages + errorMessages;
			db.setStats("MessagesWithError", figure);
			db.setStats("TotalWaitingMessages", totalWaiting);

			if (c % 5 == 0 && totalWaiting > 0)
			{
				console.log("Total waiting msgs: " + totalWaiting);
			}
		});
	});
}
