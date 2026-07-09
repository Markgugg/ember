import { create } from "zustand";

/**
 * The only global client store — UI chrome state.
 * Session (recorder/stream) state lives in stores/session.ts, scoped to the active run.
 * Everything else is server state (React Query) or URL state.
 */
interface UiState {
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
