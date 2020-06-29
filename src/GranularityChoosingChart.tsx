import * as React from "react";
import { AggregatedChart, SingleChartData } from "./AggregatedChart";
import { lazy } from "./lazy";
import { DateRounder } from "./util";

export type Granularities = [string, DateRounder][];

export type GranularityChoosingChartData = SingleChartData & {
	initialGranularity: string;
	granularities: Granularities;
	offsetter?: DateRounder;
};

export class GranularityChoosingChart extends React.Component<
	GranularityChoosingChartData,
	{
		granularity: string;
	}
> {
	constructor(props: GranularityChoosingChartData) {
		super(props);
		this.state = { granularity: props.initialGranularity };
	}
	render() {
		const rounder = lazy(this.props.granularities)
			.filter((k) => k[0] === this.state.granularity)
			.first()[1];
		let rounder2 = rounder;
		if (this.props.offsetter)
			rounder2 = (date) => {
				const rounded = rounder(date);
				if (!rounded) return null;
				else return this.props.offsetter(rounded);
			};
		return (
			<div>
				<AggregatedChart rounder={rounder2} {...this.props} />
				Granularity:{" "}
				<select
					value={this.state.granularity}
					onChange={(e) =>
						this.setState({
							granularity: (e.target as HTMLSelectElement).value,
						})
					}
				>
					{this.props.granularities.map(([name, rounder]) => (
						<option key={name} value={name}>
							{name}
						</option>
					))}
				</select>
			</div>
		);
	}
}
