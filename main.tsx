import * as React from 'react';
import * as ReactDOM from 'react-dom';
import 'whatwg-fetch';
import { NmapLog, Database, MacToInfo, GottenDates } from './db';
import { lazy } from './lazy';
import {Gui} from './gui';
(window as any).Promise = Database.Promise;

import {defaultConfig, Config} from './config';
const target = document.getElementById("root") !;
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
        ReactDOM.render(<div>Loading: {days} days</div>, target));
    ReactDOM.render(<Gui data={await db.nmapLogs.toArray() } config={config} db={db} />, target);
}
run().catch(e => {
    ReactDOM.render(<pre>Error: {e.toString() }.<br/>See F12 console for more details.</pre>, target);
    console.error(e);
});