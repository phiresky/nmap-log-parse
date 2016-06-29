# nmap-log-parse

Logs which devices are in your local network and draws graphs

Screenshot:

![Screenshot](screenshot.png)

## Setup

1. Add this line to your ***root*** crontab on your raspberry pi (or other device that is always on):

    `*/10 * * * * nmap -sn '192.168.178.*' -oX - >> /var/www/nmap-logs/$(date -I).xml`

    You can edit the root crontab by running something like `sudo EDITOR=nano crontab -e`

    Replace `'192.168.178.*'` with your network range and `/var/www/nmap-logs/` with the target location.
    
    This takes about ~10MB of storage per month.
    
    **The above command *must* be put into the root crontab!**
    Otherwise, nmap can't read mac-addresses and the output will be wrong.

2. create a `config.json` file in the same folder as the `index.html` is in,
    overriding any of the values in the [default config](./config.ts).

    for example:

    **config.json**
    ```json
    {
        "logFilesPath": "/nmap/logs/",
        "staticLogFiles": [
            "logs/oldlogs"
        ],
        "deviceNames": {
            "AB:CD:EF:01:23": "John's PC"
	    }
    }
    ```

    Use `staticLogFiles` only if you have an undated log file from an older version.

3. Wait more than an hour. Make sure the first log file (in the form 2016-06-29.xml) exists and contains XML documents.
4. Open `index.html` in a browser. Open it from a server (like a minimal `python3 -m http.server`) instead of from the filesystem because of Cross-Domain security.


## Contributing

Made with [React], the [Dexie.js] database and [Highcharts].

Get the dependencies using `npm install`, then run `webpack --watch` to build.

This project is written in [TypeScript], which is basically JavaScript (ES6), but strongly typed. I can recommend [Visual Studio Code][VSC] (on linux) for IntelliSense and Refactoring support.

If you have ideas to make this better please open an issue, or even better, send a pull request.

[TypeScript]: https://www.typescriptlang.org
[React]: https://facebook.github.io/react/
[Dexie.js]: http://dexie.org/
[Highcharts]: http://www.highcharts.com/
[VSC]: https://code.visualstudio.com/
