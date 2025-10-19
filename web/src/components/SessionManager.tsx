import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Save, FolderOpen, Trash2, Download, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { ScrollArea } from "./ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

interface Session {
  id: string;
  name: string;
  timestamp: string;
  modelConfig: any;
  methodConfig: any;
  textInput: string;
  attributions: any;
}

interface SessionManagerProps {
  currentSession: string | null;
  onSessionLoad: (session: Session) => void;
  onSessionSave: () => void;
}

export function SessionManager({
  currentSession,
  onSessionLoad,
  onSessionSave,
}: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionName, setSessionName] = useState("");

  // Load sessions from localStorage on mount
  useEffect(() => {
    const storedSessions = localStorage.getItem("mllm-sessions");
    if (storedSessions) {
      setSessions(JSON.parse(storedSessions));
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem("mllm-sessions", JSON.stringify(sessions));
    }
  }, [sessions]);

  const handleSaveSession = () => {
    const newSession: Session = {
      id: `session_${Date.now()}`,
      name: sessionName || `Session ${sessions.length + 1}`,
      timestamp: new Date().toISOString(),
      modelConfig: {}, // Would be populated from parent
      methodConfig: {},
      textInput: "",
      attributions: null,
    };

    setSessions([newSession, ...sessions]);
    setSessionName("");
    onSessionSave();
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions(sessions.filter((s) => s.id !== sessionId));
  };

  const handleExportSession = (session: Session) => {
    const dataStr = JSON.stringify(session, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    
    const exportFileDefaultName = `${session.name.replace(/\s+/g, "_")}_${session.id}.json`;
    
    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-4">
      {/* Save Current Session */}
      <Card>
        <CardHeader>
          <CardTitle>Save Current Session</CardTitle>
          <CardDescription>
            Persist current configuration and results
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="session-name">Session Name</Label>
            <Input
              id="session-name"
              placeholder="e.g., Experiment 1 - Text+Audio"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveSession} className="w-full">
            <Save className="mr-2 h-4 w-4" />
            Save Session
          </Button>
        </CardContent>
      </Card>

      {/* Saved Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Saved Sessions
            <Badge variant="secondary">{sessions.length} saved</Badge>
          </CardTitle>
          <CardDescription>
            Load previous configurations and results
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No saved sessions yet</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-4 rounded-md border transition-all ${
                      currentSession === session.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-slate-900 dark:text-slate-100 mb-1">
                          {session.name}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          {formatDate(session.timestamp)}
                        </div>
                      </div>
                      {currentSession === session.id && (
                        <Badge variant="default">Active</Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => onSessionLoad(session)}
                      >
                        <FolderOpen className="h-3 w-3 mr-2" />
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExportSession(session)}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Session</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{session.name}"? This action
                              cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteSession(session.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Import Session */}
      <Card>
        <CardHeader>
          <CardTitle>Import Session</CardTitle>
          <CardDescription>
            Load a previously exported session file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  try {
                    const session = JSON.parse(event.target?.result as string);
                    setSessions([session, ...sessions]);
                  } catch (error) {
                    console.error("Failed to parse session file", error);
                  }
                };
                reader.readAsText(file);
              }
            }}
            className="hidden"
            id="import-session"
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => document.getElementById("import-session")?.click()}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Import Session File
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
