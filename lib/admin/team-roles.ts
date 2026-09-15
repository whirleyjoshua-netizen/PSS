/** The tags a team member can have. Safe to import from client components. */
export const TEAM_ROLES = [
  { value: "designer", label: "Designer" },
  { value: "installer", label: "Installer" },
] as const;

type RoleEntry = (typeof TEAM_ROLES)[number];

export type TeamRole = RoleEntry["value"];

export const isTeamRole = (value: unknown): value is TeamRole =>
  TEAM_ROLES.some((role) => role.value === value);

// Typed from TEAM_ROLES, so a role added there without a label here fails typecheck.
const ROLE_LABELS: { [R in TeamRole]: Extract<RoleEntry, { value: R }>["label"] } = {
  designer: "Designer",
  installer: "Installer",
};

export const roleLabel = (role: TeamRole): string => ROLE_LABELS[role];
