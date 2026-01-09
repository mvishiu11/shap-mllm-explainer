import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { ModelConfigPanel } from "./components/ModelConfigPanel";
import { InputPanel } from "./components/InputPanel";
import { MethodConfigPanel } from "./components/MethodConfigPanel";
import { VisualizationPanel } from "./components/VisualizationPanel";
import { SessionManager } from "./components/SessionManager";
import { TelemetryDisplay } from "./components/TelemetryDisplay";
import { Settings, Play, Pause, History, Download, SlidersHorizontal } from "lucide-react";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { Alert, AlertDescription } from "./components/ui/alert";
import { ExportDialog } from "./components/ExportDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster, toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

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
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [evalCurrent, setEvalCurrent] = useState<number>(0);
  const [evalTotal, setEvalTotal] = useState<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [realTokens, setRealTokens] = useState<string[]>([]);

  // Model configuration state
  const [modelConfig, setModelConfig] = useState({
    source: "liquid",
    modelPath: "LiquidAI/LFM2-Audio-1.5B",
    device: "cuda",
    precision: "bfloat16",
  });

  // Input state
  const [textInput, setTextInput] = useState("This is a simple test.");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [alignment, setAlignment] = useState<any>(null);

  // Method configuration state
  const [methodConfig, setMethodConfig] = useState({
    method: "neyman-stratified",
    sampleBudget: 32,
    randomSeed: 42,
  });

  const normalizeModelSettings = (raw: any) => {
    const modeOrSource = String(raw?.source ?? raw?.mode ?? raw?.model_mode ?? "").trim().toLowerCase();
    const source = modeOrSource === "hf_text" || modeOrSource === "hf" ? "hf_text" : "liquid";

    return {
      source,
      modelPath:
        source === "hf_text"
          ? String(raw?.modelPath ?? raw?.model_id ?? raw?.model ?? "microsoft/phi-2")
          : "LiquidAI/LFM2-Audio-1.5B",
      device: String(raw?.device ?? "cuda"),
      precision: String(raw?.precision ?? "bfloat16"),
    };
  };

  const normalizeAttributions = (raw: any, fallbackTimestamp?: string) => {
    const obj = raw && typeof raw === "object" ? raw : {};

    const text =
      (Array.isArray(obj?.text) ? obj.text : null) ??
      (Array.isArray(obj?.shap_values) ? obj.shap_values : null) ??
      (Array.isArray(obj?.shapValues) ? obj.shapValues : null) ??
      [];

    const audio =
      (Array.isArray(obj?.audio) ? obj.audio : null) ??
      (Array.isArray(obj?.audio_shap_values) ? obj.audio_shap_values : null) ??
      (Array.isArray(obj?.audioShapValues) ? obj.audioShapValues : null) ??
      [];

    const tokens =
      (Array.isArray(obj?.tokens) ? obj.tokens : null) ??
      (Array.isArray(obj?.token_list) ? obj.token_list : null) ??
      (Array.isArray(obj?.tokenList) ? obj.tokenList : null) ??
      [];

    const ts =
      (typeof obj?.timestamp === "string" ? obj.timestamp : null) ??
      (typeof fallbackTimestamp === "string" ? fallbackTimestamp : null) ??
      new Date().toISOString();

    return {
      text,
      audio,
      tokens,
      timestamp: ts,
    };
  };

  const normalizeMethodSettings = (raw: any) => {
    const obj = raw && typeof raw === "object" ? raw : {};
    const method = typeof obj?.method === "string" && obj.method.length > 0 ? obj.method : "neyman-stratified";
    const sampleBudgetNum = Number(obj?.sampleBudget ?? obj?.max_evals ?? obj?.maxEvals ?? 32);
    const randomSeedNum = Number(obj?.randomSeed ?? obj?.random_seed ?? obj?.seed ?? 42);
    return {
      method,
      sampleBudget: Number.isFinite(sampleBudgetNum) ? sampleBudgetNum : 32,
      randomSeed: Number.isFinite(randomSeedNum) ? randomSeedNum : 42,
    };
  };

  // Results state
  const [attributions, setAttributions] = useState<any>(null);
  const [costEstimate, setCostEstimate] = useState({ evaluations: 0, timeSeconds: 0 });

  useEffect(() => {
    if (modelConfig.source === "hf_text" && audioFile) {
      setAudioFile(null);
      setAlignment(null);
      toast.info("Audio input cleared (HF text-only model).", { duration: 2000 });
    }
  }, [modelConfig.source]);

  const handleStartComputation = async () => {
    if (!isModelLoaded) {
      toast.error("Please load a model first.");
      return;
    }
    if (!textInput && !audioFile) {
      toast.warning("Please provide text or audio input.");
      return;
    }
    if (modelConfig.source === "hf_text" && audioFile) {
      toast.error("HF text-only model does not support audio input.");
      return;
    }

    setIsComputing(true);
    setProgress(0);
    setProgressMessage(null);
    setEvalCurrent(0);
    setEvalTotal(null);
    setAttributions(null); // Clear previous results
    setRealTokens([]); // Clear previous tokens
    toast.info("Starting explanation... This may take a moment.");

    const jobId = crypto.randomUUID();
    setActiveJobId(jobId);

    // Poll real backend progress while the request runs.
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/ml/progress/${jobId}`);
        if (!r.ok) return;
        const p = await r.json();
        if (typeof p.percent === "number") {
          // keep a little headroom until final response arrives
          setProgress(Math.min(99, Math.max(0, Math.floor(p.percent * 100))));
        }
        if (typeof p.current === "number") setEvalCurrent(p.current);
        if (typeof p.total === "number") setEvalTotal(p.total);
        if (typeof p.message === "string") setProgressMessage(p.message);
      } catch {
        // ignore polling errors
      }
    }, 500);

    try {
      const form = new FormData();
      if (textInput && textInput.trim().length > 0) form.append("text_input", textInput);
      if (audioFile) form.append("audio_file", audioFile);
      form.append("max_evals", String(methodConfig.sampleBudget));
      form.append("method", methodConfig.method);
      form.append("random_seed", String(methodConfig.randomSeed));
      form.append("job_id", jobId);

      const response = await fetch(`${API_BASE_URL}/ml/explain`, {
        method: "POST",
        body: form,
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
        audio: data.audio_shap_values ?? [],
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
      setProgressMessage(null);
      setIsComputing(false);
      setActiveJobId(null);
    }
  };

  const handleCancelComputation = () => {
    if (activeJobId) {
      fetch(`${API_BASE_URL}/ml/cancel/${activeJobId}`, { method: "POST" }).catch(() => {
        // best-effort
      });
    }
    setIsComputing(false);
    setProgress(0);
    setProgressMessage(null);
    setEvalCurrent(0);
    setEvalTotal(null);
    setActiveJobId(null);
  };

  const handleLoadSession = (sessionData: SessionData) => {
    console.log("Loading session:", sessionData); // Debug log
    setCurrentSession(String(sessionData.id)); // Convert id to string
    setModelConfig(normalizeModelSettings(sessionData.model_settings));
    setMethodConfig(normalizeMethodSettings(sessionData.method_settings));
    setTextInput(sessionData.text_input || "");
    const normalizedAttrs = normalizeAttributions(sessionData.attributions, sessionData.created_at);
    setAttributions(normalizedAttrs);
    setRealTokens(normalizedAttrs.tokens || []);
    setIsModelLoaded(true); // Assume loading session implies model is loaded
    toast.success(`Loaded session: ${sessionData.name}`);
  };

  return (
    <ErrorBoundary onError={(e) => toast.error(`UI crashed: ${e instanceof Error ? e.message : String(e)}`)}>
      <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
        <Toaster position="bottom-right" richColors />
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
                  <TabsTrigger value="method">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Method
                  </TabsTrigger>
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
                    audioEnabled={modelConfig.source !== "hf_text"}
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
                        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-2">
                          <span>{progressMessage || "Working"}</span>
                          <span>
                            {evalTotal ? `${evalCurrent.toLocaleString()} / ${evalTotal.toLocaleString()} evals` : `${evalCurrent.toLocaleString()} evals`}
                          </span>
                        </div>
                        <Progress value={progress} />
                      </AlertDescription>
                    </Alert>
                  )}

                  <VisualizationPanel
                    attributions={attributions}
                    tokens={realTokens}
                    audioFile={audioFile}
                    granularity="token"
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
                evalCurrent={evalCurrent}
                evalTotal={evalTotal}
                progressMessage={progressMessage}
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
        config={{ modelConfig, methodConfig, tokens: realTokens }}
      />
      </div>
    </ErrorBoundary>
  );
}
