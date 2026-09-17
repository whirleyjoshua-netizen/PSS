import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MessageFormState } from "@/app/(site)/project/actions";

/**
 * The form's own module is a server action file that reaches server-only code, so it is
 * mocked away: this test is about what the customer sees, not about the action.
 */
vi.mock("@/app/(site)/project/actions", () => ({ sendMessageAction: vi.fn() }));

// useActionState is stubbed so each outcome can be rendered directly. Driving the real hook
// would test React's transition machinery rather than the five states this form can show.
let state: MessageFormState = { status: "idle" };
let pending = false;
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [state, vi.fn(), pending] as const,
}));

const { MessageForm } = await import("@/app/(site)/project/MessageForm");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THANKS = "Thanks — we have your message and will come back to you.";
const box = () => screen.getByLabelText(/send us a message/i) as HTMLTextAreaElement;

beforeEach(() => {
  state = { status: "idle" };
  pending = false;
});

describe("MessageForm", () => {
  it("offers an empty message box and a Send button, and works without JavaScript", () => {
    render(<MessageForm jobId={JOB} messages={[]} />);
    expect(box()).toHaveValue("");
    expect(box()).toBeRequired();
    expect(box()).toHaveAttribute("maxLength", "2000");
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    // A plain form post carries the job id, so the action still knows the job with JS off.
    expect(document.querySelector('input[name="jobId"]')).toHaveValue(JOB);
  });

  it("thanks the customer once the message is sent, and clears the box", () => {
    state = { status: "sent", sent: 1 };
    render(<MessageForm jobId={JOB} messages={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent(THANKS);
    expect(box()).toHaveValue("");
  });

  it("says exactly the same thing to a double-click as to a first send", () => {
    state = { status: "throttled", text: "again" };
    render(<MessageForm jobId={JOB} messages={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent(THANKS);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for a shorter message and keeps what was typed", () => {
    state = { status: "too-long", text: "a very long message" };
    render(<MessageForm jobId={JOB} messages={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/shorten it to 2000 characters/i);
    expect(box()).toHaveValue("a very long message");
  });

  it("keeps what was typed when the project cannot be found", () => {
    state = { status: "not-found", text: "where are my blinds?" };
    render(<MessageForm jobId={JOB} messages={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not find that project/i);
    expect(box()).toHaveValue("where are my blinds?");
  });

  it("says nothing at all about a blank message, and keeps the form quiet", () => {
    state = { status: "empty", text: "   " };
    render(<MessageForm jobId={JOB} messages={[]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("disables the button while the message is in flight", () => {
    pending = true;
    render(<MessageForm jobId={JOB} messages={[]} />);
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  });

  it("lists the messages already sent, newest first, each with its date", () => {
    render(
      <MessageForm
        jobId={JOB}
        messages={[
          { body: "Any update?", at: "Sep 14, 2026" },
          { body: "Thanks for the quote", at: "Sep 2, 2026" },
        ]}
      />,
    );
    const sent = screen.getAllByRole("listitem");
    expect(sent).toHaveLength(2);
    expect(sent[0]).toHaveTextContent("Any update?");
    expect(sent[0]).toHaveTextContent("Sep 14, 2026");
    expect(sent[1]).toHaveTextContent("Thanks for the quote");
  });

  it("shows no message list before the customer has sent anything", () => {
    render(<MessageForm jobId={JOB} messages={[]} />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByText(/messages you have sent/i)).not.toBeInTheDocument();
  });
});
