let usecache = true; // run once,  copy(JSON.stringify(hosts)) > cache.json
class MacAddress {
	constructor(public addr: string, public vendor: string) { }
}
class HostInfo {
	times: Date[] = [];
	hostnames: string[] = [];
	ips: string[] = [];
	constructor(public mac: MacAddress) { };
}
interface Configuration {
	macToName: { [mac: string]: string };
	hostToName: { [hostname: string]: string };
	// interval in minutes with which nmaplog.sh is called
	logInterval: number;
	// don't show in Graph if total time less than this (minutes)
	ignoreLessThan: number;
}
interface Hosts { [mac: string]: HostInfo }
let config: Configuration;
interface DatesMapper {
	mapDates(inp:Date[]):Date[];
	getPercentageMultiply(inp:Date[]):number;
	incrementTime(date:Date):Date;
}
let dailyMapper:DatesMapper = {
	mapDates:mapToSingleDate,
	getPercentageMultiply: dates => {let min = d3.min(dates), max = d3.max(dates); return 1/((max.getTime() - min.getTime())/1000/60/60/24);},
	incrementTime: (date) => addHours(1,date)
}
let globalMapper:DatesMapper = {
	mapDates: d=> d,
	getPercentageMultiply: d => 1/3,
	incrementTime: date => addHours(3, date)
}
function mapToSingleDate(dates: Date[]) {
	dates = dates.map(date => {
		date = new Date(date.toString());
		date.setFullYear(1970);
		date.setMonth(0, 1);
		return date;
	});
	return dates;
}
function addHours(hours: number, date: Date) {
	date = new Date(date.toString());
	date.setHours(date.getHours() + hours);
	return date;
}
module Parser {
	function parse(hosts: Hosts, d: Document) {
		let $doc = $(d);
		let time = new Date(1000 * +$doc.children("nmaprun").attr("start"));
		if (time < new Date(2000, 0)) return;
		$doc.find("host").each((i, e) => {
			let $e = $(e);
			let macAtt = $e.children("address[addrtype=mac]");
			let mac = macAtt.attr("addr"), vendor = macAtt.attr("vendor");
			let ip = $e.children("address[addrtype=ipv4]").attr("addr");
			let hostname = $e.find("hostname[type=PTR]").attr("name");
			hosts[mac] = hosts[mac] || new HostInfo(new MacAddress(mac, vendor));
			let lastTime = hosts[mac].times[hosts[mac].times.length - 1];
			if (lastTime !== time)
				hosts[mac].times.push(time);
			if (hosts[mac].ips.indexOf(ip) < 0)
				hosts[mac].ips.push(ip);
			if (hostname && hosts[mac].hostnames.indexOf(hostname) < 0)
				hosts[mac].hostnames.push(hostname);
		});
	}
	export function parseAll(list: string) {
		let hosts: Hosts = {};
		list.split("<?xml version").filter(doc => doc.length > 0)
			.forEach(doc => parse(hosts, $.parseXML("<?xml version" + doc)));
		return hosts;
	}
}
function getname(host: HostInfo) {
	let explicitName = config.macToName[host.mac.addr]
		|| host.hostnames.map(h => config.hostToName[h]).filter(name => !!name)[0];
	if (explicitName) return explicitName;
	if (host.hostnames[0] && host.hostnames[0].indexOf("android") == 0 && host.mac.vendor)
		return `Android von ${host.mac.vendor.split(" ").slice(0, 2).join(" ") }`;
	return host.hostnames[0] || host.mac.addr;
}
function totable(data: any[]) {
	let table = $("<table class='table'>");
	let atts = Object.keys(data[0]);
	table.append(atts.map(att => $("<th>").text(att)));
	table.append(data.map(row => atts.map(att => row[att]))
		.map(row => $("<tr>").append(row.map(val => $("<td>").text(val)))));
	return table;
}
let makeBins = (begin: Date, end: Date, incrementTime: (d: Date) => Date) => {
	begin.setHours(0, 0, 0, 0);
	let thresholds = [+begin];
	while (begin < end) {
		begin = incrementTime(begin);
		thresholds.push(+begin);
	}
	return thresholds;
}
function getTable(hosts: Hosts) {
	return totable(
		Object.keys(hosts).map(mac => hosts[mac])
			.sort((a, b) => b.times.length - a.times.length)
			.map(host =>
				({
					Name: getname(host),
					Mac: host.mac.addr,
					Hostnames: host.hostnames.join(", "),
					IPs: host.ips.join(", "),
					Uptime: (host.times.length / 6).toFixed(1) + " hours"
				})
			));
}
function getChart(title:string, hosts: Hosts, mapDates: DatesMapper) {
	return {
		chart: { type: 'line', zoomType: 'x' },
		title: { text: title },
		xAxis: {
			type: 'datetime',
			//minRange: 14 * 24 * 60 * 60 * 1000
		},
		plotOptions: { line: { marker: { enabled: false } } },
		yAxis: {
			title: { text: 'Online' },
			labels: { format: "{value:%.0f}%" },
			min: 0
		},
		// tooltip: {},
		series: Object.keys(hosts).map(h => hosts[h]).filter(h => {
			return h.times.length * config.logInterval > config.ignoreLessThan;
		}).map(h => {
			let multiply = mapDates.getPercentageMultiply(h.times);
			let dates = mapDates.mapDates(h.times);
			let min = d3.min(dates), max = d3.max(dates); 
			return {
				name: getname(h),
				data: d3.layout.histogram<Date>()
					.bins(makeBins(min, max, mapDates.incrementTime))
					(dates)
					.map(bin => ({ x: bin.x, y: bin.y * 100 * config.logInterval * multiply / 60 })).sort((a, b) => a.x - b.x)
			}})
	}
}
function display(hosts: Hosts) {
	(<any>window).hosts = hosts;

	$("body>div").append("<h3>Totals</h3>");
	$("body>div").append(getTable(hosts));

	$("#globalChart").highcharts(getChart("Uptime percentage by date", hosts, globalMapper));
	$("#dailyChart").highcharts(getChart("Uptime percentage by day time", hosts, dailyMapper));
}
let getdata: JQueryPromise<Hosts>;
if (!usecache) {
	getdata = $.get("allfiles").then(Parser.parseAll);
} else {
	getdata = $.get("cache.json").then((hosts: Hosts) => {
		Object.keys(hosts).map(mac => hosts[mac]).forEach(host => host.times = host.times.map(time => new Date("" + time)));
		return hosts;
	});
}

Highcharts.setOptions({ global: { useUTC: false } });
$.getJSON("config.json").then(_config => {
	config = _config;
	this.config = config;
	$.when(getdata).done(hosts => display(hosts));
}).fail(x => console.error(x));