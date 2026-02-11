/* eslint-disable @typescript-eslint/no-explicit-any */
import { StoryFn } from '@storybook/react';

import UserBlock from '.';
import { CheckIcon } from '@atoms/icons-agnostic';
import type { UserType } from '@features/users/types/user';

export default {
  title: '@molecules/grouped-rows',
};

const mockUser = (first_name: string, last_name: string, email: string, thumbnail?: string) : UserType =>
  ({
    username: 'anonymous if this is empty',
    first_name, last_name, email, thumbnail,
  } as UserType);

const Template: StoryFn<any> = (props: {
  first_name: string;
  last_name: string;
  email: string;
  thumbnail?: string;
  className: string;
  checked: boolean;
}) => {
  return (
    <div className="flex">
      <div className="w-96 border border-gray-300 dark:border-zinc-600 rounded-sm m-2">
        <UserBlock
          className="p-2"
          user={mockUser("Romaric", "Mourgues", "r.mourgues@linagora.com", "https://images.freeimages.com/images/small-previews/d67/experimenting-with-nature-1547377.jpg")}
          suffix={
            <div className="text-blue-500">
              <CheckIcon fill="currentColor" />
            </div>
          }
        />
        <UserBlock
          className={props.className}
          user={mockUser(props.first_name, props.last_name, props.email, props.thumbnail)}
          suffix={
            (props.checked && (
              <div className="text-blue-500">
                <CheckIcon fill="currentColor" />
              </div>
            ))
          }
        />
        <UserBlock
          className="p-2 border-t border-gray-300 dark:border-zinc-600"
          user={mockUser("Diana", "Potokina", "r.potokina@linagora.com")}
        />
      </div>
    </div>
  );
};

export const User = Template.bind({});
User.args = {
  first_name: 'fred ✏️',
  last_name: 'ictitiuS editable',
  email: "sampleemail@example.com",
  className: "p-2 border-t border-gray-300 dark:border-zinc-600",
  thumbnail: "",
  checked: false,
};
