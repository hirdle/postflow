/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#e2e8f0",
        accent: "#14b8a6",
        accentWarm: "#f97316",
      },
      boxShadow: {
        glow: "0 20px 60px rgba(20, 184, 166, 0.18)",
      },
    },
  },
  plugins: [],
};
