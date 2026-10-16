import { useState } from "react";
import { QueueTabBar } from "./queue-tabs";
import { QueueTable } from "./queue-table";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function QueuePage() {
  const [queue, setQueue] = useState(0);
  const [start, setStart] = useState(0);

  return (
    <div className="page-container">
      <PageHeader
        title="Filing Queue"
        subtitle="Every transition is recorded — workflows are audited end-to-end"
        actions={
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <QueueTabBar queue={queue} onQueueChange={setQueue} />
      <div className="mt-6">
        <QueueTable queue={queue} start={start} onStartChange={setStart} />
      </div>
    </div>
  );
}
