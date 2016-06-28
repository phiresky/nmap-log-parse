import { Config } from './config';
import { Database } from './db';
import { NmapLog } from './db';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { lazy } from './lazy';
import { levelInvert, DateRounder, roundDate } from './util';
import * as Highcharts from 'highcharts';

function aggregate(datas: NmapLog[], rounder: DateRounder): Map<number, Map<string, number>> {
    const map = new Map<number, Map<string, number>>();
    lazy(datas)
    .map(log => ({
        time: rounder(new Date(log.time)).getTime(),
        devices: log.devices
    }))
    .sort(log => log.time)
    .forEach(data => {
        if (!map.has(data.time)) map.set(data.time, new Map());
        const map2 = map.get(data.time) !;
        for (const dev of data.devices) map2.set(dev, (map2.get(dev) || 0) + 1);
    });
    return map;
}

class ReactChart extends React.Component<{ options: HighchartsOptions }, {}> {
    chart: HighchartsChartObject;
    container: HTMLDivElement;
    // When the DOM is ready, create the chart.
    componentDidMount() {
        this.chart = new Highcharts.Chart(this.container, this.props.options);
    }
    //Destroy chart before unmount.
    componentWillUnmount() {
        this.chart.destroy();
    }
    componentDidUpdate(oldProps: {options: HighchartsOptions}) {
        if(oldProps.options === this.props.options) return;
        if (this.chart) this.chart.destroy();
        this.chart = new Highcharts.Chart(this.container, this.props.options);
    }
    //Create the div which the chart will be rendered to.
    render() {
        return <div ref={x => this.container = x} />
    }
}

type AggCP = { config: Config, db: Database, data: NmapLog[], title: string, rounder: DateRounder };
class AggregatedChart extends React.Component<AggCP, { options: HighchartsOptions }> {
    constructor(props: AggCP) {
        super(props);
        this.state = { options: { title: { text: "Loading..." } } };
        this.init();
    }
    componentDidUpdate(oldProps: AggCP, oldState: {options: HighchartsOptions}) {
        if(oldProps !== this.props) this.init();
    }
    async init() {
        console.log("reiniting");
        const agg = levelInvert(aggregate(this.props.data, this.props.rounder), 0);
        const meUptime = agg.get(this.props.config.selfMacAddress) !;
        const totalMeUptime = lazy(meUptime.values()).sum();
        const logIntervalMS = 1000 * 60 * this.props.config.logIntervalMinutes;
        let minDistance = Infinity;
        const data = await lazy(agg)
            .filter(([mac, vals]) => lazy(vals.values()).sum() >= totalMeUptime * this.props.config.minimumUptime)
            .mapAsync(async ([mac, map]) => {
                const info = await this.props.db.getDeviceInfo(mac);
                return {
                    name: info.displayname || info.hostnames[0] || info.ips[0] || mac,
                    tooltip: {
                        footerFormat: `
                            <p><strong>MAC</strong>: ${mac} ${info.vendor}</p><br/>
                            <p><strong>Hostnames</strong>: <ul>${info.hostnames.map(h => `<li>${h}</li>`)}</ul></p><br/>
                            <p><strong>IPs</strong>: <ul>${info.ips.map(i => `<li>${i}</li>`)}</ul></p>
                        `
                    },
                    data: lazy(map)
                        .mapToTuple(([time, amount]) => [time, (100 * amount / meUptime.get(time)) | 0])
                        .intersplice((left, right) => {
                            const distance = (right[0] - left[0]);
                            if (distance < minDistance) minDistance = distance;
                            if (distance >= minDistance * 2)
                                return [[left[0] + logIntervalMS, null], [right[0] - logIntervalMS, null]] as [number, number | null][];
                            else return [];
                        }).collect()
                }
            });
        Highcharts.setOptions({ global: { useUTC: false } });
        this.setState({
            options: {
                chart: { type: 'line', zoomType: 'x' },
                title: { text: this.props.title },
                xAxis: {
                    type: 'datetime',
                    //minRange: 14 * 24 * 60 * 60 * 1000
                },
                tooltip: {
                    valueSuffix: '%'
                },
                plotOptions: { line: { marker: { enabled: false }, animation: false } },
                yAxis: {
                    title: { text: 'Online' },
                    labels: { format: "{value:%.0f}%" },
                    min: 0,
                    max: 100
                },
                // tooltip: {},
                series: data.collect()
            }
        });
    }
    render() {
        return <ReactChart options={this.state.options} />;
    }
}
type Granularities = [string, DateRounder][];
type GranCP = { config: Config, db: Database, data: NmapLog[], initialGranularity: string,
    title: string, granularities: Granularities, offsetter?: DateRounder };
class GranularityChoosingChart extends React.Component<GranCP, { granularity: string }> {
    constructor(props: GranCP) {
        super(props);
        this.state = { granularity: props.initialGranularity };
    }
    render() {
        const rounder = lazy(this.props.granularities).filter(k => k[0] === this.state.granularity).first()[1];
        let rounder2 = rounder;
        if(this.props.offsetter) rounder2 = date => this.props.offsetter!(rounder(date));
        return (
            <div>Granularity: <select
                value={this.state.granularity}
                onChange={e => this.setState({granularity: (e.target as HTMLSelectElement).value})}
            >{this.props.granularities.map(
                ([name, rounder]) => <option key={name} value={name}>{name}</option>
            ) }</select>
                <AggregatedChart rounder={rounder2} {...this.props} />
            </div>
        )
    }
}
function offsetToSingleDay(d: Date) {
    d.setFullYear(1970); d.setMonth(0, 1);
    return d;
}
function offsetToSingleWeek(d: Date) {
    d.setFullYear(1970);
    d.setMonth(0, d.getDay() + 5);
    return d;
}
export class Gui extends React.Component<{ data: NmapLog[], config: Config, db: Database }, {}> {
    granularities: Granularities = [
        ["Weekly", date => roundDate(date, 7, 24)],
        ["Daily", date => roundDate(date, 1, 24)],
        ["3 hourly", date => roundDate(date, 1, 3)],
        ["hourly", date => roundDate(date, 1, 1)],
        ["20 minutes", date => roundDate(date, 1, 1, 20)]
    ]
    render() {
        return (
            <div>
                <GranularityChoosingChart granularities={this.granularities} initialGranularity="Weekly" 
                    title="All Time" {...this.props} />
                <GranularityChoosingChart granularities={this.granularities.slice(1)} initialGranularity="3 hourly"
                    title="Weekly" offsetter={offsetToSingleWeek} {...this.props} />
                <GranularityChoosingChart granularities={this.granularities.slice(2)} initialGranularity="20 minutes"
                    title="Daily" offsetter={offsetToSingleDay} {...this.props} />
            </div>
        );
    }
}