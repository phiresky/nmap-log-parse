# nmap-log-parse

Logs which devices are in your local network and draws graphs

## Setup

add this line to your crontab: `*/10 * * * * ../path-to/nmaplog.sh`

generate xml input with `zcat nmap-log/*.xml.gz > allfiles`

to use cache for faster page load, open the page and run `copy(JSON.stringify(hosts))`, and then `xsel -b > cache.json`, then set `usecache` to true and it should work

