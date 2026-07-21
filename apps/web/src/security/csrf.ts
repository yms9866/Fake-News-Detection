export function createCsrfToken(seed = `${Date.now()}-${Math.random()}`) {
  return btoa(seed).replace(/=+$/u, "");
}

export function validateCsrfToken(expected, received) {
  return Boolean(expected && received && expected === received);
}
