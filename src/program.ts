class MacAddress {
	constructor(public addr: string, public vendor: string) { }
}
class HostInfo {
	times: Date[] = [];
	hostnames: {[hostname:string]:number} = {};
	ips: {[ip:string]:number} = {};
	constructor(public mac: MacAddress) { };
}
interface Hosts { [mac: string]: HostInfo }
var config: Configuration;
function roundDate(date: Date, hours:number) {
	date = new Date(date.toString());
	date.setHours(date.getHours() - date.getHours()%hours);
	date.setMinutes(0,0,0);
	return date;
}
function mapToGlobal(date: Date) {
	return roundDate(date, 3);
}
function mapToSingleDate(date: Date) {
	date = roundDate(date, 1);
	date.setFullYear(1970);
	date.setMonth(0, 1);
	return date;
}
function mapToWeek(date: Date) {
	date = roundDate(date, 3);
	date.setFullYear(1970);
	date.setMonth(0,date.getDay()+5);
	return date;
}

let charts = [
	{container:'#globalChart', title:"Uptime percentage by date", mapper:mapToGlobal},
	{container:"#dailyChart", title:"Uptime percentage by day time", mapper:mapToSingleDate},
	{container:"#weeklyChart", title:"Uptime percentage by week day", mapper:mapToWeek,
		config: {xAxis: {labels: {formatter: function(){return `${"Su,Mo,Tu,We,Th,Fr,Sa,Su".split(",")[new Date(this.value).getDay()]}`}}}}
	},
];
interface ParentElement extends Element {
	children: Array<ParentElement>;
}
module Parser {
	function parse(hosts: Hosts, nmapRun: ParentElement) {
		let time = new Date(1000 * +nmapRun.getAttribute("start"));
		if (time < new Date(2000, 0)) return;
		for(let i = 0; i < nmapRun.children.length; i++) {
			let h = nmapRun.children[i];
			if(h.nodeName !== 'host') continue;
			let mac = '', vendor = '', ip = '', hostname = '';
			for(let j = 0; j < h.children.length; j++) {
				let a = h.children[j];
				if(a instanceof Element) {
					if(a.nodeName === 'address') {
						let type = a.getAttribute("addrtype");
						if(type ==='mac') { 
							mac = a.getAttribute("addr");
							vendor = a.getAttribute("vendor");
						} else if(type ==='ipv4') {
							ip = a.getAttribute("addr");
						}
					} else if(a.nodeName === 'hostnames') {
						if(a.children.length > 0)
							hostname = a.children[0].getAttribute("name");
					}
				}
			}
			hosts[mac] = hosts[mac] || new HostInfo(new MacAddress(mac, vendor));
			let lastTime = hosts[mac].times[hosts[mac].times.length - 1];
			if (lastTime !== time)
				hosts[mac].times.push(time);
			hosts[mac].ips[ip] = hosts[mac].ips[ip] + 1 || 1;
			hosts[mac].hostnames[hostname] = hosts[mac].hostnames[hostname] + 1 || 1;
		}
	}
	export function parseAll(list: string) {
		let hosts: Hosts = {};
		let parser = new DOMParser();
		list.split("<?xml version").filter(doc => doc.length > 0)
			.forEach(doc => parse(hosts, <any>parser.parseFromString("<?xml version" + doc, "text/xml").documentElement));
		return hosts;
	}
}
function getname(host: HostInfo) {
	let names = Object.keys(host.hostnames);
	let explicitName = config.macToName[host.mac.addr]
		|| names.map(h => config.hostToName[h]).filter(name => !!name)[0];
	if (explicitName) return explicitName;
	if (names[0] && names[0].indexOf("android") == 0 && host.mac.vendor)
		return `Android von ${host.mac.vendor.split(" ").slice(0, 2).join(" ") }`;
	return names[0] || host.mac.addr;
}
function totable(data: any[]) {
	let table = $("<table class='table'>");
	let atts = Object.keys(data[0]);
	table.append(atts.map(att => $("<th>").text(att)));
	table.append(data.map(row => atts.map(att => row[att]))
		.map(row => $("<tr>").append(row.map(val => $("<td>").text(val)))));
	return table;
}
function getTable(hosts: Hosts) {
	return totable(
		Object.keys(hosts).map(mac => hosts[mac])
			.sort((a, b) => b.times.length - a.times.length)
			.map(host =>
				({
					Name: getname(host),
					Mac: host.mac.addr,
					Hostnames: Object.keys(host.hostnames).join(", "),
					IPs: Object.keys(host.ips).join(", "),
					"Total Uptime": (host.times.length / 6).toFixed(1) + " hours"
				})
			));
}
function getChart(self:HostInfo, title:string, hosts: Hosts, mapDate: (d:Date) => Date, configChanges = {}) {
	let allPoints:{host:HostInfo, time:Date}[] = [];
	let filteredHosts = Object.keys(hosts).map(h => hosts[h]).filter(h =>
		h.times.length * config.logInterval > config.ignoreLessThan
	);
	filteredHosts.forEach(h => h.times.map(time => allPoints.push({host:h, time:time})));
	let lookup:{[mac:string]:number} = {};
	filteredHosts.forEach((h,i) => lookup[h.mac.addr] = i);
	let bins:{[time:string]:{[mac:string]:number}} = {};
	for(let point of allPoints) {
		let x = mapDate(point.time).getTime();
		let mac = point.host.mac.addr;
		if(!bins[x]) bins[x] = {};
		bins[x][mac] = bins[x][mac]+1 || 1;
	}
	let series = filteredHosts.map(h => ({
		name:getname(h),
		data:Object.keys(bins).map((time) => {
			const bin = bins[time];
			let selfTime = 0;
			if(self) {
				selfTime = bin[self.mac.addr];
			} else {
				// use maximum ontime of any device instead
				selfTime = Math.max(...Object.keys(bin).map(mac => bin[mac]));
			}
			return {x:+time, y:100*bin[h.mac.addr]/selfTime||0};
		}).sort((a,b) => a.x-b.x)
	}));
	return $.extend(true, {
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
		series: series
	}, configChanges);
}
function display(hosts: Hosts) {
	(<any>window).hosts = hosts;

	$("body>div").append("<h3>Totals</h3>");
	$("body>div").append(getTable(hosts));
	let selfHost = Object.keys(hosts).map(h => hosts[h]).filter(h => Object.keys(h.hostnames)[0] === config.self)[0];
	if(!selfHost) {
		console.log(`Warning: Could not find any entries with self hostname (${selfHost}), calculations will be less accurate`);
	}
	for(let chart of charts) {
		$(chart.container).highcharts(getChart(selfHost, chart.title, hosts, chart.mapper, (<any>chart).config));
	}
}
function showError(error: any) {
	$(".container-fluid").prepend(`<div class="alert alert-danger">Error: ${JSON.stringify(error)}</div>`);
}
Highcharts.setOptions({ global: { useUTC: false } });
$.getJSON("config.json").then(_config => {
	config = _config;
	$.get(config.input).then(Parser.parseAll).then(hosts => display(hosts)).fail(s => showError(`getting ${config.input}: ${s.statusText}`));
}).fail(s => showError(`getting config.json: ${s.statusText}`));
