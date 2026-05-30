Q - Request Queue System
------------------------------
Concept, system design and code by Göran Johansson (https://github.com/depeh)


# About Q - Request Queue System

**Q** is a robust and flexible Request Queue System, designed to streamline and manage the processing of HTTP requests and emails. Whether you're dealing with asynchronous calls, scheduled deliveries, or email dispatches, Q provides a seamless solution for organizing and executing your tasks efficiently.

## Key Features:

**1. Dual-Process Architecture:**
   - *server.js:* Runs an HTTP/HTTPS server, efficiently receiving and processing all incoming messages.
   - *queue.js:* Acts as a Queue Consumer, dispatching messages from the queue and ensuring smooth delivery to the designated endpoints.

**2. Easy Configuration:**
   - Quickly set up Q by copying and customizing the provided `config/default.json` file.
   - Choose database backend: `mysql` or `sqlite`.
   - For MySQL, create a database using the schema in `sql/create.sql`.
   - For SQLite, Q auto-creates database file and tables at startup.

**3. Testing Capabilities:**
   - Run `npm test` to execute the built-in end-to-end system tests.
   - Utilize `webTest.js` to perform additional local tests with event logging.

**4. Recommended NPM Packages:**
   - Enhance your Q experience on test and production servers with useful packages like *frontail* and *pm2* for streamlined logging and process management.

**5. Versatile Request Handling:**
   - Q excels at handling both incoming and outgoing HTTP requests and emails.
   - Easily configure Q to support HTTP, HTTPS, or Emails based on your project's needs.

**6. Actionable Responses:**
   - Define actions for success or failure, including message deletion, email notifications, or additional HTTP requests.
   - Actions are parsed from a string, providing flexibility in response management.

**7. Extended Customization:**
   - Override standard queue parameters using optional HTTP headers for individualized message behavior.
   - Configure default settings for all messages in the queue through the `Queueinfo` database table.

**8. Security Measures:**
   - Q's response system ensures security by providing vague error messages in case of misconfigurations, misspellings, or unauthorized access attempts.

**9. Operational Tooling:**
   - Built-in admin API and dashboard at `/admin`.
   - Dead-letter support with requeue from the admin API.
   - Consumer concurrency and per-host rate limiting controls.

Getting Started / SETUP / INSTALL
---------------------------------

### PREREQUISITES
Install Node.JS - Go here for more info: https://nodejs.org/

Install MySQL only if you plan to run with `db.client = "mysql"`:
https://dev.mysql.com/downloads/installer/


### SETUP & RUN
1. Copy `config/default.sample.json` to `config/default.json`.
2. Install NPM packages:
   - `npm install`
3. Choose one database backend:
   - **MySQL**
     1. Set `"db.client": "mysql"` in `config/default.json`.
     2. Create a MySQL database and run `sql/create.sql`.
     3. Set `db.host`, `db.user`, `db.password`, `db.database`.
   - **SQLite**
     1. Set `"db.client": "sqlite"` in `config/default.json`.
     2. Set `db.sqlite.file` (for example `./data/queue.sqlite`).
     3. No manual schema step is needed. Tables are created automatically.
4. Launch the HTTP/HTTPS server process:
   - `node server.js`
5. Launch the queue consumer process:
   - `node queue.js`

Discover the power of Q, your go-to Request Queue System for efficiently managing requests, ensuring reliability, and simplifying your workflow. Dive into a world of seamless communication and scheduling with Q!

THE MAIN CONFIG-FILE
--------------------
## Configuring **default.json**

This document provides a quick explanation of how to set up the configuration in `config/default.json`.

## db

| Property  | Description                                       | Example Value |
|-----------|---------------------------------------------------|---------------|
| client    | Database backend. Supported values: `mysql`, `sqlite` | mysql |
| host      | The host address/IP of the MySQL database server  | localhost     |
| user      | The database user with access to the database     | root          |
| password  | Password for the database user                    | password      |
| database  | The name of the database to set up                | queue         |
| sqlite.file | SQLite file path when `client` is `sqlite`     | ./data/queue.sqlite |

### Example db config for MySQL

```json
"db": {
  "client": "mysql",
  "host": "localhost",
  "user": "root",
  "password": "pass",
  "database": "queue"
}
```

### Example db config for SQLite

```json
"db": {
  "client": "sqlite",
  "sqlite": {
    "file": "./data/queue.sqlite"
  }
}
```

## server

| Property               | Description                                                              | Example Value                |
|------------------------|--------------------------------------------------------------------------|------------------------------|
| whiteListIpAddresses   | An array of IP addresses allowed to access the Queue Server               | ["::1", "127.0.0.1", "8.8.8.8"] |
| maxBodySizeKb          | Maximum incoming request body size in kilobytes                           | 256                          |
| httpPort               | The HTTP port number for the server to listen at                           | 8080                         |
| httpsPort              | The HTTPS port number for the server (requires ssl/active to be true)    | 8081                         |
| **ssl**                | **Configuration for SSL**                                               | **Example Value**            |
| active                 | Activate SSL (true/false), set to false for HTTP instead of HTTPS         | false                        |
| keyFile                | Path to the key file used for the SSL certificate                        | ssl/key.pem                  |
| certFile               | Path to the certificate file used for the SSL certificate                 | ssl/cert.pem                 |

## consumer

| Property            | Description                                                   | Example       |
|---------------------|---------------------------------------------------------------|---------------|
| sleepForSeconds     | The number of seconds the Queue Handler should sleep           | 1             |
| maxConcurrent       | Maximum number of messages dispatched in parallel              | 4             |
| minIntervalPerHostMs| Minimum delay between outgoing requests to the same host       | 0             |
| deadLetter.active   | Move permanently failed messages to a dead-letter queue        | true          |
| deadLetter.prefix   | Prefix used for dead-letter queue names                        | dead-letter.  |

## email

For email functionality, SMTP information and an authorized SMTP user must be provided.
Refer to your SMTP-provider for credentials.

### active

| Property    | Description                          | Example                  |
|-------------|--------------------------------------|--------------------------|
| active       | Should mail be used (true/false). You must setup settings before setting this to true!| false         |

### setting

| Property            | Description                               | Example                  |
|---------------------|-------------------------------------------|--------------------------|
| user                | Email sender server user name             | user2@gmail.com          |
| password            | Password for the email sender server user | password                 |
| host                | The host/IP address of the email server    | gmail.com                |
| port                | The email server port                     | 587                      |
| ssl                 | Should the email server use SSL (true/false) | false                   |
| **tls**             | **TLS Configuration**                         | **Example**        |
| rejectUnauthorized | Should the email server reject unauthorized requests (true/false) | false |

### sender

| Property    | Description                          | Example                  |
|-------------|--------------------------------------|--------------------------|
| sender       | Email address of the mail sender      | user2@gmail.com          |



## Overview

This system operates through the coordination of two concurrent processes.

### Server Component

**`server.js`:** This component initiates an HTTP/HTTPS server responsible for handling incoming messages.

### Queue Processing

**`queue.js`:** The Queue Consumer, implemented by this component, retrieves messages from the queue and forwards them to the designated receiver endpoint. Both processes, `server.js` and `queue.js`, need to be active simultaneously for the system to function effectively.


Logging (Trouble Shooting)
--------------------------
Both the Server and the Queue Listener are using the excellent Winston Logging module (https://www.npmjs.com/package/winston), which by default outputs a log to the file **event.log** in the main folder. The logging can be fully customized for advanced users and any customization of the logging is recommended to be done in the file **logger.js**

You can set the error level required for mail to be sent in **logger.json** - Look for "level: 'error' // Set the level at which to send emails, e.g., 'error'" in the file. Refer to the Winston user manual to know which levels you can use.

If something does not work or acts weird, a good tip is to look in the log file and see any error message there.


How to Test
-----------
webTest.js can be used to test the Queue system locally and starts a web server at port 8090 with event logging to STDOUT. 

### Quick start verification (MySQL and SQLite)

1. Start server:
   - `node server.js`
2. Start consumer in a second terminal:
   - `node queue.js`
3. Verify server health:
   - `curl -i http://127.0.0.1:8080/test`
   - Expected: HTTP 200 and body `Alive`.
4. Add a message to the queue:
   - `curl -X POST http://127.0.0.1:8080 -H "q-name: testq" -H "q-url: https://httpbin.org/post" -d "hello=world"`
   - Expected response: `<q-id>...</q-id>`
5. Inspect logs:
   - `tail -f event.log`
6. Open the admin dashboard:
   - `http://127.0.0.1:8080/admin`
7. Run the automated system tests:
   - `npm test`

### Database specific test notes

- **MySQL:** Make sure MySQL service is running and credentials in `config/default.json` are correct.
- **SQLite:** Make sure the path in `db.sqlite.file` is writable. The database file is created on first start.

### Admin API

- `GET /admin/api/health`
- `GET /admin/api/queues`
- `GET /admin/api/messages?queue=name&status=fail&limit=50`
- `GET /admin/api/messages/:id`
- `POST /admin/api/messages/:id/requeue`
- `POST /admin/api/messages/:id/dead-letter`

### Dead-letter behavior

- When a message reaches terminal failure, it is moved to a queue prefixed with `consumer.deadLetter.prefix`.
- Example: queue `billing` becomes `dead-letter.billing`.
- Requeue from the admin API restores the original queue name and resets retry state.


### Recommended NPM Packages

These npm packages are useful when working with Q on a Test/Production server:

#### frontail - Bring the server log to a webpage, password protected
[GitHub Repository](https://github.com/mthenw/frontail)
- Install: `sudo npm i frontail -g`
- Usage: `frontail ./logfile.txt -p 9000 -U myUser -P myPwd`

#### pm2 - Controls multiple processes very neatly
[NPM Package](https://www.npmjs.com/package/pm2)
- Install: `sudo npm install pm2 -g`
- Usage: `pm2 start app.js`

You can use `installAtServer.sh` to install all three services using pm2!





SHORT INSTRUCTIONS
------------------

## How It Works

The Q Queue System operates by both receiving and sending out HTTP Requests or Emails.

You use the system by adding SPECIFIC http-headers to your standard HTTP request. This allows you to send multiple HTTP calls asynchronously, which the Queue will then receive, store, and subsequently dispatch to the designated receiver.

The system is versatile and can be configured to support either HTTP, HTTPS, or email communication. If HTTPS is chosen, it is necessary to provide cert and key files for SSL encryption.

Additionally, the system offers the flexibility to schedule messages to be triggered at a specified date and time.




ADD YOUR HTTP REQUEST TO THE QUEUE
----------------------------------
Send a HTTP or HTTPS request to: [yoursite].com:[portnumber] with your normal request, using your **normal** http headers and **body-parameters**. Http **POST** and **GET** are supported as of today. 

Required http headers:
-----------------------------
The below http-headers **must** be added to the request, if any of these are empty, the request will fail.

| Header  | Description                             | Example                                |
|---------|-----------------------------------------|----------------------------------------|
| `Q-url` | The Destination URL                     | e.g., https://[yoursite].com/sms       |
| `Q-name`| The Queue Name                          | e.g., custom_queue                    |

Ensure that these headers are included in your request. If any of these headers are empty, the request will fail.

If the Queue Name does not exist it will be automatically created.


**Normal http headers**
All HTTP headers will be saved and forwarded to the **Q-url** address.

### HTTP GET Parameters
To initiate a GET request, direct your call to `[yoursite].com`, **followed** by the request string. For example: `http://[yoursite].com:8080?p1=20&p2=30&info=text`.

The parameters `p1`, `p2`, and `info` will be preserved in the message queue and subsequently sent to the destination host as part of the **GET** request.

### HTTP POST Parameters

All standard HTTP body parameters will be retained in the queue and then relayed to the URL specified in the HTTP header: **Q-url**.

**Note:** Avoid using the HTTP body parameter name "_params," as it will be interpreted as the entire request, adhering to the rules outlined below.



Multiple requests from single request
-------------------------------------
Rather than using form-data parameters, you have the option to send a JSON array string with the parameter name "_params". This JSON structure can encompass multiple JSON structures, allowing you to send multiple requests to the queue within a single request.

To enable multiple requests, you should send the JSON structures as an array, beginning with "[" and concluding with "]". Below is an example illustrating the required structure:

```json
[
    { "name": "arnold", "age": "42"},
    { "name": "john", "age": "32"}
]
```

This example defines two requests to be sent to the queue, with the post variables “name” and “age”.



Expected answer from the destination server
-------------------------------------------
The Queue Sender **expects** the use of HTTP error codes by the destination server. This implies that the target server **MUST** respond with **HTTP 200 OK** if the message was received and processed successfully. This serves as a crucial indicator to the Queue Sender that the message was sent successfully!

It is imperative to **configure** the destination server to respond with any **HTTP Error Codes** (any code except for **HTTP 200 OK**) in case of any issues. This approach ensures that the Queue Sender is informed of failures, allowing it to implement appropriate strategies, such as **waiting for a specified duration** before retrying or eventually marking the operation as a failure.

You must incorporate these response configurations in your destination server to establish effective communication between the Queue Sender and the server.


 
Send Email with the Q-system!
----------------------------- 
Simple mail sending.
To send emails with the system, the Q-url header MUST be set to “email” (Without the “) You must also supply Q-to, Q-from, Q-subject and Q-body for the email in the http headers.

When sending emails with the system, include the following headers in the HTTP request:

| Header       | Description                                              | Example                        |
|--------------|----------------------------------------------------------|--------------------------------|
| `Q-url`      | MUST be set to "email" (without quotes ")                | email                          |
| `Q-to`       | A single recipient email address                         | john@yoursite.com              |
| `Q-from`     | A single sender email address                             | anna@yoursite.com             |
| `Q-subject`  | The subject of the mail                                   | "Important Mail"              |
| `Q-body`     | The body of the mail. Use \n for a newline                | "Hello!\nThis is a test mail" |



Advanced Options:
-----------------
- Additional options may be available based on your specific use case.


ACTION for Success or Failure
-----------------------------

When a message is delivered successfully or encounters a failure, one or more ACTIONS are triggered. The ACTION is defined by a string that is parsed.

Multiple ACTIONs can be separated by a comma (,). Note that, for this reason, you cannot use a comma in the email/http/queue section.

- If the ACTION is DELETE, the message will be removed from the Queue. Use with caution!
- If the ACTION contains a valid email address, an email will be sent to that address.
- If the ACTION starts with http, a Http GET Request will be made to that address.

If the ACTION contains the word "queue," the message will be moved to a queue with that name, setting the status to "moved."

#### Example of ACTION strings:

| Action String                                | Description                                               |
| -------------------------------------------- | --------------------------------------------------------- |
| DELETE,http://www.url.com/success/,good@success.com | 1. Delete the message upon completion.<br>2. Send a call to http://www.url.com/success/<br>3. Send a mail to good@success.com |
| http://www.url.com/success/,good@success.com,newQueue | 1. Send a call to http://www.url.com/success/<br>2. Send a mail to good@success.com<br>3. Send the message to a queue named newQueue |
| error-queue                                 | Send the message to a queue named error-queue              |

**Note:** You cannot use both DELETE and move a message to a queue simultaneously!


Extended Optional http headers
------------------------------
To customize the behavior for individual messages, you can utilize the following optional HTTP headers:

| Header            | Description                                       | Default Value |
|-------------------|---------------------------------------------------|---------------|
| `Q-send-interval` | Time interval in seconds                         | 3             |
| `Q-retries`       | Number of max retries on timeout or failed answer | 3             |
| `Q-retry-interval`| Time interval in seconds for retries              | 120           |
| `Q-success`       | Action upon successful delivery                   | [ACTION]      |
| `Q-fail`          | Action upon delivery failure                      | [ACTION]      |
| `Q-priority`      | Priority of the message (1 is highest)            | 5             |
| `Q-schedule`      | Scheduled delivery datetime (YYYY-MM-DD HH:MM:SS(NULL)) | -         |

These headers allow you to tailor the handling of individual messages, providing flexibility and control over the queue processing. Adjust these parameters as needed to meet the specific requirements of your use case.



Response from the Queue Server
------------------------------
If everything went well, you should get an answer like:
<q-id>[nn]</q-id>

where [nn] is the unique ID that your request got in the queue-system.

If you made something wrong, misspelled or forgot a required parameter or so, you will get
**Nope**
as response. The answer is deliberately made very vague, for hackers, bots or other unauthorized access. 


### Queue Settings

These settings apply to all messages in the queue, stored in the database table "Queueinfo" along with their default values given in parentheses.

| Setting        | Description                                       | Default Value |
| -------------- | ------------------------------------------------- | ------------- |
| **SendInterval** | Time interval in seconds                         | 3             |
| **Retries**      | Number of retries on timeout or request error     | 3             |
| **RetryInterval**| Time interval in seconds for retries              | 120           |
| **Success**     | [ACTION] (Default: DELETE)                        | DELETE        |
| **Fail**        | [ACTION] (Default: NULL)                          | NULL          |

Adjust these settings in the "Queueinfo" table based on your specific requirements.






LICENSING
---------

## Fair Source License - Version 1.0

This project is licensed under the Fair Source License - Version 1.0.

### You are free to:

- **Use**: Anyone can use this software for free.

### Commercial Use:

- **For individuals, small businesses, and non-profits**: Use of this software is free for any purpose.

- **For corporations with annual revenue over $1 million USD**: A commercial license is required. Contact Göran Johansson at realdepeh@hotmail.com for licensing inquiries.

Göran Johansson retains all rights to commercial licensing of this software.

Please refer to the [Fair Source License - Version 1.0](https://opensource.org/licenses/Fair) for the full text and details.

For licensing inquiries, please contact:
- Göran Johansson
- Email: realdepeh@hotmail.com
- GitHub: [https://github.com/depeh](https://github.com/depeh)
