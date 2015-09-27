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
let config: Configuration;
function roundDate(date: Date, hours:number, minutes:number=60) {
	date = new Date(date.toString()); // preserve timezone information
	date.setHours(date.getHours() - date.getHours()%hours);
	date.setMinutes(date.getMinutes() - date.getMinutes()%minutes, 0, 0);
	return date;
}

const aggregateSpans: {[name:string]: (date: Date) => Date} = {
	"20 minutes": date => roundDate(date, 1, 20),
	"30 minutes": date => roundDate(date, 1, 30),
	"1 hour": date => roundDate(date, 1),
	"3 hours": date => roundDate(date, 3),
	"12 hours": date => roundDate(date, 12),
	"1 day": date => roundDate(date, 24),
}
interface ChartConfig {
	container: string, title: string, aggregate: string, config: {}, offset?: (d:Date) => Date
}
const charts: ChartConfig[] = [
	{container:".global.chart", title:"Uptime percentage by date", aggregate: "3 hours", config: {}},
	{container:".daily.chart", title:"Uptime percentage by day time", aggregate: "1 hour",
		offset: (date: Date) => {date.setFullYear(1970); date.setMonth(0,1); return date},
		config: {
			tooltip: { headerFormat: `<span style="font-size: 10px">{point.key:%H:%M}</span><br/>`}
		}
	},
	{container:".weekly.chart", title:"Uptime percentage by week day", aggregate: "3 hours",
		offset: (date: Date) => {date.setFullYear(1970); date.setMonth(0,date.getDay()+5); return date},
		config: {
			tooltip: { headerFormat: `<span style="font-size: 10px">{point.key:%A %H:%M}</span><br/>`},
			xAxis: {labels: {format: "{value:%a}"}
		}
	}}
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
	const maxTime = Math.max(...Object.keys(hosts).map(mac => hosts[mac].times.length));
	return totable(
		Object.keys(hosts).map(mac => hosts[mac])
			.sort((a, b) => b.times.length - a.times.length)
			.map(host =>
				({
					Name: getname(host),
					Mac: host.mac.addr,
					Hostnames: Object.keys(host.hostnames).join(", "),
					IPs: Object.keys(host.ips).join(", "),
					"Total Uptime": (host.times.length * config.logInterval / 60).toFixed(1) + " hours",
					"Average Uptime": (host.times.length / maxTime * 100).toFixed(1) + "%"
				})
			));
}
function getChartConfiguration(hosts: Hosts, cConf: ChartConfig, target: Element) {
	let allPoints:{host:HostInfo, time:Date}[] = [];
	let maximumUptime = Math.max(...Object.keys(hosts).map(h => hosts[h].times.length));
	let filteredHosts = Object.keys(hosts).map(h => hosts[h]).filter(h =>
		config.hide.indexOf(h.mac.addr) < 0
		&& (!config.ignoreLessThanPercent || (h.times.length / maximumUptime > config.ignoreLessThanPercent))
	);
	filteredHosts.forEach(h => h.times.map(time => allPoints.push({host:h, time:time})));
	let lookup:{[mac:string]:number} = {};
	filteredHosts.forEach((h,i) => lookup[h.mac.addr] = i);
	let bins:{[time:string]:{[mac:string]:number}} = {};
	for(let point of allPoints) {
		let date = aggregateSpans[cConf.aggregate || "1 hour"](point.time); 
		if(cConf.offset) date = cConf.offset(date);
		const x = date.getTime();
		const mac = point.host.mac.addr;
		if(!bins[x]) bins[x] = {};
		bins[x][mac] = bins[x][mac]+1 || 1;
	}
	let series = filteredHosts.map(h => ({
		name:getname(h),
		data:Object.keys(bins).map((time) => {
			const bin = bins[time];
			const maxTime = Math.max(...Object.keys(bin).map(mac => bin[mac]));
			return [+time, 100*bin[h.mac.addr]/maxTime||0];
		}).sort(([x1,y1],[x2,y2]) => x1-x2)
	}));
	return $.extend(true, {
		chart: { type: 'line', zoomType: 'x', renderTo: target},
		title: { text: cConf.title },
		xAxis: {
			type: 'datetime',
			//minRange: 14 * 24 * 60 * 60 * 1000
		},
		plotOptions: { line: { marker: { enabled: false }, animation: false } },
		yAxis: {
			title: { text: 'Online' },
			labels: { format: "{value:%.0f}%" },
			min: 0
		},
		// tooltip: {},
		series: series
	}, cConf.config);
}
function makeSelect(value: string, callback: (aggregate: string) => void) {
	const select = document.createElement("select");
	Object.keys(aggregateSpans).map(name => new Option(name)).forEach(o => select.add(o));
	select.value = value;	
	select.addEventListener("change", e => callback(select.value));
	return $("<p>Aggregate over </p>").append(select);
}
function initializeChart(hosts: Hosts, charts: ChartConfig[], index = 0) {
	const chart = charts[index];
	if(!chart) return;
	const chartDiv = $("<div>").appendTo(chart.container);
	const highchart = new Highcharts.Chart(getChartConfiguration(hosts, chart, chartDiv[0]), 
		() => setTimeout(() => initializeChart(hosts, charts, index + 1), 0));
	$(chart.container).append(makeSelect(chart.aggregate, (aggregate:string) => {
		chart.aggregate = aggregate;
		chartDiv.highcharts().destroy();
		new Highcharts.Chart(getChartConfiguration(hosts, chart, chartDiv[0]));
	}));
	$(chart.container).children(".spinner").remove();
}
function display(hosts: Hosts) {
	this.hosts = hosts;

	$(".statistics.chart").append("<h3>Totals</h3>").append(getTable(hosts));
	initializeChart(hosts, charts);
}
function showError(error: any) {
	$(".container-fluid").prepend(`<div class="alert alert-danger">Error: ${JSON.stringify(error)}</div>`);
}
declare var  bzip2:any;
function getAndDecompress(fname: string): JQueryPromise<string> {
	if(fname.indexOf(".") >= 0) {
		if(fname.substr(fname.indexOf(".")) === ".bz2") {
			console.log("decompressing "+fname);
			return $.ajax({
				url: fname,
				type: 'GET',
				dataType: 'binary',
				processData: false,
			}).then(data => {
				const stream = bzip2.array(new Uint8Array(data));
				let output = "";
				let i = 0;
				while(true) {
					try {
						output += bzip2.simple(stream);
						stream(8*4); // skip crc
						while(stream("bit") != 0) stream(1); // align
					} catch(e) {
						if(e === "No magic number found") break;
						throw e;
					}
					i++;
				}
				console.log(`decompressed ${i} chunks`);
				return output;
			});
		}
	}
	return $.get(config.input);
}
Highcharts.setOptions({ global: { useUTC: false } });

function normalizeConfig(config: Configuration): Configuration {
	config.hostToName = config.hostToName || {};
	config.macToName = config.macToName || {};
	for(const host of Object.keys(config.hostToName)) {
		config.hostToName[host.toUpperCase()] = config.hostToName[host];
	}
	for(const mac of Object.keys(config.macToName)) {
		config.macToName[mac.toUpperCase()] = config.macToName[mac];
	}
	config.hide = (config.hide||[]).map(mac => mac.toUpperCase());
	return config;
}
$(function() {
	$.getJSON("config.json").then(_config => {
		config = normalizeConfig(_config);
		getAndDecompress(config.input).then(Parser.parseAll).then(hosts => display(hosts)).fail(s => showError(`getting ${config.input}: ${s.statusText}`));
	}).fail(s => showError(`getting config.json: ${s.statusText}`));
});


// utility: binary ajax
/** @author Henry Algus <henryalgus@gmail.com> */
(<any>$).ajaxTransport("+binary", function(options:any, originalOptions:any, jqXHR:any){
	return {
		send: function(headers:any, callback:any) {
			var xhr = new XMLHttpRequest(),
				url = options.url,
				type = options.type,
				async = options.async || true,
				dataType = "arraybuffer",
				data = options.data || null,
				username = options.username || null,
				password = options.password || null;
						
			xhr.addEventListener('load', function(){
				var data:any = {};
				data[options.dataType] = xhr.response;
				// make callback and send data
				callback(xhr.status, xhr.statusText, data, xhr.getAllResponseHeaders());
			});
		
			xhr.open(type, url, async, username, password);
					
			// setup custom headers
			for (var i in headers ) {
				xhr.setRequestHeader(i, headers[i] );
			}
			
			xhr.responseType = dataType;
			xhr.send(data);
		},
		abort: function(){
			jqXHR.abort();
		}
	};
});