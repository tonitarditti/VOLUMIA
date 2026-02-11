import TopBar from "../components/TopBar";
import LeftSidebar from "../components/LeftSidebar";
import Viewport3D from "../components/Viewport3D";
import AIPanel from "../components/AIPanel";
import StatusBar from "../components/StatusBar";

export default function AppShell() {
  return (
    <div className="appRoot">
      <TopBar />
      <div className="grid">
        <div className="panel">
          <LeftSidebar />
        </div>
        <div className="panel">
          <Viewport3D />
        </div>
        <div className="panel">
          <AIPanel />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
