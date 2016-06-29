import { Config } from './config';
import { NmapLog, DeviceInfo } from './db';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { lazy } from './lazy';
import { levelInvert, DateRounder, roundDate, assignDeep } from './util';
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
    componentDidUpdate(oldProps: { options: HighchartsOptions }) {
        if (oldProps.options === this.props.options) return;
        if (this.chart.series.length > 0) {
            //this.chart.destroy();
            lazy(this.chart.series).zipWith(this.props.options.series!, (series, newData) => {
                series.setData(newData.data!);
            }).collect();
        } else
            this.chart = new Highcharts.Chart(this.container, this.props.options);
    }
    //Create the div which the chart will be rendered to.
    render() {
        return <div ref={x => this.container = x} />
    }
}
type CommonChartData = { data: NmapLog[], config: Config, deviceInfos: Map<string, DeviceInfo & { upCount: number }> };
type SingleChartData = CommonChartData & { title: string, highchartsOptions?: HighchartsOptions };
type AggregatedChartData = SingleChartData & { rounder: DateRounder };
type GranularityChoosingChartData = SingleChartData & { initialGranularity: string, granularities: Granularities, offsetter?: DateRounder };
class AggregatedChart extends React.Component<AggregatedChartData, { options: HighchartsOptions }> {
    constructor(props: AggregatedChartData) {
        super(props);
        this.state = { options: { title: { text: "Loading..." } } };
        this.init();
    }
    componentDidUpdate(oldProps: AggregatedChartData, oldState: { options: HighchartsOptions }) {
        if (oldProps !== this.props) this.init();
    }
    async init() {
        const agg = levelInvert(aggregate(this.props.data, this.props.rounder), 0);
        const meUptime = agg.get(this.props.config.selfMacAddress) !;
        agg.delete(this.props.config.selfMacAddress);
        const totalMeUptime = lazy(meUptime.values()).sum();
        const logIntervalMS = 1000 * 60 * this.props.config.logIntervalMinutes;
        let minDistance = Infinity;
        const data = await lazy(agg)
            .filter(([mac, vals]) => lazy(vals.values()).sum() >= totalMeUptime * this.props.config.minimumUptime)
            .map(([mac, map]) => {
                const info = this.props.deviceInfos.get(mac) !;
                return {
                    name: info.displayname || info.hostnames[0] || info.ips[0] || mac,
                    tooltip: {
                        footerFormat: `
                            <p><strong>MAC</strong>: ${mac} ${info.vendor}</p><br/>
                            <p><strong>Hostnames</strong>:<br/>${info.hostnames.join("<br/>")}</p><br/>
                            <p><strong>IPs</strong>:<br/>${info.ips.join("<br/>")}</p>
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
            options: assignDeep({
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
            }, this.props.highchartsOptions)
        });
    }
    render() {
        return <ReactChart options={this.state.options} />;
    }
}
type Granularities = [string, DateRounder][];
class GranularityChoosingChart extends React.Component<GranularityChoosingChartData, { granularity: string }> {
    constructor(props: GranularityChoosingChartData) {
        super(props);
        this.state = { granularity: props.initialGranularity };
    }
    render() {
        const rounder = lazy(this.props.granularities).filter(k => k[0] === this.state.granularity).first()[1];
        let rounder2 = rounder;
        if (this.props.offsetter) rounder2 = date => this.props.offsetter!(rounder(date));
        return (
            <div>
                <AggregatedChart rounder={rounder2} {...this.props} />
                Granularity: <select
                value={this.state.granularity}
                onChange={e => this.setState({ granularity: (e.target as HTMLSelectElement).value }) }
                >{this.props.granularities.map(
                    ([name, rounder]) => <option key={name} value={name}>{name}</option>
                ) }</select>
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

const Ul = ({list}: { list: string[] }) => <ul>{list.map((str, i) => <li key={i}>{str}</li>) }</ul>;
const HostInfoLine = (info: DeviceInfo & { mac: string, upTime: number, upRelative: number }) =>
    <tr>
        {[
            info.displayname,
            `${info.mac} ${info.vendor.length > 0 ? `(${info.vendor})` : ""}`,
            <Ul list={info.hostnames} />,
            <Ul list={info.ips} />,
            info.upTime.toFixed(0) + "h",
            `${(info.upRelative * 100) | 0}%`,
        ]
            .map((x, i) => <td key={i}>{x}</td>)
        }
    </tr>;

export const GuiContainer = ({children = {}}) =>
    <div className="container">
        <div className="page-header"><h1>Who's in my network?</h1> <a href="https://github.com/phiresky/nmap-log-parse">Source Code on GitHub</a></div>
        {children}
        <hr/>
        <footer>
            <button className="btn btn-danger btn-sm" onClick={e => {e.preventDefault(); indexedDB.deleteDatabase("NmapLogDatabase");}}>Clear local database</button>
        </footer>
    </div>;
export const ProgressGui = (props: {progress: number, total?: number, prefix: string, suffix: string}) =>
    <GuiContainer>
        <div className="progress">
            <div className="progress-bar progress-bar-info progress-bar-striped active"
                    style={{
                        transition: "none",
                        width: (
                            (props.total ? (props.progress / props.total) : (1 / (-1 / 50 * props.progress - 1) + 1))
                            * 100).toFixed(1) + "%"
                }}>
                {props.prefix}{props.progress}{props.suffix}
            </div>
        </div>
    </GuiContainer>;
export class Gui extends React.Component<CommonChartData, {}> {
    granularities: Granularities = [
        ["Weekly", date => roundDate(date, 7, 24)],
        ["Daily", date => roundDate(date, 1, 24)],
        ["3 hourly", date => roundDate(date, 1, 3)],
        ["hourly", date => roundDate(date, 1, 1)],
        ["20 minutes", date => roundDate(date, 1, 1, 20)]
    ]
    render() {
        const meUptime = this.props.deviceInfos.get(this.props.config.selfMacAddress) !.upCount;
        return (
            <GuiContainer>
                <GranularityChoosingChart
                    granularities={this.granularities.slice(0, 4) }
                    initialGranularity="Weekly"
                    title="All Time"
                    highchartsOptions={{}} {...this.props} />
                <GranularityChoosingChart
                    granularities={this.granularities.slice(1) }
                    initialGranularity="3 hourly"
                    title="Weekly"
                    highchartsOptions={{
                        tooltip: { headerFormat: `<span style="font-size: 10px">{point.key:%A %H:%M}</span><br/>` },
                        xAxis: {
                            labels: { format: "{value:%a. %H:%M}" }
                        }
                    }}
                    offsetter={offsetToSingleWeek} {...this.props} />
                <GranularityChoosingChart
                    granularities={this.granularities.slice(2) }
                    initialGranularity="20 minutes"
                    title="Daily"
                    highchartsOptions={{
                        tooltip: { headerFormat: `<span style="font-size: 10px">{point.key:%H:%M}</span><br/>` }
                    }}
                    offsetter={offsetToSingleDay} {...this.props} />
                <h3>Totals</h3>
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>{"Name,Mac,Hostnames,IPs,Recorded Uptime,Average Uptime".split(",").map(x => <th key={x}>{x}</th>) }</tr>
                        </thead>
                        <tbody>
                            {lazy(this.props.deviceInfos).sort(([_, info]) => -info.upCount)
                                .map(([mac, h]) => <HostInfoLine upTime={h.upCount * this.props.config.logIntervalMinutes / 60} upRelative={h.upCount / meUptime} key={mac} mac={mac} {...h} />)
                                .collect()
                            }
                        </tbody>
                    </table>
                </div>
            </GuiContainer>
        );
    }
}