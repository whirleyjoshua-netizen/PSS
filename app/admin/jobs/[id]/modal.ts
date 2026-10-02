// The native <dialog> helpers shared by the job page's modals (ScheduleDialog, NotesDialog).

/** Nothing to subscribe to: the store's only job is to differ between server and browser. */
export const subscribeNothing = () => () => {};

// showModal/close are missing in jsdom and in very old browsers; the open attribute still shows the dialog.
export function openModal(element: HTMLDialogElement | null) {
  if (!element) return;
  if (typeof element.showModal === "function") element.showModal();
  else element.setAttribute("open", "");
}

export function closeModal(element: HTMLDialogElement | null) {
  if (!element) return;
  if (typeof element.close === "function") element.close();
  else element.removeAttribute("open");
}
