import * as React from "react";
import { AggregatedChart, SingleChartData } from "./AggregatedChart";
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
	render(): React.ReactElement {
		const rounder = this.props.granularities.find(
			(k) => k[0] === this.state.granularity,
		)?.[1];
		if (!rounder) return <>no rounder found</>;
		let rounder2 = rounder;
		const offsetter = this.props.offsetter;
		if (offsetter) {
			rounder2 = (date) => {
				const rounded = rounder(date);
				if (!rounded) return null;
				else return offsetter(rounded);
			};
		}
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
					{this.props.granularities.map(([name, _rounder]) => (
						<option key={name} value={name}>
							{name}
						</option>
					))}
				</select>
			</div>
		);
	}
}
