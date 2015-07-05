/// <reference path='../typings/jquery/jquery.d.ts' />
/// <reference path='../typings/d3/d3.d.ts' />
/// <reference path='../typings/highcharts/highcharts.d.ts' />
class MacAddress {
	constructor(public addr: string, public vendor: string) {}
}
class HostInfo {
	times: Date[] = [];
	hostnames: string[] = [];
	ips: string[] = [];
	constructor(public mac: MacAddress){};
}
interface Configuration {
	macToName:{[mac:string]:string};
	hostToName:{[hostname:string]:string};
}
let doc: Document;
let hosts: { [mac: string]: HostInfo } = {};
let files: string[];
let usecache = true; // run once,  copy(JSON.stringify(hosts)) > cache.json 
let ignoreLessThan = 50 * 60 * 60; // ignore less than 50 hours total
let logInterval = 10 * 60; // ten minutes
let config:Configuration;
function incSpan(date:Date) {
	date.setHours(date.getHours()+1);
}
function recv(d: Document) {
	let $doc = $(d);
	doc = d;
	let time = new Date(1000 * +$doc.children("nmaprun").attr("start"));
	if(time < new Date(2000, 0)) return;
	$doc.find("host").each((i, e) => {
		let $e = $(e);
		let macAtt = $e.children("address[addrtype=mac]");
		let mac = macAtt.attr("addr"), vendor = macAtt.attr("vendor");
		let ip = $e.children("address[addrtype=ipv4]").attr("addr");
		let hostname = $e.find("hostname[type=PTR]").attr("name");
		hosts[mac] = hosts[mac] || new HostInfo(new MacAddress(mac,vendor));
		let lastTime = hosts[mac].times[hosts[mac].times.length - 1];
		if(lastTime !== time)
			hosts[mac].times.push(time);
		if (hosts[mac].ips.indexOf(ip) < 0)
			hosts[mac].ips.push(ip);
		if (hostname && hosts[mac].hostnames.indexOf(hostname) < 0)
			hosts[mac].hostnames.push(hostname);
	});
}
function getname(host:HostInfo) {
	let explicitName =  config.macToName[host.mac.addr] 
		|| host.hostnames.map(h => config.hostToName[h]).filter(name => !!name)[0];
	if(explicitName) return explicitName;
	if(host.hostnames[0] && host.hostnames[0].indexOf("android") == 0 && host.mac.vendor)
		return `Android von ${host.mac.vendor.split(" ").slice(0,2).join(" ")}`;
	return host.hostnames[0] || host.mac.addr;
}
function totable(data:any[]) {
	let table = $("<table class='table'>");
	let atts = Object.keys(data[0]);
	table.append(atts.map(att => $("<th>").text(att)));
	table.append(data.map(row => atts.map(att => row[att]))
		.map(row => $("<tr>").append(row.map(val => $("<td>").text(val)))));
	return table;
}
function display() {
	let table = totable(
		Object.keys(hosts).map(mac => hosts[mac])
			.sort((a,b) => b.times.length - a.times.length)
			.map(host => 
				({
					Name:getname(host),
					Mac: host.mac.addr,
					Hostnames: host.hostnames.join(", "), 
					IPs: host.ips.join(", "),
					Uptime: (host.times.length / 6).toFixed(1) + " hours"
				})
			));
	$(".container").append("<h3>Totals</h3>");
	$(".container").append(table);
	let bins = (range: [number, number], values: Date[], index: number) => {
		let begin = new Date(range[0]);
		let end = new Date(range[1]);
		begin.setHours(0,0,0,0);
		let thresholds:number[] = [];
		while(begin < end) {
			incSpan(begin);
			thresholds.push(+begin);
		}
		return thresholds;
	}
	$("#chart").highcharts({
		chart: { type: 'line', zoomType:'x' },
		title: {text:'Who\'s in my network?'},
		xAxis: {
			type: 'datetime',
			//minRange: 14 * 24 * 60 * 60 * 1000
		},
		plotOptions: { line : { marker: {enabled:false}}},
		yAxis: {
			title: { text: 'Online' },
			labels: {format: "{value:%.0f}%"}
		},
		// tooltip: {},
		series: Object.keys(hosts).map(h => hosts[h]).filter(h => {
			return  h.times.length * logInterval > ignoreLessThan;
		}).map(h => ({
			name: getname(h),
			data: d3.layout.histogram<Date>().bins(bins)(h.times).map(bin => ({x:bin.x, y:bin.y*100/6})).sort((a,b) => a.x - b.x)
		}))
	});
}
let getdata:JQueryPromise<void>;
if (!usecache) {
	getdata = $.get("allfiles").then((list: string) => {
		 list.split("<?xml version").filter(doc => doc.length > 0)
			.forEach(doc => recv($.parseXML("<?xml version" + doc)));
	}).fail((x) => console.log(x));
} else {
	getdata = $.get("cache.json").then(obj => {
		hosts = obj;
		Object.keys(hosts).map(mac => hosts[mac]).forEach(host => host.times = host.times.map(time => new Date("" + time)));
	}).fail((x) => console.log(x));
}
$.when($.getJSON("config.json"), getdata).done((configStatus:[Configuration]) => {
	config = configStatus[0];
	display();
});