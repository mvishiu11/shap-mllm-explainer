import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

interface TextAttributionViewProps {
  text: string;
  attributions: number[];
  granularity: string;
}

export function TextAttributionView({ text, attributions, granularity }: TextAttributionViewProps) {
  const [visualizationType, setVisualizationType] = useState<string>("heatmap");

  // Tokenize text (simple word-based for demo)
  const tokens = text.split(/\s+/).filter(Boolean);

  // Normalize attributions to match tokens if needed
  const normalizedAttributions = attributions.slice(0, tokens.length);

  // Calculate stats
  const maxAttr = Math.max(...normalizedAttributions);
  const minAttr = Math.min(...normalizedAttributions);
  const avgAttr = normalizedAttributions.reduce((a, b) => a + b, 0) / normalizedAttributions.length;

  // Prepare chart data
  const chartData = tokens.map((token, idx) => ({
    token: token.length > 10 ? token.substring(0, 10) + "..." : token,
    value: normalizedAttributions[idx] || 0,
    fullToken: token,
  }));

  // Color scale for heatmap
  const getHeatmapColor = (value: number) => {
    const normalized = (value - minAttr) / (maxAttr - minAttr);

    if (normalized > 0.7) return "bg-red-500 text-white";
    if (normalized > 0.5) return "bg-orange-400 text-white";
    if (normalized > 0.3) return "bg-yellow-400 text-slate-900";
    if (normalized > 0.1) return "bg-green-300 text-slate-900";
    return "bg-blue-200 text-slate-900";
  };

  const getHeatmapOpacity = (value: number) => {
    const normalized = (value - minAttr) / (maxAttr - minAttr);
    return 0.3 + normalized * 0.7;
  };

  const getBarColor = (value: number) => {
    const normalized = (value - minAttr) / (maxAttr - minAttr);

    if (normalized > 0.7) return "#ef4444";
    if (normalized > 0.5) return "#fb923c";
    if (normalized > 0.3) return "#facc15";
    if (normalized > 0.1) return "#86efac";
    return "#93c5fd";
  };

  return (
    <div className="space-y-4">
      {/* Visualization Type Selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Text Attribution Visualization</CardTitle>
              <CardDescription>
                {granularity} level attributions for {tokens.length} units
              </CardDescription>
            </div>
            <ToggleGroup type="single" value={visualizationType} onValueChange={(v) => v && setVisualizationType(v)}>
              <ToggleGroupItem value="heatmap">Heatmap</ToggleGroupItem>
              <ToggleGroupItem value="bar">Bar Chart</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          {visualizationType === "heatmap" ? (
            <div className="space-y-4">
              {/* Heatmap View */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap gap-2">
                  {tokens.map((token, idx) => (
                    <div
                      key={idx}
                      className={`px-3 py-2 rounded transition-all hover:scale-105 cursor-pointer ${getHeatmapColor(
                        normalizedAttributions[idx] || 0
                      )}`}
                      style={{
                        opacity: getHeatmapOpacity(normalizedAttributions[idx] || 0),
                      }}
                      title={`${token}: ${(normalizedAttributions[idx] || 0).toFixed(4)}`}
                    >
                      {token}
                    </div>
                  ))}
                </div>
              </div>

              {/* Color Legend */}
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Low</span>
                <div className="flex gap-1">
                  <div className="w-8 h-4 bg-blue-200 rounded" />
                  <div className="w-8 h-4 bg-green-300 rounded" />
                  <div className="w-8 h-4 bg-yellow-400 rounded" />
                  <div className="w-8 h-4 bg-orange-400 rounded" />
                  <div className="w-8 h-4 bg-red-500 rounded" />
                </div>
                <span className="text-slate-600 dark:text-slate-400">High</span>
              </div>
            </div>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="token"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload[0]) {
                        return (
                          <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded shadow-lg">
                            <div className="text-sm">
                              <div className="text-slate-900 dark:text-slate-100">
                                {payload[0].payload.fullToken}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                Value: {payload[0].value?.toFixed(4)}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.value)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Attribution Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Maximum</div>
              <div className="text-2xl text-slate-900 dark:text-slate-100">
                {maxAttr.toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Average</div>
              <div className="text-2xl text-slate-900 dark:text-slate-100">
                {avgAttr.toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Minimum</div>
              <div className="text-2xl text-slate-900 dark:text-slate-100">
                {minAttr.toFixed(4)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Contributors */}
      <Card>
        <CardHeader>
          <CardTitle>Top Contributing Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tokens
              .map((token, idx) => ({ token, value: normalizedAttributions[idx] || 0, idx }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
              .map((item, rank) => (
                <div
                  key={item.idx}
                  className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">#{rank + 1}</Badge>
                    <span className="text-slate-900 dark:text-slate-100 font-mono">
                      {item.token}
                    </span>
                  </div>
                  <span className="text-slate-600 dark:text-slate-400">
                    {item.value.toFixed(4)}
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
