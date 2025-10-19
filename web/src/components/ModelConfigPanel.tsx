import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "./ui/alert";

interface ModelConfigPanelProps {
  config: {
    source: string;
    modelPath: string;
    device: string;
    precision: string;
  };
  onChange: (config: any) => void;
}

export function ModelConfigPanel({ config, onChange }: ModelConfigPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);

  const handleLoadModel = () => {
    setIsLoading(true);
    // Simulate model loading
    setTimeout(() => {
      setIsLoading(false);
      setModelLoaded(true);
    }, 2000);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Model Configuration
            {modelLoaded && (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Loaded
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Select and load a transformers-compatible model
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source">Model Source</Label>
            <Select
              value={config.source}
              onValueChange={(value) => onChange({ ...config, source: value })}
            >
              <SelectTrigger id="source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="huggingface">HuggingFace Hub</SelectItem>
                <SelectItem value="local">Local Files</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-path">
              {config.source === "huggingface" ? "Model ID" : "Model Path"}
            </Label>
            <Input
              id="model-path"
              placeholder={
                config.source === "huggingface"
                  ? "e.g., openai/whisper-large-v3"
                  : "/path/to/model"
              }
              value={config.modelPath}
              onChange={(e) => onChange({ ...config, modelPath: e.target.value })}
            />
            {config.source === "local" && (
              <Button variant="outline" size="sm" className="w-full mt-2">
                <Upload className="h-4 w-4 mr-2" />
                Browse Files
              </Button>
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
            disabled={!config.modelPath || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Model...
              </>
            ) : (
              <>Load Model</>
            )}
          </Button>
        </CardContent>
      </Card>

      {modelLoaded && (
        <Alert>
          <AlertDescription>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Model:</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {config.modelPath || "N/A"}
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
