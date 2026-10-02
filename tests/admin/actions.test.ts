import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const jobs = {
  setStage: vi.fn(), updateDetails: vi.fn(), addNote: vi.fn(), createJob: vi.fn(), getJob: vi.fn(),
  assignJob: vi.fn(), deleteJob: vi.fn(),
};
vi.mock("@/lib/admin/jobs", () => jobs);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));
const referrals = { ensureReferralCode: vi.fn(), markReferralPaid: vi.fn() };
vi.mock("@/lib/referrals/db", () => referrals);
const sendReviewRequest = vi.fn();
vi.mock("@/lib/reviews/send", () => ({ sendReviewRequest }));
const reviewsDb = {
  setReviewOptOut: vi.fn(),
  stampReviewRequested: vi.fn(),
  restoreReviewRequested: vi.fn(),
  releaseReview: vi.fn(),
};
vi.mock("@/lib/reviews/db", () => reviewsDb);
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { (cb() as Promise<unknown> | undefined)?.catch?.(() => {}); } }));
const geocodeLead = vi.fn();
vi.mock("@/lib/routes/geocode", () => ({ geocodeLead }));
const invite = { autoInvite: vi.fn(), sendPortalInvite: vi.fn() };
vi.mock("@/lib/portal/invite", () => invite);
const syncJobCalendar = vi.fn();
vi.mock("@/lib/calendar/sync", () => ({ syncJobCalendar }));

const actions = await import("@/app/admin/jobs/actions");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const MEMBER = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) [value].flat().forEach((v) => data.append(key, v));
  return data;
};

beforeEach(() => {
  Object.values(jobs).forEach((fn) => fn.mockReset());
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  jobs.setStage.mockResolvedValue(true);
  jobs.updateDetails.mockResolvedValue({ saved: true, addressChanged: false });
  geocodeLead.mockReset().mockResolvedValue(undefined);
  jobs.addNote.mockResolvedValue(true);
  [...Object.values(referrals), sendReviewRequest, ...Object.values(reviewsDb)].forEach((fn) => fn.mockReset());
  jobs.getJob.mockResolvedValue({ id: ID, status: "installed", email: "dana@example.com", reviewOptOut: false });
  referrals.ensureReferralCode.mockResolvedValue("K7M2QX");
  referrals.markReferralPaid.mockResolvedValue(true);
  reviewsDb.setReviewOptOut.mockResolvedValue(true);
  reviewsDb.stampReviewRequested.mockResolvedValue({ previous: null });
  reviewsDb.restoreReviewRequested.mockResolvedValue(undefined);
  reviewsDb.releaseReview.mockResolvedValue(undefined);
  Object.values(invite).forEach((fn) => fn.mockReset());
  syncJobCalendar.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("without a session", () => {
  beforeEach(() => { requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT")); });

  it.each([
    ["moveStage", () => actions.moveStage(ID, "sold")],
    ["markLost", () => actions.markLost(ID, {}, form({ reason: "x" }))],
    ["saveDetails", () => actions.saveDetails(ID, {}, form({}))],
    ["saveNote", () => actions.saveNote(ID, {}, form({ body: "x" }))],
    ["addJob", () => actions.addJob({}, form({ name: "Dana", phone: "7025550134", city: "Henderson", source: "phone" }))],
    ["sendReviewNow", () => actions.sendReviewNow(ID, {}, form({}))],
    ["saveReviewOptOut", () => actions.saveReviewOptOut(ID, true)],
    ["createReferralLink", () => actions.createReferralLink(ID, {}, form({}))],
    ["payReferral", () => actions.payReferral(ID, ID, {}, form({}))],
    ["assignJobAction", () => actions.assignJobAction(ID, {}, form({ assignedTo: MEMBER }))],
    ["deleteJobAction", () => actions.deleteJobAction(ID, form({}))],
  ])("%s touches nothing", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    [...Object.values(jobs), ...Object.values(referrals), sendReviewRequest, ...Object.values(reviewsDb), syncJobCalendar, geocodeLead]
      .forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});

describe("with a session", () => {
  it("records the signed-in owner as the actor", async () => {
    await actions.moveStage(ID, "sold");
    expect(jobs.setStage).toHaveBeenCalledWith(ID, "sold", "owner@example.com");
  });

  it("returns the validation message instead of saving", async () => {
    const state = await actions.saveNote(ID, {}, form({ body: "  " }));
    expect(state.error).toMatch(/note/i);
    expect(jobs.addNote).not.toHaveBeenCalled();
  });

  it("saves details parsed from the form", async () => {
    const state = await actions.saveDetails(ID, {}, form({ city: "Henderson", quote: "4,500", brands: ["Hunter Douglas"] }));
    expect(state).toEqual({ ok: true });
    expect(jobs.updateDetails).toHaveBeenCalledWith(
      ID, expect.objectContaining({ brands: ["Hunter Douglas"] }), "owner@example.com",
    );
    // A stray money field in the form is ignored, never saved.
    const input = jobs.updateDetails.mock.calls[0][1];
    for (const key of ["quoteCents", "soldCents", "depositCents"]) expect(input).not.toHaveProperty(key);
  });

  it("saves the questionnaire fields from Job details", async () => {
    await actions.saveDetails(ID, {}, form({ city: "Henderson", windowCountExact: "12", treatmentTypes: ["shutters", "roman_shades"], motorized: "on", gateCode: "#4321" }));
    expect(jobs.updateDetails).toHaveBeenCalledWith(ID, expect.objectContaining({
      windowCountExact: 12, treatmentTypes: ["shutters", "roman_shades"], motorized: true,
    }), "owner@example.com");
    // A gate code sent anyway is dropped: the scheduler owns it now.
    expect(jobs.updateDetails.mock.calls[0][1]).not.toHaveProperty("gateCode");
  });

  it("saves an edited address and geocodes the job only when the address changed", async () => {
    jobs.updateDetails.mockResolvedValue({ saved: true, addressChanged: true });
    geocodeLead.mockRejectedValue(new Error("google down"));
    const state = await actions.saveDetails(ID, {}, form({ address: "12 Sample St", city: "North Las Vegas" }));
    expect(state).toEqual({ ok: true });
    expect(jobs.updateDetails).toHaveBeenCalledWith(ID, expect.objectContaining({ address: "12 Sample St", city: "North Las Vegas" }), "owner@example.com");
    expect(geocodeLead).toHaveBeenCalledWith(ID);
  });

  it("does not geocode when the address did not change", async () => {
    expect(await actions.saveDetails(ID, {}, form({ address: "12 Sample St", city: "Henderson" }))).toEqual({ ok: true });
    expect(geocodeLead).not.toHaveBeenCalled();
  });

  it("keeps the typed address and city when the details do not validate", async () => {
    const state = await actions.saveDetails(ID, {}, form({ address: "12 Sample St", city: "Reno" }));
    expect(state.values).toMatchObject({ address: "12 Sample St", city: "Reno" });
    expect(jobs.updateDetails).not.toHaveBeenCalled();
  });

  it("opens the new job after adding it", async () => {
    jobs.createJob.mockResolvedValue(ID);
    await expect(
      actions.addJob({}, form({ name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/admin/jobs/${ID}`);
  });

  it("adds a job in the chosen stage", async () => {
    jobs.createJob.mockResolvedValue(ID);
    await expect(
      actions.addJob({}, form({ name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "sold" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(jobs.createJob).toHaveBeenCalledWith(expect.objectContaining({ stage: "sold" }), "owner@example.com");
  });

  it("refuses a crafted add-job POST claiming the customer-only service source", async () => {
    // Asserted on the resolved value, not on the absence of a throw: under the wide schema this
    // action reaches the mocked redirect, and a rejects-based arrangement would fail on
    // NEXT_REDIRECT before either assertion ran — passing for the right reason by accident.
    await expect(
      actions.addJob({}, form({ name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "service" })),
    ).resolves.toMatchObject({ error: expect.any(String) });
    expect(jobs.createJob).not.toHaveBeenCalled();
  });

  it("reports a missing job when the note target no longer exists", async () => {
    jobs.addNote.mockResolvedValue(false);
    const state = await actions.saveNote(ID, {}, form({ body: "Hi" }));
    expect(state).toEqual({ error: "That job no longer exists." });
  });
});

describe("referrals and reviews", () => {
  it("sends a review request now as the signed-in owner", async () => {
    expect(await actions.sendReviewNow(ID, {}, form({}))).toEqual({ ok: true });
    expect(sendReviewRequest).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), "owner@example.com");
  });

  it("stamps review_requested_at before sending, so a crash never double-sends", async () => {
    const order: string[] = [];
    reviewsDb.stampReviewRequested.mockImplementation(async () => {
      order.push("stamp");
      return { previous: null };
    });
    sendReviewRequest.mockImplementation(async () => {
      order.push("send");
    });
    await actions.sendReviewNow(ID, {}, form({}));
    expect(reviewsDb.stampReviewRequested).toHaveBeenCalledWith(ID);
    expect(order).toEqual(["stamp", "send"]);
    expect(reviewsDb.restoreReviewRequested).not.toHaveBeenCalled();
  });

  it("restores the previous review_requested_at when the send fails", async () => {
    const previous = new Date("2026-01-01T00:00:00Z");
    reviewsDb.stampReviewRequested.mockResolvedValue({ previous });
    sendReviewRequest.mockRejectedValue(new Error("GOOGLE_REVIEW_URL is not set"));
    const state = await actions.sendReviewNow(ID, {}, form({}));
    expect(state.error).toMatch(/could not send/i);
    expect(reviewsDb.restoreReviewRequested).toHaveBeenCalledWith(ID, previous);
  });

  it("will not send to a job without an email", async () => {
    jobs.getJob.mockResolvedValue({ id: ID, status: "installed", email: null, reviewOptOut: false });
    expect((await actions.sendReviewNow(ID, {}, form({}))).error).toMatch(/no email/i);
    expect(sendReviewRequest).not.toHaveBeenCalled();
  });

  it("will not send when review requests are turned off", async () => {
    jobs.getJob.mockResolvedValue({ id: ID, status: "installed", email: "dana@example.com", reviewOptOut: true });
    expect((await actions.sendReviewNow(ID, {}, form({}))).error).toMatch(/turned off/i);
  });

  it("will not send before the job is installed, and claims nothing", async () => {
    jobs.getJob.mockResolvedValue({ id: ID, status: "sold", email: "dana@example.com", reviewOptOut: false });
    expect((await actions.sendReviewNow(ID, {}, form({}))).error).toMatch(/installed/i);
    expect(reviewsDb.stampReviewRequested).not.toHaveBeenCalled();
    expect(sendReviewRequest).not.toHaveBeenCalled();
  });

  it("sends a review request for a completed job", async () => {
    jobs.getJob.mockResolvedValue({ id: ID, status: "completed", email: "dana@example.com", reviewOptOut: false });
    expect(await actions.sendReviewNow(ID, {}, form({}))).toEqual({ ok: true });
    expect(sendReviewRequest).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), "owner@example.com");
    expect(reviewsDb.stampReviewRequested).toHaveBeenCalled();
  });

  it("reports a failed send inline", async () => {
    sendReviewRequest.mockRejectedValue(new Error("GOOGLE_REVIEW_URL is not set"));
    expect((await actions.sendReviewNow(ID, {}, form({}))).error).toMatch(/could not send/i);
  });

  it("saves the opt-out as the signed-in owner", async () => {
    await actions.saveReviewOptOut(ID, true);
    expect(reviewsDb.setReviewOptOut).toHaveBeenCalledWith(ID, true, "owner@example.com");
  });

  it("creates the referral link", async () => {
    expect(await actions.createReferralLink(ID, {}, form({}))).toEqual({ ok: true });
    expect(referrals.ensureReferralCode).toHaveBeenCalledWith(ID);
  });

  it("marks a reward paid, or says it is not owed", async () => {
    expect(await actions.payReferral("r1", ID, {}, form({}))).toEqual({ ok: true });
    expect(referrals.markReferralPaid).toHaveBeenCalledWith("r1", "owner@example.com");
    referrals.markReferralPaid.mockResolvedValue(false);
    expect((await actions.payReferral("r1", ID, {}, form({}))).error).toMatch(/not owed/i);
  });
});

describe("assignJobAction", () => {
  it("checks the session first, and '' unassigns", async () => {
    jobs.assignJob.mockResolvedValue("ok");
    const data = form({ assignedTo: "" });
    expect(await actions.assignJobAction(ID, {}, data)).toEqual({ ok: true });
    expect(requireAdmin).toHaveBeenCalled();
    expect(jobs.assignJob).toHaveBeenCalledWith(ID, null, "owner@example.com");
  });

  it("passes the chosen person through", async () => {
    jobs.assignJob.mockResolvedValue("ok");
    expect(await actions.assignJobAction(ID, {}, form({ assignedTo: MEMBER }))).toEqual({ ok: true });
    expect(jobs.assignJob).toHaveBeenCalledWith(ID, MEMBER, "owner@example.com");
  });

  it("treats an unchanged assignment as a success", async () => {
    jobs.assignJob.mockResolvedValue("unchanged");
    expect(await actions.assignJobAction(ID, {}, form({ assignedTo: MEMBER }))).toEqual({ ok: true });
  });

  it("explains a removed person and a missing job", async () => {
    const data = form({ assignedTo: MEMBER });
    jobs.assignJob.mockResolvedValue("unknown-member");
    expect(await actions.assignJobAction(ID, {}, data)).toEqual({ error: "That person is no longer on the team." });
    jobs.assignJob.mockResolvedValue("missing");
    expect(await actions.assignJobAction(ID, {}, data)).toEqual({ error: "That job no longer exists." });
  });
});

describe("Outlook calendar sync", () => {
  it("never syncs the calendar from Job details: it holds no date and no gate code", async () => {
    await actions.saveDetails(ID, {}, form({ city: "Henderson", orderedOn: "2026-10-02" }));
    expect(jobs.updateDetails).toHaveBeenCalledWith(
      ID, expect.objectContaining({ orderedOn: "2026-10-02" }), "owner@example.com",
    );
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });

  it("reports a job that no longer exists", async () => {
    jobs.updateDetails.mockResolvedValue({ saved: false, addressChanged: false });
    expect(await actions.saveDetails(ID, {}, form({ city: "Henderson" }))).toEqual({ error: "That job no longer exists." });
  });

  it("syncs after a job is marked lost, so its events are removed", async () => {
    await actions.markLost(ID, {}, form({ reason: "Went with another company" }));
    expect(syncJobCalendar).toHaveBeenCalledWith(ID);
  });

  it("syncs after a stage move, so a reopened job gets its events back", async () => {
    await actions.moveStage(ID, "quoted");
    expect(syncJobCalendar).toHaveBeenCalledWith(ID);
  });

  it("does not sync a stage move that changed nothing", async () => {
    jobs.setStage.mockResolvedValue(false);
    await actions.moveStage(ID, "quoted");
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });
});

describe("deleteJobAction", () => {
  beforeEach(() => { redirect.mockClear(); });

  it("deletes as the signed-in owner and sends them back to the board", async () => {
    jobs.deleteJob.mockResolvedValue("deleted");
    await expect(actions.deleteJobAction(ID, form({}))).rejects.toThrow("NEXT_REDIRECT");
    expect(jobs.deleteJob).toHaveBeenCalledWith(ID, "owner@example.com");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("sends the owner to the board when the job was already gone", async () => {
    jobs.deleteJob.mockResolvedValue("missing");
    await expect(actions.deleteJobAction(ID, form({}))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  // Not a returned form state: a plain form post throws one away, and the owner would
  // see nothing happen. The refusal has to survive as a redirect.
  it("returns the owner to the job with a fixed marker when a service request blocks it", async () => {
    jobs.deleteJob.mockResolvedValue("has-children");
    await expect(actions.deleteJobAction(ID, form({}))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/admin/jobs/${ID}?delete=blocked`);
  });
});
