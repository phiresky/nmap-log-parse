import Dexie from 'dexie';
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
    constructor() {
        super("NmapLogDatabase");
        this.version(3).stores({
            nmapLogs: 'time',
            gottenDates: 'date',
            macToInfo: '[mac+type+info], mac, info',
        })
    }
}