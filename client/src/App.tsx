import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clearDemoBrowserData } from "@/lib/clear-demo-browser-data";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Campaigns from "./pages/Campaigns";
import CampaignDetail from "./pages/CampaignDetail";
import CreatorDashboard from "./pages/CreatorDashboard";
import ReviewQueue from "./pages/ReviewQueue";
import Resources from "./pages/Resources";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/campaigns/:id" component={CampaignDetail} />
      <Route path="/dashboard" component={CreatorDashboard} />
      <Route path="/leaderboard" component={CreatorDashboard} />
      <Route path="/clips" component={CreatorDashboard} />
      <Route path="/earnings" component={CreatorDashboard} />
      <Route path="/profile" component={CreatorDashboard} />
      <Route path="/review" component={ReviewQueue} />
      <Route path="/learn" component={Resources} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  useEffect(() => {
    try {
      clearDemoBrowserData(window.localStorage);
    } catch {
      // Browser storage may be blocked; the application should still render.
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
