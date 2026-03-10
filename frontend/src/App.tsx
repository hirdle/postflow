import { NavLink, Route, Routes } from "react-router-dom";

import { PostEditorPage } from "./pages/PostEditorPage";
import { PostListPage } from "./pages/PostListPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { SettingsPage } from "./pages/SettingsPage";

const navigation = [
  { to: "/", label: "Posts", end: true },
  { to: "/schedules", label: "Schedules" },
  { to: "/settings", label: "Settings" },
];

function App() {
  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col rounded-[28px] border border-white/10 bg-slate-950/70 shadow-glow backdrop-blur">
        <header className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-teal-300/70">
                BioVolt Ops
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
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
                        ? "border-teal-400/70 bg-teal-400/15 text-teal-100"
                        : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10",
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
  );
}

export default App;
