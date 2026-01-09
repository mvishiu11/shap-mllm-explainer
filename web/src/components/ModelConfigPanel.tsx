import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface ModelConfigPanelProps {
  config: {
    source: string;
    modelPath: string;
    device: string;
    precision: string;
  };
  onChange: (config: any) => void;
  isModelLoaded: boolean;
  onModelLoaded: (loaded: boolean) => void;
}

export function ModelConfigPanel({
  config,
  onChange,
  isModelLoaded,
  onModelLoaded,
}: ModelConfigPanelProps) {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // keep internal loading UI consistent if parent toggles loaded state
    // (e.g., when loading a session)
    if (!isModelLoaded) setIsLoading(false);
  }, [isModelLoaded]);

  const handleSourceChange = (value: string) => {
    const nextModelPath = value === "hf_text" ? "microsoft/phi-2" : "LiquidAI/LFM2-Audio-1.5B";
    onChange({ ...config, source: value, modelPath: nextModelPath });
  };

  const handleLoadModel = async () => {
    setIsLoading(true);
    onModelLoaded(false); // Inform parent
    toast.info(config.source === "hf_text" ? "Loading HF text-only model..." : "Loading LiquidAudio model...");

    try {
      const response = await fetch(`${API_BASE_URL}/ml/models/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: config.source === "hf_text" ? "hf_text" : "lfm2",
          model_id:
            config.source === "hf_text"
              ? (config.modelPath || "microsoft/phi-2")
              : "LiquidAI/LFM2-Audio-1.5B",
          device: config.device,
          precision: config.precision,
          trust_remote_code: true, // Required for phi-2 and others
        }),
      });

      if (!response.ok) {
        // Try to read the error message as text first
        // This handles Nginx timeouts (504) or other non-JSON errors
        const errorText = await response.text();
        let errorDetail = errorText;
        try {
          // Try to parse it as JSON in case the backend sent a proper error
          const errorData = JSON.parse(errorText);
          errorDetail = errorData.detail || errorText;
        } catch (e) {}
        throw new Error(errorDetail || "Failed to load model");
      }

      const data = await response.json();

      toast.success(data.message);
      setIsLoading(false);
      onModelLoaded(true); // Inform parent
    } catch (error) {
      console.error("Model load error:", error);
      toast.error(`Model load failed: ${String(error)}`);
      setIsLoading(false);
      onModelLoaded(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Model Configuration
            {isModelLoaded && (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Loaded
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Load either LiquidAudio (multimodal) or the bundled HF text-only connector (Phi-2 pinned by mllm-shap).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source">Model Source</Label>
            <Select value={config.source} onValueChange={handleSourceChange}>
              <SelectTrigger id="source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="liquid">LiquidAudio (multimodal)</SelectItem>
                <SelectItem value="hf_text">HF text-only (Phi-2)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-path">Model</Label>
            <Input
              id="model-path"
              value={
                config.source === "hf_text"
                  ? (config.modelPath || "microsoft/phi-2")
                  : "LiquidAI/LFM2-Audio-1.5B"
              }
              disabled
            />
            {config.source === "hf_text" && (
              <p className="text-xs text-slate-500">
                Note: the shipped connector is pinned to a specific Phi-2 revision in `mllm-shap`.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="device">Device</Label>
              <Select
                value={config.device}
                onValueChange={(value) => onChange({ ...config, device: value })}
              >
                <SelectTrigger id="device">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuda">CUDA (GPU)</SelectItem>
                  <SelectItem value="cpu">CPU</SelectItem>
                  <SelectItem value="mps">MPS (Apple Silicon)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="precision">Precision</Label>
              <Select
                value={config.precision}
                onValueChange={(value) => onChange({ ...config, precision: value })}
              >
                <SelectTrigger id="precision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="float32">Float32</SelectItem>
                  <SelectItem value="float16">Float16</SelectItem>
                  <SelectItem value="bfloat16">BFloat16</SelectItem>
                  <SelectItem value="int8">Int8</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleLoadModel}
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Model...
              </>
            ) : (
              <>{isModelLoaded ? "Reload Model" : "Load Model"}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {isModelLoaded && (
        <Alert>
          <AlertDescription>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Model:</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {config.source === "hf_text" ? (config.modelPath || "microsoft/phi-2") : "LiquidAI/LFM2-Audio-1.5B"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Device:</span>
                <span className="text-slate-900 dark:text-slate-100">{config.device}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Precision:</span>
                <span className="text-slate-900 dark:text-slate-100">{config.precision}</span>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
