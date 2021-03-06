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
import { roundDate, uptimePart, setHighchartsOptionsForPreset } from "./util";

export class ReactChart extends React.Component<{
	options: Highcharts.Options;
	callback: (chart: Highcharts.Chart) => void;
}> {
	chart: Highcharts.Chart | null = null;
	render(): React.ReactElement {
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
			`${info.mac} ${
				info.vendor.length > 0 ? `(${info.vendor.join(", ")})` : ""
			}`,
			<Ul list={info.hostnames} />,
			<Ul list={info.ips} />,
			info.upTime.toFixed(0) + "h",
			`${(info.upRelative * 100) | 0}%`,
		].map((x, i) => (
			<td key={i}>{x}</td>
		))}
	</tr>
);

export const GuiContainer: React.FunctionComponent<{
	dataUsage?: number;
	children?: React.ReactNode;
}> = ({ dataUsage = 0, children = {} }) => (
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
				onClick={(e) => {
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
export const ProgressGui: React.FunctionComponent<{
	progress: number;
	total?: number;
	prefix: string;
	suffix: string;
}> = (props) => (
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
	CommonChartData & { dataUsage: number }
> {
	granularities: Granularities = [
		["Weekly", (date: Date): Date => roundDate(date, 7, 24)],
		["Daily", (date: Date): Date => roundDate(date, 1, 24)],
		["3 hourly", (date: Date): Date => roundDate(date, 1, 3)],
		["hourly", (date: Date): Date => roundDate(date, 1, 1)],
		["20 minutes", (date: Date): Date => roundDate(date, 1, 1, 20)],
	];
	render(): React.ReactElement {
		const me = this.props.deviceInfos.get(this.props.config.selfMacAddress);
		const meUptime = me?.upCount;
		return (
			<GuiContainer dataUsage={this.props.dataUsage}>
				<GranularityChoosingChart
					granularities={this.granularities}
					initialGranularity="3 hourly"
					title="Last Week"
					{...this.props}
					offsetter={(date) =>
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
					{...this.props}
					offsetter={(date) =>
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
					{...this.props}
				/>
				<hr />
				<GranularityChoosingChart
					granularities={this.granularities.slice(1)}
					initialGranularity="3 hourly"
					title={presets.weekly.title}
					highchartsOptions={setHighchartsOptionsForPreset.bind(
						null,
						presets.weekly,
					)}
					offsetter={presets.weekly.offset}
					{...this.props}
				/>
				<hr />
				<GranularityChoosingChart
					granularities={this.granularities.slice(2)}
					initialGranularity="20 minutes"
					title={presets.daily.title}
					highchartsOptions={setHighchartsOptionsForPreset.bind(
						null,
						presets.daily,
					)}
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
									.map((x) => (
										<th key={x}>{x}</th>
									))}
							</tr>
						</thead>
						<tbody>
							{[...this.props.deviceInfos]
								.sort(
									([_a, i1], [_b, i2]) =>
										i2.upCount - i1.upCount,
								)
								.map(([mac, h]) => (
									<HostInfoLine
										upTime={
											(h.upCount *
												this.props.config
													.logIntervalMinutes) /
											60
										}
										upRelative={uptimePart(
											h.upCount,
											meUptime,
										)}
										key={mac}
										mac={mac}
										{...h}
									/>
								))}
						</tbody>
					</table>
				</div>
			</GuiContainer>
		);
	}
}
