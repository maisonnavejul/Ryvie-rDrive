import React from 'react';
import { StoryFn, Meta } from '@storybook/react';
import DownloadAppBanner from './index';

export default {
  title: 'molecules/download-app-banner',
  component: DownloadAppBanner,
} as Meta<typeof DownloadAppBanner>;

const Template: StoryFn<typeof DownloadAppBanner> = args => <DownloadAppBanner {...args} />;

export const Primary = Template.bind({});

Primary.args = {
  download: () => {
    console.log('Download');
  },
  onBannerClose: () => {
    console.log('Close');
  },
};
