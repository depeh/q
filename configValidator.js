var require = require("./rq");

var config = require("./config");

function parseCodeList(value)
{
	if (value === undefined || value === null || value === "")
	{
		return [];
	}

	if (Array.isArray(value))
	{
		return value.map(function(item)
		{
			return parseInt(item, 10);
		});
	}

	return String(value).split(',').map(function(item)
	{
		return parseInt(item.trim(), 10);
	});
}

function isValidCode(code)
{
	return Number.isInteger(code) && code >= 100 && code <= 599;
}

exports.validateConfig = function()
{
	var errors = [];
	var warnings = [];
	var dbClient = config.has('db.client') ? config.get('db.client') : 'mysql';
	var okCodes = config.has('consumer.httpResponseCodesOK') ? parseCodeList(config.get('consumer.httpResponseCodesOK')) : [200];
	var failCodes = config.has('consumer.httpResponseCodesFail') ? parseCodeList(config.get('consumer.httpResponseCodesFail')) : [];
	var overlap = [];

	if (dbClient !== 'mysql' && dbClient !== 'sqlite')
	{
		errors.push("`db.client` must be either `mysql` or `sqlite`.");
	}

	if (dbClient === 'sqlite')
	{
		if (!config.has('db.sqlite.file') || !config.get('db.sqlite.file'))
		{
			errors.push("`db.sqlite.file` is required when `db.client` is `sqlite`.");
		}
	}

	if (dbClient === 'mysql')
	{
		['db.host', 'db.user', 'db.database'].forEach(function(key)
		{
			if (!config.has(key) || !config.get(key))
			{
				errors.push("`" + key + "` is required when `db.client` is `mysql`.");
			}
		});
	}

	['server.httpPort', 'server.httpsPort', 'server.maxBodySizeKb', 'consumer.sleepForSeconds', 'consumer.maxConcurrent', 'consumer.minIntervalPerHostMs'].forEach(function(key)
	{
		if (!config.has(key) || !Number.isFinite(config.get(key)) || config.get(key) < 0)
		{
			errors.push("`" + key + "` must be a non-negative number.");
		}
	});

	if (!config.has('server.whiteListIpAdresses') || !Array.isArray(config.get('server.whiteListIpAdresses')))
	{
		errors.push("`server.whiteListIpAdresses` must be an array.");
	}

	if (!okCodes.every(isValidCode))
	{
		errors.push("`consumer.httpResponseCodesOK` must contain valid HTTP status codes (100-599).");
	}

	if (!failCodes.every(isValidCode))
	{
		errors.push("`consumer.httpResponseCodesFail` must contain valid HTTP status codes (100-599).");
	}

	overlap = okCodes.filter(function(code)
	{
		return failCodes.indexOf(code) > -1;
	});

	if (overlap.length > 0)
	{
		warnings.push("Status codes exist in both OK and FAIL lists (" + overlap.join(',') + "). OK list takes precedence.");
	}

	if (errors.length > 0)
	{
		var message = "Invalid configuration:\n- " + errors.join("\n- ");
		throw new Error(message);
	}

	return { warnings: warnings };
};
