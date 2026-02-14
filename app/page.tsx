import FieldCommanderDashboard from "@/components/field-commander-dashboard";
import { loadReadyToPlotBundle } from "@/lib/ready-to-plot";

export const dynamic = "force-dynamic";

export default async function Home() {
  const readyToPlot = await loadReadyToPlotBundle();

  return <FieldCommanderDashboard data={readyToPlot} />;
}
