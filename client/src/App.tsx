import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { NavigationBar } from "@/components/navigation-bar";
import GeneratePage from "@/pages/generate";
import LibraryPage from "@/pages/library";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={GeneratePage} />
      <Route path="/library" component={LibraryPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <Router />
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
