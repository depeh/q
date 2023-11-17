var require = require("./rq"); // Override require

var moment = require('moment');
var mailOptions = require('./mailOptions.jss');

// Use winston to handle logging
var winston = require('winston'),
	Mail = require('winston-mail').Mail;

var logger = new(winston.Logger)(
{
	transports: [

		new(winston.transports.Console)(
		{
			timestamp: function()
			{
				return df();
			},
			formatter: function(options)
			{
				return cf(options);
			}
		}),
		new(winston.transports.File)(
		{
			timestamp: function()
			{
				return df();
			},
			formatter: function(options)
			{
				return cf(options);
			},
			filename: 'event.log',
			json: false
		})
	]
});

logger.add(Mail, mailOptions);
logger.setLevels(winston.config.syslog.levels);

module.exports = logger;





function df()
{
	return moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
}

function cf(options)
{
	return options.timestamp() + ' (' + process.pid + ') ' + options.level.toUpperCase() + ' ' + (options.message ? options.message : '') +
		(options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
}