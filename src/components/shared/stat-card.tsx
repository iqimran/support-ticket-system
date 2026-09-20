import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: ReactNode;
  description?: string;
  className?: string;
};

export function StatCard({ label, value, description, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="space-y-1 p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
