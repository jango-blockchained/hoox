# Hoox - Custom Frappe App

Hoox is a custom Frappe app that serves as an API Gateway on top of Frappe / ERPNext to handle Tradingview Alerts and execute trades using CCXT. This README file provides an overview of the app and instructions on how to install and use it.

## Installation

To install Hoox, follow these steps:

1. Clone the Hoox repository to your local machine: `git clone https://github.com/jango-blockchained/frappe-hoox.git`
2. Navigate to the `apps` directory in your Frappe installation.
3. Run the following command: `bench get-app https://github.com/jango-blockchained/frappe-hoox.git`.
4. Install the app using the following command: `bench --site [site-name] install-app hoox`.

## Features

Hoox comes with the following features:

- Handling Tradingview alerts via webhook in either plain text or JSON format
- Executing trades on a designated exchange using the CCXT library
- Notifying users of incoming webhooks via different services like Telegram, Email, System-Notifications, Home Assistant
- A highly detailed Backend for professional and private use cases
- A Frontend for possible users
- Signal Provider, Signal, and a corresponding marketplace
- Under heavy development with daily updates (not recommended for production environment at this time)

## Usage

To use Hoox, follow these steps:

1. Get available exchanges
2. Optional: Add Telegram Credentials
3. Optional: Add HomeAssistant Credentials
4. Add Exchange Credential
5. Update HOOX Settings

## Contributing

If you would like to contribute to Hoox, please follow these guidelines:

1. Fork the Hoox repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with clear commit messages.
4. Push your changes to your fork.
5. Submit a pull request to the Hoox repository.

## License

Hoox is licensed under the MIT license. See the `LICENSE` file for more information.

## Contact

If you have any questions or concerns about Hoox, please contact jango_blockchained.

Citations:
[1] https://frappe.school/courses/frappe-framework/learn/2.7
[2] https://youtube.com/watch?v=GGdWRe-aoxA
[3] https://github.com/gavindsouza/awesome-frappe
[4] https://youtube.com/watch?v=Pw78nj58Hy4
[5] https://www.upwork.com/l/in/blockchain-developers-in-ahmedabad/

# TL;DR

```Procfile
...
influxdb: /usr/bin/influxd -config /etc/influxdb/influxdb.conf
...

```

```supervisor.conf
...
[program:influxdb]
command=/usr/bin/influxd -config /etc/influxdb/influxdb.conf
autostart=true
autorestart=true
startretries=3
user=frappe
redirect_stderr=true
stdout_logfile=/home/frappe/frappe-bench/logs/influxdb.log

...
```

data = [
{
"measurement": "your_measurement",
"tags": {
"tag1": "value1",
"tag2": "value2"
},
"time": "2023-06-30T10:30:00Z",
"fields": {
"field1": 10,
"field2": 20
}
}
]
write_data_to_influxdb(data)

```

```
