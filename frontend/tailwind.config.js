/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Pakistan-green inspired brand palette + neutral scale for the shell.
        brand: {
          50: "#f0f9f2",
          100: "#dcf0e0",
          200: "#bbe1c5",
          300: "#8dcaa1",
          400: "#57ab77",
          500: "#36905a",
          600: "#267448",
          700: "#1f5c3b",
          800: "#1c4a32",
          900: "#183d2b",
          950: "#0c2318",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
