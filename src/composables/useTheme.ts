import { useSettingsStore } from "@/stores/settings";
import { storeToRefs } from "pinia";

export function useTheme() {
  const store = useSettingsStore();
  const { theme } = storeToRefs(store);

  return {
    theme,
    toggleTheme: store.toggleTheme,
    setTheme: store.setTheme,
  };
}
