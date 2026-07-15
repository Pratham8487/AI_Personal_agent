import bcrypt from "bcryptjs";

const COST = 12;

// Compared against when the account is missing or has no password, so the
// request takes the same time either way (anti user-enumeration).
const DUMMY_HASH = bcrypt.hashSync("never-a-real-password", COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** Timing-uniform verify; migrated `$2a`/`$2b` hashes validate natively. */
export async function verifyPassword(
  password: string,
  hash: string | null
): Promise<boolean> {
  const matched = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && matched;
}
