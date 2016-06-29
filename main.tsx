import * as React from 'react';
import * as ReactDOM from 'react-dom';
import 'whatwg-fetch';
//import 'regenerator-runtime';
import { NmapLog, Database, MacToInfo, GottenDates, DeviceInfo } from './db';
import { lazy } from './lazy';
import { Gui, GuiContainer } from './gui';
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
    await db.getAll(days =>
        ReactDOM.render(<GuiContainer>
            <div className="progress">
                <div className="progress-bar progress-bar-info progress-bar-striped active" style={{ width: ((1 / (-1 / 50 * days - 1) + 1) * 100).toFixed(1) + "%" }}>
                    Loading: {days} days
                </div>
            </div>
        </GuiContainer>, target));
    const data = await db.nmapLogs.toArray();
    const deviceInfos = await fetchDeviceInfos(db, data);
    ReactDOM.render(<Gui data={data} config={config} deviceInfos={deviceInfos} />, target);
}
run().catch(e => {
    ReactDOM.render(<GuiContainer><pre>Error: {e.toString() }.<br/>See F12 console for more details.</pre></GuiContainer>, target);
    console.error(e);
});