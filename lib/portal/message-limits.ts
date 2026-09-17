/**
 * Shared by the server action and the client form, so the textarea's maxLength and the
 * server's own check can never drift apart. Kept out of messages.ts because that module
 * is server-only and the form is a client component.
 */
export const MESSAGE_MAX = 2000;
