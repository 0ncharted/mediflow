import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/providers";
import Sidebar from "@/components/Sidebar";
import PatientPortal from "@/pages/PatientPortal";
import HospitalQuery from "@/pages/HospitalQuery";
import InsuranceModule from "@/pages/InsuranceModule";
import ResearchRegistry from "@/pages/ResearchRegistry";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={PatientPortal} />
      <Route path="/hospital" component={HospitalQuery} />
      <Route path="/insurance" component={InsuranceModule} />
      <Route path="/research" component={ResearchRegistry} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <Providers>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="min-h-screen flex bg-background text-foreground">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-auto">
              <Router />
            </main>
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </Providers>
  );
}

export default App;
