import * as Highcharts from "highcharts";
import _, { minBy } from "lodash";
import * as React from "react";
import { Config } from "./config";
import { DeviceInfo, NmapLog } from "./db";
import { ReactChart } from "./gui";
import { observable } from "mobx";
import { lazy } from "./lazy";
import { DateRounder, levelInvert, uptimePart } from "./util";
import { observer } from "mobx-react";
type AggregatedChartData = SingleChartData & { rounder: DateRounder };

export type CommonChartData = {
	data: NmapLog[];
	config: Config;
	deviceInfos: Map<string, DeviceInfo & { upCount: number }>;
};
export type SingleChartData = CommonChartData & {
	title: string;
	highchartsOptions?: (o: Highcharts.Options) => void;
};
function aggregate(
	datas: NmapLog[],
	rounder: DateRounder,
): Map<number, Map<string, number>> {
	const map = new Map<number, Map<string, number>>();
	datas
		.flatMap((log) => {
			const rounded = rounder(new Date(log.time));
			return rounded
				? [
						{
							time: rounded.getTime(),
							devices: log.devices,
						},
				  ]
				: [];
		})
		.sort((a, b) => a.time - b.time)
		.forEach((data) => {
			if (!map.has(data.time)) map.set(data.time, new Map());
			const map2 = map.get(data.time)!;
			for (const dev of data.devices)
				map2.set(dev, (map2.get(dev) || 0) + 1);
		});
	return map;
}

@observer
export class AggregatedChart extends React.Component<AggregatedChartData> {
	@observable
	chartOptions: Highcharts.Options;

	constructor(props: AggregatedChartData) {
		super(props);
		this.chartOptions = { title: { text: props.title + ": Loading..." } };
	}

	chart: Highcharts.Chart | null = null;
	componentDidMount(): void {
		this.init();
	}

	componentDidUpdate(
		oldProps: AggregatedChartData,
		_oldState: {
			options: Highcharts.Options;
		},
	): void {
		if (oldProps !== this.props) this.init();
	}
	init(): void {
		const agg = levelInvert(
			aggregate(this.props.data, this.props.rounder),
			0,
		);
		const meUptime = agg.get(this.props.config.selfMacAddress);
		if (!meUptime) {
			this.setState({
				options: { title: { text: this.props.title + ": No Data." } },
			});
			return;
		}
		// exclude data of device calling nmap
		agg.delete(this.props.config.selfMacAddress);
		const totalMeUptime = lazy(meUptime.values()).sum();
		const logIntervalMS = 1000 * 60 * this.props.config.logIntervalMinutes;
		let minDistance = Infinity;

		const hncounts = _([...this.props.deviceInfos.values()])
			.flatMap((p) => p.hostnames)
			.countBy((z) => z)
			.value();
		const ipcounts = _([...this.props.deviceInfos.values()])
			.flatMap((p) => p.ips)
			.countBy((z) => z)
			.value();

		function getNiceHostname(info: DeviceInfo) {
			if (info.displayname) return info.displayname;
			if (info.hostnames.length > 0)
				return minBy(info.hostnames, (p) => hncounts[p]);
			if (info.ips.length > 0) return minBy(info.ips, (p) => ipcounts[p]);
			return null;
		}

		const data = [...agg.entries()]
			.filter(
				([_mac, vals]) =>
					lazy(vals.values()).sum() >=
					totalMeUptime * this.props.config.minimumUptime,
			)
			.map<Highcharts.SeriesLineOptions>(([mac, map]) => {
				const info = this.props.deviceInfos.get(mac);
				const footer = `
				<p><strong>MAC</strong>: ${mac} ${info?.vendor?.join(", ") || "???"}</p><br/>
				<p><strong>Hostnames</strong>:<br/>${
					info?.hostnames?.join("<br/>") || "???"
				}</p><br/>
				<p><strong>IPs</strong>:<br/>${info?.ips?.join("<br/>") || "???"}</p>
			`;
				return {
					name: (info && getNiceHostname(info)) || mac,
					type: "line",
					tooltip: {
						footerFormat: footer,
					},
					data: lazy(map)
						.mapToTuple(([time, amount]) => [
							time,
							Math.round(
								100 * uptimePart(amount, meUptime.get(time)),
							),
						])
						.intersplice((left, right) => {
							const distance = right[0] - left[0];
							if (distance < minDistance) minDistance = distance;
							if (distance >= minDistance * 2)
								return [
									[left[0] + logIntervalMS, null],
									[right[0] - logIntervalMS, null],
								] as [number, number | null][];
							else return [];
						})
						.collect(),
				};
			});
		data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
		let showHideFlag = false;
		const co: Highcharts.Options = {
			chart: { type: "line", zoomType: "x" },
			title: { text: this.props.title },
			time: { useUTC: true },
			xAxis: {
				type: "datetime",
			},
			tooltip: {
				valueSuffix: "%",
			},
			plotOptions: {
				line: { marker: { enabled: false }, animation: false },
				series: {
					events: {
						legendItemClick() {
							const chart = this.chart;
							const series = chart.series;
							if (this.index === 0) {
								if (!showHideFlag) {
									series.forEach((series) => series.hide());
								} else {
									series.forEach((series) => series.show());
								}
								showHideFlag = !showHideFlag;
								this.hide();
							}
						},
					},
				},
			},
			yAxis: {
				title: { text: "Online" },
				labels: { format: "{value:%.0f}%" },
				min: 0,
				max: 100,
			},
			/*legend: {
						layout: "vertical",
					},*/
			// tooltip: {},
			series: [
				{
					name: "Show/Hide all",
					visible: true,
					type: "line",
				},
				...data,
			],
		};
		if (this.props.highchartsOptions) this.props.highchartsOptions(co);
		this.chartOptions = co;
	}
	render(): React.ReactElement {
		return (
			<ReactChart
				options={this.chartOptions}
				callback={(chart: Highcharts.Chart) => (this.chart = chart)}
			/>
		);
	}
}
