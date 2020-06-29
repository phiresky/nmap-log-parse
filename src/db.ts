import Dexie from "dexie";
import { Config } from "./config";
import { parseXML } from "./util";
import { lazy } from "./lazy";

export interface NmapLog {
	time: number;
	devices: Set<string>; // mac addresses
}
export interface GottenFiles {
	filename: string;
	result: "404" | "success";
}
export interface MacToInfo {
	mac: string;
	type: "ip" | "hostname" | "vendor";
	info: string;
}
export interface DeviceInfo {
	displayname: string | undefined;
	vendor: string[];
	hostnames: string[];
	ips: string[];
}
export class Database extends Dexie {
	nmapLogs!: Dexie.Table<NmapLog, number>;
	gottenFiles!: Dexie.Table<GottenFiles, string>;
	macToInfo!: Dexie.Table<MacToInfo, string>;
	constructor(private config: Config) {
		super("NmapLogDatabase");
		this.version(1).stores({
			nmapLogs: "time",
			gottenFiles: "filename",
			macToInfo: "[mac+type+info], mac, info",
		});
	}
	async getDeviceInfo(mac: string): Promise<DeviceInfo> {
		const infos = await this.macToInfo.where("mac").equals(mac).toArray();
		return {
			displayname: this.config.deviceNames[mac],
			vendor: infos
				.filter((info) => info.type === "vendor")
				.map((info) => info.info)
				.filter((x) => x.length > 0),
			hostnames: infos
				.filter((info) => info.type === "hostname")
				.map((info) => info.info),
			ips: infos
				.filter((info) => info.type === "ip")
				.map((info) => info.info),
		};
	}
	/**
	 * @return the data for the given date, null if no data was recorded on that day
	 */
	async getForDate(date: Date): Promise<"404" | "success"> {
		date.setUTCHours(0, 0, 0, 0);
		const recentDate = new Date();
		recentDate.setDate(recentDate.getDate() - 3);
		const dateFormatted = date.toISOString().substr(0, 10);

		const filename = this.config.logFilesPath + dateFormatted + ".xml";
		return await this.getForFile(filename, undefined, date >= recentDate);
	}
	async getForFile(
		filename: string,
		statusCallback?: (state: string, done: number, total: number) => void,
		forceFetch = false,
	): Promise<"404" | "success"> {
		const gotDate = await this.gottenFiles.get(filename).catch((e) => null);
		if (!forceFetch && gotDate) return gotDate.result;

		const response = await fetch(filename, { credentials: "include" });
		if (response.status == 404) {
			await this.gottenFiles.put({ filename, result: "404" });
			return "404";
		}
		if (response.status >= 300) {
			throw Error(
				`Request Error: ${response.status}: ${response.statusText}`,
			);
		}

		const rawXMLs = (await response.text()).split("<?xml version");
		const total = rawXMLs.length;
		console.log(`loading ${total} files`);
		let i = 0;
		const createStatusCallback = () =>
			statusCallback
				? [
						new Promise<void>((resolve) => {
							statusCallback("loading", i, total);
							setTimeout(resolve, 0);
						}),
				  ]
				: [];
		await lazy(rawXMLs)
			.chunk(200)
			.map(
				async (rawXMLs) =>
					await this.transaction(
						"rw",
						[this.gottenFiles, this.nmapLogs, this.macToInfo],
						async () => {
							for (const rawXML of rawXMLs) {
								if (rawXML.length == 0) continue;
								const scan = parseXML(
									this.config,
									filename,
									"<?xml version" + rawXML,
								);
								if (scan) {
									void this.nmapLogs.put(scan.online);
									void this.macToInfo.bulkPut(scan.newInfos);
								}
								i++;
							}
						},
					),
			)
			.intersplice(createStatusCallback)
			.awaitSequential();

		await this.gottenFiles.put({ filename, result: "success" });
		return "success";
	}
	async getAllDates(progressCallback: (days: number) => void) {
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
