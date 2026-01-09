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
import { toast } from "sonner";

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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const toSvgBlob = (svgText: string) => new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });

  const svgToPngBlob = async (svgText: string, width: number, height: number): Promise<Blob> => {
    const svgBlob = toSvgBlob(svgText);
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to render SVG"));
        img.src = svgUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create PNG"))), "image/png");
      });
      return blob;
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

  const getBarColor = (v: number, minV: number, maxV: number) => {
    const range = maxV - minV;
    const t = range === 0 ? 0 : clamp01((v - minV) / range);
    if (t > 0.7) return "#ef4444";
    if (t > 0.5) return "#fb923c";
    if (t > 0.3) return "#facc15";
    if (t > 0.1) return "#86efac";
    return "#93c5fd";
  };

  const buildTextBarChartSvg = (tokens: string[], values: number[]) => {
    const n = Math.min(tokens.length, values.length);
    const width = 1200;
    const height = 500;
    const pad = 60;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    const data = Array.from({ length: n }, (_, i) => ({
      label: tokens[i]?.length > 10 ? `${tokens[i].slice(0, 10)}...` : tokens[i],
      value: values[i] ?? 0,
    }));
    const minV = Math.min(...data.map((d) => d.value));
    const maxV = Math.max(...data.map((d) => d.value));
    const absMax = Math.max(Math.abs(minV), Math.abs(maxV), 1e-9);

    const barW = innerW / Math.max(1, n);
    const y0 = pad + innerH / 2;

    const bars = data
      .map((d, i) => {
        const v = d.value;
        const h = (Math.abs(v) / absMax) * (innerH / 2);
        const x = pad + i * barW;
        const y = v >= 0 ? y0 - h : y0;
        const fill = getBarColor(v, minV, maxV);
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1, barW - 1).toFixed(
          2
        )}" height="${Math.max(1, h).toFixed(2)}" fill="${fill}" />`;
      })
      .join("\n");

    // Light axes
    const axes = `
      <line x1="${pad}" y1="${y0}" x2="${pad + innerW}" y2="${y0}" stroke="#94a3b8" stroke-width="1" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${pad + innerH}" stroke="#94a3b8" stroke-width="1" />
    `;

    return {
      width,
      height,
      svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="${pad}" y="${pad - 20}" font-family="ui-sans-serif, system-ui" font-size="18" fill="#0f172a">Text Attributions (Bar Chart)</text>
  ${axes}
  ${bars}
</svg>`,
    };
  };

  const buildAudioTimelineSvg = (values: number[]) => {
    const n = values.length;
    const width = 1200;
    const height = 420;
    const pad = 60;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1e-9;

    const points = values
      .map((v, i) => {
        const x = pad + (i / Math.max(1, n - 1)) * innerW;
        const t = (v - minV) / range;
        const y = pad + (1 - t) * innerH;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    const axes = `
      <line x1="${pad}" y1="${pad + innerH}" x2="${pad + innerW}" y2="${pad + innerH}" stroke="#94a3b8" stroke-width="1" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${pad + innerH}" stroke="#94a3b8" stroke-width="1" />
    `;

    return {
      width,
      height,
      svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="${pad}" y="${pad - 20}" font-family="ui-sans-serif, system-ui" font-size="18" fill="#0f172a">Audio Attributions (Timeline)</text>
  ${axes}
  <polyline fill="none" stroke="#3b82f6" stroke-width="2" points="${points}" />
</svg>`,
    };
  };

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
    const textValues: number[] = Array.isArray(attributions?.text) ? attributions.text : [];
    const audioValues: number[] = Array.isArray(attributions?.audio) ? attributions.audio : [];
    const tokens: string[] = Array.isArray(config?.tokens) ? config.tokens : [];

    if (textValues.length === 0 && audioValues.length === 0) {
      toast.error("No attributions available to export.");
      return;
    }

    const ts = Date.now();
    const jobs: Array<() => Promise<void>> = [];

    if (tokens.length > 0 && textValues.length > 0) {
      const { svg, width, height } = buildTextBarChartSvg(tokens, textValues);
      const nameBase = `mllm_text_attributions_${ts}`;
      if (figureFormat === "svg") {
        jobs.push(async () => downloadBlob(toSvgBlob(svg), `${nameBase}.svg`));
      } else {
        jobs.push(async () => downloadBlob(await svgToPngBlob(svg, width, height), `${nameBase}.png`));
      }
    }

    if (audioValues.length > 0) {
      const { svg, width, height } = buildAudioTimelineSvg(audioValues);
      const nameBase = `mllm_audio_attributions_${ts}`;
      if (figureFormat === "svg") {
        jobs.push(async () => downloadBlob(toSvgBlob(svg), `${nameBase}.svg`));
      } else {
        jobs.push(async () => downloadBlob(await svgToPngBlob(svg, width, height), `${nameBase}.png`));
      }
    }

    if (jobs.length === 0) {
      toast.error("Nothing to export (missing tokens for text graph).");
      return;
    }

    (async () => {
      try {
        for (const job of jobs) await job();
        toast.success("Exported figures.");
        onOpenChange(false);
      } catch (e) {
        toast.error(`Export failed: ${String(e)}`);
      }
    })();
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
