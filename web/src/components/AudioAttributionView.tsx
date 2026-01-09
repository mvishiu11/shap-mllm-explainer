import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { useMemo, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Play, Pause } from "lucide-react";
import { Button } from "./ui/button";

interface AudioAttributionViewProps {
  audioFile?: File | null;
  attributions: number[];
}

export function AudioAttributionView({ audioFile, attributions }: AudioAttributionViewProps) {
  const [visualizationType, setVisualizationType] = useState<string>("timeline");
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);

  const audioUrl = useMemo(() => {
    if (!audioFile) return null;
    return URL.createObjectURL(audioFile);
  }, [audioFile]);

  if (!attributions || attributions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audio Attribution</CardTitle>
          <CardDescription>No audio attributions returned for this run.</CardDescription>
        </CardHeader>
        <CardContent>
          {audioUrl ? (
            <audio controls className="w-full" src={audioUrl} />
          ) : (
            <div className="text-sm text-slate-500">No audio file available.</div>
          )}
        </CardContent>
      </Card>
    );
  }

  const segments = attributions;
  const effectiveDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : null;
  const segmentWidthSeconds = effectiveDuration ? effectiveDuration / segments.length : 1;
  const totalSeconds = effectiveDuration ? effectiveDuration : segments.length;

  const getQuantile = (sorted: number[], q: number) => {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] === undefined) return sorted[base];
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  };

  const buildDisplaySeries = (values: number[], maxPoints: number) => {
    const n = values.length;
    if (n === 0) return [] as Array<{ idx: number; value: number }>;

    // Robust clipping for display only (avoids a single spike making the chart look crazy)
    const sampleCount = Math.min(2000, n);
    const sample: number[] = [];
    if (sampleCount === n) {
      sample.push(...values);
    } else {
      for (let i = 0; i < sampleCount; i++) {
        const idx = Math.floor((i / (sampleCount - 1)) * (n - 1));
        sample.push(values[idx]);
      }
    }
    sample.sort((a, b) => a - b);
    const lo = getQuantile(sample, 0.01);
    const hi = getQuantile(sample, 0.99);
    const clamp = (v: number) => Math.min(hi, Math.max(lo, v));

    if (n <= maxPoints) {
      return values.map((v, idx) => ({ idx, value: clamp(v) }));
    }

    // Downsample by bucket-averaging.
    const bucketSize = Math.ceil(n / maxPoints);
    const out: Array<{ idx: number; value: number }> = [];
    for (let start = 0; start < n; start += bucketSize) {
      const end = Math.min(n, start + bucketSize);
      let sum = 0;
      for (let i = start; i < end; i++) sum += clamp(values[i]);
      out.push({ idx: start, value: sum / Math.max(1, end - start) });
    }
    return out;
  };

  const timelineData = useMemo(() => {
    const display = buildDisplaySeries(segments, 800);
    return display.map(({ idx, value }) => ({
      t: effectiveDuration ? idx * segmentWidthSeconds : idx,
      attribution: value,
      segment: idx,
    }));
  }, [segments, effectiveDuration, segmentWidthSeconds]);

  // Calculate stats
  const maxAttr = Math.max(...segments);
  const minAttr = Math.min(...segments);
  const avgAttr = segments.reduce((a, b) => a + b, 0) / segments.length;
  const range = maxAttr - minAttr;

  // Get intensity color
  const getIntensityColor = (value: number) => {
    const normalized = range === 0 ? 0 : (value - minAttr) / range;

    if (normalized > 0.7) return "#ef4444";
    if (normalized > 0.5) return "#fb923c";
    if (normalized > 0.3) return "#facc15";
    if (normalized > 0.1) return "#86efac";
    return "#93c5fd";
  };

  return (
    <div className="space-y-4">
      {/* Audio Player with Attribution Overlay */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Audio Attribution Timeline</CardTitle>
              <CardDescription>
                Time-aligned attribution intensity for {segments.length} segments
              </CardDescription>
            </div>
            <ToggleGroup type="single" value={visualizationType} onValueChange={(v) => v && setVisualizationType(v)}>
              <ToggleGroupItem value="timeline">Timeline</ToggleGroupItem>
              <ToggleGroupItem value="waveform">Waveform</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Audio Controls */}
          <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!audioUrl}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="flex-1">
              {audioUrl ? (
                <audio
                  controls
                  className="w-full"
                  src={audioUrl}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0) setDurationSeconds(d);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              ) : (
                <div className="text-sm text-slate-500">No audio file available.</div>
              )}
            </div>
          </div>

          {/* Visualization */}
          {visualizationType === "timeline" ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="attributionGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={[0, totalSeconds]}
                    tickFormatter={(v) => (effectiveDuration ? `${Number(v).toFixed(2)}s` : String(v))}
                    label={{ value: effectiveDuration ? "Time (seconds)" : "Segment", position: "insideBottom", offset: -5 }}
                  />
                  <YAxis label={{ value: 'Attribution', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload[0]) {
                        return (
                          <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded shadow-lg">
                            <div className="text-sm">
                              <div className="text-slate-900 dark:text-slate-100">
                                Segment {payload[0].payload.segment}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                {effectiveDuration
                                  ? `Time: ${Number(payload[0].payload.t).toFixed(2)}s`
                                  : `Index: ${payload[0].payload.segment}`}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                Attribution: {payload[0].value?.toFixed(4)}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="attribution"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#attributionGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Waveform-style visualization */}
              <div className="h-[300px] flex items-end gap-1 p-4 bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
                {buildDisplaySeries(segments, 400).map((item) => {
                  const denom = range === 0 ? 1 : range;
                  const height = ((item.value - minAttr) / denom) * 100;
                  return (
                    <div
                      key={item.idx}
                      className="flex-1 rounded-t transition-all hover:opacity-80 cursor-pointer"
                      style={{
                        height: `${Math.max(height, 5)}%`,
                        backgroundColor: getIntensityColor(item.value),
                      }}
                      title={`Segment ${item.idx}: ${segments[item.idx]?.toFixed(4)}`}
                    />
                  );
                })}
              </div>

              {/* Time markers */}
              <div className="flex justify-between text-xs text-slate-500 px-4">
                <span>{effectiveDuration ? "0s" : "0"}</span>
                <span>
                  {effectiveDuration ? `${(totalSeconds / 2).toFixed(2)}s` : `${Math.floor(segments.length / 2)}`}
                </span>
                <span>{effectiveDuration ? `${totalSeconds.toFixed(2)}s` : `${segments.length - 1}`}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Audio Attribution Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Duration</div>
              <div className="text-2xl text-slate-900 dark:text-slate-100">
                {effectiveDuration ? `${totalSeconds.toFixed(2)}s` : "N/A"}
              </div>
            </div>
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

      {/* High Attribution Segments */}
      <Card>
        <CardHeader>
          <CardTitle>High Attribution Segments</CardTitle>
          <CardDescription>
            Audio segments with highest Shapley value contributions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {timelineData
              .slice()
              .sort((a, b) => b.attribution - a.attribution)
              .slice(0, 5)
              .map((item, rank) => (
                <div
                  key={item.segment}
                  className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">#{rank + 1}</Badge>
                    <span className="text-slate-900 dark:text-slate-100">
                      Segment {item.segment}
                    </span>
                    <span className="text-sm text-slate-500">
                      ({effectiveDuration ? `${item.t.toFixed(2)}s` : `#${item.segment}`})
                    </span>
                  </div>
                  <span className="text-slate-600 dark:text-slate-400">
                    {item.attribution.toFixed(4)}
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
