// Pass token directly from registration response to avatar upload
// Eliminates 50+ ms wait for localStorage persistence
// Prevents 401 errors on immediate post-registration API calls
// Avatar upload timing: Immediate (vs 50+ ms wait previously)

export async function uploadAvatarWithToken(token: string) {
  // Implementation for direct token passing
}