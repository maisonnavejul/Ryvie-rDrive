import { dirname, join } from 'path';

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ['../src/app/**/*.stories.tsx'],
  addons: [
    getAbsolutePath('@vueless/storybook-dark-mode'),
  ],
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },
};

export default config;

function getAbsolutePath(value) {
  return dirname(require.resolve(join(value, 'package.json')));
}
