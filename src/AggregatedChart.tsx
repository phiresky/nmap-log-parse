import * as Highcharts from "highcharts";
import _, { minBy } from "lodash";
import * as React from "react";
import { Config } from "./config";
import { DeviceInfo, NmapLog } from "./db";
import { ReactChart } from "./gui";
import { lazy } from "./lazy";
import { assignDeep, DateRounder, levelInvert } from "./util";
export type AggregatedChartData = SingleChartData & { rounder: DateRounder };

export type CommonChartData = {
	data: NmapLog[];
	config: Config;
	deviceInfos: Map<string, DeviceInfo & { upCount: number }>;
};
export type SingleChartData = CommonChartData & {
	title: string;
	highchartsOptions?: Highcharts.Options;
};
export function aggregate(
	datas: NmapLog[],
	rounder: DateRounder,
): Map<number, Map<string, number>> {
	const map = new Map<number, Map<string, number>>();
	lazy(datas)
		.flatMap(log => {
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
		.sort(log => log.time)
		.forEach(data => {
			if (!map.has(data.time)) map.set(data.time, new Map());
			const map2 = map.get(data.time)!;
			for (const dev of data.devices)
				map2.set(dev, (map2.get(dev) || 0) + 1);
		});
	return map;
}

export class AggregatedChart extends React.Component<
	AggregatedChartData,
	{
		options: Highcharts.Options;
	}
> {
	constructor(props: AggregatedChartData) {
		super(props);
		this.state = {
			options: { title: { text: props.title + ": Loading..." } },
		};
		this.init();
	}
	componentDidUpdate(
		oldProps: AggregatedChartData,
		oldState: {
			options: Highcharts.Options;
		},
	) {
		if (oldProps !== this.props) this.init();
	}
	async init() {
		const agg = levelInvert(
			aggregate(this.props.data, this.props.rounder),
			0,
		);
		const meUptime = agg.get(this.props.config.selfMacAddress);
		if (!meUptime) {
			// wait for component mount
			await new Promise(res => setTimeout(res, 0));
			this.setState({
				options: { title: { text: this.props.title + ": No Data." } },
			});
			return;
		}
		agg.delete(this.props.config.selfMacAddress);
		const totalMeUptime = lazy(meUptime.values()).sum();
		const logIntervalMS = 1000 * 60 * this.props.config.logIntervalMinutes;
		let minDistance = Infinity;
		{
			const hncounts = _([...this.props.deviceInfos.values()])
				.flatMap(p => p.hostnames)
				.countBy(z => z)
				.value();
			const ipcounts = _([...this.props.deviceInfos.values()])
				.flatMap(p => p.ips)
				.countBy(z => z)
				.value();

			var getNiceHostname = function getNiceHostname(info: DeviceInfo) {
				if (info.displayname) return info.displayname;
				if (info.hostnames.length > 0)
					return minBy(info.hostnames, p => hncounts[p]);
				if (info.ips.length > 0)
					return minBy(info.ips, p => ipcounts[p]);
				return null;
			};
		}
		const data = await lazy(agg)
			.filter(
				([mac, vals]) =>
					lazy(vals.values()).sum() >=
					totalMeUptime * this.props.config.minimumUptime,
			)
			.map(([mac, map]) => {
				const info = this.props.deviceInfos.get(mac)!;
				return {
					name: getNiceHostname(info) || mac,
					tooltip: {
						footerFormat: `
                            <p><strong>MAC</strong>: ${mac} ${
							info.vendor
						}</p><br/>
                            <p><strong>Hostnames</strong>:<br/>${info.hostnames.join(
								"<br/>",
							)}</p><br/>
                            <p><strong>IPs</strong>:<br/>${info.ips.join(
								"<br/>",
							)}</p>
                        `,
					},
					data: lazy(map)
						.mapToTuple(([time, amount]) => [
							time,
							((100 * amount) / meUptime.get(time)) | 0,
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
			})
			.sort(no => no.name);
		Highcharts.setOptions({ global: { useUTC: false } });
		this.setState({
			options: assignDeep(
				{
					chart: { type: "line", zoomType: "x" },
					title: { text: this.props.title },
					xAxis: {
						type: "datetime",
					},
					tooltip: {
						valueSuffix: "%",
					},
					plotOptions: {
						line: { marker: { enabled: false }, animation: false },
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
					series: data.collect(),
				},
				this.props.highchartsOptions,
			),
		});
	}
	render() {
		return <ReactChart options={this.state.options} />;
	}
}
