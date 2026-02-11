/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { StoryFn } from '@storybook/react';

import CompanyBlock from '.';
import Avatar from '@atoms/avatar';
import { CheckIcon } from '@atoms/icons-agnostic';

export default {
  title: '@molecules/grouped-rows',
};

const Template: StoryFn<any> = (props: {
  title: string;
  subtitle: string;
  checked: boolean;
}) => {
  return (
    <div className="flex">
      <div className="w-96 border border-gray-300 rounded-sm px-2 m-2">
        <CompanyBlock
          avatar={
            <Avatar
              type="square"
              avatar="https://s3.eu-west-3.amazonaws.com/tdrive.eu-west-3/public/uploads/grouplogo/dffc6bb54e7b5d6ee45d2d877839aa88.png"
            />
          }
          title="Linagora"
          subtitle="Linagora company"
          suffix={
            <div className="text-blue-500">
              <CheckIcon fill="currentColor" />
            </div>
          }
          className="py-2 border-b border-gray-300"
        />
        <CompanyBlock
          avatar={<Avatar type="square" title={props.title} />}
          title={props.title}
          subtitle={props.subtitle}
          suffix={
            (props.checked && (
              <div className="text-blue-500">
                <CheckIcon fill="currentColor" />
              </div>
            )) || <></>
          }
          className="py-2"
        />
      </div>
    </div>
  );
};

export const Company = Template.bind({});
Company.args = {
  title: 'Test company',
  subtitle: 'Just a test company',
  checked: false,
};
