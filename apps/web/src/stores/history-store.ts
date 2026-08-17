export function createHistoryStore(limit = 50) {
  const items: any[] = [];
  return {
    list() {
      return [...items];
    },
    add(item: any) {
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
