import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import ErrorBoundary from "./components/ErrorBoundary";
import { RoleProtectedRoute } from "./components/RoleProtectedRoute";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

const AcademicCatalogue = lazy(() => import("./pages/AcademicCatalogue"));
const Admissions = lazy(() => import("./pages/Admissions"));
const ApplicationConfirmations = lazy(() => import("./pages/ApplicationConfirmations"));
const FinanceHub = lazy(() => import("./pages/FinanceHub"));
const Governance = lazy(() => import("./pages/Governance"));
const MyAcademicRecord = lazy(() => import("./pages/MyAcademicRecord"));
const MySchedule = lazy(() => import("./pages/MySchedule"));
const MyProgression = lazy(() => import("./pages/MyProgression"));
const LearningProgress = lazy(() => import("./pages/LearningProgress"));
const NotFound = lazy(() => import("./pages/NotFound"));
const RequestsRecords = lazy(() => import("./pages/RequestsRecords"));
const StudentRegistry = lazy(() => import("./pages/StudentRegistry"));
const StudentApplication = lazy(() => import("./pages/StudentApplication"));
const StaffProvisioning = lazy(() => import("./pages/StaffProvisioning"));
const TeachingOperations = lazy(() => import("./pages/TeachingOperations"));
const Timetable = lazy(() => import("./pages/Timetable"));

function Router() {
  return (
    <Suspense fallback={<DashboardLayoutSkeleton />}>
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
    </Suspense>
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
