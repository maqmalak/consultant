import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface QueueConfig {
  title: string;
  subtitle: string;
  states: string[];
  icon: typeof RefreshCw;
  description: string;
}

export const QUEUES: QueueConfig[] = [
  { title: "Review queue", subtitle: "Submitted returns awaiting review", states: ["Submitted"], icon: RefreshCw, description: "Starts the review process for returns submitted by your consultants." },
  { title: "Approval queue", subtitle: "Returns under review", states: ["Under Review"], icon: RefreshCw, description: "Approve or reject returns currently in the review stage." },
  { title: "Filing queue", subtitle: "Approved returns ready to file", states: ["Approved"], icon: RefreshCw, description: "Approved returns flow to the FBR filing process (with evidence verification)." },
];

interface QueueTabBarProps {
  queue: number;
  onQueueChange: (i: number) => void;
}

export function QueueTabBar({ queue, onQueueChange }: QueueTabBarProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {QUEUES.map((q, i) => (
        <Card
          key={q.title}
          className={`cursor-pointer transition hover:shadow-md ${i === queue ? "ring-2 ring-brand-500" : ""}`}
          onClick={() => onQueueChange(i)}
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <q.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{q.title}</h3>
                <p className="truncate text-xs text-slate-500">{q.subtitle}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">{q.description}</p>
            <div className="mt-3 flex gap-2">
              <Badge variant="outline" className="flex-1">
                {q.states.map((s) => s.toLowerCase()).join(" / ")}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
