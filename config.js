var require = require("./rq"); // Override require

var fs = require('fs');
process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
var config = require('config');

if (!fs.existsSync('config/default.json'))
{
	console.log("\n=================================================================\nFATAL ERROR! Config file ./config/default.json does not exist!\nPlease run the following in the command line:\ncp ./config/default.sample.json ./config/default.json \n=================================================================\n");
	process.exit();
}

module.exports = config;