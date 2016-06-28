import {Config} from './main';
import {Database} from './db';
import {NmapLog} from './db';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {lazy} from './lazy';
import {levelInvert, DateRounder, roundDate} from './util';
import * as Highcharts from 'highcharts';

function aggregate(datas: NmapLog[], rounder: DateRounder): Map<number, Map<string, number>> {
    const map = new Map<number, Map<string, number>>();
    for (const data of datas) {
        const rounded = rounder(new Date(data.time)).getTime();
        if (!map.has(rounded)) map.set(rounded, new Map());
        const map2 = map.get(rounded) !;
        for (const dev of data.devices) map2.set(dev, (map2.get(dev) || 0) + 1);
    }
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
    componentDidUpdate() {
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
    async init() {
        const agg = levelInvert(aggregate(this.props.data, this.props.rounder), 0);
        const meUptime = lazy(agg.get(this.props.config.selfMacAddress) !.values()).sum();
        const logIntervalMS = 1000 * 60 * this.props.config.logIntervalMinutes;
        let minDistance = Infinity;
        const data = await lazy(agg)
            .filter(([mac, vals]) => lazy(vals.values()).sum() >= meUptime * this.props.config.minimumUptime)
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
                    data: lazy(map).intersplice((left, right) => {
                        const distance = (right[0] - left[0]);
                        if (distance < minDistance) minDistance = distance;
                        if (distance >= minDistance * 2)
                            return [[left[0] + logIntervalMS, null], [right[0] - logIntervalMS, null]] as [number, number | null][];
                        else return [];
                    }).collect()
                }
            });
        this.setState({
            options: {
                chart: { type: 'line', zoomType: 'x' },
                title: { text: this.props.title },
                xAxis: {
                    type: 'datetime',
                    //minRange: 14 * 24 * 60 * 60 * 1000
                },
                plotOptions: { line: { marker: { enabled: false }, animation: false } },
                yAxis: {
                    title: { text: 'Online' },
                    labels: { format: "{value:%.0f}" },
                    min: 0
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
export class Gui extends React.Component<{ data: NmapLog[], config: Config, db: Database }, {}> {
    render() {
        return (
            <div>
                <AggregatedChart rounder={date => roundDate(date, 7, 24) } title="weekly" {...this.props} />
                <AggregatedChart rounder={date => roundDate(date, 1, 24) } title="daily" {...this.props} />
                <AggregatedChart rounder={date => roundDate(date, 1, 3) } title="3 hourly" {...this.props} />
                <AggregatedChart rounder={date => roundDate(date, 1, 1) } title="hourly" {...this.props} />
            </div>
        );
    }
}