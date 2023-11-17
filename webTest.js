var require = require("./rq"); // Override require
var http = require('http');
console.log("Webserver started at port 8090...");

var server = http.createServer(function(req, res)
{
	console.log("New request received at: " + Date());
	var headers = req.headers;
	console.log(headers);

	// Load body
	var body = [];
	req.on('data', function(chunk)
	{
		body.push(chunk);
	}).on('end', function()
	{
		body = Buffer.concat(body).toString();
		var qs = require('qs')
		var bodyJson = qs.parse(body);

		console.log("url", req['url']);
		console.log("body", bodyJson);

		res.writeHead(200);
		res.end('ok');
	});

});

server.listen(8090);