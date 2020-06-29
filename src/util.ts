import { lazy } from "./lazy";
import { NmapLog, MacToInfo } from "./db";
import { Config } from "./config";
import type { Preset } from "./CustomyChart";

export function levelInvert<A, B, C, D>(
	map: Map<A, Map<B, C>>,
	defaultValue: D,
): Map<B, Map<A, C | D>> {
	const bs = lazy(map.values())
		.flatMap((innerMap) => innerMap.keys())
		.unique()
		.collect();
	const as = [...map.keys()];
	const innerMap = (b: B) =>
		lazy(as).toMapKeyed(
			(a) => a,
			(a) => map.get(a)!.get(b) || defaultValue,
		);
	return new Map<B, Map<A, C | D>>(lazy(bs).toMapKeyed((b) => b, innerMap));
}

export function roundDate(
	date: Date,
	weekday: number,
	hours: number,
	minutes = 60,
): Date {
	date.setDate(date.getDate() - (date.getDay() % weekday));
	date.setHours(date.getHours() - (date.getHours() % hours));
	date.setMinutes(date.getMinutes() - (date.getMinutes() % minutes), 0, 0);
	return date;
}

export function setHighchartsOptionsForPreset(
	preset: Preset,
	o: Highcharts.Options,
): void {
	if (!o.tooltip) o.tooltip = {};
	o.tooltip.headerFormat = preset.headerFormat;
	if (!o.xAxis) o.xAxis = {};
	if (Array.isArray(o.xAxis)) throw Error("can't handle multiple x");
	o.xAxis.labels = preset.xAxisLabels;
}

export type DateRounder = (d: Date) => Date | null;
function assumeNonNull<T>(t: T | null | undefined, varname = "var"): T {
	if (t == null || t === undefined) throw Error(varname + " can't be " + t);
	return t;
}
export interface parseXMLReturn {
	online: NmapLog;
	newInfos: MacToInfo[];
}
function hasChildren<T>(obj: T): obj is T & { children: HTMLCollection } {
	return !!(obj as any).children;
}

export function uptimePart(t: number, meUptime: number | undefined): number {
	if (!meUptime) {
		console.warn("could not get own uptime");
		// don't know how long we were up or meUptime = 0
		return t;
	} else return t / meUptime;
}

export function parseXML(
	config: Config,
	filename: string,
	xml: string,
): parseXMLReturn | null {
	/*const sax1 = await import('sax-wasm');
	const sax = await import('sax-wasm/lib/sax-wasm.wasm');
	console.log({sax1, sax});*/
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, "application/xml").documentElement;
	const time = new Date(1000 * +doc.getAttribute("start")!);
	if (time < new Date(2000, 0))
		// RTC has not been set, ignore scan
		return null;
	const scan: parseXMLReturn = {
		online: { time: time.getTime(), devices: new Set<string>() },
		newInfos: [],
	};
	for (const h of Array.from(doc.children)) {
		if (h.nodeName === "parsererror") {
			console.warn(`parsing error in ${filename}`);
			return null;
		}
		if (h.nodeName !== "host") {
			if (
				["verbose", "debugging", "runstats", "target"].indexOf(
					h.nodeName,
				) >= 0
			)
				continue;
			else throw Error("unexpected " + h.nodeName);
		}

		let mac = "";
		if (!hasChildren(h)) throw Error("no children");
		const ips: string[] = [],
			hostnames: string[] = [];
		for (const a of Array.from(h.children)) {
			if (a.nodeName === "status") {
				if (a.getAttribute("reason") === "localhost-response")
					mac = config.selfMacAddress;
			}
			if (a.nodeName === "address") {
				let type = a.getAttribute("addrtype");
				if (type === "mac") {
					mac = assumeNonNull(a.getAttribute("addr"), "mac");
					scan.newInfos.push({
						mac,
						type: "vendor",
						info: a.getAttribute("vendor") || "",
					});
				} else if (type === "ipv4") {
					ips.push(assumeNonNull(a.getAttribute("addr"), "ipv4"));
				}
			} else if (a.nodeName === "hostnames") {
				if (!hasChildren(a)) throw Error("no children");
				for (const child of Array.from(a.children))
					if (child.tagName === "hostname")
						hostnames.push(
							assumeNonNull(
								child.getAttribute("name"),
								"hostname",
							),
						);
			}
		}
		if (!mac) {
			console.warn("no mac address found", doc, h);
			continue;
		}
		scan.online.devices.add(mac);
		scan.newInfos.push(
			...ips.map((ip) => ({ mac, type: "ip", info: ip } as MacToInfo)),
		);
		scan.newInfos.push(
			...hostnames.map(
				(hostname) =>
					({ mac, type: "hostname", info: hostname } as MacToInfo),
			),
		);
	}
	return scan;
}
