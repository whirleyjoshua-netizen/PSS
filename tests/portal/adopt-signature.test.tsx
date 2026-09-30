import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { PNG_DATA_URL_MAX } from "@/lib/portal/adoption-limits";

vi.mock("@/app/(site)/project/actions", () => ({ signContractFormAction: vi.fn() }));
const { SignContract } = await import("@/app/(site)/project/SignContract");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const MARKS = { initials: [{ page: 1, x: 502, y: 700, section: "4" }], signature: { page: 2, x: 154, y: 300 } };
const FILE = { id: "22222222-2222-4222-8222-222222222222", name: "Contract.pdf", signMarks: MARKS };
const PLAIN = { ...FILE, signMarks: { initials: [], signature: MARKS.signature } };
const URL_OK = "data:image/png;base64,iVBORw0KGgo=";

// jsdom may lack PointerEvent. A MouseEvent subclass carries clientX/clientY and pointerId.
beforeAll(() => {
  if (!("PointerEvent" in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    }
    Object.assign(window, { PointerEvent: PointerEventPolyfill });
  }
});

const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(), lineCap: "", lineJoin: "", strokeStyle: "", lineWidth: 0 };
beforeEach(() => {
  for (const fn of [ctx.beginPath, ctx.moveTo, ctx.lineTo, ctx.stroke, ctx.clearRect]) fn.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(URL_OK);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  Object.defineProperty(window, "devicePixelRatio", { value: 3, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

const draw = (canvas: HTMLElement) => {
  fireEvent.pointerDown(canvas, { clientX: 150, clientY: 50, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 60, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 200, clientY: 60, pointerId: 1 });
};
const field = (form: HTMLFormElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);
// React's server renderer puts <!-- --> between adjacent text nodes ("sign this {noun} electronically").
const markup = (element: ReactElement) => renderToStaticMarkup(element).replace(/<!-- -->/g, "");

describe("with JavaScript off (the server-rendered HTML)", () => {
  it("is a typed form: method typed, name, initials, and no Draw and no pad", () => {
    const html = markup(<SignContract jobId={JOB} file={FILE} />);
    expect(html).toContain('name="signatureMethod" value="typed"');
    expect(html).toContain('name="signedName"');
    // Inside a form with an action, React's server renderer writes `name` last, so find the tag first.
    const initialsTag = html.match(/<input[^>]*name="signedInitials"[^>]*>/)?.[0];
    expect(initialsTag).toContain('required=""');
    expect(initialsTag).toContain('pattern="[A-Za-z][A-Za-z.\\- ]{0,5}"');
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain(">Draw<");
    expect(html).toContain("I agree to sign this contract electronically and to initial every numbered section");
  });
  it("asks for no initials when the document has no numbered sections", () => {
    const html = markup(<SignContract jobId={JOB} file={PLAIN} />);
    expect(html).not.toContain('name="signedInitials"');
    expect(html).toContain("I agree to sign this contract electronically</label>");
  });
  it("asks for no initials on a hand-uploaded contract (no marks at all)", () => {
    const html = markup(<SignContract jobId={JOB} file={{ id: FILE.id, name: FILE.name }} />);
    expect(html).not.toContain('name="signedInitials"');
  });
});

describe("typing", () => {
  it("previews the name and initials in the handwriting font as they are typed", () => {
    render(<SignContract jobId={JOB} file={FILE} />);
    fireEvent.change(screen.getByLabelText("Your full name"), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText("Your initials"), { target: { value: "JD" } });
    const preview = screen.getByTestId("signature-preview");
    expect(preview).toHaveTextContent("Jane Doe");
    expect(preview).toHaveTextContent("JD");
    expect(preview.querySelector(".font-hand")).not.toBeNull();
  });
  it("limits typed initials in the browser as the server does", () => {
    render(<SignContract jobId={JOB} file={FILE} />);
    const initials = screen.getByLabelText("Your initials");
    expect(initials).toHaveAttribute("maxLength", "6");
    expect(initials).toBeRequired();
    expect(initials).toHaveAttribute("pattern", "[A-Za-z][A-Za-z.\\- ]{0,5}");
  });
});

describe("drawing", () => {
  it("switches to two pads, posts method drawn, and drops the typed initials field", () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    expect(field(form, "signatureMethod")!.value).toBe("drawn");
    expect(field(form, "signedInitials")).toBeNull();
    expect(screen.getByLabelText("Signature pad").tagName).toBe("CANVAS");
    expect(screen.getByLabelText("Initials pad").tagName).toBe("CANVAS");
    expect(screen.getByLabelText("Your full name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    expect(field(form, "signatureMethod")!.value).toBe("typed");
    expect(screen.queryByLabelText("Signature pad")).toBeNull();
  });
  it("never posts a drawing the pad no longer shows: back from Type, the pads start empty", () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    draw(screen.getByLabelText("Signature pad"));
    draw(screen.getByLabelText("Initials pad"));
    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    // The remounted canvases are blank, so their carriers must be too, and the submit is blocked.
    expect(field(form, "signatureImage")!.value).toBe("");
    expect(field(form, "initialsImage")!.value).toBe("");
    expect(field(form, "signatureImage")!.checkValidity()).toBe(false);
    expect(field(form, "initialsImage")!.checkValidity()).toBe(false);
  });
  it("shows only the signature pad when the document has no numbered sections", () => {
    render(<SignContract jobId={JOB} file={PLAIN} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    expect(screen.getByLabelText("Signature pad")).toBeInTheDocument();
    expect(screen.queryByLabelText("Initials pad")).toBeNull();
  });
  it("carries the strokes as a PNG data URL, and Clear empties it", () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    draw(screen.getByLabelText("Signature pad"));
    expect(field(form, "signatureImage")!.value).toBe(URL_OK);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png");
    fireEvent.click(screen.getByRole("button", { name: "Clear signature" }));
    expect(field(form, "signatureImage")!.value).toBe("");
    expect(ctx.clearRect).toHaveBeenCalled();
  });
  it("blocks the submit while a pad is empty: the carrier is required and not read-only", () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    const carrier = field(form, "signatureImage")!;
    expect(carrier).toBeRequired();
    expect(carrier).not.toHaveAttribute("readonly");
    expect(carrier.checkValidity()).toBe(false);
    draw(screen.getByLabelText("Signature pad"));
    expect(carrier.checkValidity()).toBe(true);
  });
  it("names what is missing on an empty pad, and keeps the carrier out of the accessibility tree", () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    const signature = field(form, "signatureImage")!;
    const initials = field(form, "initialsImage")!;
    expect(signature.validationMessage).toBe("Draw your signature");
    expect(initials.validationMessage).toBe("Draw your initials");
    for (const carrier of [signature, initials]) {
      expect(carrier).toHaveAttribute("aria-hidden", "true");
      expect(carrier).toHaveAttribute("tabindex", "-1");
      expect(carrier).toBeRequired();
    }
    draw(screen.getByLabelText("Signature pad"));
    expect(signature.validationMessage).toBe("");
    expect(signature.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear signature" }));
    expect(signature.validationMessage).toBe("Draw your signature");
  });
  it("draws one stroke per finger: a second finger neither extends nor ends the stroke", () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    const pad = screen.getByLabelText("Signature pad");
    fireEvent.pointerDown(pad, { clientX: 150, clientY: 50, pointerId: 1 });
    ctx.lineTo.mockClear();
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(pad, { clientX: 20, clientY: 20, pointerId: 2 });
    fireEvent.pointerUp(pad, { clientX: 20, clientY: 20, pointerId: 2 });
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
    expect(field(form, "signatureImage")!.value).toBe("");
    fireEvent.pointerMove(pad, { clientX: 200, clientY: 60, pointerId: 1 });
    expect(ctx.lineTo).toHaveBeenCalledWith(400, 120);
    fireEvent.pointerUp(pad, { clientX: 200, clientY: 60, pointerId: 1 });
    expect(field(form, "signatureImage")!.value).toBe(URL_OK);
  });
  it("refuses a drawing too large to send, and says so", () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue(`data:image/png;base64,${"A".repeat(PNG_DATA_URL_MAX)}`);
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    draw(screen.getByLabelText("Signature pad"));
    expect(field(container.querySelector("form")!, "signatureImage")!.value).toBe("");
    expect(screen.getByRole("alert")).toHaveTextContent("too detailed");
  });
});

describe("the pad on a phone (Review Focus: mobile canvas)", () => {
  it("never scrolls the page while drawing, and fits the screen", () => {
    render(<SignContract jobId={JOB} file={FILE} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    const pad = screen.getByLabelText("Signature pad");
    expect(pad).toHaveClass("touch-none");
    expect(pad).toHaveClass("w-full");
    expect(pad.style.maxWidth).toBe("600px");
    expect(screen.getByLabelText("Initials pad").style.maxWidth).toBe("200px");
  });
  it("sizes the bitmap from its laid-out size at a pixel ratio capped at 2, and maps touches into it", () => {
    render(<SignContract jobId={JOB} file={FILE} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    const pad = screen.getByLabelText("Signature pad") as HTMLCanvasElement;
    draw(pad);
    // Laid out 300 x 100 at devicePixelRatio 3, capped at 2: a 600 x 200 bitmap, within 1200 x 400.
    expect([pad.width, pad.height]).toEqual([600, 200]);
    // A touch at (150, 50) CSS px lands at (300, 100) in the bitmap.
    expect(ctx.moveTo).toHaveBeenCalledWith(300, 100);
  });
});

// With JavaScript on, React posts `action={...}` itself and resets the form once the action settles.
// In the app a refusal redirects to ?signed=missing, a soft navigation that keeps this component
// mounted; here the mocked action returns, which triggers the same reset.
describe("after a refused sign (React resets the form once its action settles)", () => {
  const submit = async (form: HTMLFormElement) => {
    await act(async () => {
      fireEvent.submit(form);
    });
  };
  it("keeps the typed name, the initials and the typed method", async () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    fireEvent.change(screen.getByLabelText("Your full name"), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText("Your initials"), { target: { value: "JD" } });
    await submit(form);
    expect(field(form, "signatureMethod")!.value).toBe("typed");
    expect(field(form, "signedName")!.value).toBe("Jane Doe");
    expect(field(form, "signedInitials")!.value).toBe("JD");
    expect(screen.getByTestId("signature-preview")).toHaveTextContent("Jane Doe");
  });
  it("keeps the drawn method, and each pad still posts the drawing it shows", async () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.change(screen.getByLabelText("Your full name"), { target: { value: "Jane Doe" } });
    draw(screen.getByLabelText("Signature pad"));
    draw(screen.getByLabelText("Initials pad"));
    ctx.clearRect.mockClear();
    await submit(form);
    expect(field(form, "signatureMethod")!.value).toBe("drawn");
    expect(field(form, "signedName")!.value).toBe("Jane Doe");
    expect(field(form, "signatureImage")!.value).toBe(URL_OK);
    expect(field(form, "initialsImage")!.value).toBe(URL_OK);
    expect(ctx.clearRect).not.toHaveBeenCalled();
  });
});
