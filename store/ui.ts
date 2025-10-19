import { create } from "zustand";

type UIState = {
  activityCollapsed: boolean;
  focusedRunId?: string;
  toggleActivity: () => void;
  setFocusedRun: (id?: string) => void;
};

export const useUIStore = create<UIState>((set) => ({
  activityCollapsed: false,
  focusedRunId: undefined,
  toggleActivity: () =>
    set((state) => ({
      activityCollapsed: !state.activityCollapsed,
    })),
  setFocusedRun: (id) =>
    set(() => ({
      focusedRunId: id,
    })),
}));
