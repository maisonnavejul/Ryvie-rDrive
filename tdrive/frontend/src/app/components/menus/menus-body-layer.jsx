import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

import MenusManager from '@components/menus/menus-manager';
import MenuComponent from './menu-component';
import OutsideClickHandler from 'react-outside-click-handler';
import MobileMenu from './mobile-menu';

/*
  Where the menu will be displayed, this component should be in app.js (menus should be over all elements of the page)
*/

function getOrCreatePortalRoot() {
  let el = document.getElementById('context-menu-layer');
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('id', 'context-menu-layer');
    document.body.appendChild(el);
  }
  return el;
}

export default function MenusBodyLayer() {
  const [, forceRender] = useState(0);
  const menusDomRef = useRef(null);
  const menuObserverRef = useRef({});
  const lastUpdatePositionRef = useRef({});
  const indexUpdatePositionRef = useRef({});
  const willCloseOnUpRef = useRef(false);
  const portalRoot = useMemo(() => getOrCreatePortalRoot(), []);

  // Subscribe to MenusManager changes
  useEffect(() => {
    const listener = () => {
      forceRender(n => n + 1);
    };
    MenusManager.addListener(listener);
    return () => {
      MenusManager.removeListener(listener);
    };
  }, []);

  // Outside click detection via document listeners
  useEffect(() => {
    const element = menusDomRef.current;

    const outsideClickListener = (event) => {
      if (element && !element.contains(event.target) && document.contains(event.target)) {
        //NOT WORKING
        if (
          MenusManager.menus.length > 0 &&
          MenusManager.menus[MenusManager.menus.length - 1].allowClickOut
        ) {
          willCloseOnUpRef.current = true;
        } else {
          willCloseOnUpRef.current = false;
        }
      }
    };

    const outsideClickListenerUp = (event) => {
      if (element && !element.contains(event.target) && document.contains(event.target)) {
        //NOT WORKING
        if (
          MenusManager.menus.length > 0 &&
          MenusManager.menus[MenusManager.menus.length - 1].allowClickOut
        ) {
          if (willCloseOnUpRef.current) {
            MenusManager.closeMenu();
          }
        } else {
          willCloseOnUpRef.current = false;
        }
      }
    };

    document.addEventListener('mousedown', outsideClickListener);
    document.addEventListener('mouseup', outsideClickListenerUp);

    return () => {
      document.removeEventListener('mousedown', outsideClickListener);
      document.removeEventListener('mouseup', outsideClickListenerUp);
      Object.keys(menuObserverRef.current).forEach(index => {
        menuObserverRef.current[index].disconnect();
      });
    };
  }, []);

  const fixMenuPosition = useCallback((node, item, index) => {
    if (!node) {
      return;
    }

    if (lastUpdatePositionRef.current[item.id] !== parseInt(new Date().getTime() / 1000)) {
      lastUpdatePositionRef.current[item.id] = parseInt(new Date().getTime() / 1000);
      indexUpdatePositionRef.current[item.id] = 0;
    } else if (indexUpdatePositionRef.current[item.id] > 2) {
      return;
    }
    indexUpdatePositionRef.current[item.id]++;

    if (menuObserverRef.current[index]) {
      menuObserverRef.current[index].disconnect();
    }

    var config = { childList: true, subtree: true };
    menuObserverRef.current[index] = new MutationObserver(() => {
      fixMenuPosition(node, item);
    });
    menuObserverRef.current[index].observe(node, config);

    var nr = node.getBoundingClientRect();
    nr.x = nr.x || nr.left;
    nr.y = nr.y || nr.top;
    var rect = JSON.parse(JSON.stringify(nr || {}));
    rect.height = Math.max(node.offsetHeight, rect.height);
    rect.bottom = rect.height + rect.y;

    var max_bottom = document.documentElement.clientHeight;
    if (item.positionType === 'top') {
      max_bottom = item.position.y;
    }

    //Top
    if (rect.top < 5 || (rect.top > 10 && item.position.marginTop > 0)) {
      item.position.marginTop = Math.max(0, (item.position.marginTop || 0) - rect.top + 5);
      MenusManager.notify();
    }

    //Bottom
    if (item.position.marginTop === undefined || item.position.marginTop < 0) {
      //Else we are on the top top
      if (
        rect.bottom > Math.min(document.documentElement.clientHeight, max_bottom) - 5 ||
        (rect.bottom < Math.min(document.documentElement.clientHeight, max_bottom) - 10 &&
          item.position.marginTop < 0)
      ) {
        item.position.marginTop = Math.min(
          0,
          (item.position.marginTop || 0) -
            (rect.bottom - Math.min(document.documentElement.clientHeight, max_bottom) + 5),
        );
        MenusManager.notify();
      }
    }

    //Left
    if (rect.left < 5 || (rect.left > 10 && item.position.marginLeft > 0)) {
      item.position.marginLeft = Math.max(0, (item.position.marginLeft || 0) - rect.left + 5);
      MenusManager.notify();
    }
    //Right
    else if (
      rect.right > document.documentElement.clientWidth - 5 ||
      (rect.right < document.documentElement.clientWidth - 10 && item.position.marginLeft < 0)
    ) {
      item.position.marginLeft = Math.min(
        0,
        (item.position.marginLeft || 0) - (rect.right - document.documentElement.clientWidth + 5),
      );
      MenusManager.notify();
    }
  }, []);

  const menus = MenusManager.menus;
  const willClose = MenusManager.willClose;

  return createPortal(
    <OutsideClickHandler
      onOutsideClick={() => {
        MenusManager.closeMenu();
      }}
    >
      <div ref={menusDomRef}>
        {menus.map((item, i) => (
          <OutsideClickHandler
            key={item.id}
            onOutsideClick={() => {
              if (i === menus.length - 1) {
                MenusManager.closeSubMenu(item.level - 1);
              }
            }}
          >
            <div
              ref={node => fixMenuPosition(node, item, i)}
              style={{
                zIndex: 1050,
                position: 'absolute',
                transform: item.positionType === 'bottom' ? '' : 'translateY(-50%)',
                left: item.position.x - 140,
                top: item.position.y + 2,
                marginTop: item.position.marginTop,
                marginLeft: item.position.marginLeft,
              }}
            >
              {item.enableMobileMenu ? (
                <MobileMenu
                  withFrame
                  menu={item.menu}
                  openAt={item.openAt}
                  level={item.level}
                  animationClass={
                    willClose || item.willClose
                      ? 'fade_out'
                      : item.level === 0 || item.positionType
                      ? item.positionType === 'bottom'
                        ? 'skew_in_bottom_nobounce'
                        : item.left
                        ? 'skew_in_left_nobounce'
                        : 'skew_in_right_nobounce'
                      : 'fade_in'
                  }
                  testClassId={item.menuTestClassId}
                />
              ) : (
                <MenuComponent
                  withFrame
                  menu={item.menu}
                  openAt={item.openAt}
                  level={item.level}
                  animationClass={
                    willClose || item.willClose
                      ? 'fade_out'
                      : item.level === 0 || item.positionType
                      ? item.positionType === 'bottom'
                        ? 'skew_in_bottom_nobounce'
                        : item.left
                        ? 'skew_in_left_nobounce'
                        : 'skew_in_right_nobounce'
                      : 'fade_in'
                  }
                  testClassId={item.menuTestClassId}
                />
              )}
            </div>
          </OutsideClickHandler>
        ))}
      </div>
    </OutsideClickHandler>,
    portalRoot,
  );
}
