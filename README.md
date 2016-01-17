# nmap-log-parse

Logs which devices are in your local network and draws graphs

Screenshot:

![Screenshot](screenshot.png)

## Setup

1. add this line to your **root** crontab on your raspberry pi (or other device that is always on):

    `*/10 * * * * nmap -sn $subnet -oX - >> $outputpath/logs`

	where
    
    - `$subnet` is your local network, e.g. '192.168.178.\*'
    - `$outputpath/logs` is the location where you want your log stored (logs must not exist yet)
    
    If you don't have a lot of space (the above takes ~10MB / month), you can also compress the logs:
    
    `*/10 * * * * nmap -sn $subnet -oX - |bzip2 >> $outputpath/logs.bz2`
    
    and optionally recompress them every Sunday at 03:02 AM: (combining the individual compression streams saving a lot of space)
    
    `3 3 * * 0 bunzip2 $outputpath/logs.bz2 && bzip2 $outputpath/logs`
    
    This will make the browser loading slightly slower, but the logs will be smaller (200kB / month)

    **the above command *must* be put into the root crontab!** 

    You can edit the root crontab by running something like `sudo EDITOR=nano crontab -e`
    
    Otherwise, nmap can't read mac-addresses and the output will be wrong.

2. create a `config.json` file in the same folder as the `index.html` is in. For the schema see [Configuration.ts](src/Configuration.ts)

    minimal example for a working `config.json`:
    ```json
    {
    	"input": "../logs",
    	"macToName": {},
    	"hostToName": {},
    	"hide": [],
    	"logInterval": 10,
    	"ignoreLessThanPercent": 0.02
    }
    ```

    If you want, you can add some readable hostnames to `macToName` or `hostToName` like this:

    ```json
    "macToName": {
    	"AB:CD:EF:01:23": "John's PC"
    }
    ```

3. Wait more than an hour. Make sure the `logs` file exists and contains an XML document.
4. Open `index.html` in a browser. You will in most cases need to open it from a server (like a minimal `python3 -m http.server`) because of Cross-Domain security.


## Contributing

This project is written in TypeScript, which is basically JavaScript (ES6), but strongly typed. I can recommend [Visual Studio Code](https://code.visualstudio.com/) (on linux) for IntelliSense and Refactoring support.

The code is fairly hard to read because I love lambdas. But in return the code is under 200 lines.

If you have ideas to make this better please open an issue, or even better, send a pull request.
