# q
A Simple Node-JS based Queue System that receives web requests (http) and sends them out in a series of messages, storing the response from the receiver. Supports retries, and can also send out emails.

Q - Request Queue System
------------------------------
Concept and system design by Göran Johansson

Short instructions.
-------------------
Copy config/default.sample.json to config/default.json and edit it to suit your needs.
Create a MySQL database as in sql/create.sql
Start server.js and queue.js

Information
-----------
The queue system uses two processes that should be running at the same time.

server.js - Runs a Http/Https server that receives all messages
queue.js - Runs a Queue Consumer that dispatch messages from the queue and sends them to the receiver endpoint.

Testing
-------
webTest.js can be used to test the Queue system locally and starts a web server at port 8090 with event logging to STDOUT. 


Recommended NPM packages 
-------------------------
These are handy when using Q on a Test/Production server

frontail - Bring the server log to a webpage, password protected
https://github.com/mthenw/frontail 
Install: (sudo npm i frontail -g) Usage: (frontail ./logfile.txt -p 9000 -U myUser -P myPwd)

pm2 - Controls multiple processes very neatly.
https://www.npmjs.com/package/pm2 
Install: (sudo npm install pm2 -g) Usage: (pm2 start app.js)

You can use installAtServer.sh to install all three services using pm2!
