export const LOCKED_BIO_USER_ID = "15132a6a-ea4f-4bae-9c17-1e4a84bd5e8c";
export const LOCKED_BIO = "noob";

export function isLockedBioProfile(profileId: string | null | undefined) {
  return profileId === LOCKED_BIO_USER_ID;
}
