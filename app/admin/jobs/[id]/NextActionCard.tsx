import { ButtonLink } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { nextAction } from "@/lib/admin/next-action";
import { CallButton } from "./CallButton";
import { FollowUpBox } from "./FollowUpBox";
import { StageControls } from "./StageControls";
import { CARD, HEADING } from "./ui";

export function NextActionCard({ job, measurementCount }: { job: Job; measurementCount: number }) {
  const action = nextAction(job, measurementCount);
  if (!action) return null;

  return (
    <section aria-labelledby="next-action-heading" className={`${CARD} border-l-4 border-l-champagne`}>
      <h2 id="next-action-heading" className={HEADING}>Next action</h2>
      <div className="flex flex-col gap-1">
        <p className="font-display text-xl">{action.title}</p>
        <p className="text-sm text-ink-soft">{action.detail}</p>
      </div>
      {action.cta?.kind === "call" ? <CallButton jobId={job.id} name={job.name} phone={job.phone} /> : null}
      {action.cta?.kind === "link" ? (
        <ButtonLink href={action.cta.href} variant="primary" className="w-full">{action.cta.label}</ButtonLink>
      ) : null}
      <FollowUpBox
        key={job.followUpAt?.toISOString() ?? "none"}
        job={{ id: job.id, followUpAt: job.followUpAt ?? null, followUpNote: job.followUpNote ?? null }}
      />
      <StageControls job={job} parts={["move"]} />
    </section>
  );
}
