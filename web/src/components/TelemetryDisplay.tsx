import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Activity, Cpu, Clock, Database } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface TelemetryDisplayProps {
  isRunning: boolean;
  progress: number;
  evalCurrent: number;
  evalTotal: number | null;
  progressMessage: string | null;
  config: {
    method: string;
    sampleBudget: number;
  };
}

export function TelemetryDisplay({
  isRunning,
  progress,
  evalCurrent,
  evalTotal,
  progressMessage,
  config,
}: TelemetryDisplayProps) {
  const [telemetry, setTelemetry] = useState({
    cpu_percent: 0,
    ram_percent: 0,
    process_rss_mb: 0,
    gpu_util_percent: null as number | null,
    gpu_mem_used_mb: null as number | null,
    gpu_mem_total_mb: null as number | null,
  });

  const [history, setHistory] = useState<
    Array<{ time: number; cpu: number; gpu: number | null; ram: number }>
  >([]);

  useEffect(() => {
    if (!isRunning) return;

    let alive = true;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/ml/telemetry`);
        if (!r.ok) return;
        const t = await r.json();
        if (!alive) return;
        setTelemetry({
          cpu_percent: typeof t.cpu_percent === "number" ? t.cpu_percent : 0,
          ram_percent: typeof t.ram_percent === "number" ? t.ram_percent : 0,
          process_rss_mb: typeof t.process_rss_mb === "number" ? t.process_rss_mb : 0,
          gpu_util_percent: typeof t.gpu_util_percent === "number" ? t.gpu_util_percent : null,
          gpu_mem_used_mb: typeof t.gpu_mem_used_mb === "number" ? t.gpu_mem_used_mb : null,
          gpu_mem_total_mb: typeof t.gpu_mem_total_mb === "number" ? t.gpu_mem_total_mb : null,
        });
        setHistory((prev) => {
          const next = {
            time: prev.length,
            cpu: typeof t.cpu_percent === "number" ? t.cpu_percent : 0,
            gpu: typeof t.gpu_util_percent === "number" ? t.gpu_util_percent : null,
            ram: typeof t.ram_percent === "number" ? t.ram_percent : 0,
          };
          return [...prev.slice(-60), next];
        });
      } catch {
        // ignore
      }
    }, 1000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) {
      setTelemetry({
        cpu_percent: 0,
        ram_percent: 0,
        process_rss_mb: 0,
        gpu_util_percent: null,
        gpu_mem_used_mb: null,
        gpu_mem_total_mb: null,
      });
      setHistory([]);
    }
  }, [isRunning]);

  const evalPercent = useMemo(() => {
    if (!evalTotal || evalTotal <= 0) return 0;
    return Math.max(0, Math.min(100, (evalCurrent / evalTotal) * 100));
  }, [evalCurrent, evalTotal]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-slate-900 dark:text-slate-100 mb-1">Runtime Telemetry</h3>
        <p className="text-sm text-slate-500">
          Real-time monitoring of computation progress
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Status
            <Badge variant={isRunning ? "default" : "secondary"}>
              {isRunning ? (
                <>
                  <Activity className="h-3 w-3 mr-1 animate-pulse" />
                  Running
                </>
              ) : (
                <>Idle</>
              )}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isRunning && (
            <>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600 dark:text-slate-400">Progress</span>
                  <span className="text-slate-900 dark:text-slate-100">{progress}%</span>
                </div>
                <Progress value={progress} />
                {progressMessage && (
                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    {progressMessage}
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600 dark:text-slate-400">Evaluations</span>
                  <span className="text-slate-900 dark:text-slate-100">
                    {evalTotal
                      ? `${evalCurrent.toLocaleString()} / ${evalTotal.toLocaleString()}`
                      : evalCurrent.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={evalPercent}
                  className="h-2"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
              <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Process RSS</div>
              <div className="text-lg text-slate-900 dark:text-slate-100">
                {telemetry.process_rss_mb.toFixed(0)} MB
              </div>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
              <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">GPU Memory</div>
              <div className="text-lg text-slate-900 dark:text-slate-100">
                {telemetry.gpu_mem_used_mb != null && telemetry.gpu_mem_total_mb != null
                  ? `${telemetry.gpu_mem_used_mb.toFixed(0)} / ${telemetry.gpu_mem_total_mb.toFixed(0)} MB`
                  : "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Resource Usage
          </CardTitle>
          <CardDescription>Live utilization (polled)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 dark:text-slate-400">CPU Usage</span>
              <span className="text-slate-900 dark:text-slate-100">
                {telemetry.cpu_percent.toFixed(1)}%
              </span>
            </div>
            <Progress value={telemetry.cpu_percent} />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 dark:text-slate-400">GPU Usage</span>
              <span className="text-slate-900 dark:text-slate-100">
                {telemetry.gpu_util_percent != null ? `${telemetry.gpu_util_percent.toFixed(1)}%` : "—"}
              </span>
            </div>
            <Progress value={telemetry.gpu_util_percent ?? 0} />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 dark:text-slate-400">Memory Usage</span>
              <span className="text-slate-900 dark:text-slate-100">
                {telemetry.ram_percent.toFixed(1)}%
              </span>
            </div>
            <Progress value={telemetry.ram_percent} />
          </div>
        </CardContent>
      </Card>

      {/* Performance Timeline */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Performance Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ram"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Method:</span>
              <span className="text-slate-900 dark:text-slate-100">
                {config.method === "permutation-mc"
                  ? "Permutation MC"
                  : config.method === "neyman-stratified"
                  ? "Neyman Stratified"
                  : "Exact SV"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Sample Budget:</span>
              <span className="text-slate-900 dark:text-slate-100">
                {config.sampleBudget.toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Notice */}
      <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
        <p className="text-xs text-green-900 dark:text-green-100">
          <strong>Privacy:</strong> All telemetry is local. No data is transmitted externally.
        </p>
      </div>
    </div>
  );
}
