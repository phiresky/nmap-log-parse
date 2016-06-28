
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Highcharts from 'highcharts';
import 'whatwg-fetch';
import {NmapLog, Database, MacToInfo, GottenDates} from './idb';
import {lazy} from './lazy';
(window as any).Promise = Database.Promise;

const selfMacAddress = "00:00:00:00:00:00";

const defaultConfig = {
    logFilesPath: "./logs/logs",
    maxMissingDays: 7,
    dayGetLimit: Infinity,
    logIntervalMinutes: 10,
    minimumUptime: 0.02,
    deviceNames: {
        [selfMacAddress]: "me"
    } as { [mac: string]: string | undefined }
}


const db = new Database();
let config: typeof defaultConfig;

async function getDeviceInfo(mac: string) {
    const infos = await db.macToInfo.where("mac").equals(mac).toArray();
    const info = {
        displayname: config.deviceNames[mac],
        vendor: infos.filter(info => info.type === 'vendor').map(info => info.info).filter(x => x.length > 0),
        hostnames: infos.filter(info => info.type === 'hostname').map(info => info.info),
        ips: infos.filter(info => info.type === 'ip').map(info => info.info)
    };
    return info;
}
function assumeNonNull<T>(t: T | null | undefined, varname = "var"): T {
    if (t == null || t === undefined) throw Error(varname + " can't be " + t);
    return t;
}
interface ParseReturn { online: NmapLog, newInfos: MacToInfo[] };
function parseXML(filename: string, xml: string): ParseReturn | null {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml").documentElement;
    let time = new Date(1000 * +doc.getAttribute("start"));
    if (time < new Date(2000, 0))
        // RTC has not been set, ignore scan 
        return null;
    const scan: ParseReturn = {
        online: { time: time.getTime(), devices: new Set<string>() },
        newInfos: []
    };
    for (const h of Array.from(doc.children)) {
        if (h.nodeName === 'parsererror') {
            console.warn(`parsing error in ${filename}`, doc);
            return null;
        }
        if (h.nodeName !== 'host') {
            if (["verbose", "debugging", "runstats"].indexOf(h.nodeName) >= 0) continue;
            else throw Error("unexpected " + h.nodeName);
        }
        function hasChildren<T>(obj: T): obj is T & { children: HTMLCollection } {
            return !!(obj as any).children;
        }
        let mac: string = "";
        if (!hasChildren(h)) throw Error("no children");
        const ips: string[] = [], hostnames: string[] = [];
        for (const a of Array.from(h.children)) {
            if (a.nodeName === 'status') {
                if (a.getAttribute("reason") === 'localhost-response')
                    mac = selfMacAddress;
            }
            if (a.nodeName === 'address') {
                let type = a.getAttribute("addrtype");
                if (type === 'mac') {
                    mac = assumeNonNull(a.getAttribute("addr"), "mac");
                    scan.newInfos.push({ mac, type: "vendor", info: a.getAttribute("vendor") || "" });
                } else if (type === 'ipv4') {
                    ips.push(assumeNonNull(a.getAttribute("addr"), "ipv4"));
                }
            } else if (a.nodeName === 'hostnames') {
                if (!hasChildren(a)) throw Error("no children");
                for (const child of Array.from(a.children))
                    if (child.tagName === "hostname")
                        hostnames.push(assumeNonNull(child.getAttribute("name"), "hostname"));
            }
        }
        if (!mac) {
            console.warn("no mac address found", doc, h);
            continue;
        }
        scan.online.devices.add(mac);
        scan.newInfos.push(...ips.map(ip => ({ mac, type: "ip", info: ip }) as MacToInfo));
        scan.newInfos.push(...hostnames.map(hostname => ({ mac, type: "hostname", info: hostname }) as MacToInfo));
    }
    return scan;
}

/**
 * @return the data for the given date, null if no data was recorded on that day 
 */
async function getForDate(date: Date): Promise<"404" | "success"> {
    date.setUTCHours(0, 0, 0, 0);
    const dateFormatted = date.toISOString().substr(0, 10);
    const gotDate = await (db.gottenDates.get(date.getTime()) as any as Promise<GottenDates>).catch(e => null);

    if (gotDate) return gotDate.result;
    const filename = config.logFilesPath + dateFormatted + ".xml";
    const response = await fetch(filename);
    if (response.status == 404) {
        await db.gottenDates.add({
            date: date.getTime(), result: "404"
        });
        return getForDate(date);
    }
    if (response.status >= 300) {
        throw Error(`Request Error: ${response.status}: ${response.statusText}`)
    }

    const rawXMLs = await response.text();
    const scans: ParseReturn[] = [];
    for (const rawXML of rawXMLs.split("<?xml version")) {
        if (rawXML.length == 0) continue;
        const scan = parseXML(filename, "<?xml version" + rawXML);
        if (scan) scans.push(scan);
    }
    //const data = count(scans);
    await db.transaction('rw', [db.gottenDates, db.nmapLogs, db.macToInfo], async () => {

        db.gottenDates.add({
            date: date.getTime(), result: "success"
        });
        for (const scan of scans) {
            db.nmapLogs.put(scan.online);
            db.macToInfo.bulkPut(scan.newInfos);
        }
    });
    return getForDate(date);
}
async function getAll(progressCallback: (days: number) => void) {
    const current = new Date();
    let failures = 0;
    let gotten = 0;
    while (true) {
        const resp = await getForDate(current);
        if (resp === "404") {
            failures++;
            if (failures >= config.maxMissingDays) break;
        } else {
            failures = 0;
            gotten++;
            progressCallback(gotten);
            if (gotten >= config.dayGetLimit) break;
        }
        current.setUTCDate(current.getUTCDate() - 1);
    }
}


class ReactChart extends React.Component<{ options: HighchartsOptions }, {}> {
    chart: HighchartsChartObject;
    container: HTMLDivElement;
    // When the DOM is ready, create the chart.
    componentDidMount() {
        this.chart = new Highcharts.Chart(this.container, this.props.options);
    }
    //Destroy chart before unmount.
    componentWillUnmount() {
        this.chart.destroy();
    }
    componentDidUpdate() {
        if (this.chart) this.chart.destroy();
        this.chart = new Highcharts.Chart(this.container, this.props.options);
    }
    //Create the div which the chart will be rendered to.
    render() {
        return <div ref={x => this.container = x} />
    }
}
type AggCP = { data: NmapLog[], title: string, rounder: DateRounder };

function levelInvert<A, B, C, D>(map: Map<A, Map<B, C>>, defaultValue: D) {
    const bs = [...lazy(map.values()).flatMap(innerMap => innerMap.keys()).unique()];
    const a2s = [...map.keys()];
    const innerMap = (b: B) => lazy(a2s).toMapKeyed(a => a, a => map.get(a) !.get(b) || defaultValue);
    return new Map<B, Map<A, C | D>>(lazy(bs).toMapKeyed(b => b, innerMap));
}
class AggregatedChart extends React.Component<AggCP, { options: HighchartsOptions }> {
    constructor(props: AggCP) {
        super(props);
        this.state = { options: { title: { text: "Loading..." } } };
        this.init();
    }
    async init() {
        const agg = levelInvert(aggregate(this.props.data, this.props.rounder), 0);
        const meUptime = lazy(agg.get(selfMacAddress) !.values()).sum();
        const logIntervalMS = 1000 * 60 * config.logIntervalMinutes;
        let minDistance = Infinity;
        const data = await lazy(agg)
            .filter(([mac, vals]) => lazy(vals.values()).sum() >= meUptime * config.minimumUptime)
            .mapAsync(async ([mac, map]) => {
                const info = await getDeviceInfo(mac);
                return {
                    name: info.displayname || info.hostnames[0] || info.ips[0] || mac,
                    tooltip: {
                        footerFormat: `
                            <p><strong>MAC</strong>: ${mac} ${info.vendor}</p><br/>
                            <p><strong>Hostnames</strong>: <ul>${info.hostnames.map(h => `<li>${h}</li>`)}</ul></p><br/>
                            <p><strong>IPs</strong>: <ul>${info.ips.map(i => `<li>${i}</li>`)}</ul></p>
                        `
                    },
                    data: lazy(map).intersplice((left, right) => {
                        const distance = (right[0] - left[0]);
                        if (distance < minDistance) minDistance = distance;
                        if (distance >= minDistance * 2)
                            return [[left[0] + logIntervalMS, null], [right[0] - logIntervalMS, null]] as [number, number|null][];
                        else return [];
                    }).collect()
                }
            });
        this.setState({
            options: {
                chart: { type: 'line', zoomType: 'x' },
                title: { text: this.props.title },
                xAxis: {
                    type: 'datetime',
                    //minRange: 14 * 24 * 60 * 60 * 1000
                },
                plotOptions: { line: { marker: { enabled: false }, animation: false } },
                yAxis: {
                    title: { text: 'Online' },
                    labels: { format: "{value:%.0f}" },
                    min: 0
                },
                // tooltip: {},
                series: data.collect()
            }
        });
    }
    render() {
        return <ReactChart options={this.state.options} />;
    }
}
type GuiProps = { data: NmapLog[] };
class Gui extends React.Component<GuiProps, {}> {
    constructor(props: GuiProps) {
        super(props);
    }
    render() {
        return (
            <div>
                <AggregatedChart rounder={date => roundDate(date, 7, 24) } title="weekly" {...this.props} />
                <AggregatedChart rounder={date => roundDate(date, 1, 24) } title="daily" {...this.props} />
                <AggregatedChart rounder={date => roundDate(date, 1, 3) } title="3 hourly" {...this.props} />
                <AggregatedChart rounder={date => roundDate(date, 1, 1) } title="hourly" {...this.props} />
            </div>
        );
    }
}
function roundDate(date: Date, weekday: number, hours: number, minutes: number = 60) {
    date = new Date(date.getTime());
    date.setDate(date.getDate() - date.getDay () % weekday);
    date.setHours(date.getHours() - date.getHours() % hours);
    date.setMinutes(date.getMinutes() - date.getMinutes() % minutes, 0, 0);
    return date;
}
type DateRounder = (d: Date) => Date;
function aggregate(datas: NmapLog[], rounder: DateRounder): Map<number, Map<string, number>> {
    const map = new Map<number, Map<string, number>>();
    for (const data of datas) {
        const rounded = rounder(new Date(data.time)).getTime();
        if (!map.has(rounded)) map.set(rounded, new Map());
        const map2 = map.get(rounded) !;
        for (const dev of data.devices) map2.set(dev, (map2.get(dev) || 0) + 1);
    }
    return map;
}
function toArrayFillingGaps(allDates: number[], myDates: Map<number, number>): [number, number][] {
    return allDates.map(date => [date, myDates.get(date) || 0] as [number, number]);
}
const target = document.getElementById("root") !;
async function run() {
    const userConfig: typeof defaultConfig = await fetch("config.json").then(resp => {
        if (!resp.ok) {
            console.warn(resp);
            throw Error(resp.status + " " + resp.statusText);
        }
        return resp.json()
    });
    config = Object.assign({}, defaultConfig, userConfig);
    config.deviceNames = Object.assign({}, defaultConfig.deviceNames, userConfig.deviceNames);
    await getAll(days =>
        ReactDOM.render(<div>Loading: {days} days</div>, target));
    ReactDOM.render(<Gui data={await db.nmapLogs.toArray() } />, target);
}
run().catch(e => {
    ReactDOM.render(<pre>Error: {e.toString() }.<br/>See F12 console for more details.</pre>, target);
    console.error(e);
});