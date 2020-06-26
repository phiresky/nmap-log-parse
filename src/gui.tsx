import * as Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import * as React from "react";
import { CommonChartData } from "./AggregatedChart";
import { CustomyChart, presets } from "./CustomyChart";
import { DeviceInfo } from "./db";
import {
	Granularities,
	GranularityChoosingChart,
} from "./GranularityChoosingChart";
import { lazy } from "./lazy";
import { roundDate } from "./util";

export class ReactChart extends React.Component<
	{
		options: Highcharts.Options;
		callback: (chart) => void;
	},
	{}
> {
	chart = {};
	componentDidUpdate(oldProps: { options: Highcharts.Options }) {
		/*if (!this.chart) return;
		if (oldProps.options === this.props.options) return;
		if (this.chart.series.length > 0) {
			//this.chart.destroy();
			lazy(this.chart.series)
				.zipWith(this.props.options.series!, (series, newData) => {
					series.setData(newData.data!);
				})
				.collect();
		} else
			this.chart = new Highcharts.Chart(
				this.container,
				this.props.options,
			);*/
	}
	//Create the div which the chart will be rendered to.
	render() {
		return (
			<HighchartsReact
				highcharts={Highcharts}
				options={this.props.options}
				callback={this.props.callback}
			/>
		);
	}
}

const Ul = ({ list }: { list: string[] }) => (
	<ul>
		{list.map((str, i) => (
			<li key={i}>{str}</li>
		))}
	</ul>
);
const HostInfoLine = (
	info: DeviceInfo & { mac: string; upTime: number; upRelative: number },
) => (
	<tr>
		{[
			info.displayname,
			`${info.mac} ${info.vendor.length > 0 ? `(${info.vendor})` : ""}`,
			<Ul list={info.hostnames} />,
			<Ul list={info.ips} />,
			info.upTime.toFixed(0) + "h",
			`${(info.upRelative * 100) | 0}%`,
		].map((x, i) => (
			<td key={i}>{x}</td>
		))}
	</tr>
);

export const GuiContainer = ({ dataUsage = 0, children = {} }) => (
	<div className="container">
		<div className="page-header">
			<h1>Who's in my network?</h1>{" "}
			<a href="https://github.com/phiresky/nmap-log-parse">
				Source Code on GitHub
			</a>
		</div>
		{children}
		<hr />
		<footer>
			<button
				className="btn btn-danger btn-sm"
				onClick={e => {
					e.preventDefault();
					indexedDB.deleteDatabase("NmapLogDatabase");
				}}
			>
				Clear local database
				{dataUsage > 0 && (
					<span>
						(
						{(dataUsage / 1e6).toLocaleString(undefined, {
							maximumFractionDigits: 2,
						})}{" "}
						MB)
					</span>
				)}
			</button>
		</footer>
	</div>
);
export const ProgressGui = (props: {
	progress: number;
	total?: number;
	prefix: string;
	suffix: string;
}) => (
	<GuiContainer>
		<div className="progress">
			<div
				className="progress-bar progress-bar-info progress-bar-striped active"
				style={{
					transition: "none",
					width:
						(
							(props.total
								? props.progress / props.total
								: 1 / ((-1 / 50) * props.progress - 1) + 1) *
							100
						).toFixed(1) + "%",
				}}
			>
				{props.prefix}
				{props.progress}
				{props.suffix}
			</div>
		</div>
	</GuiContainer>
);

export class Gui extends React.Component<
	CommonChartData & { dataUsage: number },
	{}
> {
	granularities: Granularities = [
		["Weekly", date => roundDate(date, 7, 24)],
		["Daily", date => roundDate(date, 1, 24)],
		["3 hourly", date => roundDate(date, 1, 3)],
		["hourly", date => roundDate(date, 1, 1)],
		["20 minutes", date => roundDate(date, 1, 1, 20)],
	];
	render() {
		const meUptime = this.props.deviceInfos.get(
			this.props.config.selfMacAddress,
		)!.upCount;
		return (
			<GuiContainer dataUsage={this.props.dataUsage}>
				<GranularityChoosingChart
					granularities={this.granularities}
					initialGranularity="3 hourly"
					title="Last Week"
					highchartsOptions={{}}
					{...this.props}
					offsetter={date =>
						Date.now() - date.getTime() < 1000 * 60 * 60 * 24 * 7
							? date
							: null
					}
				/>
				<hr />
				<GranularityChoosingChart
					granularities={this.granularities}
					initialGranularity="Daily"
					title="Last Month"
					highchartsOptions={{}}
					{...this.props}
					offsetter={date =>
						Date.now() - date.getTime() < 1000 * 60 * 60 * 24 * 31
							? date
							: null
					}
				/>
				<hr />
				<GranularityChoosingChart
					granularities={this.granularities.slice(0, 4)}
					initialGranularity="Weekly"
					title="All Time"
					highchartsOptions={{}}
					{...this.props}
				/>
				<hr />
				<GranularityChoosingChart
					granularities={this.granularities.slice(1)}
					initialGranularity="3 hourly"
					title={presets.weekly.title}
					highchartsOptions={{
						tooltip: {
							headerFormat: presets.weekly.headerFormat,
						},
						xAxis: {
							labels: presets.weekly.xAxisLabels,
						},
					}}
					offsetter={presets.weekly.offset}
					{...this.props}
				/>
				<hr />
				<GranularityChoosingChart
					granularities={this.granularities.slice(2)}
					initialGranularity="20 minutes"
					title={presets.daily.title}
					highchartsOptions={{
						tooltip: {
							headerFormat: presets.daily.headerFormat,
						},
						xAxis: {
							labels: presets.daily.xAxisLabels,
						},
					}}
					offsetter={presets.daily.offset}
					{...this.props}
				/>
				<hr />
				<CustomyChart
					granularities={this.granularities}
					{...this.props}
				/>
				<hr />
				<h3>Totals</h3>
				<div className="table-responsive">
					<table className="table">
						<thead>
							<tr>
								{"Name,Mac,Hostnames,IPs,Recorded Uptime,Average Uptime"
									.split(",")
									.map(x => (
										<th key={x}>{x}</th>
									))}
							</tr>
						</thead>
						<tbody>
							{lazy(this.props.deviceInfos)
								.sort(([_, info]) => -info.upCount)
								.map(([mac, h]) => (
									<HostInfoLine
										upTime={
											(h.upCount *
												this.props.config
													.logIntervalMinutes) /
											60
										}
										upRelative={h.upCount / meUptime}
										key={mac}
										mac={mac}
										{...h}
									/>
								))
								.collect()}
						</tbody>
					</table>
				</div>
			</GuiContainer>
		);
	}
}
