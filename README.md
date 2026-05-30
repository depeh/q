Q - Request Queue System
------------------------
Concept, system design and code by Goran Johansson (https://github.com/depeh)

# About

**Q** is a request queue system for HTTP requests and email delivery. It receives incoming jobs through `server.js`, stores them in a database, and dispatches them asynchronously through `queue.js`.

Typical use cases:
- send HTTP requests asynchronously instead of directly in the user flow
- retry failed deliveries
- schedule delivery for a later time
- move failed jobs to a dead-letter queue
- inspect and requeue jobs from the admin UI

## Main features

- dual-process architecture:
  - `server.js` receives and stores jobs
  - `queue.js` dispatches jobs
- database backend:
  - `mysql`
  - `sqlite`
- built-in admin dashboard at `/admin`
- admin API for queue/message inspection and requeue
- dead-letter support
- concurrency and per-host rate limiting
- automated system tests with `npm test`

# Quick Start

This section is the fastest way to get Q running locally.

## Prerequisites

- Node.js
- MySQL only if you want `db.client = "mysql"`

## 1. Install dependencies

```bash
npm install
```

## 2. Create local config

Copy `config/default.sample.json` to `config/default.json`.

For SQLite, this is enough:

```json
{
  "db": {
    "client": "sqlite",
    "sqlite": {
      "file": "./data/queue.sqlite"
    }
  }
}
```

For MySQL, configure this instead:

```json
{
  "db": {
    "client": "mysql",
    "host": "localhost",
    "user": "root",
    "password": "pass",
    "database": "queue"
  }
}
```

If you use MySQL, create the schema from [sql/create.sql](/Users/gorano/temp/source/q/sql/create.sql).

## 3. Start Q

In terminal 1:

```bash
node server.js
```

In terminal 2:

```bash
node queue.js
```

## 4. Verify health

```bash
curl -i http://127.0.0.1:8080/test
```

Expected result:
- HTTP `200 OK`
- body: `Alive`

## 5. Send a test job

```bash
curl -X POST http://127.0.0.1:8080 \
  -H "q-name: testq" \
  -H "q-url: https://httpbin.org/post" \
  -d "hello=world"
```

Expected result:

```xml
<q-id>123</q-id>
```

## 6. Open the admin UI

Open:

```text
http://127.0.0.1:8080/admin
```

## 7. Run automated tests

```bash
npm test
```

## 8. Use `webTest.js` for local end-to-end testing

If you want to inspect exactly what Q sends to a destination service, start the built-in local receiver:

In terminal 3:

```bash
node webTest.js
```

`webTest.js` starts a simple HTTP server on port `8090` and:
- logs incoming request headers
- logs the request URL
- logs parsed body parameters
- always responds with `200 ok`

This makes it useful as a controlled local destination when testing queue delivery manually.

Example:

```bash
curl -X POST http://127.0.0.1:8080 \
  -H "q-name: localtest" \
  -H "q-url: http://127.0.0.1:8090/test" \
  -d "hello=world&source=q"
```

Expected behavior:
- Q accepts the request and returns a `<q-id>`
- `queue.js` picks up the message
- `webTest.js` prints the forwarded request
- the message shows up as successful in `/admin`

# How Q Works

Q has two long-running processes:

- `server.js`
  - validates the request
  - parses headers and body
  - stores the job in the queue database
- `queue.js`
  - reads available jobs from the database
  - dispatches them to the destination
  - retries or dead-letters failed jobs

The queue is driven by HTTP headers. You send a normal HTTP request to Q, but add Q-specific headers that describe where and how the request should be delivered later.

## End-to-end flow

This is the normal path through the system:

1. A client sends a request to `server.js`.
2. The request includes at least:
   - `Q-name`
   - `Q-url`
3. `server.js` validates the request and stores it in the database.
4. Q immediately returns a queue id to the client:
   - `<q-id>123</q-id>`
5. `queue.js` polls for messages that are ready to be delivered.
6. `queue.js` dispatches the outbound request to the URL stored in `Q-url`.
7. The destination service responds:
   - `200 OK` means success
   - non-`200` means failure
8. On success:
   - success stats are updated
   - success actions run, for example `DELETE`
   - the event is written to the activity log
9. On failure:
   - retry state is updated
   - the job is retried later if retries remain
   - if retries are exhausted, the job is marked as failed and can move to dead-letter
10. The admin UI at `/admin` shows:
   - current queue/message state
   - recent activity, including messages that were already deleted after success

## Concrete example

Example:

1. You send a request to Q with:
   - `Q-name: billing`
   - `Q-url: https://example.com/webhook`
2. Q stores the request in queue `billing`.
3. `queue.js` later sends the real outbound request to `https://example.com/webhook`.
4. If the receiver returns `200`, the message is marked successful.
5. If the queue is configured with success action `DELETE`, the message is removed from the live message table.
6. Even if it disappears from the live queue quickly, the Activity section in `/admin` still shows that it happened.

# Request Format

## Required headers

These headers must be present:

| Header | Description | Example |
|---|---|---|
| `Q-url` | Destination URL or `email` | `https://example.com/webhook` |
| `Q-name` | Queue name | `billing` |

If `Q-name` does not exist, it is created automatically.

## Normal request body

- `POST`: normal body fields are stored and forwarded later
- `GET`: query parameters are stored and forwarded later

## Optional headers

| Header | Description | Default |
|---|---|---|
| `Q-send-interval` | Delay in seconds between jobs in the same queue | queue default |
| `Q-retries` | Max retry count | queue default |
| `Q-retry-interval` | Seconds between retries | queue default |
| `Q-success` | Action on success | queue default |
| `Q-fail` | Action on failure | queue default |
| `Q-priority` | Priority, `1` is highest | `5` |
| `Q-schedule` | Scheduled delivery datetime | immediate |

## Multiple jobs in one request

If you send a JSON array string in `_params`, Q creates one queued message per object.

Example:

```json
[
  { "name": "arnold", "age": "42" },
  { "name": "john", "age": "32" }
]
```

# Delivery Semantics

The destination service should return:

- `200 OK` when the job is successfully handled
- any non-200 status when the job failed and should be retried or failed

This is important. Q treats non-200 responses as delivery failures.

This default behavior can be overridden in config with:
- `consumer.httpResponseCodesOK`
- `consumer.httpResponseCodesFail`

Rules:
- if `httpResponseCodesOK` contains one or more codes, only those codes are treated as success
- if `httpResponseCodesOK` is empty and `httpResponseCodesFail` contains one or more codes, every code except the fail-list is treated as success
- if both are empty, Q falls back to the default behavior: only `200` is success

Priority when both lists are set:
- `httpResponseCodesOK` has precedence
- if a code exists in `httpResponseCodesOK`, it is treated as success
- if a code does not exist in `httpResponseCodesOK`, it is treated as fail
- if a code exists in both lists, it is still treated as success (OK list wins)

Examples:

```json
"httpResponseCodesOK": "200,201,401",
"httpResponseCodesFail": "500,501,502"
```

This means:
- `200`, `201` and `401` are success
- everything else is fail

```json
"httpResponseCodesOK": "",
"httpResponseCodesFail": "500,501,502"
```

This means:
- every code is success except `500`, `501` and `502`

```json
"httpResponseCodesOK": "200",
"httpResponseCodesFail": ""
```

This means:
- only `200` is success
- everything else is fail

# Success and Failure Actions

An action string can contain one or more comma-separated actions:

- `DELETE`
- an email address
- an `http...` URL
- another queue name

Examples:

| Action string | Meaning |
|---|---|
| `DELETE` | Delete message after success |
| `ops@example.com` | Send an email notification |
| `https://example.com/done` | Trigger follow-up HTTP GET |
| `error-queue` | Move message to another queue |
| `DELETE,ops@example.com` | Run multiple actions |

Important:
- `DELETE` and move-to-queue should not be combined conceptually
- if a message is deleted after success, it may disappear from the live message list quickly, but it will still appear in the activity log in `/admin`

# Email Jobs

To send email through Q:

- set `Q-url: email`
- include:
  - `Q-to`
  - `Q-from`
  - `Q-subject`
  - `Q-body`

Example:

| Header | Example |
|---|---|
| `Q-url` | `email` |
| `Q-to` | `john@example.com` |
| `Q-from` | `noreply@example.com` |
| `Q-subject` | `Important Mail` |
| `Q-body` | `Hello!\nThis is a test mail` |

# Admin UI And API

## Dashboard

Open:

```text
http://127.0.0.1:8080/admin
```

The dashboard shows:
- queue totals
- active waiting/error counts
- current messages
- recent activity log
- requeue and dead-letter controls

## Admin API

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/api/health` | Basic health info |
| `GET` | `/admin/api/queues` | Queue summary |
| `GET` | `/admin/api/messages?queue=name&status=fail&limit=50` | Filtered message list |
| `GET` | `/admin/api/messages/:id` | Single message |
| `GET` | `/admin/api/activity` | Recent activity log |
| `POST` | `/admin/api/messages/:id/requeue` | Requeue message |
| `POST` | `/admin/api/messages/:id/dead-letter` | Move message to dead-letter queue |

## Realtime updates

The admin page updates automatically using server-sent events.

That means:
- new jobs should appear quickly
- retries and dead-letter moves should appear quickly
- successful jobs that are immediately deleted will still appear in the activity section

# Dead-letter Behavior

When a job reaches terminal failure:

- it gets status `fail`
- it can be moved to a dead-letter queue
- dead-letter queue names are prefixed with `consumer.deadLetter.prefix`

Example:
- `billing` becomes `dead-letter.billing`

Requeue from the admin API:
- restores the original queue name
- resets retry state
- schedules the job again

# Configuration Reference

This section is more detailed than the quick start and is meant as the long-term reference.

## `db`

| Property | Description | Example |
|---|---|---|
| `client` | Backend: `mysql` or `sqlite` | `sqlite` |
| `host` | MySQL host | `localhost` |
| `user` | MySQL user | `root` |
| `password` | MySQL password | `pass` |
| `database` | MySQL database name | `queue` |
| `sqlite.file` | SQLite file path | `./data/queue.sqlite` |

## `server`

| Property | Description | Example |
|---|---|---|
| `whiteListIpAdresses` | Allowed source IPs | `["127.0.0.1"]` |
| `maxBodySizeKb` | Max incoming request size | `256` |
| `httpPort` | HTTP port | `8080` |
| `httpsPort` | HTTPS port | `8081` |
| `ssl.active` | Enable HTTPS | `false` |
| `ssl.keyFile` | TLS key path | `ssl/key.pem` |
| `ssl.certFile` | TLS cert path | `ssl/cert.pem` |

## `consumer`

| Property | Description | Example |
|---|---|---|
| `sleepForSeconds` | Poll interval | `1` |
| `maxConcurrent` | Max concurrent dispatches | `4` |
| `minIntervalPerHostMs` | Minimum delay between requests to same host | `0` |
| `httpResponseCodesOK` | Success response codes, as comma-separated string or array | `"200"` |
| `httpResponseCodesFail` | Explicit failure response codes, as comma-separated string or array | `""` |
| `deadLetter.active` | Enable dead-letter flow | `true` |
| `deadLetter.prefix` | Prefix for dead-letter queues | `dead-letter.` |

## `email`

| Property | Description | Example |
|---|---|---|
| `active` | Enable email sending | `false` |
| `setting.user` | SMTP user | `user@example.com` |
| `setting.password` | SMTP password | `password` |
| `setting.host` | SMTP host | `smtp.example.com` |
| `setting.port` | SMTP port | `587` |
| `setting.ssl` | Use SSL | `false` |
| `setting.tls.rejectUnauthorized` | TLS validation behavior | `false` |
| `sender` | Sender email address | `noreply@example.com` |

# Troubleshooting

## Logs

Q writes logs to `event.log`.

Useful command:

```bash
tail -f event.log
```

## If jobs do not show in `/admin`

Check:
- `server.js` is running
- `queue.js` is running
- the request returned a `<q-id>`
- the source IP is whitelisted
- the job may already have completed and been deleted, so check the Activity section in `/admin`

## If jobs never leave the queue

Check:
- destination URL is reachable from the machine running Q
- destination service returns `200 OK` on success
- retry settings are not too aggressive or too strict

## If destination returns `201` (or other non-200) but Q marks it as fail

By default, Q treats only `200` as success.  
To accept additional success codes, edit `config/default.json`:

```json
"consumer": {
  "httpResponseCodesOK": "200,201",
  "httpResponseCodesFail": ""
}
```

Then restart:

```bash
node server.js
node queue.js
```

## If you want explicit success and fail code lists

Example:

```json
"consumer": {
  "httpResponseCodesOK": "200,201,401",
  "httpResponseCodesFail": "500,501,502"
}
```

Behavior:
- `200`, `201`, `401` => success
- everything else => fail

## If you want all codes to be OK except specific fail codes

Example:

```json
"consumer": {
  "httpResponseCodesOK": "",
  "httpResponseCodesFail": "500,501,502"
}
```

Behavior:
- all codes except `500`, `501`, `502` => success

## If you want strict default behavior (only `200` is OK)

Example:

```json
"consumer": {
  "httpResponseCodesOK": "200",
  "httpResponseCodesFail": ""
}
```

Behavior:
- only `200` => success
- all other codes => fail

Note:
- values can be comma-separated strings (`"200,201"`) or arrays (`[200, 201]`)
- after config changes, restart both processes

## If using MySQL

Check:
- MySQL service is running
- credentials in `config/default.json` are correct
- schema from [sql/create.sql](/Users/gorano/temp/source/q/sql/create.sql) is installed

## If using SQLite

Check:
- `db.sqlite.file` points to a writable directory
- the database file is not accidentally committed or locked by external tooling

## If admin timestamps look wrong

If Activity shows raw timestamps, make sure you run the latest code and hard-refresh `/admin`.

Checklist:
- stop old processes
- start `node server.js`
- start `node queue.js`
- browser hard refresh (`Cmd+Shift+R` / `Ctrl+F5`)

# Useful Tools

These are optional.

## frontail

Bring the log to a web page.

Install:

```bash
sudo npm i frontail -g
```

Usage:

```bash
frontail ./event.log -p 9000 -U myUser -P myPwd
```

## pm2

Process manager for long-running services.

Install:

```bash
sudo npm install pm2 -g
```

Usage:

```bash
pm2 start server.js
pm2 start queue.js
```

`installAtServer.sh` can be used as a starting point for server installation.

# License

## Fair Source License - Version 1.0

This project is licensed under the Fair Source License - Version 1.0.

### You are free to

- use the software for free

### Commercial use

- individuals, small businesses and non-profits: free to use
- corporations with annual revenue over $1 million USD: commercial license required

Contact:
- Goran Johansson
- realdepeh@hotmail.com
- https://github.com/depeh
