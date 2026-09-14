export type CalendarConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
  clientState: string;
};

/** The Outlook settings, or null when any is missing, in which case the calendar feature is off. */
export function calendarConfig(): CalendarConfig | null {
  const config = {
    tenantId: process.env.MS_TENANT_ID ?? "",
    clientId: process.env.MS_CLIENT_ID ?? "",
    clientSecret: process.env.MS_CLIENT_SECRET ?? "",
    mailbox: process.env.CALENDAR_MAILBOX ?? "",
    clientState: process.env.CALENDAR_CLIENT_STATE ?? "",
  };
  return Object.values(config).every((value) => value.trim() !== "") ? config : null;
}

export const calendarEnabled = (): boolean => calendarConfig() !== null;
