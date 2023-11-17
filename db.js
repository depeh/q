var require = require("./rq"); // Override require


var config = require("./config");
var logger = require('./logger');
var common = require('./common');
var doRequest = require('./doRequest');

exports.connect = function()
{
	var mysql = require('mysql');

	var connection = mysql.createConnection(
	{
		host: config.get('db.host'),
		user: config.get('db.user'),
		password: config.get('db.password'),
		database: config.get('db.database'),
	});

	connection.connect();

	return connection;
};


function setStats(key, figure)
{
	var post = {
		Key: key,
		Figure: figure
	};

	var query = conn.query("INSERT INTO Stats SET ? ON DUPLICATE KEY UPDATE Figure=" + figure, post, function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}
exports.setStats = setStats;

function increaseStats(key)
{
	var post = {
		Key: key,
		Figure: 1
	};

	var query = conn.query("INSERT INTO Stats SET ? ON DUPLICATE KEY UPDATE Figure=Figure+1", post, function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}
exports.increaseStats = increaseStats;



function increaseQueueStats(queue, type)
{
	if (type != common.statsType.ADDED && type != common.statsType.SUCCEEDED && type != common.statsType.FAILED || queue == null || queue == undefined)
	{
		console.log("Syntax error calling increaseQueueStats");
		return;
	};

	var query = conn.query("UPDATE QueueInfo SET " + type + "=" + type + "+1 WHERE Name=?", queue, function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}
exports.increaseQueueStats = increaseQueueStats;



exports.setQueueUpdated = function(queue)
{
	var updateDate = new Date();

	var post = {
		Name: queue,
		Updated: updateDate,
		WasUpdated: 1
	};

	var query = conn.query("INSERT INTO QueueInfo SET ? ON DUPLICATE KEY UPDATE WasUpdated=1, Updated=NOW()", post, function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}

function resetQueueUpdated(id)
{
	var query = conn.query("UPDATE QueueInfo SET WasUpdated=0 WHERE id=" + id, function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}

/**
 * Push (Add) the message to the queue
 * 
 * @param {String} queue
 * @param {String} url
 * @param {String} verb
 * @param {JSON} headers
 * @param {JSON} params
 * @param {String} createdby
 * @param {String} priority
 * @param {Int} callback
 * @returns {Int} Queue ID or 0 if failed. 
 */
exports.push = function(queue, url, verb, headers, params, createdby, priority, specialParams, callback)
{
	priority = (priority == undefined) ? 5 : priority;
	createdby = (createdby == undefined) ? "none" : createdby;

	if (!queue || !url || !verb || !headers || !params)
	{
		return;
	}

	// Override the Queue settings.
	var Qsendinterval = common.getHeader(headers, 'q-send-interval', null);
	var Qretries = common.getHeader(headers, 'q-retries', null);
	var Qretryinterval = common.getHeader(headers, 'q-retry-interval', null);
	var Qsuccess = common.getHeader(headers, 'q-success', null);
	var Qfail = common.getHeader(headers, 'q-fail', null);

	// This is scheduled task?
	var Qschedule = common.getHeader(headers, 'q-schedule', null);

	// todo: If params contains multiple json structures,
	// split it and create multiple
	// 



	//console.log(_params);

	// Convert the JSON objects to string
	var paramsStr = JSON.stringify(params);
	var headersStr = JSON.stringify(headers);

	var createdDate = new Date();

	var Qsendinterval = common.getHeader(headers, 'q-send-interval', null);
	var Qretries = common.getHeader(headers, 'q-retries', null);
	var Qretryinterval = common.getHeader(headers, 'q-retry-interval', null);
	var Qsuccess = common.getHeader(headers, 'q-success', null);
	var Qfail = common.getHeader(headers, 'q-fail', null);

	var status = common.messageStatus.NEW;

	var delivery = null;

	// If this is a scheduled task,
	if (Qschedule != null)
	{
		var timestamp = Date.parse(Qschedule);

		// Check if the date provided is a valid one.
		if (isNaN(timestamp) == false)
		{
			var d = new Date(timestamp);
			status = common.messageStatus.SCHEDULE;
			delivery = d;
			priority = 0;
		}

	}


	var post = {
		Queue: queue,
		Priority: priority,
		Url: url,
		Verb: verb,
		Headers: headersStr,
		Params: paramsStr,
		Created: createdDate,
		Updated: createdDate,
		CreatedBy: createdby,
		Status: status,
		SendInterval: Qsendinterval,
		Retries: Qretries,
		RetryInterval: Qretryinterval,
		Success: Qsuccess,
		Delivery: delivery,
		Fail: Qfail
	};

	//var _params = params;

	// If there are multiple structures in the json object..
	if (specialParams && params != null && params != undefined)
	{
		var sql = "INSERT INTO Message (Queue, Priority, Url, Verb, Headers, Params, Created, Updated, CreatedBy, Status, SendInterval, Retries, RetryInterval, Success, Delivery, Fail) VALUES ?";

		var values = [];

		for (var i = 0; i < params.length; i++)
		{
			var postRow = [queue, priority, url, verb, headersStr, '', createdDate, createdDate, createdby, status, Qsendinterval, Qretries, Qretryinterval, Qsuccess, delivery, Qfail];
			var param = params[i];
			var strParam = JSON.stringify(param);

			postRow[5] = strParam;
			values.push(postRow);

		}

		var valCount = values.length;

		var query = conn.query(sql, [values], function(error, results, fields)
		{
			if (error)
			{
				logger.error(query.sql, error.message);
				callback(0);
				return;
			}

			var id = results.insertId;
			logger.info(valCount + " messages were added to the Queue: " + queue + " - Last msg #" + id);

			if (delivery != null)
			{
				logger.info(valCount + " messages will be delivered at: " + delivery);
			}

			increaseStats("MessagesAdded");

			// Invoke the callback
			callback(id);
		});

		return;

	}



	var query = conn.query("INSERT INTO Message SET ?", post, function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			callback(0);
			return;
		}

		var id = results.insertId;
		logger.info("Msg #" + id + " was added to the Queue: " + queue);

		if (delivery != null)
		{
			logger.info("Msg #" + id + " will be delivered at: " + delivery);
		}

		increaseStats("MessagesAdded");

		// Invoke the callback
		callback(id);

	});

}

exports.getMessageCount = function(where, callback)
{
	var query = conn.query("SELECT count(id) as cnt FROM Message WHERE " + where, function(error, rows, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		}

		callback(rows[0].cnt);

	});

}

exports.getMessageQueueById = function(id, callback)
{
	var query = conn.query("SELECT Message.Queue, Message.Delivery, Message.Retries AS r1, QueueInfo.Retries AS r2, Message.RetryCounter, Message.RetryInterval AS ri1, QueueInfo.RetryInterval AS ri2, Message.Success AS s1, QueueInfo.Success AS s2, Message.Fail AS f1, QueueInfo.Fail AS f2 FROM Message, QueueInfo WHERE Message.Queue = QueueInfo.Name AND Message.id = " + id + " LIMIT 1", function(error, rows, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		}

		callback(rows[0]);

	});

}



function updateMessageById(id, retryCounter, updated, deliveryTime, status)
{
	var query = conn.query("UPDATE Message SET RetryCounter=?, Updated=?, Delivery=?, Status=? WHERE id=?", [retryCounter, updated, deliveryTime, status, id], function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}

exports.updateMessageById = updateMessageById;


function updateMessageStatusById(id, status)
{
	var query = conn.query("UPDATE Message SET Updated=NOW(), Status=? WHERE id=?", [status, id], function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}

exports.updateMessageStatusById = updateMessageStatusById;


function updateMessageLastErrorById(id, errorText)
{
	var query = conn.query("UPDATE Message SET Updated=NOW(), LastError=? WHERE id=?", [errorText, id], function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}

exports.updateMessageLastErrorById = updateMessageLastErrorById;



function updateDelivery(id, newDelivery)
{

	var query = conn.query("UPDATE Message SET Delivery=? WHERE id=?", [newDelivery, id], function(error, results, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		};

	});

}

//exports.updateDelivery = updateDelivery;


exports.sortQueues = function()
{

	/**
	 * 
	 * SELECT Message.id, Message.SendInterval AS si1, QueueInfo.SendInterval as si2 FROM Message, QueueInfo 
	WHERE Message.Queue = QueueInfo.Name AND QueueInfo.WasUpdated = 1
	ORDER BY Priority, Updated

	 */
	var that = this;

	var query = conn.query("SELECT id, Name FROM QueueInfo WHERE WasUpdated = 1", function(error, rows, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		}

		for (var i in rows)
		{
			var id = rows[i].id;
			var name = rows[i].Name;

			console.log("Queue " + name + " changed, resorting...");
			// Reset the Queue WasUpdated Flag.
			resetQueueUpdated(id);

			// Find all messages that are going to be rescheduled. ERROR and FAIL will not be rescheduled
			var query = conn.query("SELECT Message.id, Message.SendInterval AS si1, QueueInfo.SendInterval as si2 FROM Message, QueueInfo WHERE Message.Status = '" + common.messageStatus.NEW + "' AND Message.Queue = QueueInfo.Name AND QueueInfo.id = " + id + " ORDER BY Message.Priority, Message.Updated ", function(error, rows, fields)
			{
				if (error)
				{
					logger.error(query.sql, error.message);
					return;
				}

				// For each queue, the start time is set to NOW for the highest prioritized queue item.
				var deliveryTime = new Date();

				for (var j in rows)
				{
					var id = rows[j].id;
					var si1 = rows[j].si1;
					var si2 = rows[j].si2;

					// set new Delivery DateTime for the current message
					updateDelivery(id, deliveryTime);

					// Calculate new Delivery time for the next message
					var waitUntilNextMessage = (si1 == null) ? si2 : si1;
					deliveryTime = new Date(deliveryTime.getTime() + (1000 * waitUntilNextMessage));

				}

			});



		}

	});

}



exports.getMessages = function()
{
	var query = conn.query("SELECT id, Verb, Url, Headers, Params FROM Message WHERE (status = '" + common.messageStatus.NEW + "' OR status = '" + common.messageStatus.SCHEDULE + "' OR status = '" + common.messageStatus.ERROR + "') AND Delivery < NOW() ORDER BY Delivery LIMIT 1", function(error, rows, fields)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		}

		for (var i in rows)
		{
			var id = rows[i].id;
			var verb = rows[i].Verb;
			var url = rows[i].Url;
			var headers = rows[i].Headers;
			var params = rows[i].Params;

			if (url == "email")
			{
				doRequest.email(id, url, verb, headers, params);
			}
			else
			{
				doRequest.http(id, url, verb, headers, params);
			}

		}

	});

};