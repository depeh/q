var require = require("./rq");

var qs = require('qs');

function buildUrl(uri, query)
{
	var url = new URL(uri);
	var key;

	if (query)
	{
		for (key in query)
		{
			if (query[key] !== undefined && query[key] !== null)
			{
				url.searchParams.set(key, query[key]);
			}
		}
	}

	return url.toString();
}

exports.send = function(options, callback)
{
	var controller = new AbortController();
	var timeout = options.timeout || 10000;
	var headers = options.headers || {};
	var body = null;
	var method = options.method || 'GET';
	var url = buildUrl(options.uri, options.qs);
	var timer = setTimeout(function()
	{
		controller.abort();
	}, timeout);

	if (options.form)
	{
		body = qs.stringify(options.form);
		if (!headers['content-type'] && !headers['Content-Type'])
		{
			headers['content-type'] = 'application/x-www-form-urlencoded';
		}
	}
	else if (options.body !== undefined)
	{
		body = options.body;
	}

	fetch(url, {
		method: method,
		headers: headers,
		body: body,
		signal: controller.signal
	})
		.then(function(response)
		{
			return response.text().then(function(text)
			{
				clearTimeout(timer);
				callback(null, {
					statusCode: response.status,
					headers: response.headers
				}, text);
			});
		})
		.catch(function(error)
		{
			clearTimeout(timer);
			callback(error);
		});
}
