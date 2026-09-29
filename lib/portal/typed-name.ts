/**
 * The longest name a customer may type to sign or acknowledge. Shared by both portal actions
 * and both forms, so the input's maxLength and the server's own check can never drift apart.
 * Kept out of actions.ts because a "use server" file may export only async functions, and out
 * of sign.ts because that module is server-only.
 */
export const TYPED_NAME_MAX = 200;

/** True when the name, as it would be recorded (trimmed), is longer than the cap. */
export const isTypedNameTooLong = (name: string): boolean => name.trim().length > TYPED_NAME_MAX;
