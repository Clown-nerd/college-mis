import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { RoleProtectedRoute } from "./components/RoleProtectedRoute";
import { ThemeProvider } from "./contexts/ThemeContext";
import AcademicCatalogue from "./pages/AcademicCatalogue";
import Admissions from "./pages/Admissions";
import ApplicationConfirmations from "./pages/ApplicationConfirmations";
import FinanceHub from "./pages/FinanceHub";
import Governance from "./pages/Governance";
import Home from "./pages/Home";
import MyAcademicRecord from "./pages/MyAcademicRecord";
import MySchedule from "./pages/MySchedule";
import MyProgression from "./pages/MyProgression";
import LearningProgress from "./pages/LearningProgress";
import NotFound from "./pages/NotFound";
import RequestsRecords from "./pages/RequestsRecords";
import StudentRegistry from "./pages/StudentRegistry";
import StudentApplication from "./pages/StudentApplication";
import StaffProvisioning from "./pages/StaffProvisioning";
import TeachingOperations from "./pages/TeachingOperations";
import Timetable from "./pages/Timetable";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/students" component={() => <RoleProtectedRoute component={StudentRegistry} roles={["admin", "registrar"]} />} />
      <Route path="/apply" component={() => <RoleProtectedRoute component={StudentApplication} roles={["applicant"]} />} />
      <Route path="/admissions" component={() => <RoleProtectedRoute component={Admissions} roles={["admin", "registrar"]} />} />
      <Route path="/confirmations" component={() => <RoleProtectedRoute component={ApplicationConfirmations} roles={["admin"]} />} />
      <Route path="/staff" component={() => <RoleProtectedRoute component={StaffProvisioning} roles={["admin"]} />} />
      <Route path="/academics" component={() => <RoleProtectedRoute component={AcademicCatalogue} roles={["admin", "registrar", "faculty"]} />} />
      <Route path="/teaching" component={() => <RoleProtectedRoute component={TeachingOperations} roles={["admin", "registrar", "faculty"]} />} />
      <Route path="/learning" component={() => <RoleProtectedRoute component={LearningProgress} roles={["admin", "registrar", "faculty", "student", "user"]} />} />
      <Route path="/timetable" component={() => <RoleProtectedRoute component={Timetable} roles={["admin", "registrar", "faculty"]} />} />
      <Route path="/my-record" component={() => <RoleProtectedRoute component={MyAcademicRecord} roles={["student", "user"]} />} />
      <Route path="/my-schedule" component={() => <RoleProtectedRoute component={MySchedule} roles={["student", "user"]} />} />
      <Route path="/my-progression" component={() => <RoleProtectedRoute component={MyProgression} roles={["student", "user"]} />} />
      <Route path="/finance" component={() => <RoleProtectedRoute component={FinanceHub} roles={["admin", "finance", "student", "user"]} />} />
      <Route path="/requests" component={() => <RoleProtectedRoute component={RequestsRecords} roles={["admin", "registrar", "non_teaching", "student", "user"]} />} />
      <Route path="/governance" component={() => <RoleProtectedRoute component={Governance} roles={["admin"]} />} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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

export default App;
