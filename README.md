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

Getting Started / SETUP / INSTALL
---------------------------------

### PREREQUISITES
Install Node.JS - Go here for more info: https://nodejs.org/

Install MySQL - Go here for more info: https://dev.mysql.com/downloads/installer/


### SETUP & RUN
1. Set up a MySQL database using the provided schema in `sql/create.sql`.
2. Find and copy `config/default.sample.json` file into `config/default.json` - and customize the `config/default.json` file to your needs, the most important section to setup is "db".
3. Go to your home folder (q) in your Command Line.
4. Install NPM Packages (command: npm install)
5. Launch the HTTP/HTTPS Server process (command: node server.js)
6. Launch the Queue Consumer process (command: node queue.js)

Discover the power of Q, your go-to Request Queue System for efficiently managing requests, ensuring reliability, and simplifying your workflow. Dive into a world of seamless communication and scheduling with Q!


How it works
------------

## Overview

This system operates through the coordination of two concurrent processes.

### Server Component

**`server.js`:** This component initiates an HTTP/HTTPS server responsible for handling incoming messages.

### Queue Processing

**`queue.js`:** The Queue Consumer, implemented by this component, retrieves messages from the queue and forwards them to the designated receiver endpoint. Both processes, `server.js` and `queue.js`, need to be active simultaneously for the system to function effectively.



How to Test
-----------
webTest.js can be used to test the Queue system locally and starts a web server at port 8090 with event logging to STDOUT. 


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




ADD YOUR HTTP REQUEST TO THE SERVER
----------------------------------------
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


