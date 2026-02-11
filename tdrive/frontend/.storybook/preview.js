import '../src/tailwind.css';

/** @type { import('@storybook/react').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    darkMode: {
      stylePreview: true,
    },
    docs: {
      source: { type: 'code' },
    },
  },
};

export default preview;
