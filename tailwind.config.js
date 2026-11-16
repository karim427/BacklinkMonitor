/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Geist Variable"', "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: { border: "#e5e7eb", muted: "#f4f4f5" },
    },
  },
  plugins: [],
};
