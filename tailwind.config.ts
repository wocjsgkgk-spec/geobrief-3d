import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      aspectRatio: {
        "16/9": "16 / 9",
      },
      colors: {
        military: {
          900: "#141a15",
          800: "#1d261f",
          700: "#2a372d",
          600: "#3d4e41",
          500: "#546b5a",
          100: "#dce5de",
        },
      },
    },
  },
  plugins: [],
};
export default config;
