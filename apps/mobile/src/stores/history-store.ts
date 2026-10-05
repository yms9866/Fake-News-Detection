export function createHistoryStore(limit = 50) {
  const items: Array<Record<string, unknown>> = [];
  return {
    list() {
      return [...items];
    },
    add(item: Record<string, unknown>) {
      items.unshift(item);
      if (items.length > limit) {
        items.pop();
      }
      return [...items];
    },
    clear() {
      items.splice(0, items.length);
      return [];
    }
  };
}
