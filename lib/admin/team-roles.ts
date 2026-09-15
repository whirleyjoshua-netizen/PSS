/** The tags a team member can have. Safe to import from client components. */
export const TEAM_ROLES = [
  { value: "designer", label: "Designer" },
  { value: "installer", label: "Installer" },
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number]["value"];

export const isTeamRole = (value: unknown): value is TeamRole =>
  TEAM_ROLES.some((role) => role.value === value);

export const roleLabel = (role: TeamRole): string =>
  TEAM_ROLES.find((r) => r.value === role)!.label;
