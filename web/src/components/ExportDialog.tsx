import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Download, FileJson, FileImage, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { Badge } from "./ui/badge";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attributions: any;
  config: any;
}

export function ExportDialog({ open, onOpenChange, attributions, config }: ExportDialogProps) {
  const [exportOptions, setExportOptions] = useState({
    includeAttributions: true,
    includeConfig: true,
    includeVisualizations: true,
    includeStatistics: true,
  });

  const [exportFormat, setExportFormat] = useState<string>("json");
  const [figureFormat, setFigureFormat] = useState<string>("png");

  const handleExportData = () => {
    const exportData: any = {};

    if (exportOptions.includeConfig) {
      exportData.configuration = config;
    }

    if (exportOptions.includeAttributions && attributions) {
      exportData.attributions = attributions;
    }

    if (exportOptions.includeStatistics && attributions) {
      // Calculate statistics
      const textStats = attributions.text
        ? {
            mean: attributions.text.reduce((a: number, b: number) => a + b, 0) / attributions.text.length,
            max: Math.max(...attributions.text),
            min: Math.min(...attributions.text),
          }
        : null;

      const audioStats = attributions.audio
        ? {
            mean: attributions.audio.reduce((a: number, b: number) => a + b, 0) / attributions.audio.length,
            max: Math.max(...attributions.audio),
            min: Math.min(...attributions.audio),
          }
        : null;

      exportData.statistics = {
        text: textStats,
        audio: audioStats,
        timestamp: new Date().toISOString(),
      };
    }

    // Export based on format
    if (exportFormat === "json") {
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      const exportFileDefaultName = `mllm_attribution_${Date.now()}.json`;

      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", dataUri);
      linkElement.setAttribute("download", exportFileDefaultName);
      linkElement.click();
    } else if (exportFormat === "csv") {
      // Convert to CSV (simplified)
      let csvContent = "data:text/csv;charset=utf-8,";

      if (attributions.text) {
        csvContent += "Text Attributions\n";
        csvContent += "Index,Value\n";
        attributions.text.forEach((val: number, idx: number) => {
          csvContent += `${idx},${val}\n`;
        });
      }

      if (attributions.audio) {
        csvContent += "\nAudio Attributions\n";
        csvContent += "Segment,Value\n";
        attributions.audio.forEach((val: number, idx: number) => {
          csvContent += `${idx},${val}\n`;
        });
      }

      const exportFileDefaultName = `mllm_attribution_${Date.now()}.csv`;
      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", encodeURI(csvContent));
      linkElement.setAttribute("download", exportFileDefaultName);
      linkElement.click();
    }

    onOpenChange(false);
  };

  const handleExportFigures = () => {
    // This would typically use html2canvas or similar to capture visualizations
    alert(`Exporting figures as ${figureFormat.toUpperCase()} (implementation would capture current visualizations)`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Attribution Results</DialogTitle>
          <DialogDescription>
            Export your attribution data and visualizations for use in experiments and publications
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Export Options */}
          <div className="space-y-3">
            <Label className="text-base">Export Contents</Label>
            <div className="space-y-3 ml-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-attributions"
                  checked={exportOptions.includeAttributions}
                  onCheckedChange={(checked) =>
                    setExportOptions({ ...exportOptions, includeAttributions: checked as boolean })
                  }
                />
                <label
                  htmlFor="include-attributions"
                  className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Attribution values (raw data)
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-config"
                  checked={exportOptions.includeConfig}
                  onCheckedChange={(checked) =>
                    setExportOptions({ ...exportOptions, includeConfig: checked as boolean })
                  }
                />
                <label
                  htmlFor="include-config"
                  className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Configuration (model, method, parameters)
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-statistics"
                  checked={exportOptions.includeStatistics}
                  onCheckedChange={(checked) =>
                    setExportOptions({ ...exportOptions, includeStatistics: checked as boolean })
                  }
                />
                <label
                  htmlFor="include-statistics"
                  className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Statistical summaries
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-visualizations"
                  checked={exportOptions.includeVisualizations}
                  onCheckedChange={(checked) =>
                    setExportOptions({ ...exportOptions, includeVisualizations: checked as boolean })
                  }
                />
                <label
                  htmlFor="include-visualizations"
                  className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Visualization figures (separate export)
                </label>
              </div>
            </div>
          </div>

          {/* Data Format */}
          <div className="space-y-2">
            <Label htmlFor="export-format">Data Export Format</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger id="export-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    <span>JSON (machine-readable)</span>
                  </div>
                </SelectItem>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>CSV (spreadsheet-compatible)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Figure Format */}
          {exportOptions.includeVisualizations && (
            <div className="space-y-2">
              <Label htmlFor="figure-format">Figure Export Format</Label>
              <Select value={figureFormat} onValueChange={setFigureFormat}>
                <SelectTrigger id="figure-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">
                    <div className="flex items-center gap-2">
                      <FileImage className="h-4 w-4" />
                      <span>PNG (high quality)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="svg">
                    <div className="flex items-center gap-2">
                      <FileImage className="h-4 w-4" />
                      <span>SVG (vector, publication-ready)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pdf">
                    <div className="flex items-center gap-2">
                      <FileImage className="h-4 w-4" />
                      <span>PDF (publication-ready)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Export Preview */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md">
            <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
              <div className="flex items-center justify-between">
                <span>Files to be exported:</span>
                <Badge variant="secondary">
                  {1 + (exportOptions.includeVisualizations ? 1 : 0)} file(s)
                </Badge>
              </div>
              <ul className="ml-4 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                <li>• mllm_attribution_[timestamp].{exportFormat}</li>
                {exportOptions.includeVisualizations && (
                  <li>• visualizations_[timestamp].{figureFormat}</li>
                )}
              </ul>
            </div>
          </div>

          {/* Reproducibility Notice */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-xs text-blue-900 dark:text-blue-100">
              <strong>Reproducibility:</strong> Exported data includes all configuration parameters,
              random seeds, and software versions needed to reproduce results.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            onClick={handleExportData}
            className="flex-1"
            disabled={!attributions}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Data ({exportFormat.toUpperCase()})
          </Button>

          {exportOptions.includeVisualizations && (
            <Button
              onClick={handleExportFigures}
              variant="outline"
              className="flex-1"
              disabled={!attributions}
            >
              <FileImage className="mr-2 h-4 w-4" />
              Export Figures ({figureFormat.toUpperCase()})
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
