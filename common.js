/*
Fair Source License - v1.0 License details: https://opensource.org/licenses/Fair
Free for general use. Contact Göran Johansson at realdepeh@hotmail.com for commercial licensing.
Attribution: Göran Johansson, realdepeh@hotmail.com, https://github.com/depeh
*/

var require = require("./rq"); // Override require
var config = require('./config');
var logger = require('./logger');

// Application version number
exports.version = "0.2.0";

// On uncaught Exception, 
process.on('uncaughtException', function(err)
{
	console.log("Uncaught Exception: ");
	console.log(err);
	logger.error("Uncaught Exception");
	logger.error(err);
});

exports.validateEmail = function(email)
{
	var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
	return re.test(email);
}

exports.validateIp = function(ip)
{
	// Add ip adresses that are supposed to access this service here.
	var whiteListIpAdresses = config.get('server.whiteListIpAdresses');

	return (whiteListIpAdresses.indexOf(ip) > -1);
}

exports.getHeader = function(headers, key, defValue)
{
	return (headers[key] == undefined) ? defValue : headers[key];
}

exports.getIpFromReq = function(req)
{
	var ip = req.ip || req.connection.remoteAddress;
	if (ip.substr(0, 7) == "::ffff:")
	{
		ip = ip.substr(7)
	}

	return ip;
}

exports.messageStatus = {
	NEW: "new",
	ERROR: "error",
	FAIL: "fail",
	SUCCESS: "success",
	SCHEDULE: "schedule",
	MOVED: "moved",
	WAITING: "waiting"
}

exports.statsType = {
	ADDED: "Added",
	SUCCEEDED: "Succeeded",
	FAILED: "Failed"
}

exports.initMail = function()
{
	var nodemailer = require("nodemailer");

	let smtpConfig = {
		host: config.get('email.setting.host'), //'smtp.gmail.com',
		port: config.get('email.setting.port'), //587,
		secure: config.get('email.setting.ssl'), // upgrade later with STARTTLS
		tls: config.get('email.setting.tls')
	};

	if (config.get('email.setting.user'))
	{
		smtpConfig['auth'] = {
			user: config.get('email.setting.user'),
			pass: config.get('email.setting.password')
		}
	}

	let transporter = nodemailer.createTransport(smtpConfig);

	transporter.verify(function(error, success)
	{
		if (error)
		{
			console.log('SMTP Server Error. Could not connect to SMTP Server! Please check your settings!');
			logger.error(error);
		}
		else
		{
			console.log('SMTP Server ready.');
		}
	});

	return transporter;
}
