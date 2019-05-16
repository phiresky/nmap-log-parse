import { lazy } from "./lazy";
import { NmapLog, MacToInfo } from "./db";
import { Config } from "./config";

export function levelInvert<A, B, C, D>(
	map: Map<A, Map<B, C>>,
	defaultValue: D,
): Map<B, Map<A, C | D>> {
	const bs = lazy(map.values())
		.flatMap(innerMap => innerMap.keys())
		.unique()
		.collect();
	const as = [...map.keys()];
	const innerMap = (b: B) =>
		lazy(as).toMapKeyed(a => a, a => map.get(a)!.get(b) || defaultValue);
	return new Map<B, Map<A, C | D>>(lazy(bs).toMapKeyed(b => b, innerMap));
}

export function roundDate(
	date: Date,
	weekday: number,
	hours: number,
	minutes: number = 60,
) {
	date.setDate(date.getDate() - (date.getDay() % weekday));
	date.setHours(date.getHours() - (date.getHours() % hours));
	date.setMinutes(date.getMinutes() - (date.getMinutes() % minutes), 0, 0);
	return date;
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
export function parseXML(
	config: Config,
	filename: string,
	xml: string,
): parseXMLReturn | null {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, "application/xml").documentElement;
	let time = new Date(1000 * +doc.getAttribute("start"));
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
		function hasChildren<T>(
			obj: T,
		): obj is T & { children: HTMLCollection } {
			return !!(obj as any).children;
		}
		let mac: string = "";
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
			...ips.map(ip => ({ mac, type: "ip", info: ip } as MacToInfo)),
		);
		scan.newInfos.push(
			...hostnames.map(
				hostname =>
					({ mac, type: "hostname", info: hostname } as MacToInfo),
			),
		);
	}
	return scan;
}

export function assignDeep(target: any, ...others: any[]) {
	for (const options of others) {
		// Only deal with non-null/undefined values
		if (options != null) {
			// Extend the base object
			for (const name in options) {
				const src = target[name];
				const copy = options[name];

				// Prevent never-ending loop
				if (target === copy) continue;

				// Recurse if we're merging plain objects or arrays
				if (copy && typeof copy === "object") {
					let clone: any;
					if (Array.isArray(copy)) {
						clone = src && Array.isArray(src) ? src : [];
					} else {
						clone = src && typeof src === "object" ? src : {};
					}

					// Never move original objects, clone them
					target[name] = assignDeep(clone, copy);
				} else if (copy !== undefined) {
					// Don't bring in undefined values
					target[name] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
}
