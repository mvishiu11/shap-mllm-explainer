import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Save, FolderOpen, Trash2, Download, Clock, RefreshCw } from "lucide-react"; // Added RefreshCw
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
import { toast } from "sonner"; // Added toast

// Define Session types matching backend
interface SessionListItem {
  id: number;
  name: string;
  created_at: string; // ISO string
}

interface SessionFull extends SessionListItem {
  text_input: string | null;
  model_settings: any;
  method_settings: any;
  attributions: any;
}

const API_BASE_URL = "/api"; // Use v1 prefix

interface SessionManagerProps {
  currentSession: string | null;
  onSessionLoad: (session: SessionFull) => void;
  currentModelConfig: any;
  currentMethodConfig: any;
  currentTextInput: string;
  currentAttributions: any;
  currentRealTokens: string[];
}

export function SessionManager({
  currentSession,
  onSessionLoad,
  // onSessionSave,
  currentModelConfig,
  currentMethodConfig,
  currentTextInput,
  currentAttributions,
  currentRealTokens,
}: SessionManagerProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionName, setSessionName] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingSave, setIsLoadingSave] = useState(false);
  const [isLoadingLoad, setIsLoadingLoad] = useState<number | null>(null); // Store ID being loaded

  // Function to fetch session list
  const fetchSessions = async () => {
    setIsLoadingList(true);
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/`);
      if (!response.ok) {
        throw new Error("Failed to fetch sessions");
      }
      const data: SessionListItem[] = await response.json();
      setSessions(data);
    } catch (error) {
      console.error("Fetch sessions error:", error);
      toast.error(`Failed to load sessions: ${String(error)}`);
      setSessions([]); // Clear sessions on error
    } finally {
      setIsLoadingList(false);
    }
  };

  // Load sessions from backend on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Removed useEffect for localStorage

  const handleSaveSession = async () => {
    setIsLoadingSave(true);
    const nameToSave = sessionName.trim() || `Session ${new Date().toLocaleString()}`;
    toast.info(`Saving session: ${nameToSave}...`);

    try {
      // Structure attributions to include tokens if available
      const attributionsToSave = currentAttributions
        ? {
            ...currentAttributions, // Includes 'text', 'audio', 'timestamp'
            tokens: currentRealTokens, // Add the actual tokens
          }
        : {};

      const response = await fetch(`${API_BASE_URL}/sessions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameToSave,
          text_input: currentTextInput || null,
          model_settings: currentModelConfig, // Renamed in backend model
          method_settings: currentMethodConfig, // Renamed in backend model
          attributions: attributionsToSave,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to save session");
      }

      const newSession: SessionFull = await response.json();
      toast.success(`Session saved: ${newSession.name}`);
      setSessionName(""); // Clear input
      // Add to list optimistically or refetch
      // setSessions([newSession, ...sessions]); // Use list item type if adding optimistically
      await fetchSessions(); // Refetch to get updated list with correct ID and timestamp
    } catch (error) {
      console.error("Save session error:", error);
      toast.error(`Failed to save session: ${String(error)}`);
    } finally {
      setIsLoadingSave(false);
    }
  };

  const handleLoadFullSession = async (sessionId: number) => {
    setIsLoadingLoad(sessionId);
    toast.info(`Loading session ID: ${sessionId}...`);
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);
      if (!response.ok) {
        throw new Error(`Failed to load session details (ID: ${sessionId})`);
      }
      const fullSessionData: SessionFull = await response.json();

      // Pass the full data up to App.tsx
      onSessionLoad(fullSessionData);
      // No toast here, App.tsx handles success message

    } catch (error) {
      console.error("Load session error:", error);
      toast.error(`Failed to load session: ${String(error)}`);
    } finally {
      setIsLoadingLoad(null);
    }
  };


  const handleDeleteSession = async (sessionId: number, sessionName: string) => {
    toast.info(`Deleting session: ${sessionName}...`);
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        // Handle potential 404 if already deleted
        if (response.status === 404) {
           toast.warning(`Session "${sessionName}" not found.`);
        } else {
            const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
            throw new Error(errorData.detail || `Failed to delete session (Status: ${response.status})`);
        }
      } else {
         toast.success(`Session deleted: ${sessionName}`);
      }

      // Refresh list after delete
      await fetchSessions();

    } catch (error) {
      console.error("Delete session error:", error);
      toast.error(`Failed to delete session: ${String(error)}`);
    }
  };


  // --- Export and Import remain mostly the same (using local data for export) ---
  const handleExportSession = async (sessionListItem: SessionListItem) => {
     // Fetch full details before exporting
     toast.info(`Fetching details for export: ${sessionListItem.name}...`);
     try {
       const response = await fetch(`${API_BASE_URL}/sessions/${sessionListItem.id}`);
       if (!response.ok) {
         throw new Error(`Failed to fetch session details for export (ID: ${sessionListItem.id})`);
       }
       const fullSessionData: SessionFull = await response.json();

       const dataStr = JSON.stringify(fullSessionData, null, 2);
       const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
       const exportFileDefaultName = `${fullSessionData.name.replace(/\s+/g, "_")}_${fullSessionData.id}.json`;

       const linkElement = document.createElement("a");
       linkElement.setAttribute("href", dataUri);
       linkElement.setAttribute("download", exportFileDefaultName);
       linkElement.click();
       toast.success(`Exported session: ${fullSessionData.name}`);
     } catch (error) {
        console.error("Export session error:", error);
        toast.error(`Failed to export session: ${String(error)}`);
     }
   };

  const handleImportSession = async (sessionData: SessionFull) => {
      // Send the imported data to the backend to save it
      setIsLoadingSave(true); // Reuse save loading state
      const nameToSave = sessionData.name || `Imported Session ${new Date().toLocaleString()}`;
      toast.info(`Importing session: ${nameToSave}...`);

      try {
          const response = await fetch(`${API_BASE_URL}/sessions/`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  // Extract fields matching SessionCreate
                  name: nameToSave,
                  text_input: sessionData.text_input || null,
                  model_settings: sessionData.model_settings || {},
                  method_settings: sessionData.method_settings || {},
                  attributions: sessionData.attributions || {},
              }),
          });

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.detail || "Failed to import session");
          }
          const importedSession: SessionFull = await response.json();
          toast.success(`Session imported and saved: ${importedSession.name}`);
          await fetchSessions(); // Refresh list
      } catch (error) {
          console.error("Import session error:", error);
          toast.error(`Failed to import session: ${String(error)}`);
      } finally {
          setIsLoadingSave(false);
      }
  };


  const formatDate = (isoString: string) => {
    try {
        const date = new Date(isoString);
        return date.toLocaleString();
    } catch {
        return "Invalid date";
    }
  };

  return (
    <div className="space-y-4">
      {/* Save Current Session */}
      <Card>
        <CardHeader>
          <CardTitle>Save Current Session</CardTitle>
          <CardDescription>
            Persist current configuration and results to the database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="session-name">Session Name (Optional)</Label>
            <Input
              id="session-name"
              placeholder={`Default: Session ${new Date().toLocaleString()}`}
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              disabled={isLoadingSave}
            />
          </div>
          <Button
             onClick={handleSaveSession}
             className="w-full"
             disabled={isLoadingSave || (!currentTextInput && !currentAttributions)} // Disable if nothing to save
           >
            <Save className={`mr-2 h-4 w-4 ${isLoadingSave ? 'animate-spin' : ''}`} />
            {isLoadingSave ? "Saving..." : "Save Session"}
          </Button>
        </CardContent>
      </Card>

      {/* Saved Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Saved Sessions
            <div className="flex items-center gap-2">
                 <Button variant="ghost" size="sm" onClick={fetchSessions} disabled={isLoadingList}>
                      <RefreshCw className={`h-4 w-4 ${isLoadingList ? 'animate-spin': ''}`} />
                 </Button>
                 <Badge variant="secondary">{sessions.length} saved</Badge>
            </div>
          </CardTitle>
          <CardDescription>
            Load previous results from the database
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingList ? (
             <div className="text-center py-8 text-slate-500">Loading sessions...</div>
          ) : sessions.length === 0 ? (
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
                      // Compare string ID from state with number ID from list
                      currentSession === String(session.id)
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      {/* ... Session name and timestamp ... */}
                       <div className="flex-1 overflow-hidden"> {/* Added overflow hidden */}
                         <h4 className="text-slate-900 dark:text-slate-100 mb-1 truncate"> {/* Added truncate */}
                           {session.name}
                         </h4>
                         <div className="flex items-center gap-2 text-xs text-slate-500">
                           <Clock className="h-3 w-3 flex-shrink-0" /> {/* Added flex shrink */}
                           <span>{formatDate(session.created_at)}</span> {/* Changed property */}
                         </div>
                       </div>
                      {currentSession === String(session.id) && (
                        <Badge variant="default" className="ml-2 flex-shrink-0">Active</Badge> // Added margin/shrink
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleLoadFullSession(session.id)} // Load full session by ID
                        disabled={isLoadingLoad === session.id} // Disable only the loading button
                      >
                         {isLoadingLoad === session.id ? (
                              <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                         ) : (
                              <FolderOpen className="h-3 w-3 mr-2" />
                         )}
                        {isLoadingLoad === session.id ? "Loading..." : "Load"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExportSession(session)} // Pass list item
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
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
                              onClick={() => handleDeleteSession(session.id, session.name)}
                              variant="destructive"
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
             Load and save a previously exported session file (.json)
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
                     const session = JSON.parse(event.target?.result as string) as SessionFull;
                     // Validate basic structure? (Optional)
                     if (session && session.name && session.model_settings && session.method_settings) {
                        handleImportSession(session); // Call handler to save to backend
                     } else {
                        throw new Error("Invalid session file format.");
                     }
                   } catch (error) {
                     console.error("Failed to parse or import session file", error);
                     toast.error(`Import failed: ${String(error)}`);
                   } finally {
                      // Reset file input to allow importing the same file again
                      if (e.target) e.target.value = '';
                   }
                 };
                 reader.onerror = () => {
                     toast.error("Failed to read the session file.");
                     if (e.target) e.target.value = '';
                 }
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
            disabled={isLoadingSave} // Disable if another save/import is happening
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Import Session File
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
