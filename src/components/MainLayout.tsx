import Sidebar from "./Sidebar";
import ContentArea from "./ContentArea";
import AiToolbox from "./AiToolbox";

export default function MainLayout() {
  return (
    <div class="flex flex-1 overflow-hidden min-w-0">
      <Sidebar />
      <ContentArea />
      <AiToolbox />
    </div>
  );
}
