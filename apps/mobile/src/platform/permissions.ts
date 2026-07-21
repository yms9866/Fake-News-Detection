export class PermissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PermissionError";
    this.code = code;
  }
}

export async function requirePermission(permission, adapter) {
  const granted = await adapter.request(permission);
  if (!granted) {
    throw new PermissionError(`MOBILE_${permission.toUpperCase()}_PERMISSION_DENIED`, `${permission} permission was denied.`);
  }
  return true;
}
