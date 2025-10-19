import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Badge } from "./ui/badge";
import { Calculator } from "lucide-react";
import { useEffect } from "react";

interface MethodConfigPanelProps {
  config: {
    method: string;
    sampleBudget: number;
    granularity: string;
    audioGranularity: string;
    randomSeed: number;
  };
  onChange: (config: any) => void;
  onCostUpdate: (cost: { evaluations: number; timeSeconds: number }) => void;
}

export function MethodConfigPanel({ config, onChange, onCostUpdate }: MethodConfigPanelProps) {
  
  // Calculate cost estimate whenever config changes
  useEffect(() => {
    let evaluations = 0;
    
    switch (config.method) {
      case "exact":
        // Factorial complexity
        evaluations = 120; // Example for small inputs
        break;
      case "permutation-mc":
        evaluations = config.sampleBudget;
        break;
      case "neyman-stratified":
        evaluations = Math.floor(config.sampleBudget * 0.8); // Slightly more efficient
        break;
    }
    
    // Assume ~0.5s per evaluation (this would be model-dependent)
    const timeSeconds = Math.floor(evaluations * 0.5);
    
    onCostUpdate({ evaluations, timeSeconds });
  }, [config, onCostUpdate]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Shapley Value Method</CardTitle>
          <CardDescription>
            Select computation method and configure parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="method">SV Computation Method</Label>
            <Select
              value={config.method}
              onValueChange={(value) => onChange({ ...config, method: value })}
            >
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact">
                  Exact Shapley Value
                </SelectItem>
                <SelectItem value="permutation-mc">
                  Permutation Monte Carlo
                </SelectItem>
                <SelectItem value="neyman-stratified">
                  Neyman Stratified Allocation
                </SelectItem>
              </SelectContent>
            </Select>
            
            {config.method === "exact" && (
              <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                <p className="text-xs text-amber-900 dark:text-amber-100">
                  <strong>Note:</strong> Exact SV has factorial complexity. Only suitable for very short inputs {"(<10 tokens)"}.
                </p>
              </div>
            )}
          </div>

          {config.method !== "exact" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sample-budget">Sample Budget</Label>
                <Badge variant="outline">{config.sampleBudget.toLocaleString()}</Badge>
              </div>
              <Slider
                id="sample-budget"
                min={100}
                max={10000}
                step={100}
                value={[config.sampleBudget]}
                onValueChange={([value]) => onChange({ ...config, sampleBudget: value })}
              />
              <p className="text-xs text-slate-500">
                Higher budget = better approximation, longer computation
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="random-seed">Random Seed</Label>
            <Input
              id="random-seed"
              type="number"
              value={config.randomSeed}
              onChange={(e) => onChange({ ...config, randomSeed: parseInt(e.target.value) })}
            />
            <p className="text-xs text-slate-500">
              For reproducibility of sampling-based methods
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attribution Granularity</CardTitle>
          <CardDescription>
            Configure attribution units for each modality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="text-granularity">Text Granularity</Label>
            <Select
              value={config.granularity}
              onValueChange={(value) => onChange({ ...config, granularity: value })}
            >
              <SelectTrigger id="text-granularity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="token">Token Level</SelectItem>
                <SelectItem value="word">Word Level</SelectItem>
                <SelectItem value="sentence">Sentence Level</SelectItem>
                <SelectItem value="turn">Turn Level (Dialogue)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="audio-granularity">Audio Granularity</Label>
            <Select
              value={config.audioGranularity}
              onValueChange={(value) => onChange({ ...config, audioGranularity: value })}
            >
              <SelectTrigger id="audio-granularity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="frame">Frame Level</SelectItem>
                <SelectItem value="segment">Segment Level (~0.5s)</SelectItem>
                <SelectItem value="sentence">Sentence Level (aligned)</SelectItem>
                <SelectItem value="turn">Turn Level (Dialogue)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Method Info */}
      <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
        <div className="flex items-start gap-3">
          <Calculator className="h-5 w-5 text-slate-600 dark:text-slate-400 mt-0.5" />
          <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
            <div>
              <strong>Method Description:</strong>
            </div>
            {config.method === "exact" && (
              <p>
                Computes exact Shapley values by evaluating all possible coalitions. 
                Complexity: O(2^n × n). Guarantees accurate attributions.
              </p>
            )}
            {config.method === "permutation-mc" && (
              <p>
                Approximates Shapley values using random permutation sampling. 
                Unbiased estimator with variance inversely proportional to sample size.
              </p>
            )}
            {config.method === "neyman-stratified" && (
              <p>
                Stratified sampling with Neyman allocation for variance reduction. 
                More efficient than basic MC for the same sample budget.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
