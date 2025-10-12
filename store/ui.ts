import { create } from "zustand";

type UIState = {
  navCollapsed: boolean;
  activityCollapsed: boolean;
  focusedRunId?: string;
  toggleNav: () => void;
  toggleActivity: () => void;
  setFocusedRun: (id?: string) => void;
};

export const useUIStore = create<UIState>((set) => ({
  navCollapsed: false,
  activityCollapsed: false,
  focusedRunId: undefined,
  toggleNav: () =>
    set((state) => ({
      navCollapsed: !state.navCollapsed,
    })),
  toggleActivity: () =>
    set((state) => ({
      activityCollapsed: !state.activityCollapsed,
    })),
  setFocusedRun: (id) =>
    set(() => ({
      focusedRunId: id,
    })),
}));
