pm2 start server.js --name="server"
pm2 start queue.js --name="queue"
pm2 start frontail.sh --name="log"
pm2 startup
