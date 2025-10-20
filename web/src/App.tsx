import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { ModelConfigPanel } from "./components/ModelConfigPanel";
import { InputPanel } from "./components/InputPanel";
import { MethodConfigPanel } from "./components/MethodConfigPanel";
import { VisualizationPanel } from "./components/VisualizationPanel";
import { SessionManager } from "./components/SessionManager";
import { TelemetryDisplay } from "./components/TelemetryDisplay";
import { Settings, Play, Pause, History, Download } from "lucide-react";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { Alert, AlertDescription } from "./components/ui/alert";
import { ExportDialog } from "./components/ExportDialog";
import { Toaster, toast } from "sonner";

const API_BASE_URL = "/api";

interface SessionData {
   id: number;
   name: string;
   text_input: string | null;
   model_settings: any;
   method_settings: any;
   attributions: any; // This will include { text: number[], audio: any, timestamp: string, tokens?: string[] }
   created_at: string; // ISO string
}

export default function App() {
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [realTokens, setRealTokens] = useState<string[]>([]);

  // Model configuration state
  const [modelConfig, setModelConfig] = useState({
    source: "huggingface",
    modelPath: "microsoft/phi-2",
    device: "cuda",
    precision: "bfloat16",
  });

  // Input state
  const [textInput, setTextInput] = useState("This is a simple test.");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [alignment, setAlignment] = useState<any>(null);

  // Method configuration state
  const [methodConfig, setMethodConfig] = useState({
    method: "permutation-mc",
    sampleBudget: 128,
    granularity: "token",
    audioGranularity: "segment",
    randomSeed: 42,
  });

  // Results state
  const [attributions, setAttributions] = useState<any>(null);
  const [costEstimate, setCostEstimate] = useState({ evaluations: 0, timeSeconds: 0 });

  const handleStartComputation = async () => {
    if (!isModelLoaded) {
      toast.error("Please load a model first.");
      return;
    }
    if (!textInput && !audioFile) {
      toast.warning("Please provide text or audio input.");
      return;
    }
    // For now, we only support text
    if (!textInput) {
      toast.warning("Please enter text to explain.");
      return;
    }
    if (audioFile) {
      toast.warning("Audio-only explanations are not yet supported.");
      return;
    }

    setIsComputing(true);
    setProgress(0);
    setAttributions(null); // Clear previous results
    setRealTokens([]); // Clear previous tokens
    toast.info("Starting explanation... This may take a moment.");

    // Simulate progress as it's a long task
    const interval = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + 5 : 90));
    }, 500);

    try {
      const response = await fetch(`${API_BASE_URL}/ml/explain/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_input: textInput,
          max_evals: methodConfig.sampleBudget, // Use sampleBudget
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to run explanation");
      }

      toast.success(`Explanation complete in ${data.explanation_time_seconds.toFixed(2)}s`);

      // Set attributions in the structure VisualizationPanel expects
      // Note: This will show correct values but with MOCK_TOKENS
      // until VisualizationPanel is updated.
      setAttributions({
        text: data.shap_values, // This is the array of numbers
        audio: null, // No audio explanation
        timestamp: new Date().toISOString(),
      });
      // Store the real tokens, even if they aren't used yet by VisualizationPanel
      setRealTokens(data.tokens);
    } catch (error) {
      console.error("Explanation error:", error);
      toast.error(`Explanation failed: ${String(error)}`);
      setAttributions(null);
    } finally {
      clearInterval(interval);
      setProgress(100);
      setIsComputing(false);
    }
  };

  const handleCancelComputation = () => {
    setIsComputing(false);
    setProgress(0);
  };

  const handleLoadSession = (sessionData: SessionData) => {
    console.log("Loading session:", sessionData); // Debug log
    setCurrentSession(String(sessionData.id)); // Convert id to string
    setModelConfig(sessionData.model_settings);
    setMethodConfig(sessionData.method_settings);
    setTextInput(sessionData.text_input || "");
    setAttributions(sessionData.attributions);
    // Extract tokens from the loaded attributions object
    setRealTokens(sessionData.attributions?.tokens || []);
    setIsModelLoaded(true); // Assume loading session implies model is loaded
    toast.success(`Loaded session: ${sessionData.name}`);
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      <Toaster position="top-right" richColors />
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10 px-6 flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 dark:text-slate-100">MLLM Shapley Value Explainability</h1>
          <p className="text-slate-500 text-sm">Multi-modal Attribution Analysis Tool</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <div className="text-slate-600 dark:text-slate-400">
              Est. {costEstimate.evaluations.toLocaleString()} evaluations
            </div>
            <div className="text-slate-500 dark:text-slate-500">
              ~{Math.ceil(costEstimate.timeSeconds / 60)}m {costEstimate.timeSeconds % 60}s
            </div>
          </div>

          {isComputing ? (
            <Button onClick={handleCancelComputation} variant="destructive" size="sm">
              <Pause className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button
              onClick={handleStartComputation}
              size="sm"
              disabled={isComputing || (!textInput && !audioFile) || !isModelLoaded}
            >
              <Play className="mr-2 h-4 w-4" />
              Compute Attribution
            </Button>
          )}

          <Button
            onClick={() => setShowExportDialog(true)}
            variant="outline"
            size="sm"
            disabled={!attributions}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 pt-16">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Panel - Configuration */}
          <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
            <div className="h-full overflow-auto p-6">
              <Tabs defaultValue="model" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="model">
                    <Settings className="h-4 w-4 mr-2" />
                    Model
                  </TabsTrigger>
                  <TabsTrigger value="method">Method</TabsTrigger>
                  <TabsTrigger value="sessions">
                    <History className="h-4 w-4 mr-2" />
                    Sessions
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="model" className="mt-4">
                  <ModelConfigPanel
                    config={modelConfig}
                    onChange={setModelConfig}
                    isModelLoaded={isModelLoaded}
                    onModelLoaded={setIsModelLoaded}
                  />
                </TabsContent>

                <TabsContent value="method" className="mt-4">
                  <MethodConfigPanel
                    config={methodConfig}
                    onChange={setMethodConfig}
                    onCostUpdate={setCostEstimate}
                  />
                </TabsContent>

                <TabsContent value="sessions" className="mt-4">
                  <SessionManager
                    currentSession={currentSession}
                    onSessionLoad={handleLoadSession}
                    currentModelConfig={modelConfig}
                    currentMethodConfig={methodConfig}
                    currentTextInput={textInput}
                    currentAttributions={attributions}
                    currentRealTokens={realTokens}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center Panel - Input and Visualization */}
          <ResizablePanel defaultSize={50} minSize={40}>
            <ResizablePanelGroup direction="vertical">
              {/* Input Panel */}
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <div className="h-full overflow-auto p-6 border-b border-slate-200 dark:border-slate-800">
                  <InputPanel
                    textInput={textInput}
                    onTextChange={setTextInput}
                    audioFile={audioFile}
                    onAudioChange={setAudioFile}
                    alignment={alignment}
                    onAlignmentChange={setAlignment}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Visualization Panel */}
              <ResizablePanel defaultSize={70} minSize={50}>
                <div className="h-full overflow-auto p-6">
                  {isComputing && (
                    <Alert className="mb-4">
                      <AlertDescription>
                        <div className="flex items-center justify-between mb-2">
                          <span>Computing attributions...</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} />
                      </AlertDescription>
                    </Alert>
                  )}

                  <VisualizationPanel
                    attributions={attributions}
                    tokens={realTokens}
                    audioFile={audioFile}
                    granularity={methodConfig.granularity}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Telemetry */}
          <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
            <div className="h-full overflow-auto p-6 bg-slate-100 dark:bg-slate-900">
              <TelemetryDisplay
                isRunning={isComputing}
                progress={progress}
                config={methodConfig}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        attributions={attributions}
        config={{ modelConfig, methodConfig }}
      />
    </div>
  );
}
