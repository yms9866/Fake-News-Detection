export function createOfflineQueue() {
  const items = [];
  return {
    enqueue(request) {
      items.push({ ...request, status: "queued" });
      return [...items];
    },
    list() {
      return [...items];
    },
    async flush(sender) {
      const sent = [];
      while (items.length > 0) {
        const item = items.shift();
        sent.push(await sender(item));
      }
      return sent;
    }
  };
}
