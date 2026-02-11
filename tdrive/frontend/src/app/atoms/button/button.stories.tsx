/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { StoryFn } from '@storybook/react';
import { Button } from './button';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { TrashIcon } from '@heroicons/react/24/outline';
import { UserAddIcon } from '@atoms/icons-agnostic/index';

export default {
  title: '@atoms/button',
};

const Template: StoryFn<any> = (props: {
  text: string;
  disabled: boolean;
  loading: boolean;
}) => {
  return (
    <>
      <Button className="my-4 mx-2" disabled={props.disabled} loading={props.loading}>
        {props.text}
      </Button>

      <Button
        className="my-4 mx-2"
        theme="secondary"
        disabled={props.disabled}
        loading={props.loading}
      >
        {props.text}
      </Button>

      <Button
        className="my-4 mx-2"
        theme="danger"
        disabled={props.disabled}
        loading={props.loading}
      >
        {props.text}
      </Button>

      <Button
        className="my-4 mx-2"
        theme="default"
        disabled={props.disabled}
        loading={props.loading}
      >
        {props.text}
      </Button>

      <Button
        className="my-4 mx-2"
        theme="outline"
        disabled={props.disabled}
        loading={props.loading}
      >
        {props.text}
      </Button>

      <br />

      <Button
        className="my-4 mx-2"
        disabled={props.disabled}
        loading={props.loading}
        icon={MagnifyingGlassIcon}
      >
        Search
      </Button>

      <Button
        className="my-4 mx-2"
        theme="outline"
        disabled={props.disabled}
        loading={props.loading}
        icon={PlusIcon}
      >
        Add
      </Button>

      <Button
        className="my-4 mx-2"
        theme="danger"
        disabled={props.disabled}
        loading={props.loading}
        icon={TrashIcon}
      />

      <br />

      <Button
        size="lg"
        className="my-4 mx-2"
        theme="outline"
        disabled={props.disabled}
        loading={props.loading}
      >
        {props.text}
      </Button>

      <Button
        size="md"
        className="my-4 mx-2"
        theme="outline"
        disabled={props.disabled}
        loading={props.loading}
      >
        {props.text}
      </Button>

      <Button
        size="sm"
        className="my-4 mx-2"
        theme="outline"
        disabled={props.disabled}
        loading={props.loading}
      >
        {props.text}
      </Button>

      <br />

      <Button
        size="lg"
        className="my-4 mx-2 rounded-full"
        theme="primary"
        disabled={props.disabled}
        loading={props.loading}
        icon={TrashIcon}
      />

      <Button
        className="my-4 mx-2 rounded-full"
        theme="primary"
        disabled={props.disabled}
        loading={props.loading}
        icon={TrashIcon}
      />

      <Button
        size="sm"
        className="my-4 mx-2 rounded-full"
        theme="primary"
        disabled={props.disabled}
        loading={props.loading}
        icon={TrashIcon}
      />

      <br />

      <Button
        size="md"
        className="my-4 mx-2 w-full justify-center"
        theme="outline"
        disabled={props.disabled}
        loading={props.loading}
        icon={PlusIcon}
      >
        Add
      </Button>

      <Button
        size="md"
        className="my-4 mx-2 w-full justify-center"
        theme="outline"
        disabled={props.disabled}
        loading={props.loading}
      >
        <UserAddIcon className="w-6 h-6" fill="currentColor" />
        Add user
      </Button>
    </>
  );
};

export const Default = Template.bind({});
Default.args = {
  text: 'Text',
  loading: false,
  disabled: false,
};
