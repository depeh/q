var require = require("./rq"); // Override require

var moment = require('moment');
var mailOptions = require('./mailOptions.jss');

// Use winston to handle logging
var winston = require('winston'),
	Mail = require('winston-mail').Mail;

var logger = winston.createLogger({
	transports: [
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.timestamp({
					format: 'YYYY-MM-DD HH:mm:ss'
				}),
				winston.format.printf(info => `${info.timestamp} (${process.pid}) ${info.level.toUpperCase()} ${info.message}`)
			)
		}),
		new winston.transports.File({
			format: winston.format.combine(
				winston.format.timestamp({
					format: 'YYYY-MM-DD HH:mm:ss'
				}),
				winston.format.printf(info => `${info.timestamp} (${process.pid}) ${info.level.toUpperCase()} ${info.message}`)
			),
			filename: 'event.log',
			json: false
		})
		,
		new Mail({
			to: mailOptions.to,
			from: mailOptions.from,
			subject: mailOptions.subject,
			host: mailOptions.host,
			port: mailOptions.port,
			username: mailOptions.username,
			password: mailOptions.password,
			ssl: mailOptions.ssl,
			level: 'none' // Set the level at which to send emails, e.g. 'error'. Set to 'none' for not using mail!
		})
	]
});

logger.setLevels(winston.config.syslog.levels);

module.exports = logger;

function df() {
	return moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
}

function cf(options) {
	return options.timestamp() + ' (' + process.pid + ') ' + options.level.toUpperCase() + ' ' + (options.message ? options.message : '') +
		(options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
}
