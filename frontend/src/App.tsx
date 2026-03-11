import { useEffect } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";

import { ToastProvider } from "./components/ToastProvider";
import { PostEditorPage } from "./pages/PostEditorPage";
import { PostListPage } from "./pages/PostListPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { SettingsPage } from "./pages/SettingsPage";

const navigation = [
  { to: "/", label: "Посты", end: true },
  { to: "/schedules", label: "Расписание" },
  { to: "/settings", label: "Настройки" },
];

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search]);

  return null;
}

function App() {
  return (
    <ToastProvider>
      <ScrollToTop />
      <div className="min-h-screen px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col rounded-[28px] border border-white/70 bg-white/80 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <header className="border-b border-slate-200/80 px-6 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-teal-700/70">
                  Рабочее место BioVolt
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  PostFlow
                </h1>
              </div>

              <nav className="flex flex-wrap gap-2">
                {navigation.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      [
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        isActive
                          ? "border-teal-300 bg-teal-50 text-teal-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </header>

          <main className="flex-1 px-6 py-6">
            <Routes>
              <Route path="/" element={<PostListPage />} />
              <Route path="/posts/new" element={<PostEditorPage />} />
              <Route path="/posts/:filename" element={<PostEditorPage />} />
              <Route path="/schedules" element={<SchedulesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

export default App;
