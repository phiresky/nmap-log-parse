# nmap-log-parse

Logs which devices are in your local network and draws graphs

Screenshot:

![Screenshot](screenshot.png)

## Setup

1. add this line to your crontab:

    `*/10 * * * * nmap -sn $subnet -oX - | xz >> $outputpath/logs.xz`

	where

    - $subnet is your local network, e.g. '192.168.178.*'
	- $outputpath is the path where you want your log stored

2. create a `config.json` file. For the schema see [Configuration.ts](src/Configuration.ts)
