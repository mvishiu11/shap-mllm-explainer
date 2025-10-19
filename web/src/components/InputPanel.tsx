import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Upload, FileAudio, X, AlignCenter } from "lucide-react";
import { useRef } from "react";

interface InputPanelProps {
  textInput: string;
  onTextChange: (text: string) => void;
  audioFile: File | null;
  onAudioChange: (file: File | null) => void;
  alignment: any;
  onAlignmentChange: (alignment: any) => void;
}

export function InputPanel({
  textInput,
  onTextChange,
  audioFile,
  onAudioChange,
  alignment,
  onAlignmentChange,
}: InputPanelProps) {
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleAudioUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onAudioChange(file);
      // Auto-detect alignment if possible
      onAlignmentChange({ type: "auto", segments: [] });
    }
  };

  const handleRemoveAudio = () => {
    onAudioChange(null);
    onAlignmentChange(null);
    if (audioInputRef.current) {
      audioInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-slate-900 dark:text-slate-100 mb-1">Input Modalities</h3>
        <p className="text-sm text-slate-500">
          Provide text and/or audio input for attribution analysis
        </p>
      </div>

      {/* Text Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Text Input
            {textInput && (
              <Badge variant="secondary">
                {textInput.split(/\s+/).filter(Boolean).length} words
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Enter or paste text for analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter text here..."
            value={textInput}
            onChange={(e) => onTextChange(e.target.value)}
            className="min-h-[120px] font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Audio Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Audio Input
            {audioFile && (
              <Badge variant="secondary">
                <FileAudio className="h-3 w-3 mr-1" />
                {(audioFile.size / 1024 / 1024).toFixed(2)} MB
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Upload an audio file for multi-modal analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!audioFile ? (
            <div>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                className="hidden"
                id="audio-upload"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => audioInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Audio File
              </Button>
              <p className="text-xs text-slate-500 mt-2">
                Supported formats: WAV, MP3, FLAC, M4A
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-md">
                <div className="flex items-center gap-3">
                  <FileAudio className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-sm text-slate-900 dark:text-slate-100">
                      {audioFile.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveAudio}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Audio Preview */}
              <audio
                controls
                className="w-full"
                src={URL.createObjectURL(audioFile)}
              />

              {/* Alignment Control */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Sentence-level alignment
                </div>
                <Button variant="outline" size="sm">
                  <AlignCenter className="h-4 w-4 mr-2" />
                  {alignment ? "Aligned" : "Detect"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Input Summary */}
      {(textInput || audioFile) && (
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="text-sm text-blue-900 dark:text-blue-100 space-y-1">
            <div>
              <strong>Input Summary:</strong>
            </div>
            <div className="ml-4 space-y-1">
              {textInput && (
                <div className="flex items-center gap-2">
                  <span className="text-blue-700 dark:text-blue-300">•</span>
                  <span>Text: {textInput.split(/\s+/).filter(Boolean).length} words</span>
                </div>
              )}
              {audioFile && (
                <div className="flex items-center gap-2">
                  <span className="text-blue-700 dark:text-blue-300">•</span>
                  <span>Audio: {audioFile.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
