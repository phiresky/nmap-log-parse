import * as React from 'react';
import * as ReactDOM from 'react-dom';
import 'whatwg-fetch';
import { NmapLog, Database, MacToInfo, GottenDates } from './db';
import { lazy } from './lazy';
import {Gui} from './gui';
import {DateRounder, roundDate} from './util';
(window as any).Promise = Database.Promise;

const defaultConfig = {
    logFilesPath: "./logs/logs",
    maxMissingDays: 7,
    dayGetLimit: Infinity,
    logIntervalMinutes: 10,
    minimumUptime: 0.02,
    selfMacAddress: "00:00:00:00:00:00",
    deviceNames: {
        ["00:00:00:00:00:00"]: "me"
    } as { [mac: string]: string | undefined },
}
export type Config = typeof defaultConfig;

const target = document.getElementById("root") !;
async function run() {
    const userConfig: typeof defaultConfig = await fetch("config.json").then(resp => {
        if (!resp.ok) {
            console.warn(resp);
            throw Error(resp.status + " " + resp.statusText);
        }
        return resp.json()
    });
    const config = Object.assign({}, defaultConfig, userConfig);
    const db = new Database(config);
    config.deviceNames = Object.assign({}, defaultConfig.deviceNames, userConfig.deviceNames);
    await db.getAll(days =>
        ReactDOM.render(<div>Loading: {days} days</div>, target));
    ReactDOM.render(<Gui data={await db.nmapLogs.toArray() } config={config} db={db} />, target);
}
run().catch(e => {
    ReactDOM.render(<pre>Error: {e.toString() }.<br/>See F12 console for more details.</pre>, target);
    console.error(e);
});