/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Goran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Goran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq"); // Override require

var fs = require('fs');
var path = require('path');
var config = require("./config");
var logger = require('./logger');
var common = require('./common');
var conn = null;

var dbClient = config.has('db.client') ? config.get('db.client') : 'mysql';

function isSqlite()
{
	return dbClient === 'sqlite';
}

function normalizeParams(params)
{
	if (params === undefined || params === null)
	{
		return [];
	}

	if (Array.isArray(params))
	{
		return params;
	}

	return [params];
}

function withNow(sql)
{
	return isSqlite() ? sql.replace(/NOW\(\)/g, "datetime('now')") : sql;
}

function runQuery(sql, params, callback)
{
	if (!conn)
	{
		callback(new Error("Database connection is not initialized."), []);
		return;
	}

	var query = conn.query(sql, params, function(error, rows)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}

		callback(error, rows || []);
	});
}

function logEvent(messageId, queue, eventType, status, detail, callback)
{
	runQuery("INSERT INTO EventLog (MessageId, Queue, EventType, Status, Detail, Created) VALUES (?, ?, ?, ?, ?, ?)", [messageId || null, queue || null, eventType || null, status || null, detail || null, new Date()], function(error, rows)
	{
		if (callback)
		{
			callback(error, rows);
		}
	});
}

function initSqliteSchema(db)
{
	var schema = [
		"CREATE TABLE IF NOT EXISTS Message (id INTEGER PRIMARY KEY AUTOINCREMENT, Queue TEXT, Priority INTEGER, Created TEXT, CreatedBy TEXT, Url TEXT, Verb TEXT, Headers TEXT, Params TEXT, Delivery TEXT, Status TEXT, Retries INTEGER, RetryCounter INTEGER DEFAULT 0, Fails INTEGER, RetryInterval INTEGER, SendInterval INTEGER, Fail TEXT, Success TEXT, Updated TEXT, LastError TEXT)",
		"CREATE TABLE IF NOT EXISTS QueueInfo (id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT UNIQUE, Updated TEXT, WasUpdated INTEGER DEFAULT 0, SendInterval INTEGER DEFAULT 1, Retries INTEGER DEFAULT 3, RetryInterval INTEGER DEFAULT 120, ChunkCount INTEGER DEFAULT 1, Success TEXT DEFAULT 'DELETE', Fail TEXT, Added INTEGER DEFAULT 0, Succeeded INTEGER DEFAULT 0, Failed INTEGER DEFAULT 0)",
		"CREATE TABLE IF NOT EXISTS Stats (id INTEGER PRIMARY KEY AUTOINCREMENT, Key TEXT UNIQUE, Figure INTEGER DEFAULT 0)",
		"CREATE TABLE IF NOT EXISTS EventLog (id INTEGER PRIMARY KEY AUTOINCREMENT, MessageId INTEGER, Queue TEXT, EventType TEXT, Status TEXT, Detail TEXT, Created TEXT)"
	];

	db.serialize(function()
	{
		var i;
		for (i = 0; i < schema.length; i++)
		{
			db.run(schema[i]);
		}
	});
}

function connectSqlite()
{
	var sqlite3 = require('sqlite3').verbose();
	var file = config.has('db.sqlite.file') ? config.get('db.sqlite.file') : 'queue.sqlite';
	var filePath = path.resolve(file);
	var dir = path.dirname(filePath);

	if (!fs.existsSync(dir))
	{
		fs.mkdirSync(dir, { recursive: true });
	}

	var sqliteDb = new sqlite3.Database(filePath);
	initSqliteSchema(sqliteDb);

	return {
		query: function(sql, params, callback)
		{
			if (typeof params === 'function')
			{
				callback = params;
				params = [];
			}

			params = normalizeParams(params);
			sql = withNow(sql);

			if (sql.trim().toUpperCase().indexOf('SELECT') === 0)
			{
				sqliteDb.all(sql, params, function(error, rows)
				{
					if (callback)
					{
						callback(error, rows || [], []);
					}
				});
			}
			else
			{
				sqliteDb.run(sql, params, function(error)
				{
					if (callback)
					{
						callback(error, {
							insertId: this ? this.lastID : 0,
							affectedRows: this ? this.changes : 0
						}, []);
					}
				});
			}

			return { sql: sql };
		}
	};
}

function connectMysql()
{
	var mysql = require('mysql');
	var connection = mysql.createConnection({
		host: config.get('db.host'),
		user: config.get('db.user'),
		password: config.get('db.password'),
		database: config.get('db.database')
	});

	connection.connect();
	return connection;
}

function ensureQueueInfo(queue, callback)
{
	exports.setQueueUpdated(queue);
	if (callback)
	{
		callback();
	}
}

function getMessageByIdInternal(id, callback)
{
	runQuery("SELECT * FROM Message WHERE id = ? LIMIT 1", [id], function(error, rows)
	{
		if (error)
		{
			callback(error);
			return;
		}

		callback(null, rows[0] || null);
	});
}

function updateDelivery(id, newDelivery, callback)
{
	runQuery("UPDATE Message SET Delivery=? WHERE id=?", [newDelivery, id], function(error)
	{
		if (callback)
		{
			callback(error);
		}
	});
}

exports.connect = function()
{
	if (isSqlite())
	{
		logger.info("Using SQLite backend");
		conn = connectSqlite();
		return conn;
	}

	conn = connectMysql();
	return conn;
};

exports.logEvent = logEvent;

function setStats(key, figure)
{
	if (isSqlite())
	{
		runQuery("INSERT INTO Stats(Key, Figure) VALUES(?, ?) ON CONFLICT(Key) DO UPDATE SET Figure=excluded.Figure", [key, figure], function() {});
		return;
	}

	runQuery("INSERT INTO Stats SET ? ON DUPLICATE KEY UPDATE Figure=?", [{ Key: key, Figure: figure }, figure], function() {});
}
exports.setStats = setStats;

function increaseStats(key)
{
	if (isSqlite())
	{
		runQuery("INSERT INTO Stats(Key, Figure) VALUES(?, 1) ON CONFLICT(Key) DO UPDATE SET Figure=Figure+1", [key], function() {});
		return;
	}

	runQuery("INSERT INTO Stats SET ? ON DUPLICATE KEY UPDATE Figure=Figure+1", { Key: key, Figure: 1 }, function() {});
}
exports.increaseStats = increaseStats;

function increaseQueueStats(queue, type)
{
	if ((type != common.statsType.ADDED && type != common.statsType.SUCCEEDED && type != common.statsType.FAILED) || queue == null || queue == undefined)
	{
		console.log("Syntax error calling increaseQueueStats");
		return;
	}

	runQuery("UPDATE QueueInfo SET " + type + "=" + type + "+1 WHERE Name=?", [queue], function() {});
}
exports.increaseQueueStats = increaseQueueStats;

exports.setQueueUpdated = function(queue)
{
	var updateDate = new Date();

	if (isSqlite())
	{
		runQuery("INSERT INTO QueueInfo(Name, Updated, WasUpdated) VALUES(?, ?, 1) ON CONFLICT(Name) DO UPDATE SET WasUpdated=1, Updated=datetime('now')", [queue, updateDate.toISOString()], function() {});
		return;
	}

	runQuery("INSERT INTO QueueInfo SET ? ON DUPLICATE KEY UPDATE WasUpdated=1, Updated=NOW()", { Name: queue, Updated: updateDate, WasUpdated: 1 }, function() {});
};

function resetQueueUpdated(id)
{
	runQuery("UPDATE QueueInfo SET WasUpdated=0 WHERE id=?", [id], function() {});
}

exports.push = function(queue, url, verb, headers, params, createdby, priority, specialParams, callback)
{
	var insertSql = "INSERT INTO Message (Queue, Priority, Url, Verb, Headers, Params, Created, Updated, CreatedBy, Status, SendInterval, Retries, RetryInterval, Success, Delivery, Fail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
	var values = [];
	var createdDate = new Date();
	var status = common.messageStatus.NEW;
	var delivery = null;
	var index = 0;
	var firstId = 0;

	priority = (priority == undefined) ? 5 : priority;
	createdby = (createdby == undefined) ? "none" : createdby;

	if (!queue || !url || !verb || !headers || !params)
	{
		return;
	}

	var Qsendinterval = common.getHeader(headers, 'q-send-interval', null);
	var Qretries = common.getHeader(headers, 'q-retries', null);
	var Qretryinterval = common.getHeader(headers, 'q-retry-interval', null);
	var Qsuccess = common.getHeader(headers, 'q-success', null);
	var Qfail = common.getHeader(headers, 'q-fail', null);
	var Qschedule = common.getHeader(headers, 'q-schedule', null);
	var headersStr = JSON.stringify(headers);

	if (Qschedule != null)
	{
		var timestamp = Date.parse(Qschedule);
		if (isNaN(timestamp) == false)
		{
			delivery = new Date(timestamp);
			status = common.messageStatus.SCHEDULE;
			priority = 0;
		}
	}

	if (specialParams && params != null && params != undefined)
	{
		if (!params.length)
		{
			callback(0);
			return;
		}

		for (index = 0; index < params.length; index++)
		{
			values.push([queue, priority, url, verb, headersStr, JSON.stringify(params[index]), createdDate, createdDate, createdby, status, Qsendinterval, Qretries, Qretryinterval, Qsuccess, delivery, Qfail]);
		}
	}
	else
	{
		values.push([queue, priority, url, verb, headersStr, JSON.stringify(params), createdDate, createdDate, createdby, status, Qsendinterval, Qretries, Qretryinterval, Qsuccess, delivery, Qfail]);
	}

	function insertNext(position)
	{
		if (position >= values.length)
		{
			logger.info(values.length + " message(s) were added to the Queue: " + queue + " - Last msg #" + firstId);
			if (delivery != null)
			{
				logger.info(values.length + " message(s) will be delivered at: " + delivery);
			}
			increaseStats("MessagesAdded");
			logEvent(firstId, queue, "queued", status, values.length + " message(s) queued");
			callback(firstId);
			return;
		}

		runQuery(insertSql, values[position], function(error, results)
		{
			if (error)
			{
				callback(0);
				return;
			}

			if (!firstId)
			{
				firstId = results.insertId;
			}

			insertNext(position + 1);
		});
	}

	insertNext(0);
};

exports.getMessageCount = function(where, callback)
{
	runQuery("SELECT count(id) as cnt FROM Message WHERE " + where, [], function(error, rows)
	{
		if (error)
		{
			return;
		}

		callback(rows[0] ? rows[0].cnt : 0);
	});
};

exports.getMessageQueueById = function(id, callback)
{
	runQuery("SELECT Message.Queue, Message.Delivery, Message.Retries AS r1, QueueInfo.Retries AS r2, Message.RetryCounter, Message.RetryInterval AS ri1, QueueInfo.RetryInterval AS ri2, Message.Success AS s1, QueueInfo.Success AS s2, Message.Fail AS f1, QueueInfo.Fail AS f2 FROM Message LEFT JOIN QueueInfo ON Message.Queue = QueueInfo.Name WHERE Message.id = ? LIMIT 1", [id], function(error, rows)
	{
		if (error)
		{
			return;
		}

		callback(rows[0]);
	});
};

function updateMessageById(id, retryCounter, updated, deliveryTime, status, callback)
{
	runQuery("UPDATE Message SET RetryCounter=?, Updated=?, Delivery=?, Status=? WHERE id=?", [retryCounter, updated, deliveryTime, status, id], function(error)
	{
		if (callback)
		{
			callback(error);
		}
	});
}
exports.updateMessageById = updateMessageById;

function updateMessageStatusById(id, status, callback)
{
	runQuery("UPDATE Message SET Updated=NOW(), Status=? WHERE id=?", [status, id], function(error)
	{
		if (callback)
		{
			callback(error);
		}
	});
}
exports.updateMessageStatusById = updateMessageStatusById;

function updateMessageLastErrorById(id, errorText, callback)
{
	runQuery("UPDATE Message SET Updated=NOW(), LastError=? WHERE id=?", [errorText, id], function(error)
	{
		if (callback)
		{
			callback(error);
		}
	});
}
exports.updateMessageLastErrorById = updateMessageLastErrorById;

exports.updateDeliveryById = updateDelivery;

exports.moveMessageToQueue = function(id, queue, callback)
{
	ensureQueueInfo(queue, function()
	{
		runQuery("UPDATE Message SET Queue=?, Updated=NOW(), Status=? WHERE id=?", [queue, common.messageStatus.MOVED, id], function(error)
		{
			if (!error)
			{
				logEvent(id, queue, "moved", common.messageStatus.MOVED, "Message moved to queue " + queue);
			}

			if (callback)
			{
				callback(error);
			}
		});
	});
};

exports.deleteMessageById = function(id, callback)
{
	getMessageByIdInternal(id, function(readError, row)
	{
		runQuery("DELETE FROM Message WHERE id=?", [id], function(error)
		{
			if (!error)
			{
				logger.info("Msg #" + id + " DELETED!");
				logEvent(id, row ? row.Queue : null, "deleted", common.messageStatus.SUCCESS, "Message deleted after successful handling");
			}

			if (callback)
			{
				callback(error || readError);
			}
		});
	});
};

exports.sortQueues = function()
{
	runQuery("SELECT id, Name FROM QueueInfo WHERE WasUpdated = 1", [], function(error, rows)
	{
		if (error)
		{
			return;
		}

		rows.forEach(function(queueRow)
		{
			var deliveryTime = new Date();

			console.log("Queue " + queueRow.Name + " changed, resorting...");
			resetQueueUpdated(queueRow.id);

			runQuery("SELECT Message.id, Message.SendInterval AS si1, QueueInfo.SendInterval as si2 FROM Message JOIN QueueInfo ON Message.Queue = QueueInfo.Name WHERE Message.Status = ? AND QueueInfo.id = ? ORDER BY Message.Priority, Message.Updated", [common.messageStatus.NEW, queueRow.id], function(sortError, messageRows)
			{
				if (sortError)
				{
					return;
				}

				messageRows.forEach(function(row)
				{
					var waitUntilNextMessage = (row.si1 == null) ? row.si2 : row.si1;
					updateDelivery(row.id, deliveryTime);
					deliveryTime = new Date(deliveryTime.getTime() + (1000 * waitUntilNextMessage));
				});
			});
		});
	});
};

exports.claimAvailableMessages = function(limit, callback)
{
	runQuery("SELECT id, Queue, Verb, Url, Headers, Params, Delivery, Status FROM Message WHERE (Status = ? OR Status = ? OR Status = ?) AND Delivery < NOW() ORDER BY Delivery, Priority LIMIT ?", [common.messageStatus.NEW, common.messageStatus.SCHEDULE, common.messageStatus.ERROR, limit], function(error, rows)
	{
		var claimed = [];

		if (error || !rows.length)
		{
			callback(error, claimed);
			return;
		}

		function claimNext(index)
		{
			if (index >= rows.length)
			{
				callback(null, claimed);
				return;
			}

			updateMessageStatusById(rows[index].id, common.messageStatus.WAITING, function(updateError)
			{
				if (!updateError)
				{
					rows[index].Status = common.messageStatus.WAITING;
					claimed.push(rows[index]);
				}

				claimNext(index + 1);
			});
		}

		claimNext(0);
	});
};

exports.getMessageById = function(id, callback)
{
	getMessageByIdInternal(id, callback);
};

exports.listMessages = function(filters, callback)
{
	var clauses = [];
	var params = [];
	var limit = filters.limit || 100;
	var offset = filters.offset || 0;
	var sql = "SELECT id, Queue, Priority, Created, Updated, Url, Verb, Delivery, Status, RetryCounter, LastError FROM Message";

	if (filters.queue)
	{
		clauses.push("Queue = ?");
		params.push(filters.queue);
	}

	if (filters.status)
	{
		clauses.push("Status = ?");
		params.push(filters.status);
	}

	if (clauses.length)
	{
		sql += " WHERE " + clauses.join(" AND ");
	}

	sql += " ORDER BY Updated DESC, id DESC LIMIT ? OFFSET ?";
	params.push(limit);
	params.push(offset);

	runQuery(sql, params, callback);
};

exports.listQueues = function(callback)
{
	var sql = "SELECT QueueInfo.Name as Name, QueueInfo.Updated, QueueInfo.WasUpdated, QueueInfo.SendInterval, QueueInfo.Retries, QueueInfo.RetryInterval, QueueInfo.Success, QueueInfo.Fail, QueueInfo.Added, QueueInfo.Succeeded, QueueInfo.Failed, COUNT(Message.id) as TotalMessages, SUM(CASE WHEN Message.Status = 'new' THEN 1 ELSE 0 END) as NewMessages, SUM(CASE WHEN Message.Status = 'waiting' THEN 1 ELSE 0 END) as WaitingMessages, SUM(CASE WHEN Message.Status = 'error' THEN 1 ELSE 0 END) as ErrorMessages, SUM(CASE WHEN Message.Status = 'fail' THEN 1 ELSE 0 END) as FailedMessages, SUM(CASE WHEN Message.Status = 'success' THEN 1 ELSE 0 END) as SuccessfulMessages FROM QueueInfo LEFT JOIN Message ON QueueInfo.Name = Message.Queue GROUP BY QueueInfo.Name, QueueInfo.Updated, QueueInfo.WasUpdated, QueueInfo.SendInterval, QueueInfo.Retries, QueueInfo.RetryInterval, QueueInfo.Success, QueueInfo.Fail, QueueInfo.Added, QueueInfo.Succeeded, QueueInfo.Failed ORDER BY QueueInfo.Name";

	runQuery(sql, [], callback);
};

exports.getStatsSummary = function(callback)
{
	runQuery("SELECT Key, Figure FROM Stats ORDER BY Key", [], callback);
};

exports.listEvents = function(limit, callback)
{
	runQuery("SELECT id, MessageId, Queue, EventType, Status, Detail, Created FROM EventLog ORDER BY id DESC LIMIT ?", [limit || 50], callback);
};

exports.requeueMessageById = function(id, callback)
{
	getMessageByIdInternal(id, function(error, row)
	{
		var queueName;

		if (error || !row)
		{
			callback(error || new Error("Message not found"));
			return;
		}

		queueName = common.getOriginalQueueName(row.Queue);
		ensureQueueInfo(queueName, function()
		{
			runQuery("UPDATE Message SET Queue=?, Status=?, RetryCounter=0, Delivery=NOW(), Updated=NOW() WHERE id=?", [queueName, common.messageStatus.NEW, id], function(updateError)
			{
				if (!updateError)
				{
					logEvent(id, queueName, "requeue", common.messageStatus.NEW, "Message requeued from admin API");
				}

				if (callback)
				{
					callback(updateError, {
						id: id,
						queue: queueName,
						status: common.messageStatus.NEW
					});
				}
			});
		});
	});
};

exports.moveMessageToDeadLetter = function(id, callback)
{
	getMessageByIdInternal(id, function(error, row)
	{
		var deadLetterQueue;

		if (error || !row)
		{
			callback(error || new Error("Message not found"));
			return;
		}

		deadLetterQueue = common.getDeadLetterQueueName(row.Queue);
		ensureQueueInfo(deadLetterQueue, function()
		{
			runQuery("UPDATE Message SET Queue=?, Status=?, Updated=NOW() WHERE id=?", [deadLetterQueue, common.messageStatus.FAIL, id], function(updateError)
			{
				if (!updateError)
				{
					logEvent(id, deadLetterQueue, "dead-letter", common.messageStatus.FAIL, "Message moved to dead-letter queue");
				}

				if (callback)
				{
					callback(updateError, {
						id: id,
						queue: deadLetterQueue,
						status: common.messageStatus.FAIL
					});
				}
			});
		});
	});
};
