export type DeletableProfile = {
  id: string;
  is_superadmin: boolean;
};

export function deleteUserBlockedReason(
  target: DeletableProfile,
  currentUserId: string,
): string | null {
  if (target.id === currentUserId) {
    return "No puedes eliminar tu propia cuenta.";
  }
  if (target.is_superadmin) {
    return "No se puede eliminar una cuenta superadministradora.";
  }
  return null;
}
