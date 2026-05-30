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
var doRequest = require('./doRequest');

var dbClient = config.has('db.client') ? config.get('db.client') : 'mysql';

function isSqlite()
{
	return dbClient === 'sqlite';
}

function normalizeParams(params)
{
	if (params === undefined || params === null) return [];
	if (Array.isArray(params)) return params;
	return [params];
}

function withNow(sql)
{
	return isSqlite() ? sql.replace(/NOW\(\)/g, "datetime('now')") : sql;
}

function initSqliteSchema(db)
{
	var schema = [
		"CREATE TABLE IF NOT EXISTS Message (id INTEGER PRIMARY KEY AUTOINCREMENT, Queue TEXT, Priority INTEGER, Created TEXT, CreatedBy TEXT, Url TEXT, Verb TEXT, Headers TEXT, Params TEXT, Delivery TEXT, Status TEXT, Retries INTEGER, RetryCounter INTEGER DEFAULT 0, Fails INTEGER, RetryInterval INTEGER, SendInterval INTEGER, Fail TEXT, Success TEXT, Updated TEXT, LastError TEXT)",
		"CREATE TABLE IF NOT EXISTS QueueInfo (id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT UNIQUE, Updated TEXT, WasUpdated INTEGER DEFAULT 0, SendInterval INTEGER DEFAULT 1, Retries INTEGER DEFAULT 3, RetryInterval INTEGER DEFAULT 120, ChunkCount INTEGER DEFAULT 1, Success TEXT DEFAULT 'DELETE', Fail TEXT, Added INTEGER DEFAULT 0, Succeeded INTEGER DEFAULT 0, Failed INTEGER DEFAULT 0)",
		"CREATE TABLE IF NOT EXISTS Stats (id INTEGER PRIMARY KEY AUTOINCREMENT, Key TEXT UNIQUE, Figure INTEGER DEFAULT 0)"
	];

	db.serialize(function()
	{
		for (var i = 0; i < schema.length; i++)
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
			var upper = sql.trim().toUpperCase();

			if (upper.indexOf('SELECT') === 0)
			{
				sqliteDb.all(sql, params, function(error, rows)
				{
					if (callback) callback(error, rows || [], []);
				});
				return { sql: sql };
			}

			sqliteDb.run(sql, params, function(error)
			{
				if (callback)
				{
					callback(error, { insertId: this ? this.lastID : 0, affectedRows: this ? this.changes : 0 }, []);
				}
			});

			return { sql: sql };
		}
	};
}

function connectMysql()
{
	var mysql = require('mysql');

	var connection = mysql.createConnection(
	{
		host: config.get('db.host'),
		user: config.get('db.user'),
		password: config.get('db.password'),
		database: config.get('db.database')
	});

	connection.connect();
	return connection;
}

exports.connect = function()
{
	if (isSqlite())
	{
		logger.info("Using SQLite backend");
		return connectSqlite();
	}

	return connectMysql();
};

function setStats(key, figure)
{
	if (isSqlite())
	{
		var query = conn.query("INSERT INTO Stats(Key, Figure) VALUES(?, ?) ON CONFLICT(Key) DO UPDATE SET Figure=excluded.Figure", [key, figure], function(error)
		{
			if (error)
			{
				logger.error(query.sql, error.message);
			}
		});
		return;
	}

	var post = { Key: key, Figure: figure };
	var query = conn.query("INSERT INTO Stats SET ? ON DUPLICATE KEY UPDATE Figure=?", [post, figure], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}
exports.setStats = setStats;

function increaseStats(key)
{
	if (isSqlite())
	{
		var query = conn.query("INSERT INTO Stats(Key, Figure) VALUES(?, 1) ON CONFLICT(Key) DO UPDATE SET Figure=Figure+1", [key], function(error)
		{
			if (error)
			{
				logger.error(query.sql, error.message);
			}
		});
		return;
	}

	var post = { Key: key, Figure: 1 };
	var query = conn.query("INSERT INTO Stats SET ? ON DUPLICATE KEY UPDATE Figure=Figure+1", post, function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}
exports.increaseStats = increaseStats;

function increaseQueueStats(queue, type)
{
	if (type != common.statsType.ADDED && type != common.statsType.SUCCEEDED && type != common.statsType.FAILED || queue == null || queue == undefined)
	{
		console.log("Syntax error calling increaseQueueStats");
		return;
	}

	var sql = "UPDATE QueueInfo SET " + type + "=" + type + "+1 WHERE Name=?";
	var query = conn.query(sql, [queue], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}
exports.increaseQueueStats = increaseQueueStats;

exports.setQueueUpdated = function(queue)
{
	var updateDate = new Date();

	if (isSqlite())
	{
		var query = conn.query("INSERT INTO QueueInfo(Name, Updated, WasUpdated) VALUES(?, ?, 1) ON CONFLICT(Name) DO UPDATE SET WasUpdated=1, Updated=datetime('now')", [queue, updateDate.toISOString()], function(error)
		{
			if (error)
			{
				logger.error(query.sql, error.message);
			}
		});
		return;
	}

	var post = { Name: queue, Updated: updateDate, WasUpdated: 1 };
	var query = conn.query("INSERT INTO QueueInfo SET ? ON DUPLICATE KEY UPDATE WasUpdated=1, Updated=NOW()", post, function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}

function resetQueueUpdated(id)
{
	var query = conn.query("UPDATE QueueInfo SET WasUpdated=0 WHERE id=?", [id], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}

exports.push = function(queue, url, verb, headers, params, createdby, priority, specialParams, callback)
{
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

	var paramsStr = JSON.stringify(params);
	var headersStr = JSON.stringify(headers);
	var createdDate = new Date();
	var status = common.messageStatus.NEW;
	var delivery = null;

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
		var valCount = params.length;
		if (!valCount)
		{
			callback(0);
			return;
		}

		var insertSql = "INSERT INTO Message (Queue, Priority, Url, Verb, Headers, Params, Created, Updated, CreatedBy, Status, SendInterval, Retries, RetryInterval, Success, Delivery, Fail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
		var firstId = 0;
		var completed = 0;
		var failed = false;

		for (var i = 0; i < params.length; i++)
		{
			var rowParam = JSON.stringify(params[i]);
			var row = [queue, priority, url, verb, headersStr, rowParam, createdDate, createdDate, createdby, status, Qsendinterval, Qretries, Qretryinterval, Qsuccess, delivery, Qfail];
			conn.query(insertSql, row, function(error, results)
			{
				if (failed) return;
				if (error)
				{
					failed = true;
					callback(0);
					return;
				}

				if (!firstId)
				{
					firstId = results.insertId;
				}

				completed = completed + 1;
				if (completed === valCount)
				{
					logger.info(valCount + " messages were added to the Queue: " + queue + " - Last msg #" + results.insertId);
					if (delivery != null)
					{
						logger.info(valCount + " messages will be delivered at: " + delivery);
					}
					increaseStats("MessagesAdded");
					callback(firstId);
				}
			});
		}

		return;
	}

	var post = [queue, priority, url, verb, headersStr, paramsStr, createdDate, createdDate, createdby, status, Qsendinterval, Qretries, Qretryinterval, Qsuccess, delivery, Qfail];
	var query = conn.query("INSERT INTO Message (Queue, Priority, Url, Verb, Headers, Params, Created, Updated, CreatedBy, Status, SendInterval, Retries, RetryInterval, Success, Delivery, Fail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", post, function(error, results)
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
		callback(id);
	});
}

exports.getMessageCount = function(where, callback)
{
	var query = conn.query("SELECT count(id) as cnt FROM Message WHERE " + where, function(error, rows)
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
	var query = conn.query("SELECT Message.Queue, Message.Delivery, Message.Retries AS r1, QueueInfo.Retries AS r2, Message.RetryCounter, Message.RetryInterval AS ri1, QueueInfo.RetryInterval AS ri2, Message.Success AS s1, QueueInfo.Success AS s2, Message.Fail AS f1, QueueInfo.Fail AS f2 FROM Message, QueueInfo WHERE Message.Queue = QueueInfo.Name AND Message.id = ? LIMIT 1", [id], function(error, rows)
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
	var query = conn.query("UPDATE Message SET RetryCounter=?, Updated=?, Delivery=?, Status=? WHERE id=?", [retryCounter, updated, deliveryTime, status, id], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}
exports.updateMessageById = updateMessageById;

function updateMessageStatusById(id, status)
{
	var query = conn.query("UPDATE Message SET Updated=NOW(), Status=? WHERE id=?", [status, id], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}
exports.updateMessageStatusById = updateMessageStatusById;

function updateMessageLastErrorById(id, errorText)
{
	var query = conn.query("UPDATE Message SET Updated=NOW(), LastError=? WHERE id=?", [errorText, id], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}
exports.updateMessageLastErrorById = updateMessageLastErrorById;

function updateDelivery(id, newDelivery)
{
	var query = conn.query("UPDATE Message SET Delivery=? WHERE id=?", [newDelivery, id], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
}

exports.moveMessageToQueue = function(id, queue)
{
	var query = conn.query("UPDATE Message SET Queue=?, Updated=NOW(), Status=? WHERE id=?", [queue, common.messageStatus.MOVED, id], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
		}
	});
};

exports.deleteMessageById = function(id)
{
	var query = conn.query("DELETE FROM Message WHERE id=?", [id], function(error)
	{
		if (error)
		{
			logger.error(query.sql, error.message);
			return;
		}
		logger.info("Msg #" + id + " DELETED!");
	});
};

exports.sortQueues = function()
{
	var query = conn.query("SELECT id, Name FROM QueueInfo WHERE WasUpdated = 1", function(error, rows)
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
			resetQueueUpdated(id);

			var query2 = conn.query("SELECT Message.id, Message.SendInterval AS si1, QueueInfo.SendInterval as si2 FROM Message, QueueInfo WHERE Message.Status = ? AND Message.Queue = QueueInfo.Name AND QueueInfo.id = ? ORDER BY Message.Priority, Message.Updated", [common.messageStatus.NEW, id], function(error, rows)
			{
				if (error)
				{
					logger.error(query2.sql, error.message);
					return;
				}

				var deliveryTime = new Date();
				for (var j in rows)
				{
					var msgId = rows[j].id;
					var si1 = rows[j].si1;
					var si2 = rows[j].si2;
					updateDelivery(msgId, deliveryTime);
					var waitUntilNextMessage = (si1 == null) ? si2 : si1;
					deliveryTime = new Date(deliveryTime.getTime() + (1000 * waitUntilNextMessage));
				}
			});
		}
	});
}

exports.getMessages = function()
{
	var query = conn.query("SELECT id, Verb, Url, Headers, Params FROM Message WHERE (status = ? OR status = ? OR status = ?) AND Delivery < NOW() ORDER BY Delivery LIMIT 1", [common.messageStatus.NEW, common.messageStatus.SCHEDULE, common.messageStatus.ERROR], function(error, rows)
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
