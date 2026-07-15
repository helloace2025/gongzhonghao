import type { Config } from 'tailwindcss';
import { nextui } from '@nextui-org/react';

/** Claude / Anthropic 风格暖色系 */
const claudeLight = {
  background: '#f5f4ef',
  foreground: '#1a1915',
  primary: {
    50: '#faf3f0',
    100: '#f3e4dc',
    200: '#e8c9b8',
    300: '#dca88f',
    400: '#d18466',
    500: '#c96442',
    600: '#b5573a',
    700: '#964632',
    800: '#7a3b2c',
    900: '#643327',
    DEFAULT: '#c96442',
    foreground: '#ffffff',
  },
  secondary: {
    50: '#f7f6f2',
    100: '#eeece4',
    200: '#ddd9cc',
    300: '#c5bfad',
    400: '#a89f8a',
    500: '#8f8570',
    600: '#736b5a',
    700: '#5c5649',
    800: '#4d483e',
    900: '#423e37',
    DEFAULT: '#8f8570',
    foreground: '#ffffff',
  },
  success: {
    DEFAULT: '#3d8b6e',
    foreground: '#ffffff',
  },
  warning: {
    DEFAULT: '#c4922a',
    foreground: '#1a1915',
  },
  danger: {
    DEFAULT: '#b54a3c',
    foreground: '#ffffff',
  },
  focus: '#c96442',
  content1: '#fffcf7',
  content2: '#f0eee6',
  content3: '#e8e5db',
  content4: '#ddd9cc',
  default: {
    50: '#faf9f5',
    100: '#f0eee6',
    200: '#e5e3d9',
    300: '#d4d0c4',
    400: '#b5b0a2',
    500: '#8f8a7c',
    600: '#6e6a5e',
    700: '#56534a',
    800: '#3f3d37',
    900: '#2a2925',
    DEFAULT: '#e5e3d9',
    foreground: '#1a1915',
  },
  divider: '#e5e3d9',
};

const claudeDark = {
  background: '#1a1917',
  foreground: '#f5f4ef',
  primary: {
    50: '#3d2a22',
    100: '#4a3228',
    200: '#6b4535',
    300: '#8f5a42',
    400: '#b56e4f',
    500: '#d18466',
    600: '#da977c',
    700: '#e3ad98',
    800: '#ecc6b8',
    900: '#f5e0d6',
    DEFAULT: '#d18466',
    foreground: '#1a1917',
  },
  secondary: {
    DEFAULT: '#a89f8a',
    foreground: '#1a1917',
  },
  success: {
    DEFAULT: '#5aab8c',
    foreground: '#1a1917',
  },
  danger: {
    DEFAULT: '#d47368',
    foreground: '#1a1917',
  },
  focus: '#d18466',
  content1: '#262522',
  content2: '#2f2d29',
  content3: '#3a3732',
  content4: '#4a4640',
  default: {
    50: '#2a2925',
    100: '#3a3732',
    200: '#4a4640',
    300: '#5c584f',
    400: '#7a756a',
    500: '#9a9488',
    600: '#b5b0a2',
    700: '#d4d0c4',
    800: '#e5e3d9',
    900: '#f5f4ef',
    DEFAULT: '#3a3732',
    foreground: '#f5f4ef',
  },
  divider: '#3a3732',
};

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        claude: {
          canvas: '#f5f4ef',
          sidebar: '#f0eee6',
          paper: '#fffcf7',
          border: '#e5e3d9',
          ink: '#1a1915',
          muted: '#6e6a5e',
          accent: '#c96442',
          'accent-soft': '#f3e4dc',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
        serif: [
          'ui-serif',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'Songti SC',
          'SimSun',
          'serif',
        ],
      },
      borderRadius: {
        claude: '0.875rem',
      },
      boxShadow: {
        claude: '0 1px 2px rgba(26, 25, 21, 0.04), 0 4px 16px rgba(26, 25, 21, 0.04)',
        'claude-md':
          '0 2px 4px rgba(26, 25, 21, 0.04), 0 12px 32px rgba(26, 25, 21, 0.06)',
      },
    },
  },
  darkMode: 'class',
  plugins: [
    nextui({
      themes: {
        light: {
          colors: claudeLight,
        },
        dark: {
          colors: claudeDark,
        },
      },
      layout: {
        radius: {
          small: '0.5rem',
          medium: '0.75rem',
          large: '1rem',
        },
      },
    }),
  ],
};
export default config;
