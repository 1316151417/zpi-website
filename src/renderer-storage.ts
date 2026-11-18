// The upstream renderer uses the Web Storage API for UI preferences and input history.
// Shadow it only in its own frame, before importing any upstream module.
const values = new Map<string, string>();
const storage: Storage = {
  get length() {
    return values.size;
  },
  key: (index) => [...values.keys()][index] ?? null,
  getItem: (key) => values.get(String(key)) ?? null,
  setItem: (key, value) => {
    values.set(String(key), String(value));
  },
  removeItem: (key) => {
    values.delete(String(key));
  },
  clear: () => values.clear(),
};
Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
export {};
