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
   - Create a MySQL database using the schema outlined in `sql/create.sql`.

**3. Testing Capabilities:**
   - Utilize `webTest.js` to perform local tests, initiating a web server with event logging for thorough testing and debugging.

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

## Getting Started:

1. Copy and customize the `config/default.json` file.
2. Set up a MySQL database using the provided schema in `sql/create.sql`.
3. Launch the `server.js` and `queue.js` processes to initiate the HTTP/HTTPS server and Queue Consumer.

Discover the power of Q, your go-to Request Queue System for efficiently managing requests, ensuring reliability, and simplifying your workflow. Dive into a world of seamless communication and scheduling with Q!


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


SHORT INSTRUCTIONS
------------------

How does it work?
Q Queue System works by receiving AND sending out HTTP Requests OR Emails. 

By adding headers in your normal request and redirecting the http call, you can send multiple http calls asynchronously and the Queue will receive them, store them and send them out to the receiver.
The system can be set to support either http, https or emails, and if you are to use https, you must supply cert and key files for the SSL-encryption.  You can also schedule messages to fire at a give date and time. 

Add a http request or email to the Queue
----------------------------------------
Send a HTTP request to: q.[yoursite].com:[portnumber] with your normal http request, using your normal http headers and body parameters. Http POST and GET are supported as of today. 
Normal http headers
All HTTP headers will be saved and forwarded to the Q-url address.


### HTTP GET Parameters
To initiate a GET request, direct your call to `q.[yoursite].com`, followed by the request string. For example: `http://[yoursite].com:8080?p1=20&p2=30&info=text`.

The parameters `p1`, `p2`, and `info` will be preserved in the message queue and subsequently sent to the destination host as part of the GET request.


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


This example defines two request to be sent to the queue, with the post variables “name” and “age”.


Custom Required http headers:
-----------------------------
The below headers must be added to the request, if any of these are empty, the request will fail.

| Header  | Description                             | Example                                |
|---------|-----------------------------------------|----------------------------------------|
| `Q-url` | The Destination URL                     | e.g., http://[yoursite].com/sms       |
| `Q-name`| The Queue Name                           | e.g., custom_queue                    |

Ensure that these headers are included in your request. If any of these headers are empty, the request will fail.

If the Queue Name does not exist it will be automatically created.


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
| `Q-to`       | A single recipient email address                         | john@yoursite.com              |
| `Q-from`     | A single sender email address                             | anna@yoursite.com              |
| `Q-subject`  | The subject of the mail                                   | "Important Mail"               |
| `Q-body`     | The body of the mail. Use \n for a newline                | "Hello!\nThis is a test mail"  |



Advanced Options:
-----------------
- Additional options may be available based on your specific use case.



ACTION for a success or fail
----------------------------
If a message is delivered successfully or fails then one or more ACTIONs are performed. The Action is defined by a string that is parsed.

Multiple ACTIONs can be separated by a comma (,). Please NOTE that for this reason you can not use , in the email/http/queue above.

* If the Action says DELETE, the message will be deleted from the Queue. Use with caution!
* If the Action contains a valid email address then email is assumed and a email will be sent to that address.
* If the Action starts with http then URL is assumed, and a Http GET Request will be made to that address.

If the Action contains a word, queue is assumed and the message will be moved to a queue with that name, setting the status to “moved”.

Example of Action strings: 
--------------------------
DELETE,http://www.url.com/success/,good@success.com  
1. Will delete the message upon completion.
2. Send a call to http://www.url.com/success/ 
3. Send a mail to good@success.com 

http://www.url.com/success/,good@success.com,newQueue
1. Will Send a call to http://www.url.com/success/ 
2. Send a mail to good@success.com
3. Send the message to a queue with name newQueue 

error-queue  
1. Send the message to a queue with name error-queue 

NOTE that you can not use both DELETE and move a message to a queue!

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

Queue settings:
---------------
Settings for all messages in the queue
The database table Queueinfo stores the queues and their default settings. The settings below have the corresponding column-name in the table. The default value is given within parentheses ().

SendInterval: In seconds (3)
Retries: Number of retries when timeout or error with request (3)
RetryInterval: In seconds (120)
Success: [ACTION] (DELETE)
Fail: [ACTION] (NULL)
