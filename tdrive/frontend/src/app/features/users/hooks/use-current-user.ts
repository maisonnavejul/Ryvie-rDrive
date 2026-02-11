/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from "react";
import LoginService from '@features/auth/login-service';
import { useRecoilState } from 'recoil';
import { CurrentUserState } from '../state/atoms/current-user';
import Languages from '@features/global/services/languages-service';
import { useSetUserList } from './use-user-list';
import { getPublicLinkToken } from 'app/features/drive/api-client/api-client';
import Logger from '../../../features/global/framework/logger-service';

export const useCurrentUser = () => {
  const [user, setUser] = useRecoilState(CurrentUserState);
  const { set: setUserList } = useSetUserList('useCurrentUser');
  const setUserRef = useRef(setUser);
  setUserRef.current = setUser;

  const logger = Logger.getLogger('useCurrentUser');

  //Depreciated way to get use update from LoginService
  // Assign synchronously during render (not in useEffect) so it's available
  // immediately — with React 18 createRoot, deferred effects cause a race
  // condition where the login flow completes before the callback is assigned.
  LoginService.recoilUpdateUser = (u: any) => setUserRef.current(u);

  useEffect(() => {
    if (!user && !getPublicLinkToken()) {
      logger.debug("Init LoginService ...");
      LoginService.init(true)
        .then(() => logger.debug("Init LoginService completed"))
        .catch(err => logger.error("Error during auth: ", err))
    } else {
      if (user) setUserList([user]);
    }
  }, [user]);

  //Update app language
  useEffect(() => {
    if (user?.preferences?.locale) Languages.setLanguage(user?.preferences?.locale);
  }, [user?.preferences?.locale]);

  const refresh = async () => {
    if (!getPublicLinkToken()) {
      await LoginService.updateUser();
    }
  };

  return { user, refresh };
};
