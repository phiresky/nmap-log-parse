import Dexie from 'dexie';
import {Config} from './config';
import {parseXML, parseXMLReturn} from './util';

export interface NmapLog {
    time: number,
    devices: Set<string> // mac addresses
}
export interface GottenDates {
    date: number,
    result: "404" | "success"
}
export interface MacToInfo {
    mac: string,
    type: "ip"|"hostname"|"vendor",
    info: string
}

export class Database extends Dexie {
    nmapLogs: Dexie.Table<NmapLog, number>;
    gottenDates: Dexie.Table<GottenDates, number>;
    macToInfo: Dexie.Table<MacToInfo, string>;
    constructor(private config: Config) {
        super("NmapLogDatabase");
        this.version(3).stores({
            nmapLogs: 'time',
            gottenDates: 'date',
            macToInfo: '[mac+type+info], mac, info',
        })
    }
    async getDeviceInfo(mac: string) {
        const infos = await this.macToInfo.where("mac").equals(mac).toArray();
        const info = {
            displayname: this.config.deviceNames[mac],
            vendor: infos.filter(info => info.type === 'vendor').map(info => info.info).filter(x => x.length > 0),
            hostnames: infos.filter(info => info.type === 'hostname').map(info => info.info),
            ips: infos.filter(info => info.type === 'ip').map(info => info.info)
        };
        return info;
    }
    /**
     * @return the data for the given date, null if no data was recorded on that day 
     */
    async getForDate(date: Date): Promise<"404" | "success"> {
        date.setUTCHours(0, 0, 0, 0);
        const dateFormatted = date.toISOString().substr(0, 10);
        const gotDate = await (this.gottenDates.get(date.getTime()) as any as Promise<GottenDates>).catch(e => null);

        if (gotDate) return gotDate.result;
        const filename = this.config.logFilesPath + dateFormatted + ".xml";
        const response = await fetch(filename);
        if (response.status == 404) {
            await this.gottenDates.add({
                date: date.getTime(), result: "404"
            });
            return this.getForDate(date);
        }
        if (response.status >= 300) {
            throw Error(`Request Error: ${response.status}: ${response.statusText}`)
        }

        const rawXMLs = await response.text();
       
        const scans: parseXMLReturn[] = [];
        for (const rawXML of rawXMLs.split("<?xml version")) {
            if (rawXML.length == 0) continue;
            const scan = parseXML(this.config, filename, "<?xml version" + rawXML);
            if (scan) scans.push(scan);
        }
        //const data = count(scans);
        await this.transaction('rw', [this.gottenDates, this.nmapLogs, this.macToInfo], async () => {

            this.gottenDates.add({
                date: date.getTime(), result: "success"
            });
            for (const scan of scans) {
                this.nmapLogs.put(scan.online);
                this.macToInfo.bulkPut(scan.newInfos);
            }
        });
        return this.getForDate(date);
    }
    async getAll(progressCallback: (days: number) => void) {
        const current = new Date();
        let failures = 0;
        let gotten = 0;
        while (true) {
            const resp = await this.getForDate(current);
            if (resp === "404") {
                failures++;
                if (failures >= this.config.maxMissingDays) break;
            } else {
                failures = 0;
                gotten++;
                progressCallback(gotten);
                if (gotten >= this.config.dayGetLimit) break;
            }
            current.setUTCDate(current.getUTCDate() - 1);
        }
    }
}