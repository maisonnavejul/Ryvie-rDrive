import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { StoryFn, Meta } from '@storybook/react';
import A from './index';

export default {
  title: '@atoms/link',
  component: A,
  decorators: [
    Story => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} as Meta<typeof A>;

const Template: StoryFn<typeof A> = args => <A {...args} />;

export const Default = Template.bind({});
Default.args = {
  href: 'https://www.google.com',
  children: 'Link',
};

export const noColor = Template.bind({});
noColor.args = {
  href: 'https://www.google.com',
  children: 'Link',
  noColor: true,
};

export const internal = Template.bind({});
internal.args = {
  to: '/',
  children: 'Link',
};
