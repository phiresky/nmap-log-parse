import * as React from 'react';
import * as ReactDOM from 'react-dom';
import 'whatwg-fetch';
//import 'regenerator-runtime';
import { NmapLog, Database, MacToInfo, GottenFiles, DeviceInfo } from './db';
import { lazy } from './lazy';
import { Gui, GuiContainer, ProgressGui } from './gui';
(window as any).Promise = Database.Promise;
import { defaultConfig, Config } from './config';
const target = document.getElementById("root") !;

async function fetchDeviceInfos(db: Database, data: NmapLog[]) {
    const stats = new Map<string, DeviceInfo & { upCount: number }>();
    for (const log of data) {
        for (const dev of log.devices) {
            let info = stats.get(dev);
            if (!info)
                stats.set(dev, info = Object.assign(await db.getDeviceInfo(dev), { upCount: 0 }));
            info.upCount++;
        }
    }
    return stats;
}
async function run() {
    const userConfig: Config = await fetch("config.json").then(resp => {
        if (!resp.ok) {
            console.warn(resp);
            throw Error(resp.status + " " + resp.statusText);
        }
        return resp.json()
    });
    const config = Object.assign({}, defaultConfig, userConfig);
    config.deviceNames = Object.assign({}, defaultConfig.deviceNames, userConfig.deviceNames);
   
    const db = new Database(config);
    console.time("getDates");
    await db.getAllDates(days =>
        ReactDOM.render(<ProgressGui progress={days} prefix="Loading: " suffix=" days" />, target));
    console.timeEnd("getDates");
    console.time("getStatic");
    for(const filename of config.staticLogFiles)
        await db.getForFile(filename, (action, done, total) =>
            ReactDOM.render(<ProgressGui progress={done} total={total} prefix={action+" "} suffix=" logs" />, target));
    console.timeEnd("getStatic");
    const data = await db.nmapLogs.toArray();
    const deviceInfos = await fetchDeviceInfos(db, data);
    ReactDOM.render(<Gui data={data} config={config} deviceInfos={deviceInfos} />, target);
}
run().catch(e => {
    ReactDOM.render(<GuiContainer><pre>Error: {e.toString() }.<br/>See F12 console for more details.</pre></GuiContainer>, target);
    console.error(e);
});