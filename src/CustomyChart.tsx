import { observer, useLocalStore } from "mobx-react-lite";
import * as React from "react";
import { CommonChartData } from "./AggregatedChart";
import {
	Granularities,
	GranularityChoosingChart,
} from "./GranularityChoosingChart";
import { DateRounder } from "./util";

export const presets = {
	weekly: {
		title: "Weekly",
		headerFormat: `<span style="font-size: 10px">{point.key:%A %H:%M}</span><br/>`,
		xAxisLabels: { format: "{value:%a. %H:%M}" },
		offset(d: Date) {
			d.setFullYear(1970);
			d.setMonth(0, d.getDay() + 5);
			return d;
		},
	},
	daily: {
		title: "Daily",
		headerFormat: `<span style="font-size: 10px">{point.key:%H:%M}</span><br/>`,
		xAxisLabels: { format: "{value:%H:%M}" },
		offset(d: Date) {
			d.setFullYear(1970);
			d.setMonth(0, 1);
			return d;
		},
	},
};

function useTwoWay<T, V>(
	initialValue: V,
	get: (t: T) => V,
	set: (v: V) => Partial<T>,
) {
	const store = useLocalStore(() => ({ value: initialValue }));
	return {
		value: store.value,
		props: {
			onChange: (e: React.ChangeEvent<T>) =>
				(store.value = get(e.currentTarget)),
			...set(store.value),
		},
	};
}
function useTwoWayDate(initialDate: Date) {
	return useTwoWay<
		Pick<HTMLInputElement, "value" | "valueAsDate">,
		Date | null
	>(
		initialDate,
		e => e.valueAsDate as Date | null,
		v => ({ value: v ? v.toISOString().slice(0, 10) : "" }),
	);
}
const defaultOldDate = new Date();
defaultOldDate.setDate(defaultOldDate.getDate() - 31);

function _CustomyChart({
	granularities,
	...props
}: { granularities: Granularities } & CommonChartData) {
	const fromDate = useTwoWayDate(defaultOldDate);
	const toDate = useTwoWayDate(new Date());

	type AggChoice = "none" | keyof typeof presets;
	const aggregationChoices = ["none", ...Object.keys(presets)] as AggChoice[];
	const data = useLocalStore(() => ({
		aggregator: aggregationChoices[0],
		offsetter: ((d: Date) => d) as DateRounder,
		active: false,
		title: "Custom Chart",
		preset: null as null | (typeof presets.daily),
		rerender() {
			this.active = true;
			this.preset =
				data.aggregator !== "none" ? presets[data.aggregator] : null;

			const offsetter = this.preset ? this.preset.offset : (d: Date) => d;
			this.offsetter = (d: Date) => {
				if (
					(fromDate.value && d < fromDate.value) ||
					(toDate.value && d > toDate.value)
				)
					return null;
				return offsetter(d);
			};
		},
	}));
	return (
		<div>
			<h3>Custom Filter</h3>
			From <input type="date" {...fromDate.props} /> To{" "}
			<input type="date" {...toDate.props} />
			Aggregator{" "}
			<select
				value={data.aggregator}
				onChange={e =>
					(data.aggregator = e.currentTarget.value as AggChoice)
				}
			>
				{aggregationChoices.map(choice => (
					<option value={choice} key={choice}>
						{choice}
					</option>
				))}
			</select>
			<button onClick={() => data.rerender()}>Render</button>
			{data.active && (
				<GranularityChoosingChart
					granularities={granularities}
					initialGranularity="20 minutes"
					title={data.title}
					highchartsOptions={{
						tooltip: {
							headerFormat: data.preset
								? data.preset.headerFormat
								: undefined,
						},
						xAxis: {
							labels: data.preset
								? data.preset.xAxisLabels
								: undefined,
						},
					}}
					offsetter={data.offsetter}
					{...props}
				/>
			)}
		</div>
	);
}
export const CustomyChart = observer(_CustomyChart);
