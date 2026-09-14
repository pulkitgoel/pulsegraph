export type NodeRole = 'lead-in' | 'pipeline' | 'service' | 'output';
export function roleOf(roles: Record<string, string>, id: string): NodeRole {
  const r = roles[id];
  return r === 'lead-in' || r === 'service' || r === 'output' ? r : 'pipeline';
}
export function validateRoles(value: unknown, ids: string[]): Record<string, NodeRole> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid presentation roles. Please retry.');
  const roles = value as Record<string, unknown>;
  const result: Record<string, NodeRole> = Object.create(null) as Record<
    string,
    NodeRole
  >;
  for (const id of ids) {
    const r = roles[id];
    if (r !== 'lead-in' && r !== 'pipeline' && r !== 'service' && r !== 'output')
      throw new Error(`Missing or invalid presentation role for ${id}. Please retry.`);
    result[id] = r;
  }
  return result;
}
