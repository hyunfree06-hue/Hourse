import { create } from "zustand";

export type EditorTool =
  | "select"
  | "hand"
  | "frame"
  | "rect"
  | "ellipse"
  | "line"
  | "text"
  | "image"
  | "ai-region";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export type SelectedProps = {
  objectId?: string;
  type?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  angle?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  rx?: number;
  fontSize?: number;
  fontWeight?: string | number;
  textAlign?: string;
};

export type AiRegionState = {
  left: number;
  top: number;
  width: number;
  height: number;
} | null;

type EditorStore = {
  tool: EditorTool;
  zoom: number;
  saveStatus: SaveStatus;
  selected: SelectedProps | null;
  aiRegion: AiRegionState;
  aiPanelOpen: boolean;
  credits: number;
  projectName: string;
  backgroundColor: string;
  isMobilePreview: boolean;
  setTool: (tool: EditorTool) => void;
  setZoom: (zoom: number) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setSelected: (selected: SelectedProps | null) => void;
  setAiRegion: (region: AiRegionState) => void;
  setAiPanelOpen: (open: boolean) => void;
  setCredits: (credits: number) => void;
  setProjectName: (name: string) => void;
  setBackgroundColor: (color: string) => void;
  setIsMobilePreview: (value: boolean) => void;
};

export const useEditorStore = create<EditorStore>((set) => ({
  tool: "select",
  zoom: 1,
  saveStatus: "saved",
  selected: null,
  aiRegion: null,
  aiPanelOpen: false,
  credits: 0,
  projectName: "Untitled project",
  backgroundColor: "#ffffff",
  isMobilePreview: false,
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setSelected: (selected) => set({ selected }),
  setAiRegion: (aiRegion) => set({ aiRegion }),
  setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  setCredits: (credits) => set({ credits }),
  setProjectName: (projectName) => set({ projectName }),
  setBackgroundColor: (backgroundColor) => set({ backgroundColor }),
  setIsMobilePreview: (isMobilePreview) => set({ isMobilePreview }),
}));
