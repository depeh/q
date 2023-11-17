var rq = function(mod)
{
	try
	{
		return require(mod);
	}
	catch (e)
	{
		console.log("Error when loading module: " + mod + "\n");

		if (e.code == "MODULE_NOT_FOUND")
		{
			var errStr = "\nNPM Package '" + mod + "' missing!\nEnter: sudo npm install " + mod + " - in your console.\n";
			console.log(errStr);
			process.exit();
		}
		else
		{
			var logger = require('./logger');
			logger.alert(e);
		}

	}
};

return module.exports = rq;