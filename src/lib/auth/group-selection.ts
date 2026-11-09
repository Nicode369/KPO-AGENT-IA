export type GroupOption = {
  id: string;
  name: string;
};

export function selectActiveGroup(
  groups: GroupOption[],
  requestedGroupId?: string | null,
): GroupOption | null {
  if (!groups.length) return null;

  if (requestedGroupId) {
    const requested = groups.find((group) => group.id === requestedGroupId);
    if (requested) return requested;
  }

  return (
    groups.find((group) => group.name.trim().toLowerCase() === "kpo") ??
    groups[0]
  );
}
