const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed uuid. Kept free of imports so any module can use it without a cycle. */
export const isUuid = (id: string): boolean => UUID.test(id);
