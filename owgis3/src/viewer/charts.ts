/**
 * Parse ncWMS CSV plot responses and render interactive Apache ECharts charts
 * (parity with OWGIS 2 Highcharts time-series / vertical-profile plots).
 */

import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  ToolboxComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsType } from "echarts/core";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  ToolboxComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export type NcwmsCsvSeries = {
  /** Comment lines such as Latitude / Longitude. */
  meta: string[];
  /** Column header for X (Time or Depth). */
  xLabel: string;
  /** Column header for Y (variable + units). */
  yLabel: string;
  /** Parsed numeric points `[x, y]` — x is time ms for series, depth for profiles. */
  points: Array<[number, number]>;
  /** Whether X values are timestamps. */
  xIsTime: boolean;
};

let activeChart: EChartsType | null = null;

/**
 * Parse an ncWMS GetTimeseries / GetVerticalProfile CSV body.
 *
 * Expected shape (OWGIS 2 / ncWMS2):
 * ```
 * # Latitude: …
 * # Longitude: …
 * Time,Variable (units)
 * 2022-01-01T19:00:00.000Z,25.1
 * ```
 *
 * @param csv raw response text
 * @returns parsed series or null if unusable
 */
export function parseNcwmsCsv(csv: string): NcwmsCsvSeries | null {
  let text = csv.replace(/^.*null.*$/gim, "").replace(/^\s*\n/gm, "");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return null;
  }

  const meta = lines.filter((line) => line.startsWith("#"));
  const dataLines = lines.filter((line) => !line.startsWith("#"));
  if (dataLines.length < 2) {
    return null;
  }

  const header = dataLines[0].split(",").map((part) => part.trim());
  const xLabel = header[0] ?? "X";
  const yLabel = header[1] ?? "Value";
  const xIsTime = /time/i.test(xLabel);

  const points: Array<[number, number]> = [];
  for (const row of dataLines.slice(1)) {
    const [rawX, rawY] = row.split(",");
    if (rawX === undefined || rawY === undefined) {
      continue;
    }
    const y = Number(rawY.trim());
    if (!Number.isFinite(y)) {
      continue;
    }
    if (xIsTime) {
      const t = Date.parse(rawX.trim());
      if (!Number.isFinite(t)) {
        continue;
      }
      points.push([t, y]);
    } else {
      const x = Number(rawX.trim());
      if (!Number.isFinite(x)) {
        continue;
      }
      points.push([x, y]);
    }
  }

  if (!points.length) {
    return null;
  }
  return { meta, xLabel, yLabel, points, xIsTime };
}

/**
 * Dispose any chart currently bound to the plot modal container.
 */
export function disposePlotChart(): void {
  if (activeChart) {
    activeChart.dispose();
    activeChart = null;
  }
}

/**
 * Render a dynamic time-series chart into a host element.
 *
 * @param host chart container
 * @param series parsed CSV series
 * @param title chart title
 * @param units optional units for tooltip
 * @returns chart instance
 */
export function renderTimeSeriesChart(
  host: HTMLElement,
  series: NcwmsCsvSeries,
  title: string,
  units?: string,
): EChartsType {
  disposePlotChart();
  const chart = echarts.init(host);
  activeChart = chart;
  const subtitle = series.meta.map((line) => line.replace(/^#\s*/, "")).join(" · ");
  chart.setOption({
    title: {
      text: title,
      subtext: subtitle || undefined,
      left: "center",
      textStyle: { fontSize: 14 },
      subtextStyle: { fontSize: 11, color: "#555" },
    },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: unknown) => {
        const num = Number(value);
        const unit = units ? ` ${units}` : "";
        return Number.isFinite(num) ? `${num.toFixed(2)}${unit}` : String(value);
      },
    },
    toolbox: {
      right: 12,
      feature: {
        dataZoom: { yAxisIndex: "none" },
        restore: {},
        saveAsImage: { name: "owgis3-timeseries" },
      },
    },
    grid: { left: 56, right: 24, top: 64, bottom: 72 },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 8 }],
    xAxis: {
      type: series.xIsTime ? "time" : "value",
      name: series.xLabel,
      nameLocation: "middle",
      nameGap: 28,
      axisLine: { show: true },
    },
    yAxis: {
      type: "value",
      name: series.yLabel,
      nameLocation: "middle",
      nameGap: 40,
      axisLine: { show: true },
      scale: true,
    },
    series: [
      {
        type: "line",
        showSymbol: false,
        data: series.points,
        lineStyle: { width: 1.5, color: "#1a7979" },
        areaStyle: { color: "rgba(26, 121, 121, 0.12)" },
      },
    ],
  });
  return chart;
}

/**
 * Render a dynamic vertical-profile chart (depth on Y, value on X — inverted like OWGIS 2).
 *
 * @param host chart container
 * @param series parsed CSV series
 * @param title chart title
 * @param units optional units for tooltip
 * @returns chart instance
 */
export function renderVerticalProfileChart(
  host: HTMLElement,
  series: NcwmsCsvSeries,
  title: string,
  units?: string,
): EChartsType {
  disposePlotChart();
  const chart = echarts.init(host);
  activeChart = chart;
  const subtitle = series.meta.map((line) => line.replace(/^#\s*/, "")).join(" · ");
  // OWGIS 2 uses inverted axes: depth vertical, value horizontal.
  const profilePoints = series.points.map(([depth, value]) => [value, depth]);
  chart.setOption({
    title: {
      text: title,
      subtext: subtitle || undefined,
      left: "center",
      textStyle: { fontSize: 14 },
      subtextStyle: { fontSize: 11, color: "#555" },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        const point = list[0] as { value?: [number, number] } | undefined;
        const value = point?.value;
        if (!value) {
          return "";
        }
        const unit = units ? ` ${units}` : "";
        return `Depth ${value[1]}<br/>${series.yLabel}: ${Number(value[0]).toFixed(2)}${unit}`;
      },
    },
    toolbox: {
      right: 12,
      feature: {
        restore: {},
        saveAsImage: { name: "owgis3-vertical-profile" },
      },
    },
    grid: { left: 64, right: 28, top: 64, bottom: 56 },
    xAxis: {
      type: "value",
      name: series.yLabel,
      nameLocation: "middle",
      nameGap: 28,
      scale: true,
      axisLine: { show: true },
    },
    yAxis: {
      type: "value",
      name: series.xLabel,
      nameLocation: "middle",
      nameGap: 44,
      inverse: true,
      axisLine: { show: true },
    },
    series: [
      {
        type: "line",
        showSymbol: false,
        data: profilePoints,
        lineStyle: { width: 1.5, color: "#1a5f9e" },
      },
    ],
  });
  return chart;
}

/**
 * Export the active chart as a PNG data URL, or null if none.
 *
 * @returns PNG data URL
 */
export function chartToPngDataUrl(): string | null {
  if (!activeChart) {
    return null;
  }
  return activeChart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#fff" });
}

/**
 * Resize the active chart to its host (call on modal open / window resize).
 */
export function resizePlotChart(): void {
  activeChart?.resize();
}
