import { requireTeamMember } from "@/server/authorization";

export default async function TicketsPage() {
  await requireTeamMember();

  return (
    <div>
      <h1 className="text-xl font-semibold">Tickets</h1>
      <p className="text-muted-foreground text-sm">
        Ticket management is not built yet. Both ADMIN and TEAM_MEMBER can reach this page.
      </p>
    </div>
  );
}
