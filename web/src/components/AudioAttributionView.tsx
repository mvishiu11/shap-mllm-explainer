import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Play, Pause } from "lucide-react";
import { Button } from "./ui/button";

interface AudioAttributionViewProps {
  audioFile: File;
  attributions: number[];
}

export function AudioAttributionView({ audioFile, attributions }: AudioAttributionViewProps) {
  const [visualizationType, setVisualizationType] = useState<string>("timeline");
  const [isPlaying, setIsPlaying] = useState(false);

  // Create time-aligned data (assume attributions are evenly distributed over audio duration)
  // For demo purposes, we'll simulate 30 segments
  const segments = attributions.slice(0, 30);
  const timelineData = segments.map((value, idx) => ({
    time: idx * 0.5, // Each segment is 0.5 seconds
    timeLabel: `${(idx * 0.5).toFixed(1)}s`,
    attribution: value,
    segment: idx,
  }));

  // Calculate stats
  const maxAttr = Math.max(...segments);
  const minAttr = Math.min(...segments);
  const avgAttr = segments.reduce((a, b) => a + b, 0) / segments.length;

  // Get intensity color
  const getIntensityColor = (value: number) => {
    const normalized = (value - minAttr) / (maxAttr - minAttr);
    
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
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="flex-1">
              <audio
                controls
                className="w-full"
                src={URL.createObjectURL(audioFile)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
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
                    dataKey="timeLabel" 
                    label={{ value: 'Time (seconds)', position: 'insideBottom', offset: -5 }}
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
                                Time: {payload[0].payload.timeLabel}
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
                {segments.map((value, idx) => {
                  const height = ((value - minAttr) / (maxAttr - minAttr)) * 100;
                  return (
                    <div
                      key={idx}
                      className="flex-1 rounded-t transition-all hover:opacity-80 cursor-pointer"
                      style={{
                        height: `${Math.max(height, 5)}%`,
                        backgroundColor: getIntensityColor(value),
                      }}
                      title={`Segment ${idx}: ${value.toFixed(4)}`}
                    />
                  );
                })}
              </div>
              
              {/* Time markers */}
              <div className="flex justify-between text-xs text-slate-500 px-4">
                <span>0s</span>
                <span>{(segments.length * 0.5 / 2).toFixed(1)}s</span>
                <span>{(segments.length * 0.5).toFixed(1)}s</span>
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
                {(segments.length * 0.5).toFixed(1)}s
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
                      ({item.timeLabel})
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
