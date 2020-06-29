import * as React from "react";
import * as ReactDOM from "react-dom";
import "whatwg-fetch";
import "../node_modules/bootstrap/dist/css/bootstrap.css";
import { Config, defaultConfig } from "./config";
import { Database, DeviceInfo, NmapLog } from "./db";
import { ProgressGui, Gui, GuiContainer } from "./gui";
React;
const target = document.getElementById("root");

async function fetchDeviceInfos(db: Database, data: NmapLog[]) {
	const stats = new Map<string, DeviceInfo & { upCount: number }>();
	for (const log of data) {
		for (const dev of log.devices) {
			let info = stats.get(dev);
			if (!info)
				stats.set(
					dev,
					(info = Object.assign(await db.getDeviceInfo(dev), {
						upCount: 0,
					})),
				);
			info.upCount++;
		}
	}
	return stats;
}
async function run() {
	const userConfig = (await fetch("config.json", {
		credentials: "include",
	}).then((resp) => {
		if (!resp.ok) {
			console.warn(resp);
			throw Error(`${resp.status} ${resp.statusText}`);
		}
		return resp.json();
	})) as Config;
	const config = Object.assign({}, defaultConfig, userConfig);
	config.deviceNames = Object.assign(
		{},
		defaultConfig.deviceNames,
		userConfig.deviceNames,
	);

	const db = new Database(config);
	console.time("getDates");
	await db.getAllDates((days) =>
		ReactDOM.render(
			<ProgressGui progress={days} prefix="Loading: " suffix=" days" />,
			target,
		),
	);
	console.timeEnd("getDates");
	console.time("getStatic");
	for (const filename of config.staticLogFiles)
		await db.getForFile(filename, (action, done, total) =>
			ReactDOM.render(
				<ProgressGui
					progress={done}
					total={total}
					prefix={action + " "}
					suffix=" logs"
				/>,
				target,
			),
		);
	console.timeEnd("getStatic");
	const data = await db.nmapLogs.toArray();
	console.time("fetchDeviceInfos");
	const deviceInfos = await fetchDeviceInfos(db, data);
	console.timeEnd("fetchDeviceInfos");
	let usage = 0;
	try {
		usage = (await navigator.storage.estimate()).usage || 0;
	} catch (e) {
		console.log("could not get usage", e);
	}

	ReactDOM.render(
		<Gui
			data={data}
			config={config}
			deviceInfos={deviceInfos}
			dataUsage={usage}
		/>,
		target,
	);
}
run().catch((e) => {
	ReactDOM.render(
		<GuiContainer>
			<pre>
				Error: {String(e)}.<br />
				See F12 console for more details.
			</pre>
		</GuiContainer>,
		target,
	);
	console.error("run error", e);
});
