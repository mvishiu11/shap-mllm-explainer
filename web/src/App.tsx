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

export default function App() {
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Model configuration state
  const [modelConfig, setModelConfig] = useState({
    source: "huggingface",
    modelPath: "",
    device: "cuda",
    precision: "float16",
  });

  // Input state
  const [textInput, setTextInput] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [alignment, setAlignment] = useState<any>(null);

  // Method configuration state
  const [methodConfig, setMethodConfig] = useState({
    method: "permutation-mc",
    sampleBudget: 1000,
    granularity: "token",
    audioGranularity: "segment",
    randomSeed: 42,
  });

  // Results state
  const [attributions, setAttributions] = useState<any>(null);
  const [costEstimate, setCostEstimate] = useState({ evaluations: 0, timeSeconds: 0 });

  const handleStartComputation = () => {
    setIsComputing(true);
    setProgress(0);

    // Simulate computation progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsComputing(false);
          // Generate mock attributions
          setAttributions({
            text: Array.from({ length: 20 }, () => Math.random()),
            audio: Array.from({ length: 30 }, () => Math.random()),
            timestamp: new Date().toISOString(),
          });
          return 100;
        }
        return prev + 5;
      });
    }, 500);
  };

  const handleCancelComputation = () => {
    setIsComputing(false);
    setProgress(0);
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
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
              disabled={!textInput && !audioFile}
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
                    onSessionLoad={(session) => {
                      setCurrentSession(session.id);
                      setModelConfig(session.modelConfig);
                      setMethodConfig(session.methodConfig);
                      setTextInput(session.textInput);
                      setAttributions(session.attributions);
                    }}
                    onSessionSave={() => {
                      // Save current session
                      const sessionId = `session_${Date.now()}`;
                      setCurrentSession(sessionId);
                    }}
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
                    textInput={textInput}
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
