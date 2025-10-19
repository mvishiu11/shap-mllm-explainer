import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { BarChart3, AudioLines, GitCompare } from "lucide-react";
import { TextAttributionView } from "./TextAttributionView";
import { AudioAttributionView } from "./AudioAttributionView";
import { ModalityComparisonView } from "./ModalityComparisonView";

interface VisualizationPanelProps {
  attributions: any;
  tokens: string[];
  audioFile: File | null;
  granularity: string;
}

export function VisualizationPanel({
  attributions,
  tokens,
  audioFile,
  granularity,
}: VisualizationPanelProps) {
  if (!attributions) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-slate-400 dark:text-slate-600">
            <BarChart3 className="h-16 w-16 mx-auto" />
          </div>
          <div>
            <h3 className="text-slate-700 dark:text-slate-300 mb-1">
              No Attributions Yet
            </h3>
            <p className="text-sm text-slate-500">
              Configure inputs and click "Compute Attribution" to begin analysis
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-slate-900 dark:text-slate-100 mb-1">Attribution Results</h3>
          <p className="text-sm text-slate-500">
            Shapley value attributions for input modalities
          </p>
        </div>
        <Badge variant="secondary">
          Computed: {new Date(attributions.timestamp).toLocaleTimeString()}
        </Badge>
      </div>

      <Tabs defaultValue="text" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="text" disabled={!tokens || tokens.length === 0}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Text Attribution
          </TabsTrigger>
          <TabsTrigger value="audio" disabled={!audioFile}>
            <AudioLines className="h-4 w-4 mr-2" />
            Audio Attribution
          </TabsTrigger>
          <TabsTrigger value="comparison" disabled={!tokens || tokens.length === 0 || !audioFile}>
            <GitCompare className="h-4 w-4 mr-2" />
            Modality Comparison
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-4">
          {(tokens && tokens.length !== 0) && (
            <TextAttributionView
              rawTokens={tokens}
              attributions={attributions.text}
              granularity={granularity}
            />
          )}
        </TabsContent>

        <TabsContent value="audio" className="mt-4">
          {audioFile && (
            <AudioAttributionView
              audioFile={audioFile}
              attributions={attributions.audio}
            />
          )}
        </TabsContent>

        <TabsContent value="comparison" className="mt-4">
          {tokens && tokens.length !== 0 && audioFile && (
            <ModalityComparisonView
              textAttributions={attributions.text}
              audioAttributions={attributions.audio}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
