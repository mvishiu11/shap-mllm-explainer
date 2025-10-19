import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Activity, Cpu, Clock, Database, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TelemetryDisplayProps {
  isRunning: boolean;
  progress: number;
  config: {
    method: string;
    sampleBudget: number;
  };
}

export function TelemetryDisplay({ isRunning, progress, config }: TelemetryDisplayProps) {
  const [stats, setStats] = useState({
    evaluations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgEvalTime: 0,
    cpuUsage: 0,
    gpuUsage: 0,
    memoryUsage: 0,
  });

  const [performanceHistory, setPerformanceHistory] = useState<
    Array<{ time: number; evaluations: number; cacheHitRate: number }>
  >([]);

  // Simulate telemetry updates
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setStats((prev) => {
        const newEvaluations = prev.evaluations + Math.floor(Math.random() * 10 + 5);
        const newCacheHits = prev.cacheHits + Math.floor(Math.random() * 3);
        const newCacheMisses = newEvaluations - newCacheHits;
        
        return {
          evaluations: Math.min(newEvaluations, config.sampleBudget),
          cacheHits: newCacheHits,
          cacheMisses: newCacheMisses,
          avgEvalTime: 0.45 + Math.random() * 0.2,
          cpuUsage: 30 + Math.random() * 40,
          gpuUsage: 60 + Math.random() * 30,
          memoryUsage: 45 + Math.random() * 20,
        };
      });

      setPerformanceHistory((prev) => {
        const newEntry = {
          time: prev.length,
          evaluations: stats.evaluations,
          cacheHitRate: stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100 || 0,
        };
        return [...prev.slice(-20), newEntry];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, config.sampleBudget, stats.cacheHits, stats.cacheMisses, stats.evaluations]);

  // Reset stats when computation stops
  useEffect(() => {
    if (!isRunning) {
      setStats({
        evaluations: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgEvalTime: 0,
        cpuUsage: 0,
        gpuUsage: 0,
        memoryUsage: 0,
      });
      setPerformanceHistory([]);
    }
  }, [isRunning]);

  const cacheHitRate = stats.cacheHits + stats.cacheMisses > 0
    ? (stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100
    : 0;

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
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600 dark:text-slate-400">Evaluations</span>
                  <span className="text-slate-900 dark:text-slate-100">
                    {stats.evaluations.toLocaleString()} / {config.sampleBudget.toLocaleString()}
                  </span>
                </div>
                <Progress 
                  value={(stats.evaluations / config.sampleBudget) * 100} 
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
              <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Avg Eval Time
              </div>
              <div className="text-lg text-slate-900 dark:text-slate-100">
                {stats.avgEvalTime.toFixed(2)}s
              </div>
            </div>
            
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
              <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Cache Hit Rate
              </div>
              <div className="text-lg text-slate-900 dark:text-slate-100">
                {cacheHitRate.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-slate-600 dark:text-slate-400">Cache Hits</span>
              </div>
              <span className="text-slate-900 dark:text-slate-100">
                {stats.cacheHits.toLocaleString()}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-slate-600 dark:text-slate-400">Cache Misses</span>
              </div>
              <span className="text-slate-900 dark:text-slate-100">
                {stats.cacheMisses.toLocaleString()}
              </span>
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
          <CardDescription>(Optional monitoring)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 dark:text-slate-400">CPU Usage</span>
              <span className="text-slate-900 dark:text-slate-100">
                {stats.cpuUsage.toFixed(1)}%
              </span>
            </div>
            <Progress value={stats.cpuUsage} />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 dark:text-slate-400">GPU Usage</span>
              <span className="text-slate-900 dark:text-slate-100">
                {stats.gpuUsage.toFixed(1)}%
              </span>
            </div>
            <Progress value={stats.gpuUsage} />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 dark:text-slate-400">Memory Usage</span>
              <span className="text-slate-900 dark:text-slate-100">
                {stats.memoryUsage.toFixed(1)}%
              </span>
            </div>
            <Progress value={stats.memoryUsage} />
          </div>
        </CardContent>
      </Card>

      {/* Performance Timeline */}
      {performanceHistory.length > 0 && (
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
                <LineChart data={performanceHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="evaluations" 
                    stroke="#3b82f6" 
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
