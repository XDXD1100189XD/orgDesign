'use client';

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { fmtNum } from '@/lib/costSchema';
import { CHART_COLORS, pivotToChartData } from '@/lib/story/pivotUtils';
import type { PivotConfig, PivotData } from '@/lib/story/pivotUtils';

const tickFmt = (v: number | string) => fmtNum(Number(v));
const tooltipFmt = (v: unknown) => typeof v === 'number' ? fmtNum(v) : String(v ?? '');

export function PivotChart({ pivotData, config, mini = false }: {
  pivotData: PivotData;
  config: PivotConfig;
  mini?: boolean;
}) {
  const chartData = pivotToChartData(pivotData);
  const { colKeys } = pivotData;
  const { chartType, valueField } = config;
  const palette = config.palette.length ? config.palette : CHART_COLORS;
  const clr = (i: number) => palette[i % palette.length];
  const h = mini ? 100 : 320;
  const margin = mini
    ? { top: 2, right: 2, left: 2, bottom: 2 }
    : { top: 10, right: 20, left: 10, bottom: 64 };

  if (!chartData.length || !colKeys.length) {
    return mini ? null : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: h, color: '#999', fontSize: 13 }}>
        No data
      </div>
    );
  }

  const colLabel = (ck: string) => ck === 'value' ? (valueField ?? 'Count') : ck;

  if (chartType === 'pie') {
    const pieData = pivotData.rows.map(r => ({
      name: r.rowKey,
      value: colKeys.length === 1 ? (r.values[colKeys[0]] ?? 0) : (r.total ?? 0),
    }));
    return (
      <ResponsiveContainer width="100%" height={h}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={mini ? 38 : 110}
            label={mini ? undefined : ({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
            labelLine={!mini}
          >
            {pieData.map((_, i) => <Cell key={i} fill={clr(i)} />)}
          </Pie>
          {!mini && <Tooltip formatter={tooltipFmt} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'radar') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="rgba(0,0,0,0.07)" />
          <PolarAngleAxis dataKey="name" tick={mini ? false : { fontSize: 11, fill: '#666' }} />
          {!mini && <PolarRadiusAxis tick={{ fontSize: 9, fill: '#999' }} />}
          {colKeys.map((ck, i) => (
            <Radar
              key={ck}
              name={colLabel(ck)}
              dataKey={ck}
              stroke={clr(i)}
              fill={clr(i)}
              fillOpacity={0.15}
            />
          ))}
          {!mini && <Legend />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={chartData} margin={margin}>
          {!mini && <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />}
          {!mini && <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#555' }} angle={-35} textAnchor="end" interval={0} />}
          {!mini && <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={tickFmt} />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
          {!mini && colKeys.length > 1 && <Legend verticalAlign="top" />}
          {colKeys.map((ck, i) => (
            <Bar key={ck} dataKey={ck} name={colLabel(ck)} fill={clr(i)} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'stackedBar') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={chartData} margin={margin}>
          {!mini && <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />}
          {!mini && <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#555' }} angle={-35} textAnchor="end" interval={0} />}
          {!mini && <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={tickFmt} />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
          {!mini && <Legend verticalAlign="top" />}
          {colKeys.map((ck, i) => (
            <Bar key={ck} dataKey={ck} name={colLabel(ck)} stackId="stack" fill={clr(i)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <LineChart data={chartData} margin={margin}>
          {!mini && <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />}
          {!mini && <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#555' }} angle={-35} textAnchor="end" interval={0} />}
          {!mini && <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={tickFmt} />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
          {!mini && colKeys.length > 1 && <Legend verticalAlign="top" />}
          {colKeys.map((ck, i) => (
            <Line
              key={ck}
              type="monotone"
              dataKey={ck}
              name={colLabel(ck)}
              stroke={clr(i)}
              strokeWidth={mini ? 1.5 : 2}
              dot={mini ? false : { r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={h}>
        <AreaChart data={chartData} margin={margin}>
          {!mini && <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />}
          {!mini && <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#555' }} angle={-35} textAnchor="end" interval={0} />}
          {!mini && <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={tickFmt} />}
          {!mini && <Tooltip formatter={tooltipFmt} />}
          {!mini && colKeys.length > 1 && <Legend verticalAlign="top" />}
          {colKeys.map((ck, i) => (
            <Area
              key={ck}
              type="monotone"
              dataKey={ck}
              name={colLabel(ck)}
              stroke={clr(i)}
              fill={clr(i)}
              fillOpacity={mini ? 0.2 : 0.1}
              strokeWidth={mini ? 1.5 : 2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return null;
}
